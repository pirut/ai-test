import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { requireOrgId } from "@/lib/auth";
import { listDevices } from "@/lib/backend";
import { formatRelativeTimestamp } from "@/lib/utils";

export default async function ScreensPage() {
  const orgId = await requireOrgId();
  const devices = await listDevices(orgId);

  return (
    <div>
      <header className="workspaceHeader">
        <div>
          <p className="eyebrow">Fleet</p>
          <h1>Screens</h1>
          <p>Inspect health, playback status, screenshots, and device assignment.</p>
        </div>
      </header>
      <div className="screensGrid">
        {devices.map((device) => (
          <Link className="screenCard" href={`/screens/${device.id}`} key={device.id}>
            <div className="screenPreview">
              {device.screenshotUrl ? <img alt={device.name} src={device.screenshotUrl} /> : null}
            </div>
            <div className="screenMeta">
              <div>
                <strong>{device.name}</strong>
                <p>{device.siteName}</p>
              </div>
              <StatusPill label={device.status} status={device.status} />
            </div>
            <div className="screenMetaRow">
              <span>{device.currentPlaylistName ?? "No active playlist"}</span>
              <span>{formatRelativeTimestamp(device.lastHeartbeatAt)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
