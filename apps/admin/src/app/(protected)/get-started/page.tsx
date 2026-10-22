import { Download } from "lucide-react";

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
import { requireOrgContext } from "@/lib/auth";
import { env } from "@/lib/env";

const steps = [
  {
    title: "Download the screen image",
    description:
      "One image works for every workspace. It holds no account details, so you can reuse a card on any screen.",
  },
  {
    title: "Flash it with Raspberry Pi Imager",
    description:
      "Choose your Pi model, then Use custom and pick the downloaded file, then your microSD card. Skip the OS customisation settings.",
  },
  {
    title: "Plug in the Pi",
    description:
      "Connect HDMI first, then power. Use Ethernet, or pick a Wi-Fi network on the screen when it asks. The screen then shows a 6-character code.",
  },
  {
    title: "Enter the code below",
    description:
      "The screen joins this workspace and starts playing your default playlist within a minute.",
  },
];

export default async function GetStartedPage() {
  const session = await requireOrgContext();
  const isAdmin = session.has({ role: "org:admin" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Get started"
        description="You need a Raspberry Pi 5, a microSD card of 8 GB or more, and a TV or monitor with HDMI."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Set up a screen</CardTitle>
            <CardDescription>About 15 minutes, most of it waiting for the card to write.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-5">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-medium">{step.title}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                    {index === 0 ? (
                      env.imageDownloadUrl ? (
                        <Button className="mt-2 w-fit" render={<a href={env.imageDownloadUrl} />}>
                          <Download data-icon="inline-start" />
                          Download image
                        </Button>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                          The public download is not available yet.
                        </p>
                      )
                    ) : null}
                    {index === 1 ? (
                      <a
                        className="mt-1 w-fit text-sm text-primary underline-offset-4 hover:underline"
                        href="https://www.raspberrypi.com/software/"
                        rel="noreferrer"
                        target="_blank"
                      >
                        Get Raspberry Pi Imager
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
            <CardTitle>Claim a screen</CardTitle>
            <CardDescription>Enter the code shown on the TV.</CardDescription>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <ClaimDeviceForm embedded />
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask a workspace admin to claim screens.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
