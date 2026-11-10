import { ArrowRight, Check, Download } from "lucide-react";
import Link from "next/link";

import { ClaimDeviceForm } from "@/components/claim-device-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOrgId, getAuthSession } from "@/lib/auth";
import { listDevices, listMediaAssets, listPlaylists } from "@/lib/backend";
import { env } from "@/lib/env";

const setupSteps = [
  {
    title: "Download the screen image",
    description:
      "One image works for every workspace. It holds no account details, so you can reuse a card on any screen.",
  },
  {
    title: "Write it to a microSD card",
    description:
      "In Raspberry Pi Imager choose Raspberry Pi 5, then Use custom and pick the downloaded file, then your card. If it offers OS customisation, choose No.",
  },
  {
    title: "Plug in the Pi",
    description:
      "Put the card in, connect HDMI to the TV first, then power. The first start takes a couple of minutes.",
  },
  {
    title: "Connect it to the internet",
    description:
      "With an Ethernet cable there is nothing to do. For Wi-Fi, scan the code on the TV with your phone and pick your network, or plug in a USB keyboard and choose it on the screen.",
  },
  {
    title: "Add the screen to this workspace",
    description:
      "Once online, the TV shows a 6-character pairing code. Scan the code next to it with your phone, or type it into the form on this page.",
  },
];

function StepNumber({ index, done }: { index: number; done?: boolean }) {
  return done ? (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-signal/15 text-signal">
      <Check className="size-4" aria-hidden />
      <span className="sr-only">Done</span>
    </span>
  ) : (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums"
    >
      {index + 1}
    </span>
  );
}

export default async function GetStartedPage() {
  const orgId = await requireOrgId();
  const session = await getAuthSession();
  const isAdmin = session.has({ role: "org:admin" });
  // The checklist is a convenience; the page still works if a count fails to load.
  const [devices, media, playlists] = await Promise.all([
    listDevices(orgId).catch(() => []),
    listMediaAssets().catch(() => []),
    listPlaylists().catch(() => []),
  ]);
  const hasScreen = devices.length > 0;
  const hasDefaultPlaylist = playlists.some((playlist) => playlist.isDefault);

  const contentSteps = [
    {
      title: "Add media",
      description: "Upload photos and videos, or add a YouTube link.",
      href: "/media",
      action: "Open Media",
      done: media.length > 0,
    },
    {
      title: "Make a playlist",
      description:
        "Put media in order and tick Workspace default. Every screen plays the default unless you pick another playlist for it.",
      href: "/playlists",
      action: "Open Playlists",
      done: hasDefaultPlaylist,
    },
    {
      title: "Check the screen",
      description:
        "Open the screen to see what it is showing, choose its own playlist, or set its orientation and volume.",
      href: hasScreen ? `/screens/${devices[0]!.id}` : "/screens",
      action: "Open Screens",
      done: false,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Get started"
        description="You need a Raspberry Pi 5 with its power supply, a microSD card of 8 GB or more, and a TV or monitor with HDMI."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>1. Set up a screen</CardTitle>
              <CardDescription>About 15 minutes, most of it waiting for the card to write.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-5">
                {setupSteps.map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <StepNumber index={index} />
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="font-medium">{step.title}</p>
                      <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                      {index === 0 ? (
                        env.imageDownloadUrl ? (
                          <Button
                            className="mt-2 w-fit"
                            nativeButton={false}
                            render={<a href={env.imageDownloadUrl} rel="noreferrer" />}
                          >
                            <Download data-icon="inline-start" />
                            Download image
                          </Button>
                        ) : (
                          <p className="mt-1 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                            The download link is not set up on this site yet. Ask whoever gave you access for the
                            image file.
                          </p>
                        )
                      ) : null}
                      {index === 1 ? (
                        <a
                          className="mt-1 w-fit text-sm text-primary underline underline-offset-4"
                          href="https://www.raspberrypi.com/software/"
                          rel="noreferrer"
                          target="_blank"
                        >
                          Get Raspberry Pi Imager
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>2. Put something on it</CardTitle>
              <CardDescription>
                A paired screen stays on a waiting message until the workspace has a playlist.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-5">
                {contentSteps.map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <StepNumber index={index} done={step.done} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="font-medium">{step.title}</p>
                      <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                    </div>
                    <Button
                      className="w-fit shrink-0 self-start"
                      nativeButton={false}
                      render={<Link href={step.href} />}
                      size="sm"
                      variant="outline"
                    >
                      {step.action}
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <Card id="claim" className="scroll-mt-20 lg:sticky lg:top-20">
          <CardHeader className="border-b">
            <CardTitle>Add a screen</CardTitle>
            <CardDescription>
              {hasScreen
                ? `You have ${devices.length} screen${devices.length === 1 ? "" : "s"}. Enter the code on the TV to add another.`
                : "Enter the code shown on the TV."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <ClaimDeviceForm embedded hasDefaultPlaylist={hasDefaultPlaylist} idPrefix="get-started" />
            ) : (
              <p className="text-sm text-muted-foreground">
                Only workspace admins can add screens. Ask an admin to enter the code from the TV.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
