"use client";

import type { CommandType } from "@showroom/contracts";
import {
  Eye,
  EyeOff,
  MoreHorizontal,
  Power,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wifi,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { RemoveScreenDialog } from "@/components/remove-screen-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { readApiPayload } from "@/lib/api-response";
import { commandLabel } from "@/lib/commands";
import { cn } from "@/lib/utils";

type Feedback = { ok: boolean; text: string } | null;

type CommandContextValue = {
  deviceId: string;
  sending: CommandType | null;
  feedback: Feedback;
  issue: (commandType: CommandType, payload?: Record<string, unknown>) => Promise<boolean>;
};

const CommandContext = createContext<CommandContextValue | null>(null);

function useCommands() {
  const context = useContext(CommandContext);
  if (!context) throw new Error("Screen controls must be inside <ScreenCommandProvider>");
  return context;
}

/**
 * Shares one command sender across the screen page so every button shows the
 * same in-flight state and the activity log refreshes as soon as a command is
 * queued.
 */
export function ScreenCommandProvider({ deviceId, children }: { deviceId: string; children: React.ReactNode }) {
  const router = useRouter();
  const [sending, setSending] = useState<CommandType | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const issue = useCallback(
    async (commandType: CommandType, payload?: Record<string, unknown>) => {
      setSending(commandType);
      setFeedback(null);
      try {
        const response = await fetch(`/api/devices/${deviceId}/commands`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commandType, payload }),
        });
        const body = await readApiPayload<{ command: { commandType: string } }>(response);
        if (!response.ok) throw new Error(body.error ?? `Could not send command (${response.status})`);
        setFeedback({ ok: true, text: `${commandLabel(commandType)} sent. The screen picks it up within a few seconds.` });
        router.refresh();
        return true;
      } catch (error) {
        setFeedback({ ok: false, text: error instanceof Error ? error.message : "Could not send command" });
        return false;
      } finally {
        setSending(null);
      }
    },
    [deviceId, router],
  );

  return (
    <CommandContext.Provider value={{ deviceId, sending, feedback, issue }}>{children}</CommandContext.Provider>
  );
}

export function CommandFeedback({ className }: { className?: string }) {
  const { feedback } = useCommands();
  if (!feedback) return null;
  return (
    <p role="status" className={cn("text-xs", feedback.ok ? "text-muted-foreground" : "text-destructive", className)}>
      {feedback.text}
    </p>
  );
}

/** Header actions: the everyday commands up front, disruptive ones behind a menu. */
export function ScreenActions({
  screen,
  canAdmin,
}: {
  screen: { id: string; name: string };
  canAdmin: boolean;
}) {
  const router = useRouter();
  const { sending, issue } = useCommands();
  const [confirm, setConfirm] = useState<"reboot_device" | "restart_player" | "blank_screen" | null>(null);
  const [removing, setRemoving] = useState(false);
  const busy = sending !== null;

  const confirmCopy = {
    reboot_device: {
      title: `Reboot ${screen.name}?`,
      body: "The screen goes dark for about a minute while the Pi restarts, then resumes its playlist.",
      action: "Reboot",
    },
    restart_player: {
      title: `Restart the player on ${screen.name}?`,
      body: "Playback stops for a few seconds and starts again from the current playlist.",
      action: "Restart player",
    },
    blank_screen: {
      title: `Turn off the display on ${screen.name}?`,
      body: "The TV stays dark until you turn it back on from here. Content keeps syncing in the background.",
      action: "Turn display off",
    },
  } as const;

  return (
    <>
      <Button variant="outline" disabled={busy} onClick={() => void issue("sync_now")}>
        {sending === "sync_now" ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
        Sync content
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button aria-label="More actions" size="icon" variant="outline" />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={busy} onClick={() => void issue("unblank_screen")}>
              <Eye />
              Turn display on
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy} onClick={() => setConfirm("blank_screen")}>
              <EyeOff />
              Turn display off
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {canAdmin ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem disabled={busy} onClick={() => setConfirm("restart_player")}>
                  <RotateCcw />
                  Restart player
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy} onClick={() => setConfirm("reboot_device")}>
                  <Power />
                  Reboot screen
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onClick={() => setRemoving(true)}>
                  <Trash2 />
                  Remove screen
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          {confirm ? (
            <>
              <DialogHeader>
                <DialogTitle>{confirmCopy[confirm].title}</DialogTitle>
                <DialogDescription>{confirmCopy[confirm].body}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
                <Button
                  variant={confirm === "reboot_device" ? "destructive" : "default"}
                  disabled={busy}
                  onClick={async () => {
                    const ok = await issue(confirm);
                    if (ok) setConfirm(null);
                  }}
                >
                  {busy ? <Spinner data-icon="inline-start" /> : null}
                  {confirmCopy[confirm].action}
                </Button>
              </DialogFooter>
              <CommandFeedback />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <RemoveScreenDialog
        screen={screen}
        open={removing}
        onOpenChange={setRemoving}
        onRemoved={() => router.push("/screens")}
      />
    </>
  );
}

/** Live preview with a refresh button that waits for the new screenshot to land. */
export function ScreenPreview({
  name,
  initialScreenshot,
  reporting,
}: {
  name: string;
  initialScreenshot: { publicUrl: string; capturedAt: string } | null;
  reporting: boolean;
}) {
  const { deviceId, sending, issue } = useCommands();
  const [screenshot, setScreenshot] = useState(initialScreenshot);
  const [waiting, setWaiting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Keep showing a freshly fetched shot until the server render catches up.
  const shown =
    screenshot && initialScreenshot && Date.parse(initialScreenshot.capturedAt) > Date.parse(screenshot.capturedAt)
      ? initialScreenshot
      : screenshot ?? initialScreenshot;

  // An image that failed before hydration never fires onError, so check once mounted.
  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) setFailedUrl(image.getAttribute("src"));
  }, []);

  async function refresh() {
    setNote(null);
    const before = shown?.capturedAt ?? null;
    if (!(await issue("take_screenshot"))) return;
    setWaiting(true);
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      try {
        const response = await fetch(`/api/devices/${deviceId}/screenshot`, { cache: "no-store" });
        const body = await readApiPayload<{ screenshot: { publicUrl: string; capturedAt: string } | null }>(response);
        if (body.screenshot && body.screenshot.capturedAt !== before) {
          setScreenshot(body.screenshot);
          setWaiting(false);
          return;
        }
      } catch {
        // Keep polling until the deadline.
      }
    }
    setWaiting(false);
    setNote("The screen hasn't sent a new screenshot yet. It will appear here once it does.");
  }

  return (
    <Card className="gap-0 py-0">
      <div className="relative aspect-video bg-muted">
        {shown && shown.publicUrl !== failedUrl ? (
          <img
            alt={`Latest screenshot from ${name}`}
            onError={() => setFailedUrl(shown.publicUrl)}
            ref={imageRef}
            src={shown.publicUrl}
            className={cn("size-full object-contain", !reporting && "opacity-60 grayscale")}
          />
        ) : (
          <div className="flex size-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {shown
              ? "The screenshot couldn't be loaded. Use Refresh preview to request a new one."
              : "No screenshot yet. Use Refresh preview to ask the screen for one."}
          </div>
        )}
        {waiting ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
            <span className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-sm">
              <Spinner /> Waiting for the screen…
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          {shown ? (
            <>
              Captured{" "}
              <time dateTime={shown.capturedAt} title={new Date(shown.capturedAt).toLocaleString()}>
                {new Date(shown.capturedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </time>
              {!reporting ? " · screen is not reporting, this may be out of date" : null}
            </>
          ) : (
            "Screenshots are taken automatically while the screen is online."
          )}
          {note ? <p className="mt-1 text-warning">{note}</p> : null}
        </div>
        <Button size="sm" variant="outline" disabled={sending !== null || waiting} onClick={() => void refresh()}>
          {waiting || sending === "take_screenshot" ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
          Refresh preview
        </Button>
      </div>
    </Card>
  );
}

/** Stage a replacement Wi-Fi network. The Pi keeps its current network until the new one works. */
export function NetworkCard({ isManaged, currentSsid }: { isManaged: boolean; currentSsid?: string }) {
  const { sending, issue } = useCommands();
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const passwordValid = password.length >= 8 && password.length <= 63;
  const ready = isManaged && ssid.trim().length > 0 && passwordValid && sending === null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wifi className="size-4 text-muted-foreground" aria-hidden />
          Wi-Fi
        </CardTitle>
        <CardDescription>
          {currentSsid ? <>Connected to <span className="font-medium text-foreground">{currentSsid}</span>. </> : null}
          Send a new network before you change the showroom router. The screen saves it and only switches once it connects.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isManaged ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!ready) return;
              if (await issue("update_network", { ssid: ssid.trim(), password, priority: 100 })) {
                setPassword("");
              }
            }}
          >
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="network-ssid">Network name</FieldLabel>
                <Input
                  id="network-ssid"
                  autoComplete="off"
                  maxLength={32}
                  value={ssid}
                  onChange={(event) => setSsid(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="network-password">Password</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="network-password"
                    autoComplete="new-password"
                    maxLength={63}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      size="icon-xs"
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>8 to 63 characters. It is removed from our records once the screen has it.</FieldDescription>
              </Field>
              <Button type="submit" variant="outline" disabled={!ready}>
                {sending === "update_network" ? <Spinner data-icon="inline-start" /> : null}
                Send to screen
              </Button>
            </FieldGroup>
          </form>
        ) : (
          <Alert>
            <AlertDescription>
              Available after this screen gets the appliance update. Until then, change Wi-Fi on the screen itself.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
