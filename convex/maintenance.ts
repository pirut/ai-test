import { v } from "convex/values";
import { fleetManagedGeneration } from "@showroom/contracts";

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
