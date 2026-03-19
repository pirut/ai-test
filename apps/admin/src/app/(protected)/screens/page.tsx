import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { requireOrgId } from "@/lib/auth";
import { listDevices } from "@/lib/backend";
import { formatRelativeTimestamp } from "@/lib/utils";

function summarizeStatuses(statuses: Array<"online" | "stale" | "offline" | "unclaimed">) {
  return statuses.reduce(
    (acc, status) => {
      acc[status] += 1;
      return acc;
    },
    { online: 0, stale: 0, offline: 0, unclaimed: 0 },
  );
}

export default async function ScreensPage() {
  const orgId = await requireOrgId();
  const devices = await listDevices(orgId);
  const counts = summarizeStatuses(devices.map((device) => device.status));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Devices"
        description={`${devices.length} screen${devices.length === 1 ? "" : "s"} registered across the fleet.`}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {devices.map((device) => (
            <Link
              key={device.id}
              href={`/screens/${device.id}`}
              className="overflow-hidden rounded-xl border border-white/5 bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:bg-accent/40"
            >
              <div className="relative aspect-[16/10] bg-[var(--surface-high)]">
                {device.screenshotUrl ? (
                  <img
                    alt={device.name}
                    src={device.screenshotUrl}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Waiting for screenshot
                  </div>
                )}
              </div>

              <div className="space-y-4 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{device.name}</p>
                    <p className="mt-1 truncate text-[0.8rem] text-muted-foreground">
                      {device.siteName}
                    </p>
                  </div>
                  <StatusPill label={device.status} status={device.status} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Playlist
                    </p>
                    <p className="mt-1 truncate text-sm text-foreground">
                      {device.currentPlaylistName ?? "Unassigned"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Last heartbeat
                    </p>
                    <p className="mt-1 font-mono text-sm text-foreground">
                      {formatRelativeTimestamp(device.lastHeartbeatAt)}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </section>

        <aside className="space-y-5">
          <div className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Device health
            </p>
            <div className="mt-4 space-y-3">
              {[
                { label: "Online", value: counts.online, status: "online" as const },
                { label: "Stale", value: counts.stale, status: "stale" as const },
                { label: "Offline", value: counts.offline, status: "offline" as const },
                { label: "Unclaimed", value: counts.unclaimed, status: "unclaimed" as const },
              ].map((entry) => (
                <div key={entry.label} className="flex items-center justify-between gap-3">
                  <StatusPill label={entry.label} status={entry.status} />
                  <span className="font-heading text-2xl font-bold text-foreground">
                    {entry.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Coverage
            </p>
            <div className="mt-4 grid gap-3">
              {devices.slice(0, 4).map((device) => (
                <div
                  key={device.id}
                  className="rounded-lg border border-white/6 bg-[var(--surface-low)] px-4 py-3"
                >
                  <p className="truncate text-sm font-medium text-foreground">{device.name}</p>
                  <p className="mt-1 truncate text-[0.8rem] text-muted-foreground">
                    {device.siteName}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
