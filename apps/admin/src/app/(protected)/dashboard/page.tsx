import type { DeviceSummary } from "@showroom/contracts";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Monitor,
  Play,
  TerminalSquare,
} from "lucide-react";
import Link from "next/link";

import { AddScreenDialog } from "@/components/add-screen-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import { getDashboardStats, listDevices } from "@/lib/backend";
import { formatRelativeTimestamp } from "@/lib/utils";

function issuesFor(device: DeviceSummary) {
  const issues: string[] = [];
  if (device.status === "offline") issues.push("Offline");
  if (device.status === "stale") issues.push("Heartbeat delayed");
  if (device.fleetManagementState === "legacy") issues.push("Needs appliance flash");
  if (device.health && !device.health.playerHealthy) issues.push("Player stopped");
  if (device.health && !device.health.hdmiConnected) issues.push("HDMI disconnected");
  if ((device.health?.signalPercent ?? 100) < 25) issues.push("Weak Wi-Fi");
  if (!device.currentPlaylistName) issues.push("No playlist");
  return issues;
}

function needsAttention(device: DeviceSummary) {
  return issuesFor(device).length > 0;
}

export default async function DashboardPage() {
  const orgId = await requireOrgId();
  const [stats, devices, session] = await Promise.all([
    getDashboardStats(orgId),
    listDevices(orgId),
    getAuthSession(),
  ]);

  const attention = devices.filter(needsAttention).sort((a, b) => {
    const rank = { offline: 0, stale: 1, unclaimed: 2, online: 3 } as const;
    return rank[a.status] - rank[b.status];
  });
  const playing = devices.filter((device) => device.currentPlaylistName || device.screenshotUrl).slice(0, 2);
  const recent = [...devices]
    .sort((a, b) => new Date(b.lastHeartbeatAt).getTime() - new Date(a.lastHeartbeatAt).getTime())
    .slice(0, 5);

  const summary = [
    { label: "Online", value: stats.online, copy: "Reporting normally" },
    { label: "Needs attention", value: attention.length, copy: "Review playback risks" },
    { label: "Commands queued", value: stats.pendingCommands, copy: "Waiting for delivery" },
    { label: "Total screens", value: devices.length, copy: "Enrolled in this fleet" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fleet overview"
        description="Playback proof, fleet health, and urgent work in one place."
        action={session.has({ role: "org:admin" }) ? <AddScreenDialog /> : undefined}
      />

      <section aria-label="Fleet summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label} size="sm">
            <CardHeader>
              <CardDescription>{item.label}</CardDescription>
              <CardAction>
                <span className="text-2xl font-semibold tabular-nums">{item.value}</span>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{item.copy}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <CircleAlert className="text-warning" />
            Needs attention
          </CardTitle>
          <CardDescription>Issues most likely to interrupt playback.</CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" render={<Link href="/screens" />}>
              View all screens
              <ArrowRight data-icon="inline-end" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          {attention.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Screen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead className="w-10"><span className="sr-only">Open</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attention.slice(0, 4).map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="pl-4">
                      <Link href={`/screens/${device.id}`} className="font-medium hover:underline">
                        {device.name}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{device.siteName}</span>
                    </TableCell>
                    <TableCell><StatusPill label={device.status} status={device.status} /></TableCell>
                    <TableCell>
                      <Badge variant="warning">{issuesFor(device).slice(0, 2).join(" · ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        aria-label={`Open ${device.name}`}
                        size="icon-sm"
                        variant="ghost"
                        render={<Link href={`/screens/${device.id}`} />}
                      >
                        <ArrowRight />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><CircleCheck /></EmptyMedia>
                <EmptyTitle>Every screen is healthy</EmptyTitle>
                <EmptyDescription>There are no playback or connectivity issues to review.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.7fr)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Now playing</CardTitle>
            <CardDescription>Latest proof of playback from the fleet.</CardDescription>
            <CardAction><Play className="text-primary" /></CardAction>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {playing.length ? playing.map((device) => (
              <Link key={device.id} href={`/screens/${device.id}`} className="group flex min-w-0 flex-col gap-3">
                <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
                  {device.screenshotUrl ? (
                    <img
                      src={device.screenshotUrl}
                      alt={`${device.name} screen preview`}
                      className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.01]"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center"><Monitor className="text-muted-foreground" /></div>
                  )}
                  <Badge className="absolute left-3 top-3" variant="secondary">Live proof</Badge>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{device.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{device.currentPlaylistName ?? "No playlist"}</p>
                  </div>
                  <StatusPill label={device.status} status={device.status} />
                </div>
              </Link>
            )) : (
              <Empty className="col-span-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Monitor /></EmptyMedia>
                  <EmptyTitle>No playback proof yet</EmptyTitle>
                  <EmptyDescription>Proof appears after a screen reports in.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest fleet check-ins.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {recent.map((device) => (
              <Button
                key={device.id}
                variant="ghost"
                render={<Link href={`/screens/${device.id}`} />}
                className="h-auto justify-start py-2"
              >
                <CircleCheck data-icon="inline-start" className="text-signal" />
                <span className="grid min-w-0 flex-1 text-left">
                  <span className="truncate">{device.name}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    Checked in {formatRelativeTimestamp(device.lastHeartbeatAt)}
                  </span>
                </span>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Screens</CardTitle>
          <CardDescription>Current fleet state at a glance.</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" render={<Link href="/screens" />}>
              Manage fleet
              <ArrowRight data-icon="inline-end" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Screen</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last check-in</TableHead>
                <TableHead>Issue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.slice(0, 8).map((device) => {
                const issue = issuesFor(device)[0];
                return (
                  <TableRow key={device.id}>
                    <TableCell className="pl-4 font-medium">
                      <Link href={`/screens/${device.id}`} className="inline-flex items-center gap-2 hover:underline">
                        <Monitor />
                        {device.name}
                      </Link>
                    </TableCell>
                    <TableCell>{device.siteName}</TableCell>
                    <TableCell><StatusPill label={device.status} status={device.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{formatRelativeTimestamp(device.lastHeartbeatAt)}</TableCell>
                    <TableCell>
                      {issue ? <Badge variant="warning">{issue}</Badge> : <Badge variant="success">Healthy</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="justify-between text-xs text-muted-foreground">
          <span>{devices.length} screen{devices.length === 1 ? "" : "s"} enrolled</span>
          <span className="inline-flex items-center gap-1"><TerminalSquare /> {stats.pendingCommands} commands queued</span>
        </CardFooter>
      </Card>
    </div>
  );
}
