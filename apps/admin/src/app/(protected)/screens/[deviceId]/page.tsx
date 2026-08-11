import { notFound } from "next/navigation";

import { CommandPanel } from "@/components/command-panel";
import { PageHeader } from "@/components/page-header";
import { RemoveScreenButton } from "@/components/remove-screen-dialog";
import { ScreenSettingsPanel } from "@/components/screen-settings-panel";
import { StatusPill } from "@/components/status-pill";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import {
  getDevice,
  latestScreenshot,
  listCommands,
  listPlaylists,
} from "@/lib/backend";
import { formatRelativeTimestamp } from "@/lib/utils";

export default async function ScreenDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  const orgId = await requireOrgId();
  const session = await getAuthSession();
  const canAdmin = session.has({ role: "org:admin" });
  const device = await getDevice(orgId, deviceId);

  if (!device) notFound();

  const [screenshot, commands, playlists] = await Promise.all([
    latestScreenshot(device.id),
    listCommands(device.id),
    listPlaylists(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={device.name}
        description={`${device.siteName} · configure playback defaults, device identity, and remote commands.`}
        action={
          <div className="flex items-center gap-3">
            <StatusPill status={device.status} label={device.status} />
            {canAdmin ? <RemoveScreenButton screen={{ id: device.id, name: device.name }} /> : null}
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <div className="space-y-5">
          <div className="dashboard-surface overflow-hidden rounded-lg">
            <div className="border-b border-border px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Live preview
              </p>
            </div>
            <div className="relative aspect-[16/9] bg-[var(--surface-high)]">
              {screenshot ? (
                <img
                  alt={device.name}
                  src={screenshot.publicUrl}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No screenshot available yet.
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            {canAdmin ? (
              <ScreenSettingsPanel
                device={{
                  deviceId: device.id,
                  name: device.name,
                  siteName: device.siteName,
                  timezone: device.timezone,
                  orientation: device.orientation,
                  volume: device.volume,
                  defaultPlaylistId: device.defaultPlaylistId ?? null,
                }}
                playlists={playlists.map((playlist) => ({ id: playlist.id, name: playlist.name }))}
              />
            ) : (
              <div className="dashboard-surface rounded-lg p-5 text-sm text-muted-foreground">
                Device settings are read-only for members. Ask an organization admin to change playback defaults.
              </div>
            )}
            <CommandPanel
              canAdmin={canAdmin}
              deviceId={device.id}
              fleetManagementState={device.fleetManagementState}
            />
          </div>
        </div>

        <aside className="space-y-5">
          <div className="dashboard-surface rounded-lg p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Appliance health
              </p>
              <StatusPill
                status={device.fleetManagementState === "legacy"
                  ? "unclaimed"
                  : device.health?.playerHealthy && device.health?.hdmiConnected
                    ? "online"
                    : "stale"}
                label={device.fleetManagementState === "legacy"
                  ? "legacy protected"
                  : device.health?.playerHealthy && device.health?.hdmiConnected
                    ? "healthy"
                    : "attention"}
              />
            </div>
            {device.fleetManagementState === "legacy" ? (
              <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-3 text-[0.8rem] leading-5 text-warning">
                Current-device compatibility is active. This screen keeps the legacy command protocol and is excluded from network changes, telemetry retention, and release rollouts until its first appliance heartbeat.
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                { label: "Player", value: device.health?.playerHealthy ? "Healthy" : "No heartbeat" },
                { label: "HDMI", value: device.health?.hdmiConnected ? "Connected" : "Disconnected" },
                { label: "CPU", value: device.health?.cpuTemperatureC == null ? "—" : `${device.health.cpuTemperatureC.toFixed(1)}°C` },
                { label: "Wi-Fi", value: device.health?.signalPercent == null ? "—" : `${device.health.signalPercent}%` },
                { label: "Boot slot", value: device.health?.bootSlot ?? "—" },
                { label: "Rollback", value: String(device.health?.rollbackCount ?? 0) },
              ].map((item) => (
                <div key={item.label} className="rounded-md border border-border bg-[var(--surface-low)] px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
                  <p className="mt-1 font-mono text-[0.78rem] text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-md border border-border bg-[var(--surface-low)] px-3 py-2.5 text-[0.75rem] text-muted-foreground">
              Agent {device.agentVersion ?? "unknown"} / desired {device.desiredAgentVersion ?? "current"}<br />
              Player {device.appVersion ?? "unknown"} / desired {device.desiredPlayerVersion ?? "current"}
              <br />Fleet {device.fleetManagementState === "managed"
                ? `${device.applianceGeneration} / protocol ${device.agentProtocolVersion}`
                : "waiting for flash"}
            </div>
          </div>

          <div className="dashboard-surface rounded-lg p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Device profile
            </p>
            <div className="mt-4 space-y-4">
              {[
                { label: "Site", value: device.siteName },
                { label: "Timezone", value: device.timezone },
                { label: "Orientation", value: `${device.orientation}°` },
                { label: "Volume", value: `${device.volume}%` },
                {
                  label: "Current playlist",
                  value: device.currentPlaylistName ?? "Unassigned",
                },
                {
                  label: "Manifest version",
                  value: device.manifestVersion ?? "None",
                },
                {
                  label: "Last heartbeat",
                  value: formatRelativeTimestamp(device.lastHeartbeatAt),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-md border border-border bg-[var(--surface-low)] px-4 py-3"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-2 font-mono text-sm text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="dashboard-surface rounded-lg">
            <div className="border-b border-border px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Command log
              </p>
            </div>
            {commands.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted-foreground">
                No commands have been issued for this device yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {commands.map((command) => (
                  <div key={command.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm text-foreground">
                          {command.commandType}
                        </p>
                        <p className="mt-1 text-[0.8rem] text-muted-foreground">
                          {command.status ?? "queued"}
                        </p>
                      </div>
                      <p className="font-mono text-[0.78rem] text-muted-foreground">
                        {formatRelativeTimestamp(command.issuedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
