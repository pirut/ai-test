"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DeviceSummary } from "@showroom/contracts";
import { ExternalLink, MoreHorizontal, Search, Trash2 } from "lucide-react";

import { RemoveScreenDialog } from "@/components/remove-screen-dialog";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelativeTimestamp } from "@/lib/utils";

function healthLabel(device: DeviceSummary) {
  if (device.fleetManagementState === "legacy") return "Waiting for appliance flash";
  if (!device.health?.playerHealthy) return "Player stopped";
  if (!device.health?.hdmiConnected) return "HDMI disconnected";
  if ((device.health?.signalPercent ?? 100) < 25) return `Weak Wi-Fi · ${device.health?.signalPercent}%`;
  if ((device.health?.cpuTemperatureC ?? 0) >= 80) return `High temperature · ${device.health?.cpuTemperatureC?.toFixed(0)}°C`;
  return "Healthy";
}

function healthTone(device: DeviceSummary) {
  return healthLabel(device) === "Healthy" ? "text-signal" : "text-warning";
}

export function ScreensTable({ initialDevices, canAdmin }: { initialDevices: DeviceSummary[]; canAdmin: boolean }) {
  const [devices, setDevices] = useState(initialDevices);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [removeTarget, setRemoveTarget] = useState<DeviceSummary | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return devices.filter((device) => {
      const matchesStatus = status === "all" || device.status === status;
      const matchesQuery = !needle || [device.name, device.siteName, device.currentPlaylistName ?? ""]
        .some((value) => value.toLowerCase().includes(needle));
      return matchesStatus && matchesQuery;
    });
  }, [devices, query, status]);

  return (
    <>
      <section className="dashboard-surface overflow-hidden rounded-lg">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search screens or sites"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Status
            <select
              className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All screens</option>
              <option value="online">Online</option>
              <option value="stale">Stale</option>
              <option value="offline">Offline</option>
              <option value="unclaimed">Unclaimed</option>
            </select>
          </label>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-[var(--surface-low)] text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-5 py-3">Screen</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Now playing</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="w-14 px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((device) => (
                <tr key={device.id} className="group transition-colors hover:bg-[var(--surface-low)]">
                  <td className="px-5 py-4">
                    <Link href={`/screens/${device.id}`} className="font-medium text-foreground hover:text-primary">
                      {device.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">{device.siteName}</p>
                  </td>
                  <td className="px-4 py-4"><StatusPill label={device.status} status={device.status} /></td>
                  <td className="max-w-56 px-4 py-4 text-sm text-foreground">
                    <span className="block truncate">{device.currentPlaylistName ?? "No playlist"}</span>
                  </td>
                  <td className={`px-4 py-4 text-sm font-medium ${healthTone(device)}`}>{healthLabel(device)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                    {formatRelativeTimestamp(device.lastHeartbeatAt)}
                  </td>
                  <td className="relative px-4 py-4 text-right">
                    <details className="relative inline-block">
                      <summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden" aria-label={`Actions for ${device.name}`}>
                        <MoreHorizontal className="size-4" />
                      </summary>
                      <div className="absolute right-0 top-9 z-20 w-40 rounded-lg border border-border bg-popover p-1 text-left shadow-lg">
                        <Link href={`/screens/${device.id}`} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted">
                          <ExternalLink className="size-4" /> View details
                        </Link>
                        {canAdmin ? (
                          <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10" onClick={() => setRemoveTarget(device)}>
                            <Trash2 className="size-4" /> Remove screen
                          </button>
                        ) : null}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border md:hidden">
          {filtered.map((device) => (
            <article key={device.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/screens/${device.id}`} className="font-semibold text-foreground">{device.name}</Link>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{device.siteName}</p>
                </div>
                <StatusPill label={device.status} status={device.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-muted-foreground">Now playing</p><p className="mt-1 truncate font-medium text-foreground">{device.currentPlaylistName ?? "No playlist"}</p></div>
                <div><p className="text-muted-foreground">Last seen</p><p className="mt-1 font-medium text-foreground">{formatRelativeTimestamp(device.lastHeartbeatAt)}</p></div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <p className={`text-xs font-medium ${healthTone(device)}`}>{healthLabel(device)}</p>
                {canAdmin ? <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRemoveTarget(device)}><Trash2 className="size-4" />Remove</Button> : null}
              </div>
            </article>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">No screens match these filters.</div>
        ) : null}
        <div className="border-t border-border bg-[var(--surface-low)] px-5 py-3 text-xs text-muted-foreground">
          Showing {filtered.length} of {devices.length} screens
        </div>
      </section>

      <RemoveScreenDialog
        screen={removeTarget}
        open={Boolean(removeTarget)}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        onRemoved={(deviceId) => setDevices((current) => current.filter((device) => device.id !== deviceId))}
      />
    </>
  );
}
