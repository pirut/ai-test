import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { requireOrgId } from "@/lib/auth";
import { listDevices } from "@/lib/backend";
import { formatRelativeTimestamp } from "@/lib/utils";

export default async function ScreensPage() {
  const orgId = await requireOrgId();
  const devices = await listDevices(orgId);

  return (
    <>
      <PageHeader
        title="Screens"
        description={`${devices.length} device${devices.length !== 1 ? "s" : ""} in this fleet`}
      />
      <div className="p-8">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {devices.map((device) => (
            <Link
              key={device.id}
              href={`/screens/${device.id}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-border/80 hover:shadow-sm"
            >
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
              <div className="flex flex-col gap-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[0.85rem] font-medium text-card-foreground">{device.name}</span>
                  <StatusPill status={device.status} label={device.status} />
                </div>
                <p className="text-[0.75rem] text-muted-foreground">{device.siteName}</p>
                <div className="flex items-center justify-between gap-2 text-[0.75rem] text-muted-foreground font-mono">
                  <span className="truncate">{device.currentPlaylistName ?? "—"}</span>
                  <span className="shrink-0">{formatRelativeTimestamp(device.lastHeartbeatAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
