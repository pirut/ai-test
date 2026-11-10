import { formatDuration, formatUptimePercent } from "@showroom/contracts";
import { CircleCheck, RotateCw, WifiOff } from "lucide-react";
import Link from "next/link";

import { AlertSettingsDialog } from "@/components/alert-settings-dialog";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { FleetHealth, FleetHealthEvent } from "@/lib/fleet-health";
import { cn, formatRelativeTimestamp } from "@/lib/utils";

function eventText(event: FleetHealthEvent, now: number) {
  if (event.type === "offline") {
    return event.resolvedAt
      ? `Offline for ${formatDuration(event.resolvedAt - event.openedAt)}`
      : `Offline for ${formatDuration(now - event.openedAt)} so far`;
  }
  if (event.type === "crash_loop") {
    return event.resolvedAt
      ? `Restarted ${event.restarts} times in a row, then settled`
      : `Keeps restarting (${event.restarts} times so far)`;
  }
  const what = event.component === "player" ? "Player" : "Screen software";
  return event.restarts > 1 ? `${what} restarted unexpectedly ${event.restarts} times` : `${what} restarted unexpectedly`;
}

function alertSummary(settings: FleetHealth["settings"]) {
  if (!settings.emailConfigured) return "Alert emails aren't set up on the server yet.";
  if (!settings.enabled) return "Alert emails are turned off.";
  if (!settings.recipients.length) return "Nobody is getting alert emails yet.";
  const count = settings.recipients.length;
  return `Alert emails go to ${count === 1 ? settings.recipients[0] : `${count} people`}.`;
}

/** Uptime, outages and unexpected restarts for the workspace, with who gets told. */
export function ReliabilityCard({
  health,
  canAdmin,
  suggestedRecipient,
  now,
}: {
  health: FleetHealth;
  canAdmin: boolean;
  suggestedRecipient?: string | null;
  now: number;
}) {
  const days = health.windowDays;
  // A fleet that has only been watched for part of the window says so.
  const watchedDays = health.monitoringSince ? (now - health.monitoringSince) / (24 * 60 * 60_000) : 0;
  const period = watchedDays >= days - 0.5 || !health.monitoringSince
    ? `last ${days} days`
    : `since monitoring began ${formatRelativeTimestamp(new Date(health.monitoringSince).toISOString())}`;
  const stats = [
    {
      label: "Uptime",
      value: formatUptimePercent(health.fleet.uptimePercent),
      detail: "Share of time screens were checking in",
    },
    {
      label: "Outages",
      value: String(health.fleet.outages),
      detail: "Times a screen stopped checking in",
    },
    {
      label: "Unexpected restarts",
      value: String(health.fleet.restarts),
      detail: "Player or screen software crashes",
    },
  ];

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Reliability</CardTitle>
        <CardDescription>
          Across all screens, {period}. {alertSummary(health.settings)}
        </CardDescription>
        {canAdmin ? (
          <CardAction>
            <AlertSettingsDialog settings={health.settings} suggestedRecipient={suggestedRecipient} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="px-0">
        <dl className="grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1 px-4 py-3">
              <dt className="text-sm text-muted-foreground">{stat.label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{stat.value}</dd>
              <dd className="text-xs text-muted-foreground">{stat.detail}</dd>
            </div>
          ))}
        </dl>
        {health.recent.length ? (
          <ul className="divide-y">
            {health.recent.slice(0, 6).map((event) => {
              const open = event.resolvedAt === null;
              const Icon = event.type === "offline" ? WifiOff : RotateCw;
              return (
                <li key={event.id}>
                  <Link
                    href={`/screens/${event.deviceId}`}
                    className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        open ? (event.type === "offline" ? "text-danger" : "text-warning") : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-sm font-medium">{event.deviceName}</span>
                      <span className="truncate text-xs text-muted-foreground">{eventText(event, now)}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {open ? "Now" : formatRelativeTimestamp(new Date(event.resolvedAt ?? event.openedAt).toISOString())}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
            <CircleCheck className="size-5 text-signal" aria-hidden />
            No outages or unexpected restarts in this period.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
