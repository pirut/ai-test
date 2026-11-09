import { auth } from "@clerk/nextjs/server";
import {
  Boxes,
  Globe,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  Waypoints,
} from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";

import {
  HeroShowcase,
  InlineArrowLink,
  PublicCtaRow,
  PublicFooter,
  PublicNav,
} from "@/components/public-site";

const featureCards = [
  {
    icon: Upload,
    title: "One media library",
    description:
      "Upload photos and videos or add YouTube links, sort them into folders, and reuse them across playlists.",
  },
  {
    icon: Waypoints,
    title: "Playlists and schedules",
    description:
      "Put media in order, pick a default for each screen, and schedule a different playlist for certain hours or days.",
  },
  {
    icon: Globe,
    title: "Manage every screen remotely",
    description:
      "See what each screen is showing, check its health, and restart or re-sync it from anywhere.",
  },
];

const workflowSteps = [
  {
    label: "01",
    title: "Flash a card",
    description:
      "Download the screen image, write it to a microSD card, and plug a Raspberry Pi 5 into your TV.",
  },
  {
    label: "02",
    title: "Pair the screen",
    description:
      "Join Wi-Fi from your phone or a keyboard. The TV shows a code; scan it or type it in to add the screen to your workspace.",
  },
  {
    label: "03",
    title: "Choose what plays",
    description:
      "Upload media, build a playlist, and assign it. The screen downloads it and starts playing within a minute.",
  },
];

const pricingBullets = [
  "Raspberry Pi 5, a microSD card, and any TV or monitor with HDMI",
  "Screens only make outbound connections, so there is no router setup",
  "Software updates are delivered over the air",
];

export default async function LandingPage() {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const session = await auth();

    if (session.userId) {
      redirect(session.orgId ? "/dashboard" : "/team");
    }
  }

  return (
    <main className="bg-[#131313] text-[#e5e2e1] selection:bg-[#adc6ff]/30">
      <PublicNav />

      <section className="relative overflow-hidden px-6 pb-24 pt-36">
        <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_center,rgba(77,142,255,0.12),transparent_70%)]" />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-[#adc6ff]">
            Digital signage for showrooms
          </div>
          <h1 className="mt-6 max-w-5xl text-5xl font-black leading-[0.92] tracking-[-0.06em] text-white sm:text-7xl lg:text-[5.5rem]">
            Run every showroom screen from one place.
          </h1>
          <p className="mt-8 max-w-3xl text-lg leading-8 text-[#c2c6d6] sm:text-xl">
            Digital Curator turns a Raspberry Pi and any TV into a managed
            display. Upload photos and videos, build playlists, schedule
            them, and check on every screen without visiting the showroom.
          </p>
          <div className="mt-10">
            <PublicCtaRow />
          </div>
          <HeroShowcase />
        </div>
      </section>


      <section id="features" className="bg-[#0e0e0e] px-6 py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-black tracking-[-0.04em] text-white">
              What you get
            </h2>
            <div className="mt-5 h-1 w-20 bg-[#adc6ff]" />
          </div>

          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {featureCards.map((card) => {
              const Icon = card.icon;

              return (
                <article
                  key={card.title}
                  className="group rounded-[24px] bg-[#131313] p-8 transition-colors duration-300 hover:bg-[#2a2a2a]"
                >
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-[#adc6ff]/10 transition-colors group-hover:bg-[#adc6ff]/18">
                    <Icon className="size-5 text-[#adc6ff]" />
                  </div>
                  <h3 className="mt-8 text-xl font-bold tracking-tight text-white">
                    {card.title}
                  </h3>
                  <p className="mt-4 text-sm leading-7 text-[#c2c6d6]">
                    {card.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="workflow" className="bg-[#131313] px-6 py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-[#adc6ff]">
              Getting started
            </div>
            <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              From box to playing in three steps
            </h2>
            <div className="mt-5 h-1 w-20 bg-[#adc6ff]" />
          </div>

          <div className="mt-16 grid gap-10 lg:grid-cols-3">
            {workflowSteps.map((step) => (
              <article key={step.label}>
                <div className="flex items-baseline gap-4">
                  <span className="text-5xl font-black leading-none text-[#adc6ff]/22">
                    {step.label}
                  </span>
                  <h3 className="text-2xl font-bold tracking-tight text-white">
                    {step.title}
                  </h3>
                </div>
                <div className="mt-6 rounded-[24px] bg-[#1c1b1b] p-8">
                  <p className="text-sm leading-7 text-[#c2c6d6]">
                    {step.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="library" className="bg-[#0e0e0e] px-6 py-28">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.08fr)_420px] lg:items-center">
          <div className="relative overflow-hidden rounded-[30px] bg-[#1c1b1b] p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative min-h-[420px] overflow-hidden rounded-[24px]">
                <Image
                  src="/marketing/hero-curation.png"
                  alt=""
                  fill
                  className="object-cover grayscale"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(19,19,19,0.02),rgba(19,19,19,0.72))]" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="max-w-sm rounded-[20px] bg-[#131313]/82 p-4 backdrop-blur">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#adc6ff]">
                      Library preview
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white">
                      Images, videos, and YouTube links live in folders you can search and tag.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-[24px] bg-[#131313] p-5">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#c2c6d6]/72">
                    Plays offline
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#c2c6d6]">
                    Each screen downloads its playlist and keeps playing if the internet drops.
                  </p>
                </div>
                <div className="rounded-[24px] bg-[#131313] p-5">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#c2c6d6]/72">
                    Schedules
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#c2c6d6]">
                    Play a different playlist during an event or on certain days, then return to the default.
                  </p>
                </div>
                <div className="rounded-[24px] bg-[#131313] p-5">
                  <div className="flex items-start gap-3">
                    <SlidersHorizontal className="mt-0.5 size-4 text-[#adc6ff]" />
                    <p className="text-sm leading-6 text-[#c2c6d6]">
                      Set orientation, volume, and time zone for each screen from the dashboard.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-[#adc6ff]">
              Media library
            </div>
            <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              Upload once, play it on any screen.
            </h2>
            <p className="mt-6 max-w-lg text-base leading-8 text-[#c2c6d6]">
              Keep everything your screens show in one library. Build playlists from it, set how long each image stays up, and change what is playing in a few clicks.
            </p>
            <div className="mt-8 space-y-3">
              {[
                "A default playlist for the workspace or for each screen",
                "YouTube videos and playlists alongside your uploads",
                "Schedules for events, sales, and opening hours",
              ].map((item) => (
                <div key={item} className="rounded-[20px] bg-[#1c1b1b] px-5 py-4 text-sm text-white">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="hardware" className="bg-[#1c1b1b] px-6 py-28">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-[#adc6ff]">
              Hardware
            </div>
            <h2 className="mt-5 max-w-3xl text-4xl font-black leading-tight tracking-[-0.05em] text-white sm:text-6xl">
              Built on hardware you can buy anywhere.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#c2c6d6]">
              No proprietary players. Flash our image onto a microSD card, plug a Raspberry Pi 5 into the TV, and the screen sets itself up.
            </p>

            <div className="mt-10 border-t border-white/8 pt-8">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-[#adc6ff]/10 p-3">
                  <Boxes className="size-5 text-[#adc6ff]" />
                </div>
                <div>
                  <p className="text-base font-semibold text-white">
                    Made for unattended screens
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[#c2c6d6]">
                    Screens start playing on power-up, recover on their own after a power cut, and report back so you know they are on.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] bg-[#131313] p-8 shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-[#c2c6d6]">
                What you need
              </span>
            </div>
            <div className="mt-8 space-y-5">
              {pricingBullets.map((item) => (
                <div key={item} className="flex items-start gap-4">
                  <ShieldCheck className="mt-1 size-4 shrink-0 text-[#adc6ff]" />
                  <p className="text-sm leading-7 text-[#e5e2e1]">{item}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 rounded-[22px] bg-[#1c1b1b] p-5">
              <InlineArrowLink href="/sign-up">
                Create your workspace
              </InlineArrowLink>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0e0e0e] px-6 py-28">
        <div className="mx-auto max-w-5xl">
          <p className="text-3xl font-light leading-tight text-white sm:text-4xl">
            Every screen reports what it is playing, how healthy it is, and whether your last change arrived, so you know the showroom looks right without walking the floor.
          </p>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#1c1b1b] px-6 py-28">
        <div className="absolute bottom-0 right-0 size-[420px] translate-x-1/3 translate-y-1/3 rounded-full bg-[#adc6ff]/8 blur-[110px]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-black tracking-[-0.05em] text-white sm:text-6xl">
            Set up your first screen today.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#c2c6d6]">
            Create a workspace, download the screen image, and have a TV playing your content in about 15 minutes.
          </p>
          <div className="mt-10">
            <PublicCtaRow />
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
