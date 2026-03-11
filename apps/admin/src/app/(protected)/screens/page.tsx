import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { requireOrgId } from "@/lib/auth";
import { listDevices } from "@/lib/backend";
import { formatRelativeTimestamp } from "@/lib/utils";

export default async function ScreensPage() {
  const orgId = await requireOrgId();
  const devices = await listDevices(orgId);

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-border pb-6">
        <p className="mb-1 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
          <span className="inline-block h-px w-4 bg-brand opacity-70" />
          Fleet
        </p>
        <h1 className="text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold tracking-tight leading-tight">
          Screens
        </h1>
        <p className="mt-1 text-[0.9rem] text-muted-foreground">
          Inspect health, playback status, screenshots, and device assignment.
        </p>
      </header>

      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
        {devices.map((device) => (
          <Link
            key={device.id}
            href={`/screens/${device.id}`}
            className="group overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-md"
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
                  <p className="text-[0.9rem] font-semibold text-card-foreground">{device.name}</p>
                  <p className="text-[0.78rem] text-muted-foreground">{device.siteName}</p>
                </div>
                <StatusPill label={device.status} status={device.status} />
              </div>
              <div className="flex items-center justify-between text-[0.75rem] font-mono text-muted-foreground">
                <span>{device.currentPlaylistName ?? "No active playlist"}</span>
                <span>{formatRelativeTimestamp(device.lastHeartbeatAt)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
