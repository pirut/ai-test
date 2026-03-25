"use client";

import { startTransition, useEffect, useState } from "react";
import {
  releaseUpdatePayloadSchema,
  youtubeAuthUpdatePayloadSchema,
} from "@showroom/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LOCAL_HELPER_ORIGIN = "http://127.0.0.1:4765";
const browserOptions = [
  { value: "chrome", label: "Google Chrome" },
  { value: "brave", label: "Brave" },
  { value: "edge", label: "Microsoft Edge" },
  { value: "chromium", label: "Chromium" },
  { value: "firefox", label: "Firefox" },
  { value: "safari", label: "Safari" },
];

const commands = [
  { value: "sync_now",        label: "Sync now" },
  { value: "take_screenshot", label: "Screenshot" },
  { value: "restart_player",  label: "Restart player" },
  { value: "reboot_device",   label: "Reboot device" },
];

export function CommandPanel({ deviceId }: { deviceId: string }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [updateDraft, setUpdateDraft] = useState({
    version: "",
    agentUrl: "",
    agentSha256: "",
    playerUrl: "",
    playerSha256: "",
  });
  const [youtubeAuthDraft, setYouTubeAuthDraft] = useState({
    cookies: "",
    syncNow: true,
  });
  const [selectedBrowser, setSelectedBrowser] = useState("chrome");
  const [loadingCookieFile, setLoadingCookieFile] = useState(false);
  const [helperStatus, setHelperStatus] = useState<"checking" | "ready" | "offline">("checking");
  const [helperBusy, setHelperBusy] = useState(false);

  useEffect(() => {
    void refreshLocalHelperStatus();
  }, []);

  async function issue(commandType: string, payload?: Record<string, unknown>) {
    setMessage({ ok: true, text: `Sending ${commandType}…` });
    const response = await fetch(`/api/devices/${deviceId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandType, payload }),
    });
    const responseBody = await response.json();
    setMessage({
      ok: response.ok,
      text: response.ok ? `Queued: ${responseBody.command.commandType}` : (responseBody.error ?? "Command failed"),
    });
  }

  async function issueReleaseUpdate() {
    const payload = releaseUpdatePayloadSchema.parse({
      version: updateDraft.version.trim() || undefined,
      agentUrl: updateDraft.agentUrl.trim() || undefined,
      agentSha256: updateDraft.agentSha256.trim() || undefined,
      playerUrl: updateDraft.playerUrl.trim() || undefined,
      playerSha256: updateDraft.playerSha256.trim() || undefined,
    });

    await issue("update_release", payload);
  }

  async function issueYouTubeAuthUpdate() {
    const payload = youtubeAuthUpdatePayloadSchema.parse({
      cookies: youtubeAuthDraft.cookies,
      syncNow: youtubeAuthDraft.syncNow,
    });

    await issue("update_youtube_auth", payload);
  }

  async function refreshLocalHelperStatus() {
    try {
      const response = await fetch(`${LOCAL_HELPER_ORIGIN}/health`, {
        method: "GET",
      });
      setHelperStatus(response.ok ? "ready" : "offline");
    } catch {
      setHelperStatus("offline");
    }
  }

  async function callLocalHelper<T>(path: string, payload?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${LOCAL_HELPER_ORIGIN}${path}`, {
      method: payload ? "POST" : "GET",
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });

    const responseBody = (await response.json().catch(() => ({}))) as {
      error?: string;
    } & T;

    if (!response.ok) {
      throw new Error(responseBody.error ?? "Local helper request failed");
    }

    return responseBody;
  }

  async function openYouTubeLogin() {
    setHelperBusy(true);
    setMessage({ ok: true, text: "Opening YouTube login locally…" });
    try {
      await callLocalHelper("/youtube/open", { browser: selectedBrowser });
      setHelperStatus("ready");
      setMessage({
        ok: true,
        text: "YouTube opened locally. Sign in there, then pull auth from the helper.",
      });
    } catch (error) {
      setHelperStatus("offline");
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to open YouTube locally",
      });
    } finally {
      setHelperBusy(false);
    }
  }

  async function importYouTubeCookies() {
    setHelperBusy(true);
    setMessage({ ok: true, text: "Pulling YouTube auth from the local helper…" });
    try {
      const response = await callLocalHelper<{ cookies: string }>("/youtube/export", {
        browser: selectedBrowser,
      });
      setYouTubeAuthDraft((current) => ({ ...current, cookies: response.cookies }));
      setHelperStatus("ready");
      setMessage({ ok: true, text: "Imported YouTube auth from the local helper." });
      return response.cookies;
    } catch (error) {
      setHelperStatus("offline");
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to import YouTube auth",
      });
      throw error;
    } finally {
      setHelperBusy(false);
    }
  }

  async function importAndApplyYouTubeCookies() {
    const cookies = await importYouTubeCookies();
    const payload = youtubeAuthUpdatePayloadSchema.parse({
      cookies,
      syncNow: youtubeAuthDraft.syncNow,
    });
    await issue("update_youtube_auth", payload);
  }

  async function handleCookieFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setLoadingCookieFile(true);
    try {
      const text = await file.text();
      setYouTubeAuthDraft((current) => ({ ...current, cookies: text }));
      setMessage({ ok: true, text: `Loaded ${file.name}` });
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to read cookie file",
      });
    } finally {
      event.target.value = "";
      setLoadingCookieFile(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Controls
        </p>
        <h2 className="font-heading mt-2 text-xl font-bold text-foreground">Remote control</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Commands queue immediately and execute on the device heartbeat loop.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {commands.map((cmd) => (
          <Button
            key={cmd.value}
            variant="outline"
            size="sm"
            className="text-[0.82rem]"
            onClick={() => startTransition(() => void issue(cmd.value))}
          >
            {cmd.label}
          </Button>
        ))}
      </div>
      <div className="mt-4 space-y-2 rounded-xl border border-white/6 bg-[var(--surface-low)] p-4">
        <div>
          <h3 className="text-[0.82rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Release update
          </h3>
          <p className="mt-1 text-[0.8rem] text-muted-foreground">
            Queue a player archive and/or agent binary. SHA-256 values are optional but recommended.
          </p>
        </div>
        <Input
          value={updateDraft.version}
          placeholder="Release version (optional)"
          className="h-8 text-[0.8rem]"
          onChange={(event) =>
            setUpdateDraft((current) => ({ ...current, version: event.target.value }))
          }
        />
        <Input
          value={updateDraft.playerUrl}
          placeholder="Player archive URL (.tar.gz, .tgz, or .zip)"
          className="h-8 text-[0.8rem]"
          onChange={(event) =>
            setUpdateDraft((current) => ({ ...current, playerUrl: event.target.value }))
          }
        />
        <Input
          value={updateDraft.playerSha256}
          placeholder="Player SHA-256 (optional)"
          className="h-8 font-mono text-[0.75rem]"
          onChange={(event) =>
            setUpdateDraft((current) => ({ ...current, playerSha256: event.target.value }))
          }
        />
        <Input
          value={updateDraft.agentUrl}
          placeholder="Agent binary URL"
          className="h-8 text-[0.8rem]"
          onChange={(event) =>
            setUpdateDraft((current) => ({ ...current, agentUrl: event.target.value }))
          }
        />
        <Input
          value={updateDraft.agentSha256}
          placeholder="Agent SHA-256 (optional)"
          className="h-8 font-mono text-[0.75rem]"
          onChange={(event) =>
            setUpdateDraft((current) => ({ ...current, agentSha256: event.target.value }))
          }
        />
        <Button
          variant="secondary"
          size="sm"
          className="w-full text-[0.8rem]"
          onClick={() =>
            startTransition(() => {
              void issueReleaseUpdate().catch((error) => {
                setMessage({
                  ok: false,
                  text: error instanceof Error ? error.message : "Command failed",
                });
              });
            })
          }
        >
          Apply release
        </Button>
      </div>
      <div className="mt-4 space-y-3 rounded-xl border border-white/6 bg-[var(--surface-low)] p-4">
        <div>
          <h3 className="text-[0.82rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            YouTube auth
          </h3>
          <p className="mt-1 text-[0.8rem] text-muted-foreground">
            Use the local helper from this page, or fall back to uploading a Netscape cookie file.
          </p>
        </div>
        <div className="rounded-lg border border-white/8 bg-background/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.78rem] font-medium text-foreground">Local helper</p>
              <p className="text-[0.74rem] text-muted-foreground">
                {helperStatus === "ready"
                  ? "Connected on this Mac."
                  : helperStatus === "checking"
                    ? "Checking for a local helper…"
                    : "Not running. Start `npm run youtube-auth-helper` on this Mac."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-[0.76rem]"
              onClick={() => {
                void refreshLocalHelperStatus();
              }}
            >
              Refresh
            </Button>
          </div>
          <label className="mt-3 block">
            <span className="mb-2 block text-[0.78rem] text-muted-foreground">Browser</span>
            <select
              value={selectedBrowser}
              className="h-8 w-full rounded-md border border-white/10 bg-background px-3 text-[0.8rem] text-foreground outline-none transition focus:border-primary"
              onChange={(event) => setSelectedBrowser(event.target.value)}
            >
              {browserOptions.map((browser) => (
                <option key={browser.value} value={browser.value}>
                  {browser.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <Button
              variant="outline"
              size="sm"
              className="text-[0.78rem]"
              disabled={helperBusy}
              onClick={() => {
                startTransition(() => {
                  void openYouTubeLogin();
                });
              }}
            >
              Open YouTube login
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-[0.78rem]"
              disabled={helperBusy}
              onClick={() => {
                startTransition(() => {
                  void importYouTubeCookies();
                });
              }}
            >
              Pull auth from helper
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 w-full text-[0.8rem]"
            disabled={helperBusy}
            onClick={() => {
              startTransition(() => {
                void importAndApplyYouTubeCookies().catch((error) => {
                  setMessage({
                    ok: false,
                    text: error instanceof Error ? error.message : "Unable to apply YouTube auth",
                  });
                });
              });
            }}
          >
            {helperBusy ? "Working…" : "Pull and apply from this Mac"}
          </Button>
        </div>
        <label className="block">
          <span className="mb-2 block text-[0.78rem] text-muted-foreground">
            Cookie file
          </span>
          <Input
            type="file"
            accept=".txt,text/plain"
            className="h-8 text-[0.8rem]"
            onChange={(event) => {
              void handleCookieFileChange(event);
            }}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-[0.78rem] text-muted-foreground">
            Netscape cookies
          </span>
          <textarea
            value={youtubeAuthDraft.cookies}
            placeholder={"# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\t..."}
            className="min-h-32 w-full rounded-md border border-white/10 bg-background px-3 py-2 font-mono text-[0.74rem] text-foreground outline-none transition focus:border-primary"
            onChange={(event) =>
              setYouTubeAuthDraft((current) => ({ ...current, cookies: event.target.value }))
            }
          />
        </label>
        <label className="flex items-center gap-2 text-[0.8rem] text-foreground">
          <input
            type="checkbox"
            checked={youtubeAuthDraft.syncNow}
            onChange={(event) =>
              setYouTubeAuthDraft((current) => ({ ...current, syncNow: event.target.checked }))
            }
          />
          Sync immediately after applying auth
        </label>
        <Button
          variant="secondary"
          size="sm"
          className="w-full text-[0.8rem]"
          disabled={loadingCookieFile}
          onClick={() =>
            startTransition(() => {
              void issueYouTubeAuthUpdate().catch((error) => {
                setMessage({
                  ok: false,
                  text: error instanceof Error ? error.message : "Unable to update YouTube auth",
                });
              });
            })
          }
        >
          {loadingCookieFile ? "Loading cookie file…" : "Apply YouTube auth"}
        </Button>
      </div>
      {message ? (
        <p className={`mt-3 font-mono text-[0.78rem] ${message.ok ? "text-primary" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
