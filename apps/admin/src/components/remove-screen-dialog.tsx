"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

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
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="dashboard-theme sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Remove {screen?.name}?</DialogTitle>
          <DialogDescription>
            This removes its credential, queued commands, screenshots, and operational history from Digital Curator.
            The Pi must be claimed again before it can receive content. Raspberry Pi Connect is not changed.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>This cannot be undone</AlertTitle>
          <AlertDescription>Only remove a screen you intend to retire or re-enroll.</AlertDescription>
        </Alert>

        <FieldGroup>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="screen-confirmation">
              Type <strong>{screen?.name}</strong> to confirm
            </FieldLabel>
            <Input
              id="screen-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              aria-invalid={Boolean(error)}
            />
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => changeOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={!matches || removing} onClick={remove}>
            {removing ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
            {removing ? "Removing…" : "Remove screen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveScreenButton({ screen }: { screen: ScreenIdentity }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 data-icon="inline-start" />
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
