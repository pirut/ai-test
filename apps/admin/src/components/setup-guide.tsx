"use client";

import type { MediaAsset } from "@showroom/contracts";
import {
  ArrowRight,
  CalendarRange,
  Check,
  CircleAlert,
  Download,
  ImageIcon,
  Link2,
  MonitorSmartphone,
  PartyPopper,
  RefreshCw,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ClaimDeviceForm } from "@/components/claim-device-form";
import { acceptedUploadTypes, uploadOne } from "@/components/media-add-dialog";
import { ScreenThumbnail } from "@/components/screen-thumbnail";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { type SetupProgress, type SetupStepId, setupStepOrder } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

const preparedKey = "dc-setup-screen-ready";
// The playlist the guide makes from the first upload.
const firstPlaylistName = "Main playlist";

const stepTitles: Record<SetupStepId, string> = {
  prepare: "Get the screen ready",
  pair: "Pair it with this workspace",
  content: "Add your first video",
  playing: "Watch it play",
};

type LibraryAsset = { id: string; title: string };

export function SetupGuide({
  progress,
  isAdmin,
  imageUrl,
  initialStep,
  claimCode,
  libraryAssets,
  mediaCount,
}: {
  progress: SetupProgress;
  isAdmin: boolean;
  imageUrl?: string;
  initialStep?: SetupStepId;
  /** From the QR code on the TV. */
  claimCode?: string;
  /** Media already in the library, offered when no playlist uses it yet. */
  libraryAssets: LibraryAsset[];
  mediaCount: number;
}) {
  const router = useRouter();
  // "The TV shows a code" is the one step only the customer can confirm.
  const [prepared, setPrepared] = useState(false);
  const [active, setActive] = useState<SetupStepId>(
    initialStep ?? (claimCode && !progress.hasScreen ? "pair" : progress.current),
  );
  const [userMoved, setUserMoved] = useState(Boolean(initialStep || claimCode));
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(preparedKey) === "1") setPrepared(true);
    } catch {
      // Private windows may block storage; the step is then confirmed per visit.
    }
  }, []);

  const done: Record<SetupStepId, boolean> = { ...progress.done, prepare: progress.done.prepare || prepared };
  const doneCount = setupStepOrder.filter((step) => done[step]).length;
  const firstOpen = setupStepOrder.find((step) => !done[step]) ?? "playing";

  // Until the customer picks a step themselves, follow the first open one.
  useEffect(() => {
    if (!userMoved) setActive(firstOpen);
  }, [firstOpen, userMoved]);

  const go = useCallback((step: SetupStepId) => {
    setUserMoved(true);
    setActive(step);
    // On a phone the panel sits below the step list.
    window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: "start" });
      else if (panel && window.matchMedia("(max-width: 1023px)").matches) {
        panel.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
  }, []);

  function confirmPrepared() {
    setPrepared(true);
    try {
      window.localStorage.setItem(preparedKey, "1");
    } catch {
      // See above.
    }
    go(progress.hasScreen ? (progress.hasContent ? "playing" : "content") : "pair");
  }

  const hints: Record<SetupStepId, string> = {
    prepare: done.prepare ? "Done" : "About 15 minutes, mostly waiting",
    pair: progress.screen ? `${progress.screen.name} is paired` : "Enter the code the TV shows",
    content: progress.playlist
      ? `${progress.playlist.name}, ${countLabel(progress.playlist.items.length, "item")}`
      : "Upload a file or paste a YouTube link",
    playing: progress.complete ? "Playing now" : screenStateHint(progress),
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
      <Card className="lg:sticky lg:top-20">
        <CardHeader className="border-b">
          <CardTitle>{progress.complete ? "Setup complete" : "Your first screen"}</CardTitle>
          <CardDescription>
            {doneCount} of {setupStepOrder.length} steps done
          </CardDescription>
          <div
            aria-hidden
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-signal transition-[width] duration-500"
              style={{ width: `${(doneCount / setupStepOrder.length) * 100}%` }}
            />
          </div>
        </CardHeader>
        <CardContent className="px-2">
          <ol className="flex flex-col gap-0.5">
            {setupStepOrder.map((step, index) => (
              <li key={step}>
                <button
                  aria-current={active === step ? "step" : undefined}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active === step && "bg-muted",
                  )}
                  onClick={() => go(step)}
                  type="button"
                >
                  <StepMarker index={index} done={done[step]} active={active === step} />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-sm font-medium">{stepTitles[step]}</span>
                    <span className="truncate text-xs text-muted-foreground">{hints[step]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div ref={panelRef} className="min-w-0 scroll-mt-20">
        {active === "prepare" ? (
          <PrepareStep
            done={done.prepare}
            hasContent={progress.hasContent}
            imageUrl={imageUrl}
            isAdmin={isAdmin}
            onAddContentFirst={() => go("content")}
            onReady={confirmPrepared}
          />
        ) : active === "pair" ? (
          <PairStep
            claimCode={claimCode}
            isAdmin={isAdmin}
            onBack={() => go("prepare")}
            onPaired={(deviceId) => {
              // Follow the screen that was just paired from here on.
              router.replace(`/get-started?screen=${encodeURIComponent(deviceId)}`, { scroll: false });
              go(progress.hasContent ? "playing" : "content");
            }}
            progress={progress}
            onNext={() => go(progress.hasContent ? "playing" : "content")}
          />
        ) : active === "content" ? (
          <ContentStep
            isAdmin={isAdmin}
            libraryAssets={libraryAssets}
            mediaCount={mediaCount}
            onPublished={() => {
              router.refresh();
              go(progress.hasScreen ? "playing" : done.prepare ? "pair" : "prepare");
            }}
            onNext={() => go(progress.hasScreen ? "playing" : done.prepare ? "pair" : "prepare")}
            progress={progress}
          />
        ) : (
          <PlayingStep onGo={go} progress={progress} />
        )}
      </div>
    </div>
  );
}

function countLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function screenStateHint(progress: SetupProgress) {
  switch (progress.screenState) {
    case "none":
      return "Starts once a screen is paired";
    case "offline":
      return "Waiting for the screen to come online";
    case "waiting_for_content":
      return "Waiting for something to play";
    case "downloading":
      return "Downloading to the screen";
    case "problem":
      return "Needs a look";
    case "playing":
      return "Playing now";
  }
}

function StepMarker({ index, done, active }: { index: number; done: boolean; active: boolean }) {
  return done ? (
    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-signal/15 text-signal">
      <Check className="size-3.5" aria-hidden />
      <span className="sr-only">Done:</span>
    </span>
  ) : (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground ring-1 ring-border",
      )}
    >
      {index + 1}
    </span>
  );
}

function StepCard({
  step,
  description,
  children,
  footer,
}: {
  step: SetupStepId;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <p className="text-xs font-medium text-muted-foreground">
          Step {setupStepOrder.indexOf(step) + 1} of {setupStepOrder.length}
        </p>
        <CardTitle className="text-xl">
          <h2>{stepTitles[step]}</h2>
        </CardTitle>
        <CardDescription className="max-w-2xl leading-6">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
      {footer ? (
        <div className="flex flex-wrap items-center gap-2 border-t px-4 pt-4 sm:px-6">{footer}</div>
      ) : null}
    </Card>
  );
}

/** A small picture of the pairing screen, so the customer knows what to look for. */
function TvPairingPreview({ code = "ABC 123" }: { code?: string }) {
  return (
    <figure className="flex w-full max-w-64 flex-col gap-2">
      <div className="rounded-lg border-4 border-foreground/80 bg-[#101216] p-4 shadow-sm" aria-hidden>
        <div className="flex aspect-video items-center justify-between gap-3">
          <div className="grid gap-1.5">
            <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-white/50">Pair this screen</span>
            <span className="font-mono text-2xl font-semibold tracking-[0.12em] text-white">{code}</span>
            <span className="text-[9px] text-white/50">Online · waiting to be added</span>
          </div>
          <div className="grid size-14 shrink-0 grid-cols-5 gap-px rounded-sm bg-white p-1">
            {qrCells.map((filled, index) => (
              <span key={index} className={filled ? "bg-black" : "bg-white"} />
            ))}
          </div>
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        What the TV shows when it is ready: a 6-character code and a QR code.
      </figcaption>
    </figure>
  );
}

// Decorative only; not a scannable code.
const qrCells = "1110110101101110001011011".split("").map((cell) => cell === "1");

function PrepareStep({
  done,
  hasContent,
  imageUrl,
  isAdmin,
  onReady,
  onAddContentFirst,
}: {
  done: boolean;
  hasContent: boolean;
  imageUrl?: string;
  isAdmin: boolean;
  onReady: () => void;
  onAddContentFirst: () => void;
}) {
  return (
    <StepCard
      step="prepare"
      description="You need a Raspberry Pi 5 with its power supply, a microSD card of 8 GB or more, and a TV or monitor with HDMI."
      footer={
        <>
          <Button onClick={onReady}>
            {done ? "Next" : "My TV shows a pairing code"}
            <ArrowRight data-icon="inline-end" />
          </Button>
          {!hasContent && isAdmin ? (
            <Button onClick={onAddContentFirst} variant="ghost">
              Add a video while the card writes
            </Button>
          ) : null}
        </>
      }
    >
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_auto]">
        <ol className="flex flex-col gap-5">
          <SubStep index={1} title="Download the screen image">
            <p>One image works for every screen. It holds no account details.</p>
            {imageUrl ? (
              <Button
                className="mt-2 w-fit"
                nativeButton={false}
                render={<a href={imageUrl} rel="noreferrer" />}
                variant="outline"
              >
                <Download data-icon="inline-start" />
                Download image
              </Button>
            ) : (
              <p className="mt-1 rounded-md border border-dashed px-3 py-2">
                The download link is not set up on this site yet. Ask whoever gave you access for the image file.
              </p>
            )}
          </SubStep>
          <SubStep index={2} title="Write it to the microSD card">
            <p>
              In{" "}
              <a
                className="text-primary underline underline-offset-4"
                href="https://www.raspberrypi.com/software/"
                rel="noreferrer"
                target="_blank"
              >
                Raspberry Pi Imager
                <span className="sr-only"> (opens in a new tab)</span>
              </a>{" "}
              choose Raspberry Pi 5, then Use custom and pick the downloaded file, then your card. If it offers OS
              customisation, choose No.
            </p>
          </SubStep>
          <SubStep index={3} title="Plug in the Pi">
            <p>
              Put the card in, connect HDMI to the TV first, then power. The first start takes a couple of minutes and
              restarts once on its own.
            </p>
          </SubStep>
          <SubStep index={4} title="Connect it to the internet">
            <p>
              With a network cable there is nothing to do. For Wi-Fi, scan the QR code on the TV with your phone and
              pick your network, or plug in a USB keyboard and choose it on the TV.
            </p>
          </SubStep>
        </ol>
        <TvPairingPreview />
      </div>

      <details className="group rounded-md border px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium marker:text-muted-foreground">
          The TV shows something else
        </summary>
        <dl className="mt-3 grid gap-x-6 gap-y-2 pb-1 text-muted-foreground sm:grid-cols-[auto_minmax(0,1fr)]">
          {tvStates.map(([shown, meaning]) => (
            <div key={shown} className="contents">
              <dt className="font-medium text-foreground">{shown}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
      </details>
    </StepCard>
  );
}

const tvStates: Array<[string, string]> = [
  ["Nothing, or No signal", "Check the TV input and that HDMI was connected before power. Unplug power, wait, plug back in."],
  ["Starting player", "Still starting. Give it two minutes."],
  ["Wi-Fi setup", "It has no internet yet. Scan the QR code on the TV to choose a network, or plug in a network cable."],
  ["Getting a pairing code", "It is online and the code appears in a few seconds."],
  ["Can't reach Digital Curator", "The network blocks the screen. It keeps retrying; try another network or a phone hotspot."],
];

function SubStep({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums"
      >
        {index}
      </span>
      <div className="flex min-w-0 flex-col gap-1 text-sm leading-6 text-muted-foreground">
        <p className="font-medium text-foreground">{title}</p>
        {children}
      </div>
    </li>
  );
}

function PairStep({
  progress,
  isAdmin,
  claimCode,
  onPaired,
  onNext,
  onBack,
}: {
  progress: SetupProgress;
  isAdmin: boolean;
  claimCode?: string;
  onPaired: (deviceId: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  // Keep the form up while it waits for the new screen's first check-in,
  // even though the workspace already lists the screen by then.
  const [pairing, setPairing] = useState(false);
  const screen = progress.screen;

  if (screen && !pairing) {
    return (
      <StepCard
        step="pair"
        description="This screen belongs to your workspace. Only people in the workspace can change what it shows."
        footer={
          <>
            <Button onClick={onNext}>
              Next
              <ArrowRight data-icon="inline-end" />
            </Button>
            {isAdmin ? (
              <Button nativeButton={false} render={<Link href="/screens" />} variant="ghost">
                Pair another screen
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex items-center gap-4">
          <ScreenThumbnail className="w-32 shrink-0" compact device={screen} />
          <div className="grid min-w-0 gap-1.5">
            <p className="truncate font-medium">{screen.name}</p>
            <StatusPill className="w-fit" status={screen.status} />
            {progress.screenState === "offline" ? (
              <p className="text-sm text-muted-foreground">
                It has not checked in yet. Leave it powered and online; it finishes pairing on its own.
              </p>
            ) : null}
          </div>
        </div>
      </StepCard>
    );
  }

  return (
    <StepCard
      step="pair"
      description="Type the code from the TV, or scan the QR code next to it with your phone to open this page with the code filled in."
    >
      <div className="grid gap-8 xl:grid-cols-[minmax(0,24rem)_auto]">
        {isAdmin ? (
          <ClaimDeviceForm
            embedded
            hasDefaultPlaylist={progress.hasContent}
            idPrefix="setup"
            initialClaimCode={claimCode}
            onClaimed={() => setPairing(true)}
            onConnected={(deviceId) => {
              setPairing(false);
              onPaired(deviceId);
            }}
          />
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Only workspace admins can add screens. Ask an admin to enter the code from the TV.
          </p>
        )}
        <TvPairingPreview code={formatCode(claimCode)} />
      </div>
      {pairing ? null : (
        <p className="text-sm text-muted-foreground">
          No code on the TV yet?{" "}
          <button className="text-primary underline underline-offset-4" onClick={onBack} type="button">
            Go back to getting the screen ready
          </button>
          . The code renews itself if it expires.
        </p>
      )}
    </StepCard>
  );
}

function formatCode(code?: string) {
  if (!code || code.length !== 6) return undefined;
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

type Source = "upload" | "youtube";

function ContentStep({
  progress,
  isAdmin,
  libraryAssets,
  mediaCount,
  onPublished,
  onNext,
}: {
  progress: SetupProgress;
  isAdmin: boolean;
  libraryAssets: LibraryAsset[];
  mediaCount: number;
  onPublished: () => void;
  onNext: () => void;
}) {
  const [source, setSource] = useState<Source>("upload");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function publish(assetIds: string[]) {
    setBusy("Putting it on your screens…");
    const response = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: firstPlaylistName,
        itemIds: assetIds.map((mediaAssetId) => ({ mediaAssetId })),
        makeDefault: true,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "The media was added, but the playlist could not be made. Try again.");
    }
    onPublished();
  }

  async function run(task: () => Promise<void>) {
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function uploadFiles(files: File[]) {
    const accepted = files.filter((file) => acceptedUploadTypes.split(",").includes(file.type));
    if (!accepted.length) {
      setError("Use an MP4 video, or a JPG, PNG or WEBP image.");
      return;
    }
    void run(async () => {
      const added: MediaAsset[] = [];
      for (const [index, file] of accepted.entries()) {
        const label = accepted.length > 1 ? `Uploading ${index + 1} of ${accepted.length}` : "Uploading";
        setBusy(`${label}…`);
        added.push(
          await uploadOne(file, { tags: [], folderId: null }, (percent) => setBusy(`${label}, ${percent}%`)),
        );
      }
      await publish(added.map((asset) => asset.id));
    });
  }

  function addYouTube() {
    if (!youtubeUrl.trim()) return;
    void run(async () => {
      setBusy("Looking up the video…");
      const response = await fetch("/api/media/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl.trim(), tags: [], folderId: null }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; asset?: MediaAsset };
      if (!response.ok || !payload.asset) throw new Error(payload.error ?? "Unable to add that YouTube link.");
      await publish([payload.asset.id]);
    });
  }

  function makeDefault(playlistId: string) {
    void run(async () => {
      setBusy("Putting it on your screens…");
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setDefault" }),
      });
      if (!response.ok) throw new Error("Could not make that playlist the default. Try again.");
      onPublished();
    });
  }

  if (progress.hasContent && progress.playlist) {
    return (
      <StepCard
        step="content"
        description="Every screen plays the workspace default playlist unless you give it its own or a schedule says otherwise."
        footer={
          <>
            <Button onClick={onNext}>
              Next
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button nativeButton={false} render={<Link href="/media" />} variant="ghost">
              Add more media
            </Button>
            <Button nativeButton={false} render={<Link href="/playlists" />} variant="ghost">
              Edit the playlist
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-signal/15 text-signal">
            <Check className="size-5" aria-hidden />
          </span>
          <div className="grid gap-0.5">
            <p className="font-medium">{progress.playlist.name}</p>
            <p className="text-sm text-muted-foreground">
              {countLabel(progress.playlist.items.length, "item")}
              {progress.playlist.isDefault ? ", playing on every screen by default" : ""}
            </p>
          </div>
        </div>
      </StepCard>
    );
  }

  if (!isAdmin) {
    return (
      <StepCard step="content" description="A screen stays on a waiting message until the workspace has a playlist.">
        <p className="text-sm leading-6 text-muted-foreground">
          Only workspace admins can add media and playlists. Ask an admin to add the first video.
        </p>
      </StepCard>
    );
  }

  return (
    <StepCard
      step="content"
      description={
        progress.hasScreen
          ? "Pick one video or a few photos. They go into a playlist that your screen starts playing on its own."
          : "Pick one video or a few photos. They go into a playlist that every screen you pair starts playing on its own."
      }
    >
      {progress.candidatePlaylist ? (
        <ExistingChoice
          actionLabel={`Play “${progress.candidatePlaylist.name}”`}
          busy={Boolean(busy)}
          onAction={() => makeDefault(progress.candidatePlaylist!.id)}
          text={`You already have a playlist, “${progress.candidatePlaylist.name}”. Make it the workspace default and every screen plays it.`}
        />
      ) : libraryAssets.length > 0 ? (
        <ExistingChoice
          actionLabel={libraryAssets.length === 1 ? `Play “${libraryAssets[0]!.title}”` : "Play what I have"}
          busy={Boolean(busy)}
          onAction={() => void run(() => publish(libraryAssets.map((asset) => asset.id)))}
          text={
            mediaCount > libraryAssets.length
              ? `Your library already has ${mediaCount} items. Start with the newest ${libraryAssets.length}, or add something new below.`
              : `Your library already has ${countLabel(mediaCount, "item")}. Play ${mediaCount === 1 ? "it" : "them"} now, or add something new below.`
          }
        />
      ) : null}

      <div className="flex max-w-xl flex-col gap-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg border p-0.5" role="tablist" aria-label="Where the video comes from">
          {(
            [
              { value: "upload", label: "Upload a file", icon: Upload },
              { value: "youtube", label: "YouTube link", icon: Link2 },
            ] as const
          ).map((option) => (
            <Button
              key={option.value}
              aria-selected={source === option.value}
              disabled={Boolean(busy)}
              onClick={() => {
                setSource(option.value);
                setError(null);
              }}
              role="tab"
              size="sm"
              variant={source === option.value ? "secondary" : "ghost"}
            >
              <option.icon />
              {option.label}
            </Button>
          ))}
        </div>

        {source === "upload" ? (
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-10 text-center transition-colors hover:bg-muted/60 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
              dragOver && "border-primary bg-accent",
              busy && "pointer-events-none opacity-70",
            )}
            htmlFor="setup-files"
            onDragLeave={() => setDragOver(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              uploadFiles(Array.from(event.dataTransfer.files));
            }}
          >
            {busy ? <Spinner className="size-5" /> : <Upload className="size-5 text-muted-foreground" aria-hidden />}
            <span className="text-sm font-medium" aria-live="polite">
              {busy ?? "Drop a video or photos here, or click to choose"}
            </span>
            <span className="text-xs text-muted-foreground">MP4, JPG, PNG or WEBP, up to 250 MB each</span>
            <input
              accept={acceptedUploadTypes}
              className="sr-only"
              disabled={Boolean(busy)}
              id="setup-files"
              multiple
              onChange={(event) => {
                uploadFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
              type="file"
            />
          </label>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              addYouTube();
            }}
          >
            <Label htmlFor="setup-youtube">YouTube link</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                disabled={Boolean(busy)}
                id="setup-youtube"
                inputMode="url"
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                value={youtubeUrl}
              />
              <Button className="shrink-0" disabled={!youtubeUrl.trim() || Boolean(busy)} type="submit">
                {busy ? <Spinner data-icon="inline-start" /> : null}
                {busy ?? "Add video"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The screen downloads a copy, so it keeps playing without internet.
            </p>
          </form>
        )}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </StepCard>
  );
}

function ExistingChoice({
  text,
  actionLabel,
  onAction,
  busy,
}: {
  text: string;
  actionLabel: string;
  onAction: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex max-w-xl flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-sm leading-6">{text}</p>
      <Button className="max-w-full shrink-0" disabled={busy} onClick={onAction}>
        <span className="truncate">{actionLabel}</span>
      </Button>
    </div>
  );
}

function PlayingStep({ progress, onGo }: { progress: SetupProgress; onGo: (step: SetupStepId) => void }) {
  const router = useRouter();
  const screen = progress.screen;
  const playing = progress.screenState === "playing";
  const [refreshing, setRefreshing] = useState(false);

  const requestScreenshot = useCallback(async (deviceId: string) => {
    await fetch(`/api/devices/${deviceId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandType: "take_screenshot" }),
    }).catch(() => undefined);
  }, []);

  // Ask for a fresh picture once, the first time the screen reports playing,
  // so the proof on this page is the customer's own content.
  const screenId = screen?.id;
  useEffect(() => {
    if (!playing || !screenId) return;
    const key = `dc-setup-shot-${screenId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    void requestScreenshot(screenId);
  }, [playing, requestScreenshot, screenId]);

  if (!screen || !progress.hasContent) {
    const missing: Array<{ step: SetupStepId; label: string; text: string }> = [];
    if (!screen) {
      missing.push({ step: "pair", label: "Pair a screen", text: "No screen is paired with this workspace yet." });
    }
    if (!progress.hasContent) {
      missing.push({ step: "content", label: "Add a video", text: "There is nothing for a screen to play yet." });
    }
    return (
      <StepCard
        step="playing"
        description="Once a screen is paired and has something to play, this page follows it until the video is on the TV."
      >
        <ul className="flex flex-col gap-3">
          {missing.map((entry) => (
            <li key={entry.step} className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
              <p className="min-w-0 flex-1 text-sm">{entry.text}</p>
              <Button onClick={() => onGo(entry.step)} size="sm" variant="outline">
                {entry.label}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </li>
          ))}
        </ul>
      </StepCard>
    );
  }

  const playlistName = progress.playlist?.name ?? screen.currentPlaylistName ?? "your playlist";
  const status = playingStatus(progress, screen.name, playlistName);

  return (
    <StepCard
      step="playing"
      description={
        playing
          ? "That is the whole loop: change the playlist here and the screen follows within a minute."
          : "Nothing to do here. This page updates by itself while the screen catches up."
      }
      footer={
        playing ? (
          <>
            <Button nativeButton={false} render={<Link href="/dashboard" />}>
              Go to the overview
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button nativeButton={false} render={<Link href={`/screens/${screen.id}`} />} variant="ghost">
              Open {screen.name}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-2">
          <ScreenThumbnail device={screen} />
          {playing ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {screen.screenshotUrl ? "A picture taken by the screen itself." : "The picture arrives in a few seconds."}
              </p>
              <Button
                disabled={refreshing}
                onClick={async () => {
                  setRefreshing(true);
                  await requestScreenshot(screen.id);
                  // The screen answers within a few seconds.
                  window.setTimeout(() => {
                    router.refresh();
                    setRefreshing(false);
                  }, 4_000);
                }}
                size="sm"
                variant="ghost"
              >
                {refreshing ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                Refresh picture
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                status.tone === "done" && "bg-signal/15 text-signal",
                status.tone === "busy" && "bg-muted text-foreground",
                status.tone === "warn" && "bg-warning/15 text-warning",
              )}
            >
              {status.tone === "done" ? (
                <PartyPopper className="size-5" aria-hidden />
              ) : status.tone === "busy" ? (
                <Spinner className="size-5" />
              ) : (
                <CircleAlert className="size-5" aria-hidden />
              )}
            </span>
            <div className="grid min-w-0 gap-1">
              <p className="font-heading text-lg font-semibold leading-snug">{status.title}</p>
              <p className="text-sm leading-6 text-muted-foreground">{status.detail}</p>
            </div>
          </div>

          <ol className="flex flex-col gap-2 text-sm">
            {status.trail.map((entry) => (
              <li key={entry.label} className="flex items-center gap-2.5">
                {entry.state === "done" ? (
                  <Check className="size-4 shrink-0 text-signal" aria-hidden />
                ) : entry.state === "now" ? (
                  <Spinner className="size-4 shrink-0" />
                ) : (
                  <span aria-hidden className="mx-1 size-2 shrink-0 rounded-full bg-border" />
                )}
                <span className={entry.state === "next" ? "text-muted-foreground" : undefined}>{entry.label}</span>
              </li>
            ))}
          </ol>

          {status.tone === "warn" ? (
            <Button
              className="w-fit"
              nativeButton={false}
              render={<Link href={`/screens/${screen.id}`} />}
              size="sm"
              variant="outline"
            >
              Open {screen.name}
              <ArrowRight data-icon="inline-end" />
            </Button>
          ) : null}
        </div>
      </div>

      {playing ? (
        <div className="grid gap-3 border-t pt-6 sm:grid-cols-2 xl:grid-cols-4">
          {nextSteps.map((entry) => (
            <Link
              key={entry.href}
              className="group flex flex-col gap-1.5 rounded-lg border p-4 transition-colors hover:bg-muted/60"
              href={entry.href}
            >
              <entry.icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium group-hover:underline">{entry.title}</span>
              <span className="text-xs leading-5 text-muted-foreground">{entry.text}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </StepCard>
  );
}

const nextSteps = [
  { href: "/media", icon: ImageIcon, title: "Add more media", text: "Photos, videos and YouTube links in one library." },
  { href: "/schedules", icon: CalendarRange, title: "Schedule a playlist", text: "Play something different during set hours." },
  { href: "/screens", icon: MonitorSmartphone, title: "Add another screen", text: "The same card image works for every screen." },
  { href: "/team", icon: Users, title: "Invite your team", text: "Members can look; admins can change things." },
];

type Trail = Array<{ label: string; state: "done" | "now" | "next" }>;

function playingStatus(
  progress: SetupProgress,
  screenName: string,
  playlistName: string,
): { tone: "done" | "busy" | "warn"; title: string; detail: string; trail: Trail } {
  const trail = (reached: number, stuck = false): Trail =>
    ["Screen is online", "Content is downloaded", "Playing on the TV"].map((label, index) => ({
      label,
      state: index < reached ? "done" : index === reached && !stuck ? "now" : "next",
    }));

  switch (progress.screenState) {
    case "playing":
      return {
        tone: "done",
        title: `${screenName} is playing ${playlistName}`,
        detail: "Your first screen is set up. It keeps playing on its own, also after a power cut or without internet.",
        trail: trail(3),
      };
    case "downloading":
      return {
        tone: "busy",
        title: `${screenName} is downloading ${playlistName}`,
        detail: "The TV says “Downloading your content”. A short video takes under a minute; large files take longer.",
        trail: trail(1),
      };
    case "problem":
      return {
        tone: "warn",
        title: `${screenName} needs a look`,
        detail: progress.problem ?? "Something is stopping the content from showing.",
        trail: trail(1, true),
      };
    case "offline":
      return {
        tone: "busy",
        title: `Waiting for ${screenName} to come online`,
        detail:
          "Check that it has power and internet. If the TV still shows a pairing code, it finishes pairing on its own once it is online.",
        trail: trail(0),
      };
    default:
      return {
        tone: "busy",
        title: `${screenName} is waiting for content`,
        detail: "It starts as soon as the workspace has a default playlist.",
        trail: trail(1),
      };
  }
}
