import Link from "next/link";
import type { DeviceSummary } from "@showroom/contracts";

import { ClaimDeviceForm } from "@/components/claim-device-form";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { requireOrgId } from "@/lib/auth";
import {
  getDashboardStats,
  listDevices,
  listMediaAssets,
  listPlaylists,
} from "@/lib/backend";
import { formatRelativeTimestamp } from "@/lib/utils";

function sortByHeartbeat<T extends { lastHeartbeatAt: string }>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      new Date(b.lastHeartbeatAt).getTime() - new Date(a.lastHeartbeatAt).getTime(),
  );
}

function hasHealthWarning(device: DeviceSummary) {
  const health = device.health;
  return Boolean(
    health && (
      !health.playerHealthy ||
      !health.hdmiConnected ||
      (health.cpuTemperatureC ?? 0) >= 80 ||
      (health.signalPercent != null && health.signalPercent < 25) ||
      (health.throttledFlags != null && !/(?:^|=)0x0+$/i.test(health.throttledFlags))
    )
  );
}

function sortByPriority<T extends DeviceSummary>(items: T[]) {
  const rank = { offline: 0, stale: 1, online: 2, unclaimed: 3 } as const;
  return [...items].sort((a, b) => {
    const statusDifference = rank[a.status] - rank[b.status];
    if (!statusDifference && hasHealthWarning(a) !== hasHealthWarning(b)) {
      return hasHealthWarning(a) ? -1 : 1;
    }
    return statusDifference || new Date(b.lastHeartbeatAt).getTime() - new Date(a.lastHeartbeatAt).getTime();
  });
}

export default async function DashboardPage() {
  const orgId = await requireOrgId();
  const [stats, devices, mediaAssets, playlists] = await Promise.all([
    getDashboardStats(orgId),
    listDevices(orgId),
    listMediaAssets(),
    listPlaylists(),
  ]);

  const leadDevice = sortByPriority(devices)[0] ?? null;
  const recentDevices = sortByHeartbeat(devices).slice(0, 4);
  const attentionCount = devices.filter(
    (device) => device.status === "stale" || device.status === "offline" || hasHealthWarning(device),
  ).length;
  const healthWarningCount = devices.filter(hasHealthWarning).length;
  const fleetMessage =
    devices.length === 0
      ? "No screens connected"
      : attentionCount > 0
        ? `${attentionCount} screen${attentionCount === 1 ? "" : "s"} need attention`
        : stats.unclaimed > 0
          ? `${stats.unclaimed} screen${stats.unclaimed === 1 ? "" : "s"} awaiting setup`
          : "All screens healthy";
  const fleetStatus = [
    { label: "Online", value: stats.online, status: "online" as const },
    { label: "Stale", value: stats.stale, status: "stale" as const },
    { label: "Offline", value: stats.offline, status: "offline" as const },
    { label: "Unclaimed", value: stats.unclaimed, status: "unclaimed" as const },
    { label: "Health warnings", value: healthWarningCount, status: "stale" as const },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Real-time status across your media catalog, playlists, and screen fleet."
        action={
          <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
            <span className={`size-2 rounded-full ${attentionCount > 0 ? "bg-danger" : stats.unclaimed > 0 ? "bg-warning" : "bg-signal"}`} />
            {fleetMessage}
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Total assets"
              value={mediaAssets.length}
              hint={`${mediaAssets.filter((asset) => asset.type === "video").length} ${mediaAssets.filter((asset) => asset.type === "video").length === 1 ? "video" : "videos"}`}
              tone="primary"
            />
            <MetricCard
              label="Playlists"
              value={playlists.length}
              hint={`${stats.pendingCommands} command${stats.pendingCommands === 1 ? "" : "s"} queued`}
              tone="queue"
            />
            <MetricCard
              label="Screens online"
              value={stats.online}
              hint={`${devices.length} total`}
              tone={attentionCount > 0 ? "danger" : "signal"}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,1fr)]">
            <Link
              href={leadDevice ? `/screens/${leadDevice.id}` : "/screens"}
              className="overflow-hidden rounded-xl border border-white/5 bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            >
              <div className="border-b border-white/5 px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Priority screen
                    </p>
                    <h2 className="font-heading mt-2 text-xl font-bold text-foreground">
                      {leadDevice?.currentPlaylistName ?? "No playlist assigned"}
                    </h2>
                  </div>
                  {leadDevice ? (
                    <StatusPill label={leadDevice.status} status={leadDevice.status} />
                  ) : null}
                </div>
              </div>

              <div className="relative aspect-[16/9] bg-[var(--surface-high)]">
                {leadDevice?.screenshotUrl ? (
                  <img
                    alt={leadDevice.name}
                    src={leadDevice.screenshotUrl}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {leadDevice ? "Waiting for the first screenshot" : "Connect a screen to see its live preview"}
                  </div>
                )}
              </div>

              <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Screen
                  </p>
                  <p className="mt-2 text-sm text-foreground">{leadDevice?.name ?? "Waiting for device"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Site
                  </p>
                  <p className="mt-2 text-sm text-foreground">{leadDevice?.siteName ?? "Not assigned"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Last heartbeat
                  </p>
                  <p className="mt-2 font-mono text-sm text-foreground">
                    {leadDevice ? formatRelativeTimestamp(leadDevice.lastHeartbeatAt) : "N/A"}
                  </p>
                </div>
              </div>
            </Link>

            <div className="space-y-5">
              <div className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Quick actions
                </p>
                <div className="mt-4 space-y-2">
                  {[
                    {
                      href: "/media",
                      title: "Upload media",
                      copy: "Add new videos, stills, and campaign assets.",
                    },
                    {
                      href: "/playlists",
                      title: "Create playlist",
                      copy: "Sequence assets and set fallback playback.",
                    },
                    {
                      href: "/screens",
                      title: "Manage devices",
                      copy: "Inspect health, screenshots, and assigned content.",
                    },
                  ].map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="block rounded-lg border border-white/6 bg-[var(--surface-low)] px-4 py-3 transition-colors hover:bg-accent"
                    >
                      <p className="text-sm font-medium text-foreground">{action.title}</p>
                      <p className="mt-1 text-[0.8rem] text-muted-foreground">{action.copy}</p>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Fleet health
                </p>
                <div className="mt-4 space-y-3">
                  {fleetStatus.map((entry) => (
                    <div key={entry.label} className="flex items-center justify-between gap-3">
                      <StatusPill label={entry.label} status={entry.status} />
                      <span className="font-heading text-2xl font-bold text-foreground">
                        {entry.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <section className="rounded-xl border border-white/5 bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="border-b border-white/5 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Recent activity
                  </p>
                  <h2 className="font-heading mt-2 text-xl font-bold text-foreground">
                    Device heartbeat feed
                  </h2>
                </div>
                <Link href="/screens" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                  View all devices
                </Link>
              </div>
            </div>

            <div className="divide-y divide-white/5">
              {recentDevices.length > 0 ? (
                recentDevices.map((device) => (
                  <Link
                    key={device.id}
                    href={`/screens/${device.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-accent/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{device.name}</p>
                      <p className="mt-1 truncate text-[0.8rem] text-muted-foreground">
                        {device.currentPlaylistName ?? "No playlist assigned"} · {device.siteName}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-mono text-[0.78rem] text-muted-foreground">
                        {formatRelativeTimestamp(device.lastHeartbeatAt)}
                      </p>
                      <StatusPill label={device.status} status={device.status} />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="px-5 py-6 text-sm text-muted-foreground">
                  No devices have reported in yet.
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <ClaimDeviceForm />

          <div className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Library mix
            </p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-lg border border-white/6 bg-[var(--surface-low)] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Images
                </p>
                <p className="font-heading mt-2 text-2xl font-bold text-foreground">
                  {mediaAssets.filter((asset) => asset.type === "image").length}
                </p>
              </div>
              <div className="rounded-lg border border-white/6 bg-[var(--surface-low)] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Videos
                </p>
                <p className="font-heading mt-2 text-2xl font-bold text-foreground">
                  {mediaAssets.filter((asset) => asset.type === "video").length}
                </p>
              </div>
              <div className="rounded-lg border border-white/6 bg-[var(--surface-low)] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Defaults
                </p>
                <p className="font-heading mt-2 text-2xl font-bold text-foreground">
                  {playlists.filter((playlist) => playlist.isDefault).length}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
