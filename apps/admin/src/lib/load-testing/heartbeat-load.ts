import type { HeartbeatPayload } from "@showroom/contracts";

export type HeartbeatLoadDevice = {
  deviceId: string;
  credential: string;
};

export type HeartbeatLoadBudget = {
  maxFailureRate?: number;
  maxP95LatencyMs?: number;
  maxTotalDurationMs?: number;
  minRequestsPerSecond?: number;
};

export type HeartbeatLoadResult = {
  deviceCount: number;
  cadenceSeconds: number;
  concurrency: number;
  succeeded: number;
  failed: number;
  failureRate: number;
  totalDurationMs: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  achievedRequestsPerSecond: number;
  requiredRequestsPerSecond: number;
  budgetPassed: boolean;
};

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.ceil(values.length * ratio) - 1),
  );
  return values[index] ?? 0;
}

function createHeartbeatPayload(deviceId: string, index: number): HeartbeatPayload {
  const now = new Date();
  return {
    deviceId,
    manifestVersion: `manifest-load-${index % 25}`,
    appVersion: "load-test-admin",
    agentVersion: "load-test-agent",
    uptimeSeconds: 60 + index,
    storageFreeBytes: 48 * 1024 * 1024,
    storageTotalBytes: 64 * 1024 * 1024,
    currentAssetId: `asset-${index % 7}`,
    currentPlaylistId: `playlist-${index % 5}`,
    lastSeenAt: now.toISOString(),
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let cursor = 0;

  async function next() {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) {
      return;
    }

    await worker(items[index]!, index);
    await next();
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => next()),
  );
}

export async function runHeartbeatLoadSimulation(input: {
  devices: HeartbeatLoadDevice[];
  cadenceSeconds?: number;
  concurrency?: number;
  spreadWindowMs?: number;
  budget?: HeartbeatLoadBudget;
  sendHeartbeat: (device: HeartbeatLoadDevice, payload: HeartbeatPayload) => Promise<void>;
}) {
  const cadenceSeconds = input.cadenceSeconds ?? 60;
  const concurrency = input.concurrency ?? 50;
  const spreadWindowMs = input.spreadWindowMs ?? 0;
  const latencies: number[] = [];
  let failed = 0;

  const startedAt = performance.now();

  await runWithConcurrency(input.devices, concurrency, async (device, index) => {
    if (spreadWindowMs > 0) {
      const scheduledDelay = Math.floor((index / Math.max(1, input.devices.length)) * spreadWindowMs);
      await new Promise((resolve) => setTimeout(resolve, scheduledDelay));
    }

    const requestStartedAt = performance.now();
    try {
      await input.sendHeartbeat(device, createHeartbeatPayload(device.deviceId, index));
    } catch {
      failed += 1;
    } finally {
      latencies.push(performance.now() - requestStartedAt);
    }
  });

  const totalDurationMs = performance.now() - startedAt;
  const succeeded = input.devices.length - failed;
  const sortedLatencies = [...latencies].sort((left, right) => left - right);
  const averageLatencyMs =
    latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length);
  const p50LatencyMs = percentile(sortedLatencies, 0.5);
  const p95LatencyMs = percentile(sortedLatencies, 0.95);
  const maxLatencyMs = sortedLatencies[sortedLatencies.length - 1] ?? 0;
  const achievedRequestsPerSecond =
    succeeded / Math.max(0.001, totalDurationMs / 1000);
  const requiredRequestsPerSecond =
    input.devices.length / Math.max(1, cadenceSeconds);
  const failureRate = failed / Math.max(1, input.devices.length);

  const budget = input.budget;
  const budgetPassed =
    failureRate <= (budget?.maxFailureRate ?? 0) &&
    p95LatencyMs <= (budget?.maxP95LatencyMs ?? 250) &&
    totalDurationMs <= (budget?.maxTotalDurationMs ?? cadenceSeconds * 1000) &&
    achievedRequestsPerSecond >=
      (budget?.minRequestsPerSecond ?? requiredRequestsPerSecond);

  const result: HeartbeatLoadResult = {
    deviceCount: input.devices.length,
    cadenceSeconds,
    concurrency,
    succeeded,
    failed,
    failureRate,
    totalDurationMs,
    averageLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
    maxLatencyMs,
    achievedRequestsPerSecond,
    requiredRequestsPerSecond,
    budgetPassed,
  };

  return result;
}
