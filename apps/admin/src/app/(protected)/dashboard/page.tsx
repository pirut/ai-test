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
    <div>
      <header className="workspaceHeader">
        <div>
          <p className="eyebrow">Control room</p>
          <h1>Fleet overview</h1>
          <p>
            Watch live screen health, verify what is on display, and claim new
            hardware as it comes online.
          </p>
        </div>
      </header>

      <section className="metricsGrid">
        <MetricCard label="Online" value={stats.online} hint="Healthy screens reporting in." />
        <MetricCard label="Stale" value={stats.stale} hint="Needs a heartbeat check." />
        <MetricCard label="Offline" value={stats.offline} hint="No response in 5+ minutes." />
        <MetricCard label="Unclaimed" value={stats.unclaimed} hint="Awaiting operator assignment." />
        <MetricCard label="Queued" value={stats.pendingCommands} hint="Pending command executions." />
      </section>

      <div className="splitGrid">
        <section className="panel">
          <div className="sectionTitle">
            <span className="eyebrow">Screens</span>
            <h2>Latest playback state</h2>
            <p>Every tile shows the latest screenshot, playlist, and heartbeat.</p>
          </div>
          <div className="screensGrid">
            {devices.map((device) => (
              <Link className="screenCard" href={`/screens/${device.id}`} key={device.id}>
                <div className="screenPreview">
                  {device.screenshotUrl ? (
                    <img alt={device.name} src={device.screenshotUrl} />
                  ) : null}
                </div>
                <div className="screenMeta">
                  <div>
                    <strong>{device.name}</strong>
                    <p>{device.siteName}</p>
                  </div>
                  <StatusPill label={device.status} status={device.status} />
                </div>
                <div className="screenMetaRow">
                  <span>{device.currentPlaylistName ?? "No playlist assigned"}</span>
                  <span>{formatRelativeTimestamp(device.lastHeartbeatAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
        <ClaimDeviceForm />
      </div>
    </div>
  );
}
