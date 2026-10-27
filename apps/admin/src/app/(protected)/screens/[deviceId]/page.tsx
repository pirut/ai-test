import { AlertTriangle, Cable, Cpu, MonitorPlay, RefreshCw, Thermometer, Wifi } from "lucide-react";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { CommandStatusBadge } from "@/components/command-status-badge";
import { PageHeader } from "@/components/page-header";
import {
  CommandFeedback,
  NetworkCard,
  ScreenActions,
  ScreenCommandProvider,
  ScreenPreview,
} from "@/components/screen-controls";
import { ScreenSettingsPanel } from "@/components/screen-settings-panel";
import { StatusPill } from "@/components/status-pill";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import {
  getDevice,
  latestScreenshot,
  listCommands,
  listPlaylists,
} from "@/lib/backend";
import { commandLabel, isCommandPending } from "@/lib/commands";
import { contentStateLabels, deviceIssues } from "@/lib/device-health";
import { cn, formatRelativeTimestamp } from "@/lib/utils";

type Tone = "good" | "warn" | "bad" | "unknown";

const toneClass: Record<Tone, string> = {
  good: "text-signal",
  warn: "text-warning",
  bad: "text-danger",
  unknown: "text-muted-foreground",
};

function HealthTile({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Wifi;
  label: string;
  value: string;
  detail?: string;
  tone: Tone;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-3 py-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </span>
      <span className={cn("truncate text-sm font-semibold", toneClass[tone])}>{value}</span>
      {detail ? <span className="truncate text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-xs">{value}</dd>
    </div>
  );
}

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

  const health = device.health;
  const reporting = device.status === "online" || device.status === "stale";
  const isManaged = device.fleetManagementState === "managed";
  const issues = deviceIssues(device).filter((issue) => issue.severity !== "info");
  const hasPendingCommand = commands.some((command) => isCommandPending(command.status));

  const tiles = [
    {
      icon: MonitorPlay,
      label: "Player",
      value: !reporting || !health ? "Unknown" : health.playerHealthy ? "Playing" : "Stopped",
      detail: device.currentPlaylistName ?? "No playlist",
      tone: (!reporting || !health ? "unknown" : health.playerHealthy ? "good" : "bad") as Tone,
    },
    {
      icon: Cable,
      label: "Display",
      value: !reporting || !health ? "Unknown" : health.hdmiConnected ? "Connected" : "Unplugged",
      detail: "HDMI",
      tone: (!reporting || !health ? "unknown" : health.hdmiConnected ? "good" : "bad") as Tone,
    },
    {
      icon: Wifi,
      label: "Network",
      value: health?.signalPercent != null ? `${health.signalPercent}% signal` : health?.networkInterface === "eth0" ? "Wired" : "Unknown",
      detail: health?.ssid ?? health?.ipAddress,
      tone: (!reporting || health?.signalPercent == null
        ? "unknown"
        : health.signalPercent < 25 ? "bad" : health.signalPercent < 50 ? "warn" : "good") as Tone,
    },
    {
      icon: RefreshCw,
      label: "Content",
      value: !reporting ? "Unknown" : device.lastError ? "Error" : contentStateLabels[device.contentState ?? "unknown"],
      detail: device.lastSyncAt ? `Synced ${formatRelativeTimestamp(device.lastSyncAt)}` : undefined,
      tone: (!reporting || !device.contentState || device.contentState === "unknown"
        ? "unknown"
        : device.lastError ? "warn" : device.contentState === "current" ? "good" : "warn") as Tone,
    },
    {
      icon: Thermometer,
      label: "Temperature",
      value: health?.cpuTemperatureC != null ? `${health.cpuTemperatureC.toFixed(0)}°C` : "Unknown",
      detail: health?.throttledFlags && health.throttledFlags !== "0x0" ? `Throttled ${health.throttledFlags}` : undefined,
      tone: (!reporting || health?.cpuTemperatureC == null
        ? "unknown"
        : health.cpuTemperatureC >= 80 ? "bad" : health.cpuTemperatureC >= 70 ? "warn" : "good") as Tone,
    },
  ];

  return (
    <ScreenCommandProvider deviceId={device.id}>
      {/* Poll faster while a command is still on its way so its result shows up promptly. */}
      <AutoRefresh intervalMs={hasPendingCommand ? 5_000 : 15_000} />
      <div className="flex flex-col gap-6">
        <PageHeader
          back={{ href: "/screens", label: "Screens" }}
          title={device.name}
          meta={<StatusPill status={device.status} />}
          description={
            <>
              {device.siteName} · last check-in {formatRelativeTimestamp(device.lastHeartbeatAt)}
            </>
          }
          action={<ScreenActions screen={{ id: device.id, name: device.name }} canAdmin={canAdmin} />}
        />
        <CommandFeedback className="-mt-3" />

        {issues.length ? (
          <Alert variant={issues.some((issue) => issue.severity === "critical") ? "destructive" : "default"}>
            <AlertTriangle />
            <AlertTitle>{issues.map((issue) => issue.label).join(" · ")}</AlertTitle>
            <AlertDescription>
              {device.lastError ? (
                <span className="mb-1 block break-words font-mono text-xs">Last error from the screen: {device.lastError}</span>
              ) : null}
              {device.status === "offline"
                ? "The screen keeps playing its saved content if it lost internet, but it can't receive changes or commands until it reconnects. Check power and network at the site."
                : "Playback may be interrupted. Try Restart player from the menu, or check the TV and cables at the site."}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-6">
            <ScreenPreview
              key={screenshot?.capturedAt ?? "none"}
              name={device.name}
              initialScreenshot={screenshot ? { publicUrl: screenshot.publicUrl, capturedAt: screenshot.capturedAt } : null}
              reporting={reporting}
            />

            <section aria-label="Health" className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
              {tiles.map((tile) => (
                <HealthTile key={tile.label} {...tile} />
              ))}
            </section>

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
              <Card>
                <CardHeader>
                  <CardTitle>Settings</CardTitle>
                  <CardDescription>Only workspace admins can change a screen&apos;s settings.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="divide-y">
                    <InfoRow label="Orientation" value={`${device.orientation}°`} />
                    <InfoRow label="Volume" value={`${device.volume}%`} />
                    <InfoRow label="Time zone" value={device.timezone} />
                  </dl>
                </CardContent>
              </Card>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-6">
            <Card id="activity" className="scroll-mt-20">
              <CardHeader className="border-b">
                <CardTitle>Activity</CardTitle>
                <CardDescription>Commands sent to this screen. Results update on their own.</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {commands.length === 0 ? (
                  <p className="px-4 text-sm text-muted-foreground">Nothing sent to this screen yet.</p>
                ) : (
                  <ol className="max-h-[420px] divide-y overflow-y-auto">
                    {commands.map((command) => (
                      <li key={command.id} className="flex flex-col gap-1 px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium">{commandLabel(command.commandType)}</span>
                          <CommandStatusBadge status={command.status} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Sent {formatRelativeTimestamp(command.issuedAt)}
                          {command.startedAt && !command.completedAt ? ` · started ${formatRelativeTimestamp(command.startedAt)}` : null}
                          {command.completedAt ? ` · finished ${formatRelativeTimestamp(command.completedAt)}` : null}
                        </span>
                        {command.message && command.status === "failed" ? (
                          <span className="break-words font-mono text-xs text-destructive">{command.message}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            {canAdmin ? <NetworkCard isManaged={isManaged} currentSsid={health?.ssid} /> : null}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="size-4 text-muted-foreground" aria-hidden />
                  Device details
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!isManaged ? (
                  <Alert className="mb-3">
                    <AlertDescription>
                      This screen runs the older software. It keeps working as-is, but Wi-Fi changes and software
                      rollouts unlock after its appliance update.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <dl className="divide-y">
                  <InfoRow label="Model" value={health?.model ?? device.hardwareProfile ?? "—"} />
                  <InfoRow label="IP address" value={health?.ipAddress ?? "—"} />
                  <InfoRow
                    label="Player"
                    value={`${device.appVersion ?? "unknown"}${device.desiredPlayerVersion && device.desiredPlayerVersion !== device.appVersion ? ` → ${device.desiredPlayerVersion}` : ""}`}
                  />
                  <InfoRow
                    label="Agent"
                    value={`${device.agentVersion ?? "unknown"}${device.desiredAgentVersion && device.desiredAgentVersion !== device.agentVersion ? ` → ${device.desiredAgentVersion}` : ""}`}
                  />
                  <InfoRow label="OS" value={health?.osVersion ?? "—"} />
                  <InfoRow label="Boot slot" value={health?.bootSlot ?? "—"} />
                  <InfoRow
                    label="Content version"
                    value={`${device.manifestVersion ?? "—"}${device.desiredManifestVersion && device.desiredManifestVersion !== device.manifestVersion ? ` → ${device.desiredManifestVersion}` : ""}`}
                  />
                  <InfoRow
                    label="Software"
                    value={isManaged ? `${device.applianceGeneration ?? "appliance"} · protocol ${device.agentProtocolVersion ?? "?"}` : "Legacy"}
                  />
                </dl>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </ScreenCommandProvider>
  );
}
