import { z } from "zod";

export const alertSettingsSchema = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.string()),
  notifyAfterSeconds: z.number(),
  // False until the server has an email provider key and a from address.
  emailConfigured: z.boolean(),
});

export const fleetHealthEventSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  deviceName: z.string(),
  type: z.enum(["offline", "crash", "crash_loop"]),
  component: z.string().nullable(),
  openedAt: z.number(),
  resolvedAt: z.number().nullable(),
  restarts: z.number(),
});

export const deviceReliabilitySchema = z.object({
  deviceId: z.string(),
  uptimePercent: z.number().nullable(),
  downMs: z.number(),
  outages: z.number(),
  restarts: z.number(),
  offlineSince: z.number().nullable(),
  crashLooping: z.boolean(),
});

export const fleetHealthSchema = z.object({
  windowDays: z.number(),
  monitoringSince: z.number().nullable(),
  fleet: z.object({
    uptimePercent: z.number().nullable(),
    outages: z.number(),
    restarts: z.number(),
  }),
  devices: z.array(deviceReliabilitySchema),
  recent: z.array(fleetHealthEventSchema),
  settings: alertSettingsSchema,
});

export type AlertSettings = z.infer<typeof alertSettingsSchema>;
export type FleetHealth = z.infer<typeof fleetHealthSchema>;
export type FleetHealthEvent = z.infer<typeof fleetHealthEventSchema>;
export type DeviceReliability = z.infer<typeof deviceReliabilitySchema>;
