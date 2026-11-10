import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";

import {
  fleetManagedCapabilities,
  fleetManagedGeneration,
  fleetManagedProtocolVersion,
  healthCapturedSinceAgentStart,
  osVersionMatches,
  planReleaseRollout,
  releaseCommandPayloadForDevice,
  releaseUpdatePayloadSchema,
  releaseVersionPattern,
  supportsSystemBundles,
  systemUpdateConfirmTimeoutMs,
  systemUpdateOutcome,
} from "@showroom/contracts";

import * as mock from "../apps/admin/src/lib/mock-store";
import { signReleaseChecksum } from "../apps/admin/src/lib/release-signing";

const digest = "a".repeat(64);
const managed = {
  applianceGeneration: fleetManagedGeneration,
  agentProtocolVersion: fleetManagedProtocolVersion,
  capabilities: [...fleetManagedCapabilities] as string[],
};
// Showroom OS: the same agent, plus the system_bundles capability.
const showroomOs = { ...managed, capabilities: [...managed.capabilities, "system_bundles"] };
const legacy = { applianceGeneration: null, agentProtocolVersion: null, capabilities: [] as string[] };

const fullRelease = {
  version: "2026.11.09.42",
  playerUrl: "https://example.com/player.tar.gz",
  playerSha256: digest,
  playerSignature: "player-signature",
  agentUrl: "https://example.com/agent",
  agentSha256: digest,
  agentSignature: "agent-signature",
  systemUrl: "https://example.com/showroom-os.raucb",
  systemSha256: digest,
  systemSignature: "system-signature",
  signingKeyId: "production-2026",
};
const systemOnlyRelease = {
  version: fullRelease.version,
  systemUrl: fullRelease.systemUrl,
  systemSha256: digest,
  systemSignature: "system-signature",
  signingKeyId: "production-2026",
};

test("the system bundle is only sent to screens that advertise system_bundles", () => {
  const forShowroomOs = releaseCommandPayloadForDevice(fullRelease, showroomOs);
  assert.equal(forShowroomOs?.systemUrl, fullRelease.systemUrl);
  assert.equal(forShowroomOs?.systemVersion, fullRelease.version);
  assert.equal(forShowroomOs?.systemSignature, "system-signature");

  // A Raspberry Pi OS screen rejects a whole release that carries a system
  // part, so it must get the player and agent parts and nothing else.
  const forPiOs = releaseCommandPayloadForDevice(fullRelease, managed);
  assert.ok(forPiOs);
  assert.equal(forPiOs.playerUrl, fullRelease.playerUrl);
  assert.equal(forPiOs.agentUrl, fullRelease.agentUrl);
  for (const key of ["systemUrl", "systemSha256", "systemSignature", "systemVersion"] as const) {
    assert.equal(forPiOs[key], undefined, key);
  }
  assert.equal(JSON.stringify(forPiOs).includes("system"), false);
  assert.equal(releaseUpdatePayloadSchema.safeParse(forShowroomOs).success, true);
  assert.equal(releaseUpdatePayloadSchema.safeParse(JSON.parse(JSON.stringify(forPiOs))).success, true);
});

test("a screen that would get nothing from a release is skipped, not sent an empty update", () => {
  assert.equal(releaseCommandPayloadForDevice(systemOnlyRelease, managed), null);
  assert.equal(releaseCommandPayloadForDevice(systemOnlyRelease, legacy), null);
  assert.equal(releaseCommandPayloadForDevice(fullRelease, legacy), null);
  assert.ok(releaseCommandPayloadForDevice(systemOnlyRelease, showroomOs));
});

test("system_bundles alone does not make an unmanaged screen eligible", () => {
  assert.equal(supportsSystemBundles({ ...legacy, capabilities: ["system_bundles"] }), false);
  assert.equal(supportsSystemBundles(managed), false);
  assert.equal(supportsSystemBundles(showroomOs), true);
});

test("a system-only rollout targets Showroom OS screens and refuses hand-picked others", () => {
  const devices = [
    { id: "pi-os", organizationId: "org_a", ...managed },
    { id: "showroom-os", organizationId: "org_a", ...showroomOs },
    { id: "legacy", organizationId: "org_a", ...legacy },
  ];
  const all = planReleaseRollout({ release: systemOnlyRelease, releaseOrganizationId: "org_a", devices });
  assert.ok(all.ok);
  assert.deepEqual(all.targets.map((target) => target.device.id), ["showroom-os"]);
  assert.equal(all.targets[0]!.includesSystem, true);

  const picked = planReleaseRollout({
    release: systemOnlyRelease,
    releaseOrganizationId: "org_a",
    devices,
    requestedIds: ["pi-os"],
  });
  assert.equal(picked.ok, false);

  const none = planReleaseRollout({
    release: systemOnlyRelease,
    releaseOrganizationId: "org_a",
    devices: devices.filter((device) => device.id !== "showroom-os"),
  });
  assert.deepEqual(none, { ok: false, error: "No screens running Showroom OS are available for this system update" });
});

test("a mixed rollout reaches every flashed screen and marks which ones get the OS part", () => {
  const plan = planReleaseRollout({
    release: fullRelease,
    releaseOrganizationId: "org_a",
    devices: [
      { id: "pi-os", organizationId: "org_a", ...managed },
      { id: "showroom-os", organizationId: "org_a", ...showroomOs },
      { id: "legacy", organizationId: "org_a", ...legacy },
    ],
  });
  assert.ok(plan.ok);
  const bySystem = Object.fromEntries(plan.targets.map((target) => [target.device.id, target.includesSystem]));
  assert.deepEqual(bySystem, { "pi-os": false, "showroom-os": true });
});

test("the canary is one of the operator's own recently seen screens, and nothing is queued twice", () => {
  const devices = [
    { id: "customer-fresh", organizationId: "org_customer", lastHeartbeatAt: 900, ...managed },
    { id: "own-stale", organizationId: "org_platform", lastHeartbeatAt: 100, ...managed },
    { id: "own-fresh", organizationId: "org_platform", lastHeartbeatAt: 800, ...managed },
  ];
  const plan = planReleaseRollout({ release: fullRelease, releaseOrganizationId: "org_platform", devices });
  assert.ok(plan.ok);
  assert.deepEqual(plan.targets.map((target) => target.device.id), ["own-fresh", "own-stale", "customer-fresh"]);
  assert.equal(plan.targets[0]!.ring, 0);
  assert.ok(plan.targets[2]!.ring > 0);

  const again = planReleaseRollout({
    release: fullRelease,
    releaseOrganizationId: "org_platform",
    devices,
    activeDeviceIds: new Set(["own-fresh", "own-stale"]),
  });
  assert.ok(again.ok);
  assert.deepEqual(again.targets.map((target) => target.device.id), ["customer-fresh"]);

  const nothingLeft = planReleaseRollout({
    release: fullRelease,
    releaseOrganizationId: "org_platform",
    devices,
    activeDeviceIds: new Set(devices.map((device) => device.id)),
  });
  assert.equal(nothingLeft.ok, false);
});

test("the reported OS name is matched by its version token", () => {
  const pretty = "Showroom OS 2026.11.09.42 (Buildroot 2026.02.3)";
  assert.equal(osVersionMatches(pretty, "2026.11.09.42"), true);
  assert.equal(osVersionMatches("Showroom OS 2026.11.09.42 dev (Buildroot 2026.02.3)", "2026.11.09.42"), true);
  assert.equal(osVersionMatches(pretty, "2026.11.09.4"), false);
  assert.equal(osVersionMatches(pretty, "2026.02.3"), false);
  assert.equal(osVersionMatches("Debian GNU/Linux 13 (trixie)", "2026.11.09.42"), false);
  assert.equal(osVersionMatches(null, "2026.11.09.42"), false);
  assert.equal(osVersionMatches(pretty, " "), false);
});

test("a system update is confirmed only by a restarted screen on the new version", () => {
  const installedAt = 1_000_000;
  const base = { installedAt, expectedVersion: "2026.11.09.42" };
  const newOs = "Showroom OS 2026.11.09.42 (Buildroot 2026.02.3)";
  const oldOs = "Showroom OS 2026.10.01.7 (Buildroot 2026.02.3)";

  // Heartbeats from the agent that ran the install (before the restart) say nothing yet.
  assert.equal(
    systemUpdateOutcome({ ...base, now: installedAt + 3_000, agentStartedAt: installedAt - 60_000, osVersion: oldOs }),
    "pending",
  );
  assert.equal(
    systemUpdateOutcome({ ...base, now: installedAt + 90_000, agentStartedAt: installedAt + 60_000, osVersion: newOs }),
    "confirmed",
  );
  // The screen came back on the old OS: RAUC rolled it back.
  assert.equal(
    systemUpdateOutcome({ ...base, now: installedAt + 90_000, agentStartedAt: installedAt + 60_000, osVersion: oldOs }),
    "rolled_back",
  );
  // Restarted, but no fresh health report yet.
  assert.equal(
    systemUpdateOutcome({ ...base, now: installedAt + 90_000, agentStartedAt: installedAt + 60_000, osVersion: null }),
    "pending",
  );
  assert.equal(systemUpdateOutcome({ ...base, now: installedAt + systemUpdateConfirmTimeoutMs }), "timed_out");
  assert.equal(systemUpdateOutcome({ ...base, now: installedAt + systemUpdateConfirmTimeoutMs - 1 }), "pending");
});

test("a health report saved before the restart is not taken as the new OS version", () => {
  const sentAt = Date.parse("2026-11-09T12:10:00.000Z");
  const heartbeat = (capturedAt: string, uptimeSeconds: number) => ({
    lastSeenAt: new Date(sentAt).toISOString(),
    uptimeSeconds,
    health: { capturedAt },
  });
  // Agent started 20 s ago; the health block is from 10 minutes ago (read back from disk).
  assert.equal(healthCapturedSinceAgentStart(heartbeat("2026-11-09T12:00:00.000Z", 20)), false);
  assert.equal(healthCapturedSinceAgentStart(heartbeat("2026-11-09T12:09:55.000Z", 20)), true);
  assert.equal(healthCapturedSinceAgentStart({ lastSeenAt: "nope", uptimeSeconds: 20, health: { capturedAt: "x" } }), false);
  assert.equal(healthCapturedSinceAgentStart({}), false);
});

test("release versions are limited to what the agent accepts in a path", () => {
  assert.equal(releaseVersionPattern.test("2026.11.09.42"), true);
  assert.equal(releaseVersionPattern.test("v1.2.3-rc_1"), true);
  assert.equal(releaseVersionPattern.test("spring release"), false);
  assert.equal(releaseVersionPattern.test("../etc"), false);
  assert.equal(releaseVersionPattern.test(""), false);
});

test("server-side signing produces the signature the agent verifies", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const env = {
    SHOWROOM_RELEASE_SIGNING_PRIVATE_KEY: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString()
      .replace(/\n/g, "\\n"),
    SHOWROOM_RELEASE_SIGNING_KEY_ID: "test-key",
  };
  const signed = signReleaseChecksum(`sha256:${digest.toUpperCase()}`, env);
  assert.equal(signed.keyId, "test-key");
  // The agent verifies Ed25519 over the raw 32-byte digest.
  assert.equal(
    verify(null, Buffer.from(digest, "hex"), publicKey, Buffer.from(signed.signature, "base64")),
    true,
  );
  assert.throws(() => signReleaseChecksum(digest, {}), /not configured/);
  assert.throws(() => signReleaseChecksum("not-a-digest", env), /SHA-256/);
});

function resetMockFleet() {
  delete (globalThis as typeof globalThis & { __showroomMockState?: unknown }).__showroomMockState;
}

test("mock mode sends the same per-screen payloads as the real backend", () => {
  resetMockFleet();
  const release = mock.createRelease({ name: "Autumn", ...fullRelease });
  mock.deployRelease({ releaseId: release.id });
  const commands = mock.listCommands().filter((command) => command.commandType === "update_release");
  assert.ok(commands.length > 0);
  for (const command of commands) {
    // No demo screen runs Showroom OS, so none may be told to install the bundle.
    assert.equal("systemUrl" in command.payload, false);
    assert.equal(command.payload.playerUrl, fullRelease.playerUrl);
    assert.notEqual(mock.getDevice("org-demo", command.deviceId)?.fleetManagementState, "legacy");
  }

  const systemOnly = mock.createRelease({ name: "OS only", ...systemOnlyRelease });
  assert.throws(() => mock.deployRelease({ releaseId: systemOnly.id }), /Showroom OS/);
  assert.throws(() => mock.createRelease({ name: "Bad", ...fullRelease, version: "bad version" }), /version/i);
  resetMockFleet();
});

test("mock mode locks out claim-code guessing like the real backend", () => {
  resetMockFleet();
  const registration = mock.registerTemporaryDevice();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.deepEqual(
      mock.claimDevice({ orgId: "org-guesser", claimCode: "ZZZZZZ", name: "Lobby", siteName: "HQ" }),
      { error: "invalid_code" },
    );
  }
  // Locked out: even the right code is refused for this workspace...
  assert.deepEqual(
    mock.claimDevice({ orgId: "org-guesser", claimCode: registration.claimCode, name: "Lobby", siteName: "HQ" }),
    { error: "too_many_attempts" },
  );
  // ...while another workspace can still pair the screen.
  const claimed = mock.claimDevice({ orgId: "org-demo", claimCode: registration.claimCode, name: "Lobby", siteName: "HQ" });
  assert.ok("deviceId" in claimed);
  // A used code cannot be claimed again.
  assert.deepEqual(
    mock.claimDevice({ orgId: "org-demo", claimCode: registration.claimCode, name: "Lobby", siteName: "HQ" }),
    { error: "invalid_code" },
  );
  resetMockFleet();
});
