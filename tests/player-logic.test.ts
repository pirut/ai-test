import assert from "node:assert/strict";
import test from "node:test";

import type { DeviceManifest, ManifestPlaylistItem } from "@showroom/contracts";
import { choosePlaylistId, chooseSchedule, reconcilePlaylistIndex } from "../apps/player/src/player-app";
import {
  CANNOT_REACH,
  OFFLINE_BADGE_AFTER_MS,
  friendlyError,
  isConnectivityError,
  networkName,
  showOfflineBadge,
  videoProgressed,
} from "../apps/player/src/screen-text";

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

test("agent errors become lines a customer can act on", () => {
  const dns = 'Post "https://app.example/api/device/register": dial tcp: lookup app.example: no such host';
  assert.equal(isConnectivityError(dns), true);
  assert.equal(friendlyError(dns), CANNOT_REACH);
  // A paired screen with nothing assigned already says "choose a playlist".
  assert.equal(friendlyError("no playable media assets were available after 0 hydration failures"), null);
  assert.match(
    friendlyError("no playable media assets were available after 2 hydration failures") ?? "",
    /couldn't be downloaded/,
  );
  assert.equal(friendlyError("device credential was rejected (1): 401"), null);
  assert.equal(friendlyError("  "), null);
  assert.equal(friendlyError(undefined), null);
  assert.equal(friendlyError("something new"), "something new");
});

test("a looping video's clock starting over counts as progress", () => {
  assert.equal(videoProgressed(12, 12.02), false);
  assert.equal(videoProgressed(12, 12.3), true);
  // A single video loops in place: 59.8 -> 0.4 is playback, not a stall.
  assert.equal(videoProgressed(59.8, 0.4), true);
});

test("the offline badge waits until the screen has been out of touch for a while", () => {
  assert.equal(showOfflineBadge(null, 100_000), false);
  assert.equal(showOfflineBadge(100_000, 100_000 + OFFLINE_BADGE_AFTER_MS - 1), false);
  assert.equal(showOfflineBadge(100_000, 100_000 + OFFLINE_BADGE_AFTER_MS), true);
});

test("the agent's new download summary is reworded too", () => {
  assert.match(
    friendlyError("1 of 3 items are not on the screen yet: dial tcp: i/o timeout") ?? "",
    /couldn't be downloaded/,
  );
});

test("a cabled screen has a network to name", () => {
  assert.equal(networkName({ connected: true, ssid: "Shop" }), "Shop");
  assert.equal(networkName({ connected: true, wired: true }), "a network cable");
  assert.equal(networkName({ connected: true }), null);
  assert.equal(networkName({ connected: false, ssid: "Shop" }), null);
  assert.equal(networkName(null), null);
});
