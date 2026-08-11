import { v } from "convex/values";
import { fleetManagedGeneration } from "@showroom/contracts";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const day = 24 * 60 * 60_000;

export const pruneFleetTelemetry = internalMutation({
  args: {},
  returns: v.object({ heartbeats: v.number(), screenshots: v.number(), diagnostics: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const heartbeats = await ctx.db
      .query("deviceHeartbeats")
      .withIndex("by_appliance_generation_and_received_at", (q) =>
        q.eq("applianceGeneration", fleetManagedGeneration).lt("receivedAt", now - 30 * day),
      )
      .take(500);
    const screenshots = await ctx.db
      .query("deviceScreenshots")
      .withIndex("by_appliance_generation_and_created_at", (q) =>
        q.eq("applianceGeneration", fleetManagedGeneration).lt("createdAt", now - 14 * day),
      )
      .take(100);
    const diagnostics = await ctx.db
      .query("deviceDiagnostics")
      .withIndex("by_appliance_generation_and_occurred_at", (q) =>
        q.eq("applianceGeneration", fleetManagedGeneration).lt("occurredAt", now - 30 * day),
      )
      .take(500);

    for (const heartbeat of heartbeats) await ctx.db.delete(heartbeat._id);
    for (const screenshot of screenshots) {
      if (screenshot.storageId) await ctx.storage.delete(screenshot.storageId);
      await ctx.db.delete(screenshot._id);
    }
    for (const diagnostic of diagnostics) await ctx.db.delete(diagnostic._id);
    return {
      heartbeats: heartbeats.length,
      screenshots: screenshots.length,
      diagnostics: diagnostics.length,
    };
  },
});

const purgeStage = v.union(
  v.literal("credentials"),
  v.literal("registrations"),
  v.literal("heartbeats"),
  v.literal("screenshots"),
  v.literal("manifests"),
  v.literal("commands"),
  v.literal("rollouts"),
  v.literal("alerts"),
  v.literal("diagnostics"),
  v.literal("scheduleTargets"),
);

const purgeStages = [
  "credentials",
  "registrations",
  "heartbeats",
  "screenshots",
  "manifests",
  "commands",
  "rollouts",
  "alerts",
  "diagnostics",
  "scheduleTargets",
] as const;

export const purgeRemovedScreenData = internalMutation({
  args: {
    deviceId: v.id("devices"),
    stage: v.optional(purgeStage),
  },
  returns: v.object({ removed: v.number(), complete: v.boolean() }),
  handler: async (ctx, args) => {
    const stage = args.stage ?? "credentials";
    const batchSize = 200;
    let removed = 0;

    if (stage === "credentials") {
      const records = await ctx.db.query("deviceCredentials").withIndex("by_device", (q) => q.eq("deviceId", args.deviceId)).take(batchSize);
      for (const record of records) await ctx.db.delete(record._id);
      removed = records.length;
    } else if (stage === "registrations") {
      const records = await ctx.db.query("deviceRegistrations").withIndex("by_claimed_device", (q) => q.eq("claimedDeviceId", args.deviceId)).take(batchSize);
      for (const record of records) await ctx.db.delete(record._id);
      removed = records.length;
    } else if (stage === "heartbeats") {
      const records = await ctx.db.query("deviceHeartbeats").withIndex("by_device_and_received_at", (q) => q.eq("deviceId", args.deviceId)).take(batchSize);
      for (const record of records) await ctx.db.delete(record._id);
      removed = records.length;
    } else if (stage === "screenshots") {
      const records = await ctx.db.query("deviceScreenshots").withIndex("by_device_and_captured_at", (q) => q.eq("deviceId", args.deviceId)).take(batchSize);
      for (const record of records) {
        if (record.storageId) await ctx.storage.delete(record.storageId);
        await ctx.db.delete(record._id);
      }
      removed = records.length;
    } else if (stage === "manifests") {
      const records = await ctx.db.query("compiledManifests").withIndex("by_device_and_active", (q) => q.eq("deviceId", args.deviceId)).take(batchSize);
      for (const record of records) await ctx.db.delete(record._id);
      removed = records.length;
    } else if (stage === "commands") {
      const records = await ctx.db.query("deviceCommands").withIndex("by_device_and_queued_at", (q) => q.eq("deviceId", args.deviceId)).take(batchSize);
      for (const record of records) await ctx.db.delete(record._id);
      removed = records.length;
    } else if (stage === "rollouts") {
      const records = await ctx.db.query("releaseRollouts").withIndex("by_device_and_queued_at", (q) => q.eq("deviceId", args.deviceId)).take(batchSize);
      for (const record of records) await ctx.db.delete(record._id);
      removed = records.length;
    } else if (stage === "alerts") {
      const records = await ctx.db.query("alertEvents").withIndex("by_device", (q) => q.eq("deviceId", args.deviceId)).take(batchSize);
      for (const record of records) await ctx.db.delete(record._id);
      removed = records.length;
    } else if (stage === "diagnostics") {
      const records = await ctx.db.query("deviceDiagnostics").withIndex("by_device_and_occurred_at", (q) => q.eq("deviceId", args.deviceId)).take(batchSize);
      for (const record of records) await ctx.db.delete(record._id);
      removed = records.length;
    } else {
      const records = await ctx.db.query("scheduleTargets").withIndex("by_device", (q) => q.eq("deviceId", args.deviceId)).take(batchSize);
      for (const record of records) await ctx.db.delete(record._id);
      removed = records.length;
    }

    const stageIndex = purgeStages.indexOf(stage);
    const repeatStage = removed === batchSize;
    const nextStage = repeatStage ? stage : purgeStages[stageIndex + 1];
    if (nextStage) {
      await ctx.scheduler.runAfter(0, internal.maintenance.purgeRemovedScreenData, {
        deviceId: args.deviceId,
        stage: nextStage,
      });
    }

    return { removed, complete: !nextStage };
  },
});
