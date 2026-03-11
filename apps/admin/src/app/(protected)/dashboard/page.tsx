import Link from "next/link";

import { ClaimDeviceForm } from "@/components/claim-device-form";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { requireOrgId } from "@/lib/auth";
import { getDashboardStats, listDevices } from "@/lib/backend";
import { formatRelativeTimestamp } from "@/lib/utils";

export default async function DashboardPage() {
  const orgId = await requireOrgId();
  const [stats, devices] = await Promise.all([
    getDashboardStats(orgId),
    listDevices(orgId),
  ]);

  return (
    <>
      <PageHeader
        title="Fleet overview"
        description="Live health, screenshots, and provisioning for all connected screens."
      />

      <div className="p-8 flex flex-col gap-8">
        {/* Metrics row */}
        <div className="grid grid-cols-5 gap-3">
          <MetricCard label="Online"    value={stats.online}          hint="Reporting in" tone="signal" />
          <MetricCard label="Stale"     value={stats.stale}           hint="Missed heartbeat" tone="warning" />
          <MetricCard label="Offline"   value={stats.offline}         hint="5+ min silent" tone="danger" />
          <MetricCard label="Unclaimed" value={stats.unclaimed}       hint="Needs assignment" tone="unclaimed" />
          <MetricCard label="Queued"    value={stats.pendingCommands} hint="Pending commands" tone="queue" />
        </div>

        {/* Device grid + claim sidebar */}
        <div className="grid grid-cols-[1fr_280px] gap-6">
          {/* Screens */}
          <section>
            <h2 className="mb-4 text-sm font-semibold text-foreground">Screens</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {devices.map((device) => (
                <Link
                  key={device.id}
                  href={`/screens/${device.id}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-border/80 hover:shadow-sm"
                >
                  {/* Screenshot */}
                  <div className="relative aspect-video overflow-hidden bg-muted">
                    {device.screenshotUrl ? (
                      <img
                        alt={device.name}
                        src={device.screenshotUrl}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <svg className="size-6 text-muted-foreground/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                          <rect x="2" y="3" width="20" height="14" rx="2" />
                          <path d="M8 21h8M12 17v4" strokeLinecap="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex flex-col gap-1.5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[0.85rem] font-medium text-card-foreground">{device.name}</span>
                      <StatusPill status={device.status} label={device.status} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[0.75rem] text-muted-foreground">
                      <span className="truncate font-mono">{device.currentPlaylistName ?? "—"}</span>
                      <span className="shrink-0 font-mono">{formatRelativeTimestamp(device.lastHeartbeatAt)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Claim device */}
          <aside>
            <h2 className="mb-4 text-sm font-semibold text-foreground">Add device</h2>
            <ClaimDeviceForm />
          </aside>
        </div>
      </div>
    </>
  );
}
