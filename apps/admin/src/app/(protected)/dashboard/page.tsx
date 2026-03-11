import Link from "next/link";

import { ClaimDeviceForm } from "@/components/claim-device-form";
import { MetricCard } from "@/components/metric-card";
import { StatusPill } from "@/components/status-pill";
import { requireOrgId } from "@/lib/auth";
import { getDashboardStats, listDevices } from "@/lib/backend";
import { formatRelativeTimestamp } from "@/lib/utils";

export default async function DashboardPage() {
  const orgId = await requireOrgId();
  const stats = await getDashboardStats(orgId);
  const devices = await listDevices(orgId);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <header className="border-b border-border pb-6">
        <p className="mb-1 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
          <span className="inline-block h-px w-4 bg-brand opacity-70" />
          Control room
        </p>
        <h1 className="text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold tracking-tight leading-tight">
          Fleet overview
        </h1>
        <p className="mt-1 max-w-[52ch] text-[0.9rem] text-muted-foreground">
          Watch live screen health, verify what&apos;s on display, and claim new
          hardware as it comes online.
        </p>
      </header>

      {/* Metrics */}
      <section className="grid grid-cols-5 gap-3">
        <MetricCard label="Online"    value={stats.online}          hint="Healthy screens reporting in." tone="signal" />
        <MetricCard label="Stale"     value={stats.stale}           hint="Needs a heartbeat check."      tone="warning" />
        <MetricCard label="Offline"   value={stats.offline}         hint="No response in 5+ minutes."   tone="danger" />
        <MetricCard label="Unclaimed" value={stats.unclaimed}       hint="Awaiting operator assignment." tone="unclaimed" />
        <MetricCard label="Queued"    value={stats.pendingCommands} hint="Pending command executions."   tone="queue" />
      </section>

      {/* Split grid */}
      <div className="grid gap-5 grid-cols-[minmax(0,1.65fr)_minmax(300px,0.7fr)]">
        {/* Device grid */}
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-0.5 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
            <span className="inline-block h-px w-4 bg-brand opacity-70" />
            Screens
          </p>
          <h2 className="mb-0.5 text-lg font-semibold tracking-tight">Latest playback state</h2>
          <p className="mb-4 text-[0.85rem] text-muted-foreground">
            Every tile shows the latest screenshot, playlist, and heartbeat.
          </p>
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
            {devices.map((device) => (
              <Link
                key={device.id}
                href={`/screens/${device.id}`}
                className="group overflow-hidden rounded-lg border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-md"
              >
                <div className="aspect-video bg-muted overflow-hidden">
                  {device.screenshotUrl ? (
                    <img
                      alt={device.name}
                      src={device.screenshotUrl}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : null}
                </div>
                <div className="p-3 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[0.88rem] font-semibold text-card-foreground">{device.name}</p>
                      <p className="text-[0.78rem] text-muted-foreground">{device.siteName}</p>
                    </div>
                    <StatusPill label={device.status} status={device.status} />
                  </div>
                  <div className="flex items-center justify-between text-[0.75rem] font-mono text-muted-foreground">
                    <span>{device.currentPlaylistName ?? "No playlist"}</span>
                    <span>{formatRelativeTimestamp(device.lastHeartbeatAt)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Claim form */}
        <ClaimDeviceForm />
      </div>
    </div>
  );
}
