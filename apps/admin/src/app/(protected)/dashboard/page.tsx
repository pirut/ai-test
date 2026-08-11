import Link from "next/link";
import type { DeviceSummary } from "@showroom/contracts";
import { ArrowRight, CircleAlert, Monitor, Play } from "lucide-react";

import { AddScreenDialog } from "@/components/add-screen-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
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

  return (
    <div className="space-y-7">
      <PageHeader
        title="Fleet overview"
        description="See what is playing, what needs attention, and where your screens stand right now."
        action={session.has({ role: "org:admin" }) ? <AddScreenDialog /> : undefined}
      />

      <section className="dashboard-surface grid grid-cols-2 overflow-hidden rounded-lg lg:grid-cols-4">
        {[
          { label: "Online", value: stats.online, status: "online" as const, copy: "Reporting normally" },
          { label: "Stale", value: stats.stale, status: "stale" as const, copy: "Heartbeat delayed" },
          { label: "Offline", value: stats.offline, status: "offline" as const, copy: "Not reporting" },
          { label: "Total screens", value: devices.length, status: "unclaimed" as const, copy: `${stats.pendingCommands} command${stats.pendingCommands === 1 ? "" : "s"} queued` },
        ].map((item, index) => (
          <div key={item.label} className={`px-4 py-4 sm:px-5 sm:py-5 ${index === 1 ? "border-l border-border" : ""} ${index === 2 ? "border-t border-border lg:border-l lg:border-t-0" : ""} ${index === 3 ? "border-l border-t border-border lg:border-t-0" : ""}`}>
            <div className="flex items-center justify-between">
              <StatusPill label={item.label} status={item.status} />
              <span className="font-heading text-3xl font-bold tracking-[-0.04em] text-foreground">{item.value}</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{item.copy}</p>
          </div>
        ))}
      </section>

      <section className="dashboard-surface overflow-hidden rounded-lg">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <CircleAlert className="size-4 text-warning" />
              <h2 className="font-heading text-lg font-bold text-foreground">Needs attention</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Issues most likely to interrupt playback.</p>
          </div>
          <Link href="/screens" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            View all screens <ArrowRight className="size-3.5" />
          </Link>
        </div>
        {attention.length ? (
          <div className="divide-y divide-border">
            {attention.slice(0, 4).map((device) => (
              <Link key={device.id} href={`/screens/${device.id}`} className="grid gap-3 px-5 py-4 transition-colors hover:bg-[var(--surface-low)] sm:grid-cols-[minmax(0,1fr)_180px_130px_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{device.name}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{device.siteName}</p>
                </div>
                <StatusPill label={device.status} status={device.status} />
                <p className="text-sm font-medium text-warning">{issuesFor(device).slice(0, 2).join(" · ")}</p>
                <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-signal">Every screen is healthy</p>
            <p className="mt-1 text-xs text-muted-foreground">There are no playback or connectivity issues to review.</p>
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <section className="dashboard-surface overflow-hidden rounded-lg">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-heading text-lg font-bold text-foreground">Now playing</h2>
              <p className="mt-1 text-xs text-muted-foreground">Latest proof of playback from the fleet.</p>
            </div>
            <Play className="size-4 text-primary" />
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-2">
            {playing.length ? playing.map((device) => (
              <Link key={device.id} href={`/screens/${device.id}`} className="bg-card p-4 transition-colors hover:bg-[var(--surface-low)]">
                <div className="relative aspect-video overflow-hidden rounded-md bg-[var(--surface-high)]">
                  {device.screenshotUrl ? (
                    <img src={device.screenshotUrl} alt={`${device.name} screen preview`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center"><Monitor className="size-7 text-muted-foreground" /></div>
                  )}
                  <div className="absolute left-3 top-3 rounded-md bg-slate-950/75 px-2 py-1 text-[10px] font-semibold text-white">LIVE PROOF</div>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{device.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{device.currentPlaylistName ?? "No playlist"}</p>
                  </div>
                  <StatusPill label={device.status} status={device.status} />
                </div>
              </Link>
            )) : (
              <div className="col-span-full px-5 py-12 text-center text-sm text-muted-foreground">Playback proof will appear after a screen reports in.</div>
            )}
          </div>
        </section>

        <section className="dashboard-surface overflow-hidden rounded-lg">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-heading text-lg font-bold text-foreground">Recent activity</h2>
            <p className="mt-1 text-xs text-muted-foreground">Latest fleet check-ins.</p>
          </div>
          <div className="divide-y divide-border">
            {recent.map((device) => (
              <Link key={device.id} href={`/screens/${device.id}`} className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-[var(--surface-low)]">
                <span className={`mt-1 size-2 shrink-0 rounded-full ${device.status === "online" ? "bg-signal" : device.status === "stale" ? "bg-warning" : "bg-danger"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{device.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Checked in {formatRelativeTimestamp(device.lastHeartbeatAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
