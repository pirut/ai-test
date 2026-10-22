import type { DeviceSummary } from "@showroom/contracts";
import { ArrowRight, CircleCheck, Monitor, TerminalSquare } from "lucide-react";
import Link from "next/link";

import { AddScreenDialog } from "@/components/add-screen-dialog";
import { AutoRefresh } from "@/components/auto-refresh";
import { CommandStatusBadge } from "@/components/command-status-badge";
import { PageHeader } from "@/components/page-header";
import { ScreenThumbnail } from "@/components/screen-thumbnail";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import { listCommands, listDevices } from "@/lib/backend";
import { commandLabel } from "@/lib/commands";
import {
  type DeviceStatus,
  compareByUrgency,
  countByStatus,
  deviceIssues,
  needsAttention,
  statusDescriptions,
  statusLabels,
} from "@/lib/device-health";
import { cn, formatRelativeTimestamp } from "@/lib/utils";

const statusDot: Record<DeviceStatus, string> = {
  online: "bg-signal",
  stale: "bg-warning",
  offline: "bg-danger",
  unclaimed: "bg-unclaimed",
};

export default async function DashboardPage() {
  const orgId = await requireOrgId();
  const [devices, commands, session] = await Promise.all([
    listDevices(orgId),
    listCommands(),
    getAuthSession(),
  ]);
  const canAdmin = session.has({ role: "org:admin" });

  const counts = countByStatus(devices);
  const attention = devices.filter(needsAttention).sort(compareByUrgency);
  const playing = devices
    .filter((device) => device.status !== "unclaimed")
    .sort((a, b) => Number(Boolean(b.screenshotUrl)) - Number(Boolean(a.screenshotUrl)) || a.name.localeCompare(b.name))
    .slice(0, 6);
  const deviceNames = new Map(devices.map((device) => [device.id, device.name]));
  const activity = commands.slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh />
      <PageHeader
        title="Fleet overview"
        description="What every screen is showing, and anything that needs you."
        action={canAdmin ? <AddScreenDialog /> : undefined}
      />

      {devices.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Monitor /></EmptyMedia>
              <EmptyTitle>Add your first screen</EmptyTitle>
              <EmptyDescription>
                Power on a Pi and connect it to the internet. It shows a pairing code you enter here.
              </EmptyDescription>
            </EmptyHeader>
            {canAdmin ? <EmptyContent><AddScreenDialog /></EmptyContent> : null}
          </Empty>
        </Card>
      ) : (
        <>
          <section
            aria-label="Fleet status"
            className="grid grid-cols-2 overflow-hidden rounded-lg border bg-card lg:grid-cols-4"
          >
            {(["online", "stale", "offline", "unclaimed"] as const).map((status, index) => (
              <Link
                key={status}
                href={`/screens?status=${status}`}
                className={cn(
                  "group flex flex-col gap-1 px-4 py-4 transition-colors hover:bg-muted/60",
                  index % 2 === 1 && "border-l",
                  index >= 2 && "border-t lg:border-t-0",
                  index === 2 && "lg:border-l",
                )}
              >
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span aria-hidden className={cn("size-2 rounded-full", statusDot[status])} />
                  {statusLabels[status]}
                </span>
                <span className="text-2xl font-semibold tabular-nums">{counts[status]}</span>
                <span className="text-xs text-muted-foreground">{statusDescriptions[status]}</span>
              </Link>
            ))}
          </section>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>
                {attention.length
                  ? `${attention.length} screen${attention.length === 1 ? "" : "s"} with problems that can interrupt playback.`
                  : "Nothing is interrupting playback right now."}
              </CardDescription>
              {attention.length > 5 ? (
                <CardAction>
                  <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/screens?view=attention" />}>
                    View all {attention.length}
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="px-0">
              {attention.length ? (
                <ul className="divide-y">
                  {attention.slice(0, 5).map((device) => (
                    <AttentionRow key={device.id} device={device} />
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-3 px-4 py-2 text-sm text-muted-foreground">
                  <CircleCheck className="size-5 text-signal" aria-hidden />
                  Every screen is online, playing, and connected to its display.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Now playing</CardTitle>
                <CardDescription>Latest screenshot from each screen.</CardDescription>
                <CardAction>
                  <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/screens?layout=grid" />}>
                    All screens
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {playing.map((device) => (
                  <Link key={device.id} href={`/screens/${device.id}`} className="group flex min-w-0 flex-col gap-2">
                    <ScreenThumbnail device={device} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium group-hover:underline">{device.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {device.currentPlaylistName ?? "No playlist assigned"}
                        </p>
                      </div>
                      <StatusPill status={device.status} />
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Commands sent to screens and how they went.</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {activity.length ? (
                  <ul className="divide-y">
                    {activity.map((command) => (
                      <li key={command.id}>
                        <Link
                          href={`/screens/${command.deviceId}#activity`}
                          className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                        >
                          <TerminalSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="grid min-w-0 flex-1">
                            <span className="truncate text-sm font-medium">
                              {deviceNames.get(command.deviceId) ?? "Removed screen"}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {commandLabel(command.commandType)} · {formatRelativeTimestamp(command.issuedAt)}
                            </span>
                          </span>
                          <CommandStatusBadge status={command.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-2 text-sm text-muted-foreground">
                    No commands yet. Restarts, syncs and preview refreshes show up here.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function AttentionRow({ device }: { device: DeviceSummary }) {
  const issues = deviceIssues(device).filter((issue) => issue.severity !== "info");
  return (
    <li>
      <Link
        href={`/screens/${device.id}`}
        className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
      >
        <ScreenThumbnail device={device} className="hidden w-24 shrink-0 sm:block" compact />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{device.name}</span>
            <span className="hidden truncate text-xs text-muted-foreground md:inline">{device.siteName}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {issues.map((issue) => (
              <Badge key={issue.label} variant={issue.severity === "critical" ? "danger" : "warning"}>
                {issue.label}
              </Badge>
            ))}
          </div>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:block">
          Seen {formatRelativeTimestamp(device.lastHeartbeatAt)}
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
