import {
  AlertTriangle,
  ArrowRight,
  Cable,
  Cpu,
  HardDriveDownload,
  ListVideo,
  MonitorPlay,
  RefreshCw,
  TerminalSquare,
  Thermometer,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { osVersionMatches } from "@showroom/contracts";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import {
  getDevice,
  getWorkspaceAccess,
  latestScreenshot,
  listCommands,
  listPlaylists,
} from "@/lib/backend";
import { commandLabel, isCommandPending } from "@/lib/commands";
import { contentStateLabels, deviceIssues, savedContent } from "@/lib/device-health";
import { isTailscaleConfigured, readTailscaleConfig } from "@/lib/tailscale";
import { cn, formatRelativeTimestamp } from "@/lib/utils";

// Labels device-health.ts uses for a screen's own report; that notice is rendered separately here.
const contentWarningLabels = new Set(["Screen reported an error", "Content needs attention"]);

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

  const [screenshot, commands, playlists, access] = await Promise.all([
    latestScreenshot(device.id),
    listCommands(device.id),
    listPlaylists(),
    // Remote SSH belongs to whoever runs the site, so customers' workspaces don't see it.
    canAdmin ? getWorkspaceAccess().catch(() => ({ isPlatformOperator: false })) : { isPlatformOperator: false },
  ]);
  const showRemoteAccess = canAdmin && access.isPlatformOperator;
  const remoteAccessOn = showRemoteAccess && isTailscaleConfigured(readTailscaleConfig());
  // Mirrors the hostname rule in showroom-tailscale-join.
  const tailnetName = `showroom-${device.id}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 63);

  const health = device.health;
  const reporting = device.status === "online" || device.status === "stale";
  const isManaged = device.fleetManagementState === "managed";
  const osVersion = device.osVersion ?? health?.osVersion ?? null;
  const bootSlot = device.bootSlot ?? health?.bootSlot ?? null;
  const systemUpdatePending = Boolean(
    device.desiredSystemVersion && !osVersionMatches(osVersion, device.desiredSystemVersion),
  );
  const noPlaylist = device.status !== "unclaimed" && !device.currentPlaylistName;
  // The screen's own report (for example "2 of 9 items are not on the screen yet") stays set until
  // the cause is fixed. It is a content warning, not a failure, and is shown in full below.
  const contentWarning = reporting && device.lastError ? device.lastError : null;
  // "No playlist" and the content warning get their own notices with the way to fix them.
  const issues = deviceIssues(device).filter(
    (issue) =>
      issue.severity !== "info" &&
      issue.label !== "No playlist" &&
      !(contentWarning && contentWarningLabels.has(issue.label)),
  );
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
      value: !reporting ? "Unknown" : device.lastError ? "Needs attention" : contentStateLabels[device.contentState ?? "unknown"],
      detail: device.lastSyncAt ? `Synced ${formatRelativeTimestamp(device.lastSyncAt)}` : undefined,
      tone: (!reporting || !device.contentState || device.contentState === "unknown"
        ? "unknown"
        : device.lastError ? "warn" : device.contentState === "current" ? "good" : "warn") as Tone,
    },
    {
      icon: HardDriveDownload,
      label: "Saved on screen",
      ...savedContent(device),
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
              {device.lastError && !contentWarning ? (
                <span className="mb-1 block break-words">Last report from the screen: {device.lastError}</span>
              ) : null}
              {device.status === "offline"
                ? "The screen keeps playing its saved content if it lost internet, but it can't receive changes or commands until it reconnects. Check power and network at the site."
                : "Playback may be interrupted. Try Restart player from the menu, or check the TV and cables at the site."}
            </AlertDescription>
          </Alert>
        ) : null}

        {contentWarning ? (
          <Alert>
            <AlertTriangle className="text-warning" />
            <AlertTitle>Content needs attention</AlertTitle>
            <AlertDescription>
              <p className="break-words text-foreground">{contentWarning}</p>
              <p className="mt-1">
                The screen keeps playing what it already has. This clears on its own once the problem is fixed;
                use Sync content to try again now.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        {noPlaylist ? (
          <Alert>
            <ListVideo />
            <AlertTitle>This screen has nothing to play</AlertTitle>
            <AlertDescription>
              <p>
                {playlists.length === 0
                  ? "The workspace has no playlists yet. Add media, then make a playlist and tick Workspace default."
                  : canAdmin
                    ? "Pick a Default playlist in Settings below, or tick Workspace default on a playlist so every screen plays it."
                    : "Ask a workspace admin to pick a playlist for it."}
              </p>
              {canAdmin ? (
                <Button
                  className="mt-2"
                  nativeButton={false}
                  render={<Link href={playlists.length === 0 ? "/media" : "/playlists"} />}
                  size="sm"
                  variant="outline"
                >
                  {playlists.length === 0 ? "Add media" : "Open Playlists"}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              ) : null}
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

            <section aria-label="Health" className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
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
                    <InfoRow label="Site" value={device.siteName} />
                    <InfoRow
                      label="Default playlist"
                      value={
                        playlists.find((playlist) => playlist.id === device.defaultPlaylistId)?.name ??
                        "Workspace default"
                      }
                    />
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

            {showRemoteAccess ? (
              <Card id="remote-access">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TerminalSquare className="size-4 text-muted-foreground" aria-hidden />
                    Remote access
                  </CardTitle>
                  <CardDescription>
                    {remoteAccessOn
                      ? "SSH over Tailscale is set up on this site. A screen whose image includes Tailscale joins your tailnet within 15 minutes of pairing."
                      : "SSH over Tailscale is not set up on this site. Everything else on this page works without it."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  {remoteAccessOn ? (
                    <>
                      <p className="text-muted-foreground">From a computer signed in to the tailnet:</p>
                      <code className="block overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">
                        ssh pi@{tailnetName}
                      </code>
                      <p className="text-xs text-muted-foreground">
                        This page can&apos;t tell whether the screen has joined yet. If the name doesn&apos;t resolve,
                        look for it in the Tailscale admin console.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      To turn it on, set <code className="font-mono">TAILSCALE_OAUTH_CLIENT_ID</code> and{" "}
                      <code className="font-mono">TAILSCALE_OAUTH_CLIENT_SECRET</code> on the dashboard deployment.
                      Steps are in infra/pi-image/README.md under Remote SSH (Tailscale).
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : null}

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
                  {/* Older Raspberry Pi OS screens don't report these, so the rows stay out of the way. */}
                  {osVersion ? (
                    <InfoRow label="System" value={<span title={osVersion}>{osVersion}</span>} />
                  ) : null}
                  {bootSlot ? <InfoRow label="Boot slot" value={bootSlot} /> : null}
                  <InfoRow
                    label="Content version"
                    value={`${device.manifestVersion ?? "—"}${device.desiredManifestVersion && device.desiredManifestVersion !== device.manifestVersion ? ` → ${device.desiredManifestVersion}` : ""}`}
                  />
                  <InfoRow
                    label="Software"
                    value={isManaged ? `${device.applianceGeneration ?? "appliance"} · protocol ${device.agentProtocolVersion ?? "?"}` : "Legacy"}
                  />
                </dl>
                {systemUpdatePending ? (
                  <p role="status" className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    A system update to <span className="font-medium text-foreground">{device.desiredSystemVersion}</span>{" "}
                    is in progress. The screen downloads it, restarts once, and goes back to the previous version on
                    its own if the new one fails to start.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </ScreenCommandProvider>
  );
}
