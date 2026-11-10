package local

import (
	"testing"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
)

func scheduleManifest(windows ...remote.ScheduleWindow) *remote.DeviceManifest {
	return &remote.DeviceManifest{
		GeneratedAt:       "2026-11-01T00:00:00Z",
		Timezone:          "America/New_York",
		DefaultPlaylistID: "default",
		DefaultPlaylist:   []remote.ManifestPlaylistItem{{ID: "default"}},
		ScheduleWindows:   windows,
	}
}

func repeating(id string, priority int, days []int, start int, end int) remote.ScheduleWindow {
	return remote.ScheduleWindow{
		ID: id, PlaylistID: id, Priority: priority,
		// What the service sends for repeating windows.
		StartsAt: "1970-01-01T00:00:00.000Z", EndsAt: "1970-01-01T00:00:00.000Z",
		Playlist:   []remote.ManifestPlaylistItem{{ID: id}},
		Recurrence: &remote.ScheduleRecurrence{DaysOfWeek: days, StartMinute: start, EndMinute: end},
	}
}

func playingAt(t *testing.T, manifest *remote.DeviceManifest, at string) string {
	t.Helper()
	now, err := time.Parse(time.RFC3339, at)
	if err != nil {
		t.Fatal(err)
	}
	_, id := chooseActivePlaylist(manifest, now)
	return id
}

func TestRepeatingScheduleFollowsTheScreensTimeZone(t *testing.T) {
	weekdays := []int{1, 2, 3, 4, 5}
	manifest := scheduleManifest(repeating("open-hours", 10, weekdays, 9*60, 17*60))
	for _, test := range []struct{ at, want string }{
		// Tuesday 2026-11-10. New York is UTC-5 in November.
		{"2026-11-10T13:59:00Z", "default"},    // 8:59
		{"2026-11-10T14:00:00Z", "open-hours"}, // 9:00
		{"2026-11-10T21:59:00Z", "open-hours"}, // 16:59
		{"2026-11-10T22:00:00Z", "default"},    // 17:00, the end is exclusive
		{"2026-11-14T17:00:00Z", "default"},    // Saturday noon
		// Summer time: New York is UTC-4, and 9:00 is still 9:00.
		{"2027-07-06T13:00:00Z", "open-hours"},
		{"2027-07-06T12:59:00Z", "default"},
	} {
		if got := playingAt(t, manifest, test.at); got != test.want {
			t.Errorf("at %s playing %q, want %q", test.at, got, test.want)
		}
	}
}

func TestRepeatingSchedulePastMidnightBelongsToItsStartDay(t *testing.T) {
	// Friday 22:00 to 02:00.
	manifest := scheduleManifest(repeating("late", 10, []int{5}, 22*60, 2*60))
	for _, test := range []struct{ at, want string }{
		{"2026-11-14T03:30:00Z", "late"},    // Friday 22:30
		{"2026-11-14T06:30:00Z", "late"},    // Saturday 1:30
		{"2026-11-14T07:00:00Z", "default"}, // Saturday 2:00
		{"2026-11-13T06:30:00Z", "default"}, // Friday 1:30 is Thursday's night
		{"2026-11-15T03:30:00Z", "default"}, // Saturday 22:30
	} {
		if got := playingAt(t, manifest, test.at); got != test.want {
			t.Errorf("at %s playing %q, want %q", test.at, got, test.want)
		}
	}
}

func TestEqualStartAndEndIsAllDay(t *testing.T) {
	manifest := scheduleManifest(repeating("weekend", 10, []int{0, 6}, 0, 0))
	if got := playingAt(t, manifest, "2026-11-14T15:00:00Z"); got != "weekend" {
		t.Errorf("Saturday playing %q", got)
	}
	if got := playingAt(t, manifest, "2026-11-16T15:00:00Z"); got != "default" {
		t.Errorf("Monday playing %q", got)
	}
}

func TestPriorityThenDatedWindowWins(t *testing.T) {
	everyDay := []int{0, 1, 2, 3, 4, 5, 6}
	dated := remote.ScheduleWindow{
		ID: "sale", PlaylistID: "sale", Priority: 10,
		StartsAt: "2026-11-10T00:00:00Z", EndsAt: "2026-11-11T00:00:00Z",
		Playlist: []remote.ManifestPlaylistItem{{ID: "sale"}},
	}
	at := "2026-11-10T15:00:00Z"
	if got := playingAt(t, scheduleManifest(repeating("daily", 10, everyDay, 0, 0), dated), at); got != "sale" {
		t.Errorf("equal priority playing %q, want the dated window", got)
	}
	if got := playingAt(t, scheduleManifest(repeating("daily", 20, everyDay, 0, 0), dated), at); got != "daily" {
		t.Errorf("higher priority playing %q, want daily", got)
	}
	first := repeating("first", 10, everyDay, 0, 0)
	second := repeating("second", 10, everyDay, 0, 0)
	if got := playingAt(t, scheduleManifest(first, second), at); got != "first" {
		t.Errorf("tie playing %q, want the earlier window", got)
	}
}

// A Pi without a clock battery that boots with no network can come up in the
// past. Following the schedule then would play the wrong thing with
// confidence; the default playlist is the safe choice until the clock is set.
func TestScheduleWaitsWhileTheClockIsBeforeTheManifest(t *testing.T) {
	manifest := scheduleManifest(repeating("always", 10, []int{0, 1, 2, 3, 4, 5, 6}, 0, 0))
	if got := playingAt(t, manifest, "2026-11-10T15:00:00Z"); got != "always" {
		t.Fatalf("with a good clock playing %q", got)
	}
	if got := playingAt(t, manifest, "2025-01-01T00:00:00Z"); got != "default" {
		t.Fatalf("with a lost clock playing %q, want default", got)
	}
}

func TestUnknownTimeZoneReadsAsUTC(t *testing.T) {
	manifest := scheduleManifest(repeating("morning", 10, []int{2}, 9*60, 10*60))
	manifest.Timezone = "Not/AZone"
	if got := playingAt(t, manifest, "2026-11-10T09:30:00Z"); got != "morning" {
		t.Fatalf("playing %q", got)
	}
}
