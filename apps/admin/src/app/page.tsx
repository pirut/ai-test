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
  LogoCloud,
  PublicCtaRow,
  PublicFooter,
  PublicNav,
} from "@/components/public-site";

const featureCards = [
  {
    icon: Upload,
    title: "Advanced media library",
    description:
      "Keep stills, videos, and imported sources in one controlled catalog built for repeatable releases.",
  },
  {
    icon: Waypoints,
    title: "Seamless collaboration",
    description:
      "Organizations, release windows, and staged approvals keep teams aligned before content reaches a screen.",
  },
  {
    icon: Globe,
    title: "Global content delivery",
    description:
      "Push playlists and manifests to distributed players while preserving a simple operator view back at HQ.",
  },
];

const workflowSteps = [
  {
    label: "01",
    title: "Import and organize",
    description:
      "Build a reusable catalog of campaign assets, evergreen content, and YouTube imports without losing track of source material.",
  },
  {
    label: "02",
    title: "Curate with precision",
    description:
      "Assemble playlists, dayparts, and releases in a workflow that keeps operational detail visible and clutter low.",
  },
  {
    label: "03",
    title: "Ship and verify",
    description:
      "Confirm screenshots, heartbeats, and device status after deployment so the team has actual proof of playback.",
  },
];

const pricingBullets = [
  "Self-hosted control plane with a small-fleet cost profile",
  "Playlist delivery tuned for Raspberry Pi signage hardware",
  "Device claim and refresh endpoints built into the same stack",
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
            Digital curation reinvented
          </div>
          <h1 className="mt-6 max-w-5xl text-5xl font-black leading-[0.92] tracking-[-0.06em] text-white sm:text-7xl lg:text-[5.5rem]">
            Curate your digital assets with precision.
          </h1>
          <p className="mt-8 max-w-3xl text-lg leading-8 text-[#c2c6d6] sm:text-xl">
            Screen is a cinematic control surface for showroom fleets: media
            library, playlist sequencing, release timing, screenshots, and
            remote commands in one editorial dark-mode workspace.
          </p>
          <div className="mt-10">
            <PublicCtaRow />
          </div>
          <HeroShowcase />
        </div>
      </section>

      <LogoCloud />

      <section id="features" className="bg-[#0e0e0e] px-6 py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-black tracking-[-0.04em] text-white">
              Precision engineering
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
              The process
            </div>
            <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              How Screen works
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
                  alt="Abstract media art used to represent the curated library."
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
                      The new home page uses downloaded Stitch imagery for the hero and library treatment instead of leaving mock frames empty.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-[24px] bg-[#131313] p-5">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#c2c6d6]/72">
                    Media coverage
                  </div>
                  <div className="mt-3 text-3xl font-black tracking-tight text-white">
                    1,280
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#c2c6d6]">
                    Assets staged across campaigns, evergreen loops, and fallback schedules.
                  </p>
                </div>
                <div className="rounded-[24px] bg-[#131313] p-5">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#c2c6d6]/72">
                    Release discipline
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#c2c6d6]">
                    Preview the exact sequence, window, and fleet assignment before anything ships.
                  </p>
                </div>
                <div className="rounded-[24px] bg-[#131313] p-5">
                  <div className="flex items-start gap-3">
                    <SlidersHorizontal className="mt-0.5 size-4 text-[#adc6ff]" />
                    <p className="text-sm leading-6 text-[#c2c6d6]">
                      A quieter interface still exposes the operator details that matter when a screen is on the wall and time is short.
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
              Treat assets like a curated collection, not a file dump.
            </h2>
            <p className="mt-6 max-w-lg text-base leading-8 text-[#c2c6d6]">
              The library section gives the marketing page a real visual anchor while still describing the actual product: catalog media, compose playlists, stage schedules, and keep provenance clear.
            </p>
            <div className="mt-8 space-y-3">
              {[
                "Reusable playlists with fallback playback",
                "YouTube imports alongside uploaded media",
                "Release windows tied to actual device fleets",
              ].map((item) => (
                <div key={item} className="rounded-[20px] bg-[#1c1b1b] px-5 py-4 text-sm text-white">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-[#1c1b1b] px-6 py-28">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-[#adc6ff]">
              Vertical integration
            </div>
            <h2 className="mt-5 max-w-3xl text-4xl font-black leading-tight tracking-[-0.05em] text-white sm:text-6xl">
              Uncompromising control, a smaller-fleet cost profile.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#c2c6d6]">
              The Stitch concept had a cost-efficiency section; this implementation grounds it in the actual app: one stack for media, releases, devices, and claim flows rather than separate control tooling.
            </p>

            <div className="mt-10 border-t border-white/8 pt-8">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-[#adc6ff]/10 p-3">
                  <Boxes className="size-5 text-[#adc6ff]" />
                </div>
                <div>
                  <p className="text-base font-semibold text-white">
                    Custom build architecture
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[#c2c6d6]">
                    Purpose-built for signage operators who need steady release handling, proof of playback, and minimal overhead.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] bg-[#131313] p-8 shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-[#c2c6d6]">
                Monthly infrastructure cost
              </span>
              <span className="text-sm font-bold text-[#adc6ff]">80% lower</span>
            </div>
            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-[#2a2a2a]">
              <div className="h-full w-[20%] bg-[#adc6ff]" />
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
                Open a workspace for your team
              </InlineArrowLink>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0e0e0e] px-6 py-28">
        <div className="mx-auto max-w-5xl">
          <div className="relative">
            <span className="absolute -left-3 -top-10 text-8xl text-[#adc6ff]/10 sm:-left-10 sm:text-9xl">
              “
            </span>
            <blockquote className="relative">
              <p className="text-3xl font-light italic leading-tight text-white sm:text-4xl">
                Screen has completely transformed how we present our digital vision. It does not feel like another dashboard. It feels like the workspace finally respects the work.
              </p>
              <footer className="mt-10 flex items-center gap-4">
                <div className="size-12 overflow-hidden rounded-full bg-[#353534]">
                  <Image
                    src="/marketing/testimonial-portrait.png"
                    alt="Portrait used for the testimonial area."
                    width={512}
                    height={512}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <cite className="not-italic font-bold text-white">Julian Thorne</cite>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-[#c2c6d6]">
                    Creative director, Nexa Design
                  </div>
                </div>
              </footer>
            </blockquote>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#1c1b1b] px-6 py-28">
        <div className="absolute bottom-0 right-0 size-[420px] translate-x-1/3 translate-y-1/3 rounded-full bg-[#adc6ff]/8 blur-[110px]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-black tracking-[-0.05em] text-white sm:text-6xl">
            Join the future of digital curation.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#c2c6d6]">
            The public home page now follows the Stitch design direction, and the auth pages use the same system so the whole entry flow feels deliberate.
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
