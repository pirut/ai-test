import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "roll up daily usage",
  {
    hourUTC: 5,
    minuteUTC: 0,
  },
  internal.billing.rollupUsageSnapshots,
);

crons.interval(
  "cleanup expired operational data",
  { hours: 6 },
  internal.billing.cleanupExpiredOperationalData,
);

export default crons;
