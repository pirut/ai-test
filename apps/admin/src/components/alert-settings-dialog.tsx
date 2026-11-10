"use client";

import {
  defaultNotifyAfterSeconds,
  maxAlertRecipients,
  notifyAfterSecondsChoices,
  parseAlertRecipients,
} from "@showroom/contracts";
import { BellRing, Send } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { readApiPayload } from "@/lib/api-response";
import type { AlertSettings } from "@/lib/fleet-health";

const waitOptions = notifyAfterSecondsChoices.map((seconds) => ({
  value: String(seconds),
  label: seconds < 3600 ? `${seconds / 60} minutes` : "1 hour",
}));

export function AlertSettingsDialog({
  settings,
  suggestedRecipient,
}: {
  settings: AlertSettings;
  suggestedRecipient?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initialRecipients = () =>
    settings.recipients.length ? settings.recipients.join("\n") : suggestedRecipient ?? "";
  const [enabled, setEnabled] = useState(settings.enabled);
  const [recipients, setRecipients] = useState(initialRecipients);
  const [wait, setWait] = useState(
    String(
      (notifyAfterSecondsChoices as readonly number[]).includes(settings.notifyAfterSeconds)
        ? settings.notifyAfterSeconds
        : defaultNotifyAfterSeconds,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  const parsed = parseAlertRecipients(recipients);
  const savedList = settings.recipients.join(",");
  const dirty =
    enabled !== settings.enabled ||
    parsed.valid.join(",") !== savedList ||
    Number(wait) !== settings.notifyAfterSeconds;

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      // Start from what is saved each time it opens.
      setEnabled(settings.enabled);
      setRecipients(initialRecipients());
      setError(null);
      setNotice(null);
    }
    setOpen(nextOpen);
  }

  async function save() {
    if (parsed.invalid.length) {
      setError(`${parsed.invalid[0]} doesn't look like an email address.`);
      return;
    }
    if (parsed.valid.length > maxAlertRecipients) {
      setError(`Alerts can go to at most ${maxAlertRecipients} addresses.`);
      return;
    }
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/alerts/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          recipients: parsed.valid,
          notifyAfterSeconds: Number(wait),
        }),
      });
      const payload = await readApiPayload<{ settings: AlertSettings }>(response);
      if (!response.ok) throw new Error(payload.error ?? "Could not save alert settings.");
      router.refresh();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save alert settings.");
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/alerts/test", { method: "POST" });
      const payload = await readApiPayload<{ sentTo: string[] }>(response);
      if (!response.ok) throw new Error(payload.error ?? "Could not send the test email.");
      setNotice(`Test email sent to ${(payload.sentTo ?? []).join(", ")}. It can take a minute to arrive.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the test email.");
    } finally {
      setBusy(null);
    }
  }

  const canTest = settings.emailConfigured && settings.recipients.length > 0 && !dirty;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <BellRing data-icon="inline-start" />
        Alert emails
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Alert emails</DialogTitle>
          <DialogDescription>
            Get an email when a screen stops checking in or keeps restarting, and another when it is back to normal.
            Several screens going down together arrive as one email.
          </DialogDescription>
        </DialogHeader>

        {!settings.emailConfigured ? (
          <Alert>
            <BellRing />
            <AlertTitle>Email isn&apos;t set up on the server yet</AlertTitle>
            <AlertDescription>
              You can save who should get alerts now. Emails start once whoever runs this site adds an email key. The
              dashboard banner works either way.
            </AlertDescription>
          </Alert>
        ) : null}

        <FieldGroup>
          <div className="flex items-center gap-3">
            <Switch id="alert-enabled" className="shrink-0" checked={enabled} onCheckedChange={setEnabled} />
            <label htmlFor="alert-enabled" className="text-sm font-medium">Send alert emails</label>
          </div>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="alert-recipients">Send to</FieldLabel>
            <Textarea
              id="alert-recipients"
              value={recipients}
              onChange={(event) => setRecipients(event.target.value)}
              placeholder="you@example.com"
              rows={3}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(error)}
              disabled={!enabled}
            />
            <FieldDescription>One address per line, up to {maxAlertRecipients}.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="alert-wait">Email after a screen has been offline for</FieldLabel>
            <Select items={waitOptions} value={wait} onValueChange={(value) => setWait(value ?? wait)} disabled={!enabled}>
              <SelectTrigger id="alert-wait" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {waitOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              A screen that comes back sooner never emails. A screen that keeps restarting emails right away.
            </FieldDescription>
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          {notice ? <p className="text-sm text-muted-foreground" role="status">{notice}</p> : null}
        </FieldGroup>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            disabled={!canTest || busy !== null}
            onClick={sendTest}
            title={canTest ? undefined : "Save at least one address first"}
          >
            {busy === "test" ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            Send test email
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => changeOpen(false)}>Cancel</Button>
            <Button disabled={busy !== null || (!dirty && settings.recipients.length > 0)} onClick={save}>
              {busy === "save" ? <Spinner data-icon="inline-start" /> : null}
              {busy === "save" ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
