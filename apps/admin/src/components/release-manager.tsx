"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DeviceSummary, ReleaseSummary } from "@showroom/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const emptyDraft = {
  name: "",
  version: "",
  notes: "",
  playerUrl: "",
  playerSha256: "",
  playerSignature: "",
  agentUrl: "",
  agentSha256: "",
  agentSignature: "",
  systemUrl: "",
  systemSha256: "",
  systemSignature: "",
  signingKeyId: "",
};

const rolloutStatusLabels: Record<string, string> = {
  waiting: "waiting for its turn",
  queued: "queued",
  in_progress: "updating",
  succeeded: "updated",
  failed: "failed",
  paused: "paused",
  rolled_back: "rolled back",
};

function statusTone(status: string) {
  switch (status) {
    case "succeeded":
      return "text-primary";
    case "failed":
      return "text-destructive";
    case "in_progress":
      return "text-amber-500";
    case "paused":
      return "text-amber-500";
    default:
      return "text-muted-foreground";
  }
}

function rolloutStartedText(rollout: { queuedDeviceCount: number; targetDeviceCount?: number }) {
  const total = rollout.targetDeviceCount ?? rollout.queuedDeviceCount;
  const first = rollout.queuedDeviceCount;
  if (total <= first) {
    return `Rollout started on ${total} screen${total === 1 ? "" : "s"}.`;
  }
  return `Rollout started on ${first} of ${total} screens. The rest follow in stages once these update cleanly.`;
}

export function ReleaseManager({
  initialDevices,
  initialReleases,
  canDeployToAllWorkspaces = false,
}: {
  initialDevices: DeviceSummary[];
  initialReleases: ReleaseSummary[];
  canDeployToAllWorkspaces?: boolean;
}) {
  const router = useRouter();
  const [releases, setReleases] = useState(initialReleases);
  const [draft, setDraft] = useState(emptyDraft);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Record<string, string[]>>({});
  const [playerFile, setPlayerFile] = useState<File | null>(null);
  const [agentFile, setAgentFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deployingReleaseId, setDeployingReleaseId] = useState<string | null>(null);
  const managedDeviceCount = initialDevices.filter(
    (device) => device.fleetManagementState === "managed",
  ).length;
  const systemDeviceCount = initialDevices.filter((device) => device.supportsSystemUpdates).length;

  // A release with only a system bundle applies to Showroom OS screens alone;
  // the player and agent parts apply to every flashed screen.
  function canInstall(release: ReleaseSummary, device: DeviceSummary) {
    if (device.fleetManagementState !== "managed") return false;
    return Boolean(release.playerUrl || release.agentUrl) || Boolean(device.supportsSystemUpdates);
  }

  useEffect(() => {
    setReleases(initialReleases);
  }, [initialReleases]);

  async function saveRelease() {
    try {
      setIsSaving(true);
      setStatus({ ok: true, text: "Saving release…" });
      const hasUpload = Boolean(playerFile || agentFile);
      const uploadBody = new FormData();
      if (hasUpload) {
        uploadBody.set("name", draft.name.trim());
        uploadBody.set("version", draft.version.trim());
        uploadBody.set("deployToAll", "false");
        if (draft.notes.trim()) uploadBody.set("notes", draft.notes.trim());
        if (playerFile) uploadBody.set("player", playerFile);
        if (agentFile) uploadBody.set("agent", agentFile);
      }
      const response = await fetch(hasUpload ? "/api/releases/publish" : "/api/releases", {
        method: "POST",
        headers: hasUpload ? undefined : { "Content-Type": "application/json" },
        body: hasUpload ? uploadBody : JSON.stringify({
          name: draft.name.trim(),
          version: draft.version.trim(),
          notes: draft.notes.trim() || undefined,
          playerUrl: draft.playerUrl.trim() || undefined,
          playerSha256: draft.playerSha256.trim() || undefined,
          playerSignature: draft.playerSignature.trim() || undefined,
          agentUrl: draft.agentUrl.trim() || undefined,
          agentSha256: draft.agentSha256.trim() || undefined,
          agentSignature: draft.agentSignature.trim() || undefined,
          systemUrl: draft.systemUrl.trim() || undefined,
          systemSha256: draft.systemSha256.trim() || undefined,
          systemSignature: draft.systemSignature.trim() || undefined,
          signingKeyId: draft.signingKeyId.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create release");
      }

      const nextRelease = payload.release as ReleaseSummary;
      setReleases((current) => [nextRelease, ...current]);
      setDraft(emptyDraft);
      setStatus({ ok: true, text: `Saved release ${nextRelease.version}` });
      setPlayerFile(null);
      setAgentFile(null);
      router.refresh();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to save release",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function deploy(releaseId: string, deviceIds?: string[], allWorkspaces = false) {
    if (
      allWorkspaces &&
      !window.confirm(
        "Roll this release out to every workspace's screens? It starts with one of your own screens and widens in stages, pausing if screens fail.",
      )
    ) {
      return;
    }
    try {
      setDeployingReleaseId(releaseId);
      setStatus({ ok: true, text: "Queueing rollout…" });
      const response = await fetch(`/api/releases/${releaseId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceIds: deviceIds?.length ? deviceIds : undefined,
          allWorkspaces: allWorkspaces || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to queue rollout");
      }

      setStatus({
        ok: true,
        text: rolloutStartedText(payload.rollout),
      });
      router.refresh();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to queue rollout",
      });
    } finally {
      setDeployingReleaseId(null);
    }
  }

  async function control(releaseId: string, action: "pause" | "resume" | "retry_failed") {
    try {
      setDeployingReleaseId(releaseId);
      const response = await fetch(`/api/releases/${releaseId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to control rollout");
      setStatus({ ok: true, text: `Rollout is now ${payload.status}.` });
      router.refresh();
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : "Unable to control rollout" });
    } finally {
      setDeployingReleaseId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="border border-border/70 bg-card/95">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-[0.92rem] font-semibold">Release catalog</CardTitle>
          <p className="text-[0.78rem] text-muted-foreground">
            Save a signed player bundle, agent binary or Showroom OS bundle once, then roll it out in stages.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-name">
              Name
            </Label>
            <Input
              id="release-name"
              value={draft.name}
              placeholder="Spring showroom rollout"
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-version">
              Version
            </Label>
            <Input
              id="release-version"
              value={draft.version}
              placeholder="2026.03.11.1"
              onChange={(event) => setDraft((current) => ({ ...current, version: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-notes">
              Release notes
            </Label>
            <textarea
              id="release-notes"
              className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              placeholder="Validation checklist, rollback notes…"
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 rounded-xl border border-border/70 bg-muted/15 p-4 md:col-span-2 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-player-file">
                Player bundle
              </Label>
              <Input
                id="release-player-file"
                type="file"
                accept=".tar.gz,.tgz,.zip,application/gzip,application/zip"
                onChange={(event) => setPlayerFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-agent-file">
                Agent binary
              </Label>
              <Input
                id="release-agent-file"
                type="file"
                onChange={(event) => setAgentFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <p className="text-[0.75rem] text-muted-foreground md:col-span-2">
              Uploads are hashed and signed here. For a file hosted elsewhere, fill in its URL and SHA-256 below instead.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-player-url">
              Player URL
            </Label>
            <Input
              id="release-player-url"
              value={draft.playerUrl}
              placeholder="https://…/player.tar.gz"
              onChange={(event) => setDraft((current) => ({ ...current, playerUrl: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-player-sha">
              Player SHA-256 (required with URL)
            </Label>
            <Input
              id="release-player-sha"
              value={draft.playerSha256}
              placeholder="sha256:…"
              className="font-mono text-[0.78rem]"
              onChange={(event) => setDraft((current) => ({ ...current, playerSha256: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-player-signature">
              Player Ed25519 signature (leave empty to sign here)
            </Label>
            <Input
              id="release-player-signature"
              value={draft.playerSignature}
              placeholder="Base64 signature"
              className="font-mono text-[0.78rem]"
              onChange={(event) => setDraft((current) => ({ ...current, playerSignature: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-agent-url">
              Agent URL
            </Label>
            <Input
              id="release-agent-url"
              value={draft.agentUrl}
              placeholder="https://…/agent"
              onChange={(event) => setDraft((current) => ({ ...current, agentUrl: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-agent-sha">
              Agent SHA-256 (required with URL)
            </Label>
            <Input
              id="release-agent-sha"
              value={draft.agentSha256}
              placeholder="sha256:…"
              className="font-mono text-[0.78rem]"
              onChange={(event) => setDraft((current) => ({ ...current, agentSha256: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-agent-signature">
              Agent Ed25519 signature (leave empty to sign here)
            </Label>
            <Input
              id="release-agent-signature"
              value={draft.agentSignature}
              placeholder="Base64 signature"
              className="font-mono text-[0.78rem]"
              onChange={(event) => setDraft((current) => ({ ...current, agentSignature: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 rounded-xl border border-border/70 bg-muted/15 p-4 md:col-span-2 md:grid-cols-2">
            <p className="text-[0.75rem] text-muted-foreground md:col-span-2">
              Showroom OS update. Only screens running Showroom OS receive it ({systemDeviceCount} in this workspace);
              other screens still get the player and agent parts. The screen restarts to finish, and goes back to
              its previous system by itself if the new one does not start. Use the bundle&apos;s own version as the
              release version so the dashboard can confirm it.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-system-url">
                System bundle URL (.raucb)
              </Label>
              <Input
                id="release-system-url"
                value={draft.systemUrl}
                placeholder="https://…/showroom-os-rpi5-2026.11.09.42.raucb"
                onChange={(event) => setDraft((current) => ({ ...current, systemUrl: event.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-system-sha">
                System bundle SHA-256 (required with URL)
              </Label>
              <Input
                id="release-system-sha"
                value={draft.systemSha256}
                placeholder="sha256:…"
                className="font-mono text-[0.78rem]"
                onChange={(event) => setDraft((current) => ({ ...current, systemSha256: event.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-system-signature">
                System bundle Ed25519 signature (leave empty to sign here)
              </Label>
              <Input
                id="release-system-signature"
                value={draft.systemSignature}
                placeholder="Base64 signature"
                className="font-mono text-[0.78rem]"
                onChange={(event) => setDraft((current) => ({ ...current, systemSignature: event.target.value }))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="release-signing-key">
              Signing key ID (only with pasted signatures)
            </Label>
            <Input
              id="release-signing-key"
              value={draft.signingKeyId}
              placeholder="production-2026"
              className="font-mono text-[0.78rem]"
              onChange={(event) => setDraft((current) => ({ ...current, signingKeyId: event.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between gap-3 md:col-span-2">
            <p className={`text-[0.78rem] font-mono ${status ? (status.ok ? "text-primary" : "text-destructive") : "text-muted-foreground"}`}>
              {status?.text ?? ""}
            </p>
            <Button
              disabled={isSaving}
              onClick={() => startTransition(() => void saveRelease())}
            >
              {isSaving ? "Saving…" : "Save release"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {releases.map((release) => {
          const selected = selectedDeviceIds[release.id] ?? [];
          return (
            <Card key={release.id} className="border border-border/70 bg-card/95">
              <CardHeader className="border-b border-border/60">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-[0.95rem] font-semibold">{release.name}</CardTitle>
                      <Badge variant="outline">{release.version}</Badge>
                      {release.playerUrl ? <Badge variant="outline">player</Badge> : null}
                      {release.agentUrl ? <Badge variant="outline">agent</Badge> : null}
                      {release.systemUrl ? <Badge variant="outline">Showroom OS</Badge> : null}
                      {release.rolloutStatus && release.rolloutStatus !== "draft" ? (
                        <Badge variant="outline">{release.rolloutStatus}</Badge>
                      ) : null}
                      {release.rolloutStatus === "active" ? (
                        <Badge variant="outline">ring {(release.currentRing ?? 0) + 1}/{release.rolloutRings?.length ?? 4}</Badge>
                      ) : null}
                    </div>
                    {release.notes ? (
                      <p className="max-w-3xl text-[0.8rem] text-muted-foreground">{release.notes}</p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-center text-[0.72rem] font-mono">
                    <div><div className="text-foreground">{release.rolloutSummary.total}</div><div className="text-muted-foreground">total</div></div>
                    <div><div className="text-muted-foreground">{release.rolloutSummary.queued + (release.rolloutSummary.waiting ?? 0) + (release.rolloutSummary.paused ?? 0)}</div><div className="text-muted-foreground">waiting</div></div>
                    <div><div className="text-amber-500">{release.rolloutSummary.inProgress}</div><div className="text-muted-foreground">active</div></div>
                    <div><div className="text-primary">{release.rolloutSummary.succeeded}</div><div className="text-muted-foreground">ok</div></div>
                    <div><div className="text-destructive">{release.rolloutSummary.failed}</div><div className="text-muted-foreground">failed</div></div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 pt-5 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[0.82rem] font-semibold text-foreground">Recent rollout activity</h3>
                    <span className="text-[0.72rem] font-mono text-muted-foreground">
                      updated {new Date(release.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  {release.latestRollouts.length ? (
                    <div className="rounded-xl border border-border/70">
                      {release.latestRollouts.map((rollout, index) => (
                        <div
                          key={rollout.id}
                          className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${index < release.latestRollouts.length - 1 ? "border-b border-border/60" : ""}`}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{rollout.deviceName}</span>
                            <span className="text-[0.72rem] text-muted-foreground">
                              Stage {(rollout.ring ?? 0) + 1}
                              {rollout.includesSystem ? " · with Showroom OS update" : ""}
                              {" · "}
                              {new Date(rollout.queuedAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className={`text-[0.78rem] font-mono ${statusTone(rollout.status)}`}>
                              {rolloutStatusLabels[rollout.status] ?? rollout.status}
                            </span>
                            {rollout.message ? (
                              <span className="max-w-72 text-right text-[0.72rem] text-muted-foreground" title={rollout.message}>
                                {rollout.message}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 p-4 text-[0.8rem] text-muted-foreground">
                      No rollout attempts yet.
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-[0.82rem] font-semibold text-foreground">Target devices</h3>
                      <p className="mt-1 text-[0.72rem] text-muted-foreground">
                        {release.playerUrl || release.agentUrl
                          ? `${managedDeviceCount} screen${managedDeviceCount === 1 ? "" : "s"} can install this release.`
                          : `${systemDeviceCount} screen${systemDeviceCount === 1 ? "" : "s"} on Showroom OS can install this release.`}
                        {release.systemUrl && (release.playerUrl || release.agentUrl)
                          ? ` ${systemDeviceCount} of them also get the Showroom OS update.`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {release.rolloutStatus === "active" ? (
                        <Button size="sm" variant="outline" disabled={deployingReleaseId === release.id} onClick={() => void control(release.id, "pause")}>Pause</Button>
                      ) : null}
                      {release.rolloutStatus === "paused" ? (
                        <>
                          <Button size="sm" variant="outline" disabled={deployingReleaseId === release.id} onClick={() => void control(release.id, "retry_failed")}>Retry failed</Button>
                          <Button size="sm" variant="outline" disabled={deployingReleaseId === release.id} onClick={() => void control(release.id, "resume")}>Resume</Button>
                        </>
                      ) : null}
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={
                          !initialDevices.some((device) => canInstall(release, device)) ||
                          deployingReleaseId === release.id ||
                          release.rolloutStatus === "active"
                        }
                        onClick={() => startTransition(() => void deploy(release.id))}
                      >
                        {deployingReleaseId === release.id ? "Working…" : "Deploy to all"}
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                    <div className="grid gap-2">
                      {initialDevices.map((device) => {
                        const checked = selected.includes(device.id);
                        const eligible = canInstall(release, device);
                        const osLabel = device.supportsSystemUpdates
                          ? `${device.osVersion ?? "Showroom OS"}${device.bootSlot ? ` · slot ${device.bootSlot}` : ""}`
                          : null;
                        return (
                          <label
                            key={device.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/80 px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={checked}
                                disabled={!eligible}
                                onCheckedChange={(nextChecked) =>
                                  setSelectedDeviceIds((current) => {
                                    const currentValues = current[release.id] ?? [];
                                    return {
                                      ...current,
                                      [release.id]: nextChecked
                                        ? [...currentValues, device.id]
                                        : currentValues.filter((entry) => entry !== device.id),
                                    };
                                  })
                                }
                              />
                              <span className="flex flex-col">
                                <span className="text-[0.82rem] text-foreground">{device.name}</span>
                                {osLabel ? (
                                  <span className="text-[0.7rem] text-muted-foreground">{osLabel}</span>
                                ) : null}
                              </span>
                            </div>
                            <Badge variant="outline">
                              {eligible
                                ? device.status
                                : device.fleetManagementState === "managed"
                                  ? "not on Showroom OS"
                                  : "needs reflash"}
                            </Badge>
                          </label>
                        );
                      })}
                    </div>
                    <Button
                      size="sm"
                      className="mt-3 w-full"
                      disabled={!selected.length || deployingReleaseId === release.id}
                      onClick={() => startTransition(() => void deploy(release.id, selected))}
                    >
                      Deploy selected
                    </Button>
                    {canDeployToAllWorkspaces ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 w-full"
                        disabled={deployingReleaseId === release.id || release.rolloutStatus === "active"}
                        onClick={() => startTransition(() => void deploy(release.id, undefined, true))}
                      >
                        Deploy to every workspace
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {!releases.length ? (
          <Card className="border border-dashed border-border/80 bg-muted/15">
            <CardContent className="py-8 text-center text-[0.82rem] text-muted-foreground">
              No releases saved yet.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
