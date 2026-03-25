import { Check } from "lucide-react";

import { buildMarketingMetadata } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Getting Started",
  description:
    "Set up your first Raspberry Pi screen in minutes. Step-by-step guide.",
  path: "/getting-started",
});

const prerequisites = [
  "A Raspberry Pi (3B+, 4, or 5)",
  "The Screen OS image (from our repo or downloads)",
  "A display connected via HDMI",
  "Network access (Wi-Fi or Ethernet)",
];

const steps = [
  {
    title: "Create your workspace",
    description:
      "Sign up at the console. You'll get a 14-day trial with 3 screens included. No credit card required.",
  },
  {
    title: "Flash the SD card",
    description:
      "Download the Screen OS image and flash it to an SD card using Raspberry Pi Imager or Balena Etcher.",
  },
  {
    title: "Boot and wait for the claim code",
    description:
      "Insert the SD card, connect the display, and power on. A six-digit claim code appears on screen within 30 seconds.",
  },
  {
    title: "Claim the device",
    description:
      "Enter the claim code in your console. The device joins your workspace and is ready for content.",
  },
  {
    title: "Upload and publish",
    description:
      "Drag media into the library, build a playlist, and publish. The screen starts playing within seconds.",
  },
];

export default function GettingStartedPage() {
  return (
    <section className="px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
            Get your first screen live
          </h1>
          <p className="mt-4 text-[0.95rem] leading-7 text-[#8d93a6]">
            From zero to playback in about 15 minutes.
          </p>
        </div>

        {/* Prerequisites */}
        <div className="mt-14 rounded-xl border border-white/6 bg-[#0c0e11] p-5">
          <h2 className="text-[0.8rem] font-semibold uppercase tracking-[0.1em] text-[#7f8aa6]">
            What you need
          </h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {prerequisites.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2.5 text-[0.8rem] text-[#b3b9cd]"
              >
                <Check className="size-3.5 shrink-0 text-[#7cd39d]" />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="mt-10 space-y-3">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="flex gap-4 rounded-xl border border-white/6 bg-[#0c0e11] p-5"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-[0.8rem] font-bold text-[#9bb6ff]">
                {index + 1}
              </div>
              <div>
                <h3 className="text-[0.9rem] font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-1 text-[0.8rem] leading-6 text-[#8d93a6]">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
