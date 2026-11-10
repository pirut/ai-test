package local

import (
	"time"
	// The schedule runs on the screen's own time zone, and a minimal image
	// may ship without the zone database. Carry it in the binary.
	_ "time/tzdata"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
)

// clockTrustSlack is how far behind the manifest the clock may be before the
// screen is taken to have lost its time (no battery clock, not online yet).
// Schedules then wait, and the default playlist plays, until it is set again.
const clockTrustSlack = 24 * time.Hour

// chooseActivePlaylist picks what plays at now: the active schedule window
// with the highest priority, or the default playlist. At equal priority a
// dated window beats a repeating one, then the earlier one in the manifest.
// Everything it needs is in the saved manifest, so it works without a network.
func chooseActivePlaylist(manifest *remote.DeviceManifest, now time.Time) ([]remote.ManifestPlaylistItem, string) {
	if active := activeScheduleWindow(manifest, now); active != nil && len(active.Playlist) > 0 {
		return active.Playlist, active.PlaylistID
	}
	return manifest.DefaultPlaylist, manifest.DefaultPlaylistID
}

func activeScheduleWindow(manifest *remote.DeviceManifest, now time.Time) *remote.ScheduleWindow {
	if generatedAt, err := time.Parse(time.RFC3339, manifest.GeneratedAt); err == nil && now.Before(generatedAt.Add(-clockTrustSlack)) {
		return nil
	}
	local := now.In(scheduleLocation(manifest.Timezone))
	var best *remote.ScheduleWindow
	for index := range manifest.ScheduleWindows {
		window := &manifest.ScheduleWindows[index]
		if !windowActive(window, now, local) {
			continue
		}
		if best == nil || window.Priority > best.Priority ||
			(window.Priority == best.Priority && window.Recurrence == nil && best.Recurrence != nil) {
			best = window
		}
	}
	return best
}

func windowActive(window *remote.ScheduleWindow, now time.Time, local time.Time) bool {
	if window.Recurrence != nil {
		return recurrenceActive(window.Recurrence, int(local.Weekday()), local.Hour()*60+local.Minute())
	}
	startsAt, err := time.Parse(time.RFC3339, window.StartsAt)
	if err != nil {
		return false
	}
	endsAt, err := time.Parse(time.RFC3339, window.EndsAt)
	if err != nil {
		return false
	}
	return !startsAt.After(now) && !endsAt.Before(now)
}

func recurrenceActive(recurrence *remote.ScheduleRecurrence, day int, minute int) bool {
	today := hasDay(recurrence.DaysOfWeek, day)
	if recurrence.StartMinute < recurrence.EndMinute {
		return today && minute >= recurrence.StartMinute && minute < recurrence.EndMinute
	}
	// Past midnight: the late part belongs to the day it started on.
	yesterday := hasDay(recurrence.DaysOfWeek, (day+6)%7)
	return (today && minute >= recurrence.StartMinute) || (yesterday && minute < recurrence.EndMinute)
}

func hasDay(days []int, day int) bool {
	for _, candidate := range days {
		if candidate == day {
			return true
		}
	}
	return false
}

// scheduleLocation is the screen's time zone from the dashboard. An unknown
// name reads as UTC, the same as the web player.
func scheduleLocation(name string) *time.Location {
	if location, err := time.LoadLocation(name); err == nil && name != "" {
		return location
	}
	return time.UTC
}
