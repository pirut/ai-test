import { notFound } from "next/navigation";

import { CommandPanel } from "@/components/command-panel";
import { StatusPill } from "@/components/status-pill";
import { requireOrgId } from "@/lib/auth";
import { getDevice, latestScreenshot, listCommands } from "@/lib/backend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ScreenDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  const orgId = await requireOrgId();
  const device = await getDevice(orgId, deviceId);

  if (!device) notFound();

  const screenshot = await latestScreenshot(device.id);
  const commands = await listCommands(device.id);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="mb-1 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
            <span className="inline-block h-px w-4 bg-brand opacity-70" />
            Screen detail
          </p>
          <h1 className="text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold tracking-tight leading-tight">
            {device.name}
          </h1>
          <p className="mt-1 text-[0.9rem] text-muted-foreground">{device.siteName}</p>
        </div>
        <StatusPill label={device.status} status={device.status} />
      </header>

      {/* Detail grid */}
      <div className="grid gap-5 grid-cols-[minmax(0,1.5fr)_minmax(300px,0.5fr)]">
        {/* Screenshot + stats */}
        <Card>
          <CardContent className="flex flex-col gap-4 pt-4">
            {screenshot ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <img alt={device.name} src={screenshot.publicUrl} className="w-full h-auto block" />
              </div>
            ) : null}
            <div className="divide-y divide-border">
              {[
                { label: "Current playlist", value: device.currentPlaylistName ?? "Unassigned" },
                { label: "Manifest version", value: device.manifestVersion ?? "None" },
                { label: "Last heartbeat",   value: device.lastHeartbeatAt },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3 text-[0.88rem]">
                  <span className="text-muted-foreground">{label}</span>
                  <strong className="font-mono text-[0.85rem] text-card-foreground">{String(value)}</strong>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Commands + log */}
        <div className="flex flex-col gap-4">
          <CommandPanel deviceId={device.id} />
          <Card>
            <CardHeader>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
                Command log
              </p>
              <CardTitle className="text-lg">Recent queue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {commands.map((command) => (
                  <div key={command.id} className="flex items-center justify-between gap-4 py-2.5 text-[0.85rem]">
                    <span className="text-muted-foreground">{command.commandType}</span>
                    <strong className="font-mono text-[0.8rem] text-card-foreground">{command.issuedAt}</strong>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
