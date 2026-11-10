import type { DeviceSummary } from "@showroom/contracts";
import { formatDuration } from "@showroom/contracts";
import { ArrowRight, RotateCw, WifiOff } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { FleetHealth } from "@/lib/fleet-health";

const listed = 3;

function ScreenLinks({ screens }: { screens: Array<{ id: string; name: string; detail?: string }> }) {
  const shown = screens.slice(0, listed);
  const rest = screens.length - shown.length;
  return (
    <>
      {shown.map((screen, index) => (
        <span key={screen.id}>
          {index > 0 ? ", " : null}
          <Link href={`/screens/${screen.id}`} className="font-medium text-foreground">
            {screen.name}
          </Link>
          {screen.detail ? ` (${screen.detail})` : null}
        </span>
      ))}
      {rest > 0 ? ` and ${rest} more` : null}
    </>
  );
}

/**
 * The first thing on the dashboard when a screen has stopped checking in or
 * keeps restarting. It works from the screen list alone, so it still appears
 * when the health history is unavailable.
 */
export function FleetAlertBanner({
  devices,
  health,
  now,
}: {
  devices: DeviceSummary[];
  health: FleetHealth | null;
  now: number;
}) {
  const reliability = new Map((health?.devices ?? []).map((entry) => [entry.deviceId, entry]));
  const offline = devices
    .filter((device) => device.status === "offline")
    .map((device) => {
      const since = reliability.get(device.id)?.offlineSince ?? (Date.parse(device.lastHeartbeatAt) || null);
      return { id: device.id, name: device.name, since };
    })
    // Most recent outage first: that is the one somebody can still catch.
    .sort((a, b) => (b.since ?? 0) - (a.since ?? 0));
  const crashLooping = devices
    .filter((device) => device.status !== "offline" && reliability.get(device.id)?.crashLooping)
    .map((device) => ({ id: device.id, name: device.name }));

  if (!offline.length && !crashLooping.length) return null;

  return (
    <div className="flex flex-col gap-3">
      {offline.length ? (
        <Alert className="border-danger/40 bg-danger/5">
          <WifiOff className="text-danger" />
          <AlertTitle>
            {offline.length === 1
              ? `${offline[0].name} is offline`
              : `${offline.length} screens are offline`}
          </AlertTitle>
          <AlertDescription>
            <p>
              {offline.length === 1 ? (
                <>
                  No check-in{offline[0].since ? ` for ${formatDuration(now - offline[0].since)}` : ""}.{" "}
                </>
              ) : (
                <>
                  <ScreenLinks
                    screens={offline.map((screen) => ({
                      id: screen.id,
                      name: screen.name,
                      detail: screen.since ? formatDuration(now - screen.since) : undefined,
                    }))}
                  />
                  .{" "}
                </>
              )}
              A screen that lost its internet keeps playing saved content, but it can&apos;t take changes until it
              reconnects. Check power and network at the site.
            </p>
            <Link
              href={offline.length === 1 ? `/screens/${offline[0].id}` : "/screens?status=offline"}
              className="mt-1 inline-flex items-center gap-1 font-medium text-foreground"
            >
              {offline.length === 1 ? "Open this screen" : "See offline screens"}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {crashLooping.length ? (
        <Alert className="border-warning/40 bg-warning/5">
          <RotateCw className="text-warning" />
          <AlertTitle>
            {crashLooping.length === 1
              ? `${crashLooping[0].name} keeps restarting`
              : `${crashLooping.length} screens keep restarting`}
          </AlertTitle>
          <AlertDescription>
            <p>
              {crashLooping.length > 1 ? (
                <>
                  <ScreenLinks screens={crashLooping} />.{" "}
                </>
              ) : null}
              Playback is probably being interrupted. Try Reboot from the screen&apos;s page; if it keeps happening,
              check its power supply and the media it is playing.
            </p>
            {crashLooping.length === 1 ? (
              <Link
                href={`/screens/${crashLooping[0].id}`}
                className="mt-1 inline-flex items-center gap-1 font-medium text-foreground"
              >
                Open this screen
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
