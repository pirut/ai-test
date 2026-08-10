import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("progress staged release rollouts", { minutes: 1 }, internal.fleet.progressReleaseRollouts);
crons.interval("prune fleet telemetry", { hours: 6 }, internal.maintenance.pruneFleetTelemetry);

export default crons;
