import { ConvexError, v } from "convex/values";
import {
  fleetManagedGeneration,
  isFleetManagedDevice,
  shouldPauseRollout,
} from "@showroom/contracts";

import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation } from "./_generated/server";
import { requireAdmin } from "./lib";

function commandPayload(release: Doc<"releases">) {
  return {
    version: release.version,
    agentVersion: release.agentUrl ? release.version : undefined,
    agentUrl: release.agentUrl,
    agentSha256: release.agentSha256,
    agentSignature: release.agentSignature,
    playerVersion: release.playerUrl ? release.version : undefined,
    playerUrl: release.playerUrl,
    playerSha256: release.playerSha256,
    playerSignature: release.playerSignature,
    signingKeyId: release.signingKeyId,
  };
}

async function queueRollout(ctx: any, release: Doc<"releases">, rollout: Doc<"releaseRollouts">) {
  const device = await ctx.db.get(rollout.deviceId);
  if (!device || device.organizationId !== release.organizationId) return false;
  const now = Date.now();
  if (!isFleetManagedDevice(device)) {
    await ctx.db.patch(rollout._id, {
      status: "paused",
      message: "Waiting for this device to be flashed with the fleet appliance",
      updatedAt: now,
    });
    return false;
  }
  const commandId = await ctx.db.insert("deviceCommands", {
    organizationId: release.organizationId,
    deviceId: device._id,
    commandType: "update_release",
    status: "queued",
    payload: commandPayload(release),
    queuedAt: now,
    maxAttempts: 5,
    idempotencyKey: `release:${release._id}:${device._id}`,
  });
  await ctx.db.patch(rollout._id, {
    commandId,
    status: "queued",
    applianceGeneration: fleetManagedGeneration,
    queuedAt: now,
    message: undefined,
    startedAt: undefined,
    completedAt: undefined,
    updatedAt: now,
  });
  return true;
}

async function evaluateRelease(ctx: any, release: Doc<"releases">) {
  const rollouts = await ctx.db
    .query("releaseRollouts")
    .withIndex("by_release_and_queued_at", (q: any) => q.eq("releaseId", release._id))
    .take(2_000) as Array<Doc<"releaseRollouts">>;
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
    .filter((rollout) => rollout.status === "waiting" && (rollout.ring ?? 0) > currentRing)
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

  for (const rollout of rollouts.filter(
    (entry) => entry.status === "waiting" && entry.ring === nextRing,
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
    const { orgId } = await requireAdmin(ctx);
    const release = await ctx.db.get(args.releaseId);
    if (!release || release.organizationId !== orgId) throw new ConvexError("Release not found");
    const now = Date.now();
    const rollouts = await ctx.db
      .query("releaseRollouts")
      .withIndex("by_release_and_queued_at", (q) => q.eq("releaseId", release._id))
      .take(2_000);

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
