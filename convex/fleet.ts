import { ConvexError, v } from "convex/values";
import {
  defaultRolloutRings,
  fleetManagedGeneration,
  isFleetManagedDevice,
  planReleaseRollout,
  releaseCommandPayloadForDevice,
  shouldPauseRollout,
  supportsSystemBundles,
  systemUpdateOutcome,
} from "@showroom/contracts";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation } from "./_generated/server";
import { requirePlatformAdmin } from "./lib";

const defaultFailureThresholdPercent = 10;

function rolloutDescriptor(device: Doc<"devices">) {
  return {
    id: device._id as string,
    organizationId: device.organizationId,
    lastHeartbeatAt: device.lastHeartbeatAt,
    applianceGeneration: device.applianceGeneration,
    agentProtocolVersion: device.agentProtocolVersion,
    capabilities: device.capabilities,
  };
}

// Queues the update_release command for one screen. The payload is built per
// screen: the system bundle is only included for screens that advertise the
// system_bundles capability. Returns null when nothing in the release applies.
export async function queueReleaseCommand(
  ctx: MutationCtx,
  release: Doc<"releases">,
  device: Doc<"devices">,
  now: number,
) {
  const payload = releaseCommandPayloadForDevice(release, device);
  if (!payload) return null;
  return ctx.db.insert("deviceCommands", {
    organizationId: device.organizationId ?? release.organizationId,
    deviceId: device._id,
    commandType: "update_release",
    status: "queued",
    payload,
    queuedAt: now,
    maxAttempts: 5,
    idempotencyKey: `release:${release._id}:${device._id}`,
  });
}

function desiredVersionPatch(release: Doc<"releases">, device: Doc<"devices">, now: number) {
  return {
    desiredAgentVersion: release.agentUrl ? release.version : device.desiredAgentVersion,
    desiredPlayerVersion: release.playerUrl ? release.version : device.desiredPlayerVersion,
    desiredSystemVersion:
      release.systemUrl && supportsSystemBundles(device)
        ? release.version
        : device.desiredSystemVersion,
    updatedAt: now,
  };
}

// Starts (or widens) a staged rollout. Ring 0 is queued right away; later
// rings wait for the cron to see the earlier ring finish cleanly.
export async function startReleaseRollout(
  ctx: MutationCtx,
  release: Doc<"releases">,
  options: { deviceIds?: Array<Id<"devices">>; allWorkspaces?: boolean },
) {
  const now = Date.now();
  const candidates = options.allWorkspaces
    ? (await ctx.db.query("devices").take(5_000)).filter((device) => Boolean(device.organizationId))
    : await ctx.db
        .query("devices")
        .withIndex("by_org", (q) => q.eq("organizationId", release.organizationId))
        .take(2_000);
  const existing = await ctx.db
    .query("releaseRollouts")
    .withIndex("by_release_and_queued_at", (q) => q.eq("releaseId", release._id))
    .take(5_000);
  const activeDeviceIds = new Set<string>(
    existing
      .filter((entry) => entry.status === "waiting" || entry.status === "queued" || entry.status === "in_progress")
      .map((entry) => entry.deviceId),
  );

  const byId = new Map(candidates.map((device) => [device._id as string, device]));
  const plan = planReleaseRollout({
    release,
    releaseOrganizationId: release.organizationId,
    devices: candidates.map(rolloutDescriptor),
    requestedIds: options.deviceIds,
    activeDeviceIds,
  });
  if (!plan.ok) {
    throw new ConvexError(plan.error);
  }

  // A screen that already finished (or failed) this release is being sent it
  // again on purpose; keep one row per screen.
  const targetIds = new Set(plan.targets.map((target) => target.device.id));
  for (const entry of existing) {
    if (targetIds.has(entry.deviceId) && !activeDeviceIds.has(entry.deviceId)) {
      await ctx.db.delete(entry._id);
    }
  }

  let queuedDeviceCount = 0;
  for (const target of plan.targets) {
    const device = byId.get(target.device.id)!;
    const commandId = target.ring === 0
      ? (await queueReleaseCommand(ctx, release, device, now)) ?? undefined
      : undefined;
    if (commandId) queuedDeviceCount += 1;

    await ctx.db.insert("releaseRollouts", {
      organizationId: release.organizationId,
      releaseId: release._id,
      deviceId: device._id,
      commandId,
      ring: target.ring,
      status: commandId ? "queued" : "waiting",
      applianceGeneration: fleetManagedGeneration,
      deviceOrganizationId:
        device.organizationId !== release.organizationId ? device.organizationId : undefined,
      includesSystem: target.includesSystem || undefined,
      queuedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(device._id, desiredVersionPatch(release, device, now));
  }

  await ctx.db.patch(release._id, {
    rolloutStatus: "active",
    rolloutRings: [...defaultRolloutRings],
    currentRing: 0,
    failureThresholdPercent: release.failureThresholdPercent ?? defaultFailureThresholdPercent,
    rolloutStartedAt: now,
    rolloutCompletedAt: undefined,
    updatedAt: now,
  });

  return { queuedDeviceCount, targetDeviceCount: plan.targets.length };
}

async function queueRollout(ctx: MutationCtx, release: Doc<"releases">, rollout: Doc<"releaseRollouts">) {
  const device = await ctx.db.get(rollout.deviceId);
  const now = Date.now();
  const expectedOrgId = rollout.deviceOrganizationId ?? release.organizationId;
  if (!device || device.organizationId !== expectedOrgId) {
    await ctx.db.patch(rollout._id, {
      status: "failed",
      message: "This screen was removed before the release reached it",
      completedAt: now,
      updatedAt: now,
    });
    return false;
  }
  if (!isFleetManagedDevice(device)) {
    await ctx.db.patch(rollout._id, {
      status: "paused",
      message: "Waiting for this device to be flashed with the fleet appliance",
      updatedAt: now,
    });
    return false;
  }
  const commandId = await queueReleaseCommand(ctx, release, device, now);
  if (!commandId) {
    await ctx.db.patch(rollout._id, {
      status: "failed",
      message: "This screen can no longer install this release",
      completedAt: now,
      updatedAt: now,
    });
    return false;
  }
  await ctx.db.patch(rollout._id, {
    commandId,
    status: "queued",
    applianceGeneration: fleetManagedGeneration,
    includesSystem: (Boolean(release.systemUrl) && supportsSystemBundles(device)) || undefined,
    systemVersion: undefined,
    systemInstalledAt: undefined,
    queuedAt: now,
    message: undefined,
    startedAt: undefined,
    completedAt: undefined,
    updatedAt: now,
  });
  return true;
}

// A screen that installed a system bundle but never reported back on the new
// version counts as failed, so the failure gate can stop the rollout.
async function failUnconfirmedSystemUpdates(ctx: MutationCtx, rollouts: Array<Doc<"releaseRollouts">>) {
  const now = Date.now();
  for (const rollout of rollouts) {
    if (rollout.status !== "in_progress" || !rollout.systemInstalledAt || !rollout.systemVersion) continue;
    const outcome = systemUpdateOutcome({
      installedAt: rollout.systemInstalledAt,
      expectedVersion: rollout.systemVersion,
      now,
    });
    if (outcome !== "timed_out") continue;
    const message = "The screen installed the system update but has not come back online on the new version";
    await ctx.db.patch(rollout._id, { status: "failed", message, completedAt: now, updatedAt: now });
    rollout.status = "failed";
  }
}

async function evaluateRelease(ctx: MutationCtx, release: Doc<"releases">) {
  const rollouts = await ctx.db
    .query("releaseRollouts")
    .withIndex("by_release_and_queued_at", (q) => q.eq("releaseId", release._id))
    .take(5_000);
  await failUnconfirmedSystemUpdates(ctx, rollouts);
  const currentRing = release.currentRing ?? 0;
  const current = rollouts.filter((rollout) => (rollout.ring ?? 0) === currentRing);
  if (current.some((rollout) => rollout.status === "paused")) {
    await ctx.db.patch(release._id, { rolloutStatus: "paused", updatedAt: Date.now() });
    return;
  }
  if (current.some((rollout) => rollout.status === "queued" || rollout.status === "in_progress")) {
    return;
  }

  const failed = current.filter((rollout) => rollout.status === "failed").length;
  if (shouldPauseRollout(failed, current.length, release.failureThresholdPercent ?? 10)) {
    const now = Date.now();
    await ctx.db.patch(release._id, { rolloutStatus: "paused", updatedAt: now });
    for (const rollout of rollouts) {
      if (rollout.status === "waiting") {
        await ctx.db.patch(rollout._id, { status: "paused", updatedAt: now });
      }
    }
    return;
  }

  const nextRing = rollouts
    .filter((rollout) => rollout.status === "waiting" && (rollout.ring ?? 0) >= currentRing)
    .reduce<number | null>((minimum, rollout) => {
      const ring = rollout.ring ?? 0;
      return minimum === null || ring < minimum ? ring : minimum;
    }, null);
  if (nextRing === null) {
    await ctx.db.patch(release._id, {
      rolloutStatus: "completed",
      rolloutCompletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return;
  }

  // ">=" above: a screen in the current ring that was paused and resumed is
  // waiting again and must not be left behind.
  for (const rollout of rollouts.filter(
    (entry) => entry.status === "waiting" && (entry.ring ?? 0) === nextRing,
  )) {
    await queueRollout(ctx, release, rollout);
  }
  await ctx.db.patch(release._id, {
    currentRing: nextRing,
    rolloutStatus: "active",
    updatedAt: Date.now(),
  });
}

export const progressReleaseRollouts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const active = await ctx.db
      .query("releases")
      .withIndex("by_rollout_status", (q) => q.eq("rolloutStatus", "active"))
      .take(50);
    for (const release of active) await evaluateRelease(ctx, release);
    return null;
  },
});

export const controlReleaseRollout = mutation({
  args: {
    releaseId: v.id("releases"),
    action: v.union(v.literal("pause"), v.literal("resume"), v.literal("retry_failed")),
  },
  returns: v.object({ status: v.string() }),
  handler: async (ctx, args) => {
    const { orgId } = await requirePlatformAdmin(ctx);
    const release = await ctx.db.get(args.releaseId);
    if (!release || release.organizationId !== orgId) throw new ConvexError("Release not found");
    const now = Date.now();
    const rollouts = await ctx.db
      .query("releaseRollouts")
      .withIndex("by_release_and_queued_at", (q) => q.eq("releaseId", release._id))
      .take(5_000);
    if (!rollouts.length) {
      throw new ConvexError("This release has not been deployed to any screen yet");
    }

    if (args.action === "pause") {
      await ctx.db.patch(release._id, { rolloutStatus: "paused", updatedAt: now });
      for (const rollout of rollouts) {
        if (rollout.status === "waiting") await ctx.db.patch(rollout._id, { status: "paused", updatedAt: now });
      }
      return { status: "paused" };
    }

    if (args.action === "retry_failed") {
      for (const rollout of rollouts) {
        if (rollout.status === "paused") await ctx.db.patch(rollout._id, { status: "waiting", updatedAt: now });
      }
      for (const rollout of rollouts.filter(
        (entry) => entry.status === "failed" && (entry.ring ?? 0) === (release.currentRing ?? 0),
      )) {
        await queueRollout(ctx, release, rollout);
      }
    } else {
      for (const rollout of rollouts) {
        if (rollout.status === "paused") await ctx.db.patch(rollout._id, { status: "waiting", updatedAt: now });
      }
    }
    await ctx.db.patch(release._id, { rolloutStatus: "active", updatedAt: now });
    return { status: "active" };
  },
});
