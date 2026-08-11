"use client";

import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ScreenIdentity = { id: string; name: string };

export function RemoveScreenDialog({
  screen,
  open,
  onOpenChange,
  onRemoved,
}: {
  screen: ScreenIdentity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: (deviceId: string) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const matches = Boolean(screen && confirmation === screen.name);

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setConfirmation("");
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function remove() {
    if (!screen || !matches) return;
    setRemoving(true);
    setError(null);
    try {
      const response = await fetch(`/api/devices/${screen.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not remove screen");
      onRemoved(screen.id);
      changeOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove screen");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="dashboard-theme fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 text-foreground shadow-[0_24px_80px_rgba(15,23,42,0.22)] transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <Dialog.Close className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </Dialog.Close>
          <div className="mb-5 flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <Dialog.Title className="font-heading text-2xl font-bold tracking-[-0.03em]">
            Remove {screen?.name}?
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
            This removes the screen, its credential, queued commands, screenshots, and operational history from Digital Curator. The Raspberry Pi will need to be claimed again before it can receive content. This does not remove it from Raspberry Pi Connect.
          </Dialog.Description>

          <label className="mt-6 block text-sm font-medium text-foreground" htmlFor="screen-confirmation">
            Type <span className="font-semibold">{screen?.name}</span> to confirm
          </label>
          <Input
            id="screen-confirmation"
            className="mt-2"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => changeOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!matches || removing} onClick={remove}>
              {removing ? "Removing…" : "Remove screen"}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function RemoveScreenButton({ screen }: { screen: ScreenIdentity }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}>
        Remove screen
      </Button>
      <RemoveScreenDialog
        screen={screen}
        open={open}
        onOpenChange={setOpen}
        onRemoved={() => router.push("/screens")}
      />
    </>
  );
}
