import { query } from "./_generated/server";
import { v } from "convex/values";

import { requireOrgIdentity } from "./lib";
import { deriveDeviceStatus } from "./showroom";

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
    const [devices, pendingCommands] = await Promise.all([
      ctx.db
        .query("devices")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect(),
      ctx.db
        .query("deviceCommands")
        .withIndex("by_org_and_status", (q) =>
          q.eq("organizationId", orgId).eq("status", "queued"),
        )
        .collect(),
    ]);
    const statuses = devices.map((device) => deriveDeviceStatus(device));

    return {
      stats: {
        online: statuses.filter((status) => status === "online").length,
        stale: statuses.filter((status) => status === "stale").length,
        offline: statuses.filter((status) => status === "offline").length,
        unclaimed: statuses.filter((status) => status === "unclaimed").length,
        pendingCommands: pendingCommands.length,
      },
      devices,
    };
  },
});
