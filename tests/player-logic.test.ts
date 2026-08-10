import assert from "node:assert/strict";
import test from "node:test";

import type { DeviceManifest, ManifestPlaylistItem } from "@showroom/contracts";
import { choosePlaylistId, chooseSchedule, reconcilePlaylistIndex } from "../apps/player/src/player-app";

function item(id: string): ManifestPlaylistItem {
  return {
    id,
    assetId: `asset-${id}`,
    assetType: "image",
    sourceType: "upload",
    title: id,
    url: `/assets/${id}.jpg`,
    checksum: `checksum-${id}`,
    durationSeconds: 10,
  };
}

function manifest(overrides: Partial<DeviceManifest> = {}): DeviceManifest {
  return {
    manifestVersion: "manifest-1",
    deviceId: "device-1",
    generatedAt: "2026-08-10T12:00:00.000Z",
    timezone: "America/New_York",
    orientation: 0,
    volume: 0,
    defaultPlaylist: [item("default")],
    scheduleWindows: [],
    assetBaseUrl: "http://localhost:4173/assets",
    assetChecksums: {},
    ...overrides,
  };
}

test("chooseSchedule selects the highest-priority active schedule", () => {
  const now = Date.parse("2026-08-10T12:30:00.000Z");
  const selected = chooseSchedule(
    manifest({
      scheduleWindows: [
        {
          id: "low",
          label: "Low",
          startsAt: "2026-08-10T12:00:00.000Z",
          endsAt: "2026-08-10T13:00:00.000Z",
          priority: 1,
          playlist: [item("low")],
        },
        {
          id: "high",
          label: "High",
          startsAt: "2026-08-10T12:00:00.000Z",
          endsAt: "2026-08-10T13:00:00.000Z",
          priority: 20,
          playlistId: "playlist-high",
          playlist: [item("high")],
        },
      ],
    }),
    now,
  );

  assert.equal(selected[0]?.id, "high");
  assert.equal(choosePlaylistId(manifest({
    defaultPlaylistId: "playlist-default",
    scheduleWindows: [{
      id: "high",
      label: "High",
      startsAt: "2026-08-10T12:00:00.000Z",
      endsAt: "2026-08-10T13:00:00.000Z",
      priority: 20,
      playlistId: "playlist-high",
      playlist: [item("high")],
    }],
  }), now), "playlist-high");
});

test("chooseSchedule falls back when windows are invalid or inactive", () => {
  const selected = chooseSchedule(
    manifest({
      scheduleWindows: [
        {
          id: "invalid",
          label: "Invalid",
          startsAt: "not-a-date",
          endsAt: "also-not-a-date",
          priority: 100,
          playlist: [item("invalid")],
        },
      ],
    }),
    Date.parse("2026-08-10T12:30:00.000Z"),
  );

  assert.equal(selected[0]?.id, "default");
});

test("manifest refresh preserves the currently playing item", () => {
  const current = [item("one"), item("two"), item("three")];
  const reordered = [item("three"), item("two"), item("one")];
  assert.equal(reconcilePlaylistIndex(current, 1, reordered), 1);
});

test("manifest refresh resets safely when the active item was removed", () => {
  assert.equal(reconcilePlaylistIndex([item("one"), item("two")], 1, [item("three")]), 0);
  assert.equal(reconcilePlaylistIndex([item("one")], 0, []), 0);
});
