import { notFound } from "next/navigation";

import { CommandPanel } from "@/components/command-panel";
import { PageHeader } from "@/components/page-header";
import { ScreenSettingsPanel } from "@/components/screen-settings-panel";
import { StatusPill } from "@/components/status-pill";
import { requireOrgId } from "@/lib/auth";
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
        action={<StatusPill status={device.status} label={device.status} />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl border border-white/5 bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="border-b border-white/5 px-5 py-4">
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
              playlists={playlists.map((playlist) => ({
                id: playlist.id,
                name: playlist.name,
              }))}
            />
            <CommandPanel deviceId={device.id} />
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
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
                  className="rounded-lg border border-white/6 bg-[var(--surface-low)] px-4 py-3"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-2 font-mono text-sm text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="border-b border-white/5 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Command log
              </p>
            </div>
            {commands.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted-foreground">
                No commands have been issued for this device yet.
              </p>
            ) : (
              <div className="divide-y divide-white/5">
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
