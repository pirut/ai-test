import { query } from "./_generated/server";
import { v } from "convex/values";

import { requireOrgIdentity } from "./lib";

export const getOverview = query({
  args: {},
  returns: v.object({
    stats: v.object({
      online: v.number(),
      stale: v.number(),
      offline: v.number(),
      unclaimed: v.number(),
      pendingCommands: v.number(),
    }),
    devices: v.array(v.any()),
  }),
  handler: async (ctx) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    const commands = await ctx.db
      .query("deviceCommands")
      .collect();

    return {
      stats: {
        online: devices.filter((device) => device.status === "online").length,
        stale: devices.filter((device) => device.status === "stale").length,
        offline: devices.filter((device) => device.status === "offline").length,
        unclaimed: devices.filter((device) => device.status === "unclaimed").length,
        pendingCommands: commands.filter((command) => command.status === "queued").length,
      },
      devices,
    };
  },
});
