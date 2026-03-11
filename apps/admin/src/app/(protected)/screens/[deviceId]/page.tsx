import { notFound } from "next/navigation";

import { CommandPanel } from "@/components/command-panel";
import { PageHeader } from "@/components/page-header";
import { ScreenSettingsPanel } from "@/components/screen-settings-panel";
import { StatusPill } from "@/components/status-pill";
import { requireOrgId } from "@/lib/auth";
import { getDevice, latestScreenshot, listCommands, listPlaylists } from "@/lib/backend";

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
    <>
      <PageHeader
        title={device.name}
        description={device.siteName}
        action={<StatusPill status={device.status} label={device.status} />}
      />

      <div className="p-8">
        <div className="grid grid-cols-[1fr_300px] gap-6">
          {/* Left: screenshot + stats */}
          <div className="flex flex-col gap-4">
            {screenshot ? (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <img alt={device.name} src={screenshot.publicUrl} className="w-full h-auto block" />
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-xl border border-border bg-card text-muted-foreground/30">
                <svg className="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" strokeLinecap="round" />
                </svg>
              </div>
            )}

            {/* Device stats */}
            <div className="rounded-xl border border-border bg-card">
              {[
                { label: "Current playlist", value: device.currentPlaylistName ?? "Unassigned" },
                { label: "Manifest version", value: String(device.manifestVersion ?? "—") },
                { label: "Last heartbeat",   value: device.lastHeartbeatAt },
              ].map(({ label, value }, i, arr) => (
                <div
                  key={label}
                  className={`flex items-center justify-between gap-4 px-4 py-3 text-sm ${i < arr.length - 1 ? "border-b border-border" : ""}`}
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono text-[0.82rem] text-foreground">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: commands + log */}
          <div className="flex flex-col gap-4">
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

            {/* Command log */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-[0.88rem] font-semibold text-foreground">Command log</h2>
              </div>
              {commands.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">No commands issued yet.</p>
              ) : (
                <div>
                  {commands.map((cmd, i) => (
                    <div
                      key={cmd.id}
                      className={`flex items-center justify-between gap-4 px-4 py-2.5 text-sm ${i < commands.length - 1 ? "border-b border-border" : ""}`}
                    >
                      <div className="flex flex-col">
                        <span className="font-mono text-[0.8rem] text-foreground">{cmd.commandType}</span>
                        {cmd.status ? (
                          <span className="font-mono text-[0.72rem] text-muted-foreground">{cmd.status}</span>
                        ) : null}
                      </div>
                      <span className="font-mono text-[0.75rem] text-muted-foreground">{cmd.issuedAt}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
