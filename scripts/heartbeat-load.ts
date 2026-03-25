import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { heartbeatPayloadSchema } from "@showroom/contracts";

import {
  authenticateDevice,
  recordHeartbeat,
  resetMockState,
  seedHeartbeatLoadDevices,
} from "@/lib/mock-store";
import { runHeartbeatLoadSimulation } from "@/lib/load-testing/heartbeat-load";

type CredentialInput =
  | string
  | {
      deviceId?: string;
      credential: string;
    };

function printUsage() {
  console.log(`Usage:
  npm run benchmark:heartbeat -- --mock --device-count 1000
  npm run benchmark:heartbeat -- --base-url https://app.example.com --credentials-file ./credentials.json

Options:
  --mock                   Run against the in-process mock device store.
  --base-url               Base URL of the deployed app to benchmark.
  --credentials-file       JSON file containing credentials as strings or objects.
  --device-count           Number of devices to simulate in mock mode. Default: 1000
  --concurrency            Concurrent requests. Default: 50
  --cadence-seconds        Heartbeat cadence to validate against. Default: 60
  --spread-window-ms       Optional window to spread requests across before send.
  --max-p95-ms             P95 latency budget. Default: 250
  --max-total-ms           Total duration budget. Default: cadenceSeconds * 1000
  --max-failure-rate       Failure-rate budget. Default: 0
  --help                   Show this help text.
`);
}

async function loadCredentials(filePath: string) {
  const raw = JSON.parse(await readFile(filePath, "utf8")) as CredentialInput[];
  return raw.map((entry, index) =>
    typeof entry === "string"
      ? { deviceId: `device-${index + 1}`, credential: entry }
      : {
          deviceId: entry.deviceId ?? `device-${index + 1}`,
          credential: entry.credential,
        },
  );
}

const args = parseArgs({
  options: {
    help: { type: "boolean" },
    mock: { type: "boolean" },
    "base-url": { type: "string" },
    "credentials-file": { type: "string" },
    "device-count": { type: "string" },
    concurrency: { type: "string" },
    "cadence-seconds": { type: "string" },
    "spread-window-ms": { type: "string" },
    "max-p95-ms": { type: "string" },
    "max-total-ms": { type: "string" },
    "max-failure-rate": { type: "string" },
  },
});

if (args.values.help) {
  printUsage();
  process.exit(0);
}

const cadenceSeconds = Number(args.values["cadence-seconds"] ?? 60);
const concurrency = Number(args.values.concurrency ?? 50);
const maxP95LatencyMs = Number(args.values["max-p95-ms"] ?? 250);
const maxTotalDurationMs = Number(
  args.values["max-total-ms"] ?? cadenceSeconds * 1000,
);
const maxFailureRate = Number(args.values["max-failure-rate"] ?? 0);
const spreadWindowMs = Number(args.values["spread-window-ms"] ?? 0);

async function main() {
  if (args.values.mock) {
    resetMockState();
    const seeded = seedHeartbeatLoadDevices({
      count: Number(args.values["device-count"] ?? 1_000),
    });

    const result = await runHeartbeatLoadSimulation({
      devices: seeded.devices,
      cadenceSeconds,
      concurrency,
      spreadWindowMs,
      budget: {
        maxFailureRate,
        maxP95LatencyMs,
        maxTotalDurationMs,
      },
      sendHeartbeat: async (device, payload) => {
        const authenticated = authenticateDevice(device.credential);
        if (!authenticated) {
          throw new Error("Unauthorized device");
        }

        const heartbeat = recordHeartbeat(
          authenticated.id,
          heartbeatPayloadSchema.parse(payload),
        );
        if (!heartbeat) {
          throw new Error("Heartbeat was not recorded");
        }
      },
    });

    console.log(JSON.stringify({ mode: "mock", result }, null, 2));
    process.exit(result.budgetPassed ? 0 : 1);
  }

  const baseUrl = args.values["base-url"];
  const credentialsFile = args.values["credentials-file"];
  if (!baseUrl || !credentialsFile) {
    printUsage();
    throw new Error("Provide --mock or both --base-url and --credentials-file.");
  }

  const devices = await loadCredentials(credentialsFile);
  const trimmedBaseUrl = baseUrl.replace(/\/$/, "");

  const result = await runHeartbeatLoadSimulation({
    devices,
    cadenceSeconds,
    concurrency,
    spreadWindowMs,
    budget: {
      maxFailureRate,
      maxP95LatencyMs,
      maxTotalDurationMs,
    },
    sendHeartbeat: async (device, payload) => {
      const response = await fetch(`${trimmedBaseUrl}/api/device/heartbeat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${device.credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Heartbeat failed for ${device.deviceId}: ${response.status} ${response.statusText}`,
        );
      }
    },
  });

  console.log(JSON.stringify({ mode: "http", result }, null, 2));
  process.exit(result.budgetPassed ? 0 : 1);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.stack ?? error.message : String(error),
  );
  process.exit(1);
});
