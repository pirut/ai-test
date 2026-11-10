package agent

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

// droppable is a control plane whose network can be cut: while down, every
// connection is closed without an answer.
type droppable struct {
	inner http.Handler
	down  atomic.Bool
}

func (d *droppable) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if d.down.Load() {
		if hijacker, ok := w.(http.Hijacker); ok {
			if conn, _, err := hijacker.Hijack(); err == nil {
				_ = conn.Close()
				return
			}
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	d.inner.ServeHTTP(w, r)
}

// Everything a screen needs to keep playing, including what a schedule plays
// later in the day, is saved on the card: when the network drops, the saved
// manifest and files are left exactly as they were and no error is put on
// the TV.
func TestNetworkDropKeepsSavedContentAndSchedules(t *testing.T) {
	backend := &manifestServer{}
	network := &droppable{inner: backend}
	service, stateRoot := newLinkTestService(t, network)
	pairForTest(t, service)
	host := serverHost(t, service)
	backend.manifest = map[string]interface{}{
		"manifestVersion": "v1",
		"deviceId":        "device-1",
		"timezone":        "America/New_York",
		"defaultPlaylist": []map[string]interface{}{
			{"id": "item-1", "assetId": "asset1", "assetType": "image", "url": "http://" + host + "/media/ok-1.jpg"},
		},
		"scheduleWindows": []map[string]interface{}{{
			"id": "evening", "label": "Evening", "priority": 10, "playlistId": "playlist-evening",
			"startsAt": "1970-01-01T00:00:00.000Z", "endsAt": "1970-01-01T00:00:00.000Z",
			"recurrence": map[string]interface{}{"daysOfWeek": []int{1, 2, 3, 4, 5}, "startMinute": 1020, "endMinute": 1260},
			"playlist": []map[string]interface{}{
				{"id": "item-2", "assetId": "asset2", "assetType": "image", "url": "http://" + host + "/media/ok-2.jpg"},
			},
		}},
	}
	if err := service.syncOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(filepath.Join(stateRoot, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}

	network.down.Store(true)
	for attempt := 0; attempt < 3; attempt++ {
		if err := service.syncOnce(context.Background()); err == nil {
			t.Fatal("expected the sync to fail while the network is down")
		}
	}

	after, err := os.ReadFile(filepath.Join(stateRoot, "manifest.json"))
	if err != nil || string(after) != string(before) {
		t.Fatalf("the saved manifest changed while offline (err %v)", err)
	}
	local := readLocalManifest(t, stateRoot)
	if len(local.DefaultPlaylist) != 1 || len(local.ScheduleWindows) != 1 || len(local.ScheduleWindows[0].Playlist) != 1 {
		t.Fatalf("saved manifest is missing content: %+v", local)
	}
	window := local.ScheduleWindows[0]
	if window.Recurrence == nil || window.Recurrence.StartMinute != 1020 || len(window.Recurrence.DaysOfWeek) != 5 {
		t.Fatalf("the repeating schedule was not saved: %+v", window.Recurrence)
	}
	for _, item := range append(local.DefaultPlaylist, window.Playlist...) {
		if !strings.HasPrefix(item.URL, "/assets/") {
			t.Fatalf("item %s still points at the network: %s", item.ID, item.URL)
		}
		if _, err := os.Stat(filepath.Join(service.config.StorageRoot, strings.TrimPrefix(item.URL, "/assets/"))); err != nil {
			t.Fatalf("item %s is not on the card: %v", item.ID, err)
		}
	}
	if status := service.store.PlayerStatus(); !status.Claimed || status.LastError != "" || status.PendingItems != 0 {
		t.Fatalf("status while offline: %+v", status)
	}

	network.down.Store(false)
	if err := service.sendHeartbeat(context.Background(), service.store.Snapshot(), true); err != nil {
		t.Fatal(err)
	}
	backend.mu.Lock()
	report, _ := backend.heartbeat["sync"].(map[string]interface{})
	backend.mu.Unlock()
	if report["savedItems"] != float64(2) || report["totalItems"] != float64(2) || report["repeatingSchedules"] != true {
		t.Fatalf("heartbeat sync report: %+v", report)
	}
}

// One new file is fetched per sync so playback starts early. The next one
// must follow at once, not a poll interval later: until the whole playlist is
// on the card a network drop leaves the screen with part of it.
func TestRemainingDownloadsFollowWithoutWaiting(t *testing.T) {
	backend := &manifestServer{}
	service, _ := newLinkTestService(t, backend)
	pairForTest(t, service)
	host := serverHost(t, service)
	items := []map[string]interface{}{}
	for _, id := range []string{"1", "2", "3", "4"} {
		items = append(items, map[string]interface{}{
			"id": "item-" + id, "assetId": "asset" + id, "assetType": "image", "url": "http://" + host + "/media/ok-" + id + ".jpg",
		})
	}
	backend.manifest = map[string]interface{}{"manifestVersion": "v1", "deviceId": "device-1", "defaultPlaylist": items}

	passes := 0
	for {
		if err := service.syncOnce(context.Background()); err != nil {
			t.Fatal(err)
		}
		passes++
		select {
		case <-service.syncTrigger:
			if passes > 10 {
				t.Fatal("sync keeps asking for another pass")
			}
			continue
		default:
		}
		break
	}
	if got := len(service.store.Snapshot().CachedAssets); got != 4 {
		t.Fatalf("saved %d of 4 items after %d back-to-back passes", got, passes)
	}
	if passes < 2 {
		t.Fatalf("expected more than one pass, got %d", passes)
	}
}

// An item that cannot be downloaded is retried on its backoff, not in a loop.
func TestFailedDownloadDoesNotAskForAnotherPass(t *testing.T) {
	backend := &manifestServer{}
	service, _ := newLinkTestService(t, backend)
	pairForTest(t, service)
	host := serverHost(t, service)
	backend.manifest = map[string]interface{}{
		"manifestVersion": "v1",
		"deviceId":        "device-1",
		"defaultPlaylist": []map[string]interface{}{
			{"id": "item-1", "assetId": "asset1", "assetType": "image", "url": "http://" + host + "/media/ok-1.jpg"},
			{"id": "item-2", "assetId": "asset2", "assetType": "image", "url": "http://" + host + "/media/missing.jpg"},
		},
	}
	if err := service.syncOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	<-service.syncTrigger // the first pass saved a file and one is still missing
	if err := service.syncOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	select {
	case <-service.syncTrigger:
		t.Fatal("a pass that saved nothing new asked for another")
	default:
	}
}
