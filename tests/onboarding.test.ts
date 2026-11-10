import assert from "node:assert/strict";
import test from "node:test";

import {
  type SetupDevice,
  needsSetup,
  parseClaimCode,
  screenSetupState,
  setupProgress,
} from "../apps/admin/src/lib/onboarding";

function screen(overrides: Partial<SetupDevice> = {}): SetupDevice {
  return {
    id: "device-1",
    name: "Front Window",
    status: "online",
    screenshotUrl: null,
    currentPlaylistName: null,
    manifestVersion: "manifest-1",
    contentState: "current",
    lastError: null,
    health: undefined,
    lastHeartbeatAt: "2026-11-10T12:00:00.000Z",
    ...overrides,
  };
}

const mainPlaylist = { id: "playlist-1", name: "Main playlist", isDefault: true, items: ["item-1"] };

test("a new workspace starts at getting the screen ready", () => {
  const progress = setupProgress({ devices: [], mediaCount: 0, playlists: [] });
  assert.equal(progress.current, "prepare");
  assert.equal(progress.doneCount, 0);
  assert.equal(progress.screenState, "none");
  assert.equal(progress.complete, false);
});

test("content added before any screen is paired counts, and pairing stays open", () => {
  const progress = setupProgress({ devices: [], mediaCount: 1, playlists: [mainPlaylist] });
  assert.deepEqual(progress.done, { prepare: false, pair: false, content: true, playing: false });
  assert.equal(progress.current, "prepare");
  assert.equal(progress.playlist?.name, "Main playlist");
});

test("a paired screen with nothing to play points at adding content", () => {
  const progress = setupProgress({ devices: [screen()], mediaCount: 0, playlists: [] });
  assert.equal(progress.current, "content");
  assert.equal(progress.screenState, "waiting_for_content");
  assert.equal(progress.doneCount, 2);
});

test("an empty default playlist is not content", () => {
  const progress = setupProgress({
    devices: [screen({ currentPlaylistName: "Main playlist" })],
    mediaCount: 0,
    playlists: [{ ...mainPlaylist, items: [] }],
  });
  assert.equal(progress.hasContent, false);
  assert.equal(progress.candidatePlaylist, null);
});

test("a playlist that is not the default is offered as a one-click start", () => {
  const progress = setupProgress({
    devices: [screen()],
    mediaCount: 2,
    playlists: [{ ...mainPlaylist, isDefault: false }],
  });
  assert.equal(progress.hasContent, false);
  assert.equal(progress.candidatePlaylist?.id, "playlist-1");
});

test("the screen is followed from downloading to playing", () => {
  const downloading = setupProgress({
    devices: [screen({ contentState: "updating", currentPlaylistName: "Main playlist" })],
    mediaCount: 1,
    playlists: [mainPlaylist],
  });
  assert.equal(downloading.screenState, "downloading");
  assert.equal(downloading.current, "playing");
  assert.equal(downloading.complete, false);

  const playing = setupProgress({
    devices: [screen({ currentPlaylistName: "Main playlist" })],
    mediaCount: 1,
    playlists: [mainPlaylist],
  });
  assert.equal(playing.screenState, "playing");
  assert.equal(playing.complete, true);
  assert.equal(playing.doneCount, 4);
});

test("a screen that has not checked in is waited for, not called playing", () => {
  const progress = setupProgress({
    devices: [screen({ status: "offline", manifestVersion: null, contentState: "unknown" })],
    mediaCount: 1,
    playlists: [mainPlaylist],
  });
  assert.equal(progress.screenState, "offline");
  assert.equal(progress.done.pair, true);
  assert.equal(progress.complete, false);
});

test("problems on the screen are reported in its own words", () => {
  const hdmi = screenSetupState(
    screen({
      health: {
        capturedAt: "2026-11-10T12:00:00.000Z",
        hardwareProfile: "rpi5",
        hdmiConnected: false,
        playerHealthy: true,
      },
    }),
    true,
  );
  assert.equal(hdmi.state, "problem");
  assert.match(hdmi.problem ?? "", /HDMI/);

  const content = screenSetupState(screen({ lastError: "1 of 1 items are not on the screen yet" }), true);
  assert.deepEqual(content, { state: "problem", problem: "1 of 1 items are not on the screen yet" });

  // While content is still arriving, an earlier error does not hide the download.
  assert.equal(screenSetupState(screen({ contentState: "updating", lastError: "old" }), true).state, "downloading");
});

test("screens on older software count as playing once they hold any content version", () => {
  assert.equal(screenSetupState(screen({ contentState: "unknown" }), true).state, "playing");
  assert.equal(screenSetupState(screen({ contentState: undefined, manifestVersion: null }), true).state, "downloading");
});

test("the guide follows the screen furthest along, or the one just paired", () => {
  const devices = [
    screen({ id: "old", name: "Old", status: "offline" }),
    screen({ id: "new", name: "New", contentState: "updating" }),
    screen({ id: "done", name: "Done" }),
  ];
  const input = { devices, mediaCount: 1, playlists: [mainPlaylist] };
  assert.equal(setupProgress(input).screen?.id, "done");
  const preferred = setupProgress({ ...input, preferredScreenId: "new" });
  assert.equal(preferred.screen?.id, "new");
  assert.equal(preferred.screenState, "downloading");
  assert.equal(setupProgress({ ...input, preferredScreenId: "gone" }).screen?.id, "done");
});

test("a workspace run on per-screen playlists with no default counts as set up", () => {
  const progress = setupProgress({
    devices: [screen({ currentPlaylistName: "Window loop" })],
    mediaCount: 3,
    playlists: [{ id: "playlist-2", name: "Window loop", isDefault: false, items: ["a", "b"] }],
  });
  assert.equal(progress.hasContent, true);
  assert.equal(progress.playlist?.name, "Window loop");
  assert.equal(progress.complete, true);
});

test("the sidebar flags setup only while no screen has anything to play", () => {
  assert.equal(needsSetup([]), true);
  assert.equal(needsSetup([{ currentPlaylistName: null }]), true);
  assert.equal(needsSetup([{ currentPlaylistName: null }, { currentPlaylistName: "Main playlist" }]), false);
});

test("pairing codes from a link are cleaned up or dropped", () => {
  assert.equal(parseClaimCode("ab12cd"), "AB12CD");
  assert.equal(parseClaimCode(["AB12CD"]), undefined);
  assert.equal(parseClaimCode("AB12CD&next=//evil"), undefined);
  assert.equal(parseClaimCode(undefined), undefined);
});
