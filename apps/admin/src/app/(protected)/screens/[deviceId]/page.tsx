import { notFound } from "next/navigation";

import { CommandPanel } from "@/components/command-panel";
import { StatusPill } from "@/components/status-pill";
import { requireOrgId } from "@/lib/auth";
import { getDevice, latestScreenshot, listCommands } from "@/lib/backend";

export default async function ScreenDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  const orgId = await requireOrgId();
  const device = await getDevice(orgId, deviceId);

  if (!device) {
    notFound();
  }

  const screenshot = await latestScreenshot(device.id);
  const commands = await listCommands(device.id);

  return (
    <div>
      <header className="workspaceHeader">
        <div>
          <p className="eyebrow">Screen detail</p>
          <h1>{device.name}</h1>
          <p>{device.siteName}</p>
        </div>
        <StatusPill label={device.status} status={device.status} />
      </header>
      <div className="detailGrid">
        <section className="panel">
          <div className="detailFigure">
            {screenshot ? <img alt={device.name} src={screenshot.publicUrl} /> : null}
          </div>
          <div className="detailStats">
            <div className="detailStatsRow">
              <span>Current playlist</span>
              <strong>{device.currentPlaylistName ?? "Unassigned"}</strong>
            </div>
            <div className="detailStatsRow">
              <span>Manifest version</span>
              <strong>{device.manifestVersion ?? "None"}</strong>
            </div>
            <div className="detailStatsRow">
              <span>Last heartbeat</span>
              <strong>{device.lastHeartbeatAt}</strong>
            </div>
          </div>
        </section>
        <div className="detailStats">
          <CommandPanel deviceId={device.id} />
          <section className="panel">
            <div className="sectionTitle">
              <span className="eyebrow">Command log</span>
              <h2>Recent queue</h2>
            </div>
            {commands.map((command) => (
              <div className="detailStatsRow" key={command.id}>
                <span>{command.commandType}</span>
                <strong>{command.issuedAt}</strong>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
