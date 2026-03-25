import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Script from "next/script";
import {
  Monitor,
  Upload,
  Calendar,
  Rocket,
  Shield,
  Eye,
  Zap,
  ArrowRight,
  CheckCircle2,
  Tv2,
  LayoutGrid,
  Clock,
} from "lucide-react";

import { CheckoutButton } from "@/components/marketing/checkout-button";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PricingShowcase } from "@/components/marketing/pricing-showcase";
import { absoluteUrl, buildMarketingMetadata, siteConfig } from "@/lib/site";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const capabilities = [
  {
    icon: Monitor,
    title: "Instant device claim",
    description:
      "Boot a Pi, enter a six-digit code, and it joins your fleet. No SSH, no config files.",
  },
  {
    icon: Upload,
    title: "Drag-and-drop media",
    description:
      "Upload images and videos or paste a YouTube link. We handle the rest.",
  },
  {
    icon: LayoutGrid,
    title: "Visual playlists",
    description:
      "Arrange media into playlists with per-slide timing. Drag to reorder.",
  },
  {
    icon: Calendar,
    title: "Time-based schedules",
    description:
      "Assign playlists to time windows. The right content plays at the right time, automatically.",
  },
  {
    icon: Rocket,
    title: "One-click releases",
    description:
      "Push updates to one screen or your entire fleet with a single deploy.",
  },
  {
    icon: Eye,
    title: "Proof of playback",
    description:
      "Live screenshots, heartbeat monitoring, and status badges for every screen.",
  },
];

const setupSteps = [
  {
    step: "01",
    title: "Create a workspace",
    description: "Sign up and get a 14-day trial with 3 screens included. No card needed.",
  },
  {
    step: "02",
    title: "Flash your Pi",
    description: "Use our image, boot the device, and a claim code appears on screen.",
  },
  {
    step: "03",
    title: "Go live",
    description: "Claim the device, upload content, and publish your first playlist.",
  },
  {
    step: "04",
    title: "Scale up",
    description: "Verify everything works, then repeat for every screen in your fleet.",
  },
];

const trustPoints = [
  { icon: Shield, label: "Security & privacy docs published" },
  { icon: CheckCircle2, label: "DPA, terms & policies ready to share" },
  { icon: Tv2, label: "Pay only for active screens" },
  { icon: Clock, label: "30-day grace period if billing lapses" },
];

const buyerQuestions = [
  {
    question: "Do I need to talk to sales?",
    answer:
      "No. Sign up, start a trial, and upgrade when you're ready. Everything is self-serve.",
  },
  {
    question: "What counts as a billable screen?",
    answer:
      "Any claimed, non-archived device. Archive a screen to stop billing without losing its history.",
  },
  {
    question: "What if my payment fails?",
    answer:
      "Your workspace goes read-only. Existing content keeps playing for 30 days while you sort it out.",
  },
  {
    question: "Do you sell hardware?",
    answer:
      "No. You bring the Raspberry Pis. We provide the software to manage them.",
  },
];

const metrics = [
  { value: "< 60s", label: "Time to claim" },
  { value: "14 days", label: "Free trial" },
  { value: "99.9%", label: "Uptime" },
  { value: "$99/mo", label: "Starting at" },
];

/* ------------------------------------------------------------------ */
/*  Metadata                                                           */
/* ------------------------------------------------------------------ */

export const metadata = buildMarketingMetadata({
  title: "Digital Signage Infrastructure for Raspberry Pi",
  description:
    "Manage Raspberry Pi signage fleets with a hosted control plane. Playlists, schedules, releases, and proof of playback.",
  path: "/",
});

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function LandingPage() {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const session = await auth();
    if (session.userId) {
      redirect(session.orgId ? "/dashboard" : "/team");
    }
  }

  return (
    <MarketingShell>
      {/* Structured data */}
      <Script
        id="screen-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: siteConfig.name,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "USD",
              lowPrice: "99",
              highPrice: "799",
            },
            url: absoluteUrl("/"),
            description: siteConfig.description,
          }),
        }}
      />
      <Script
        id="screen-faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: buyerQuestions.map((entry) => ({
              "@type": "Question",
              name: entry.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: entry.answer,
              },
            })),
          }),
        }}
      />

      {/* ========== HERO ========== */}
      <section className="relative isolate overflow-hidden px-6 pb-20 pt-24 sm:pb-32 sm:pt-36">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[700px] w-[1000px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-[radial-gradient(ellipse,rgba(122,161,255,0.12),transparent_70%)]" />
          <div className="absolute right-0 top-1/3 h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,rgba(124,211,157,0.06),transparent_70%)]" />
        </div>

        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3.5 py-1.5 text-[0.75rem] text-[#8d93a6]">
            <Zap className="size-3 text-[#9bb6ff]" />
            Digital signage infrastructure
          </div>

          <h1 className="mt-8 text-balance text-[2.75rem] font-black leading-[1] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
            Manage every screen from one place
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-[0.95rem] leading-7 text-[#8d93a6]">
            The control plane for Raspberry Pi signage fleets. Upload content,
            build playlists, schedule deployments, and verify playback across
            every screen — without SSH.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CheckoutButton
              planKey="growth"
              billingInterval="month"
              label="Start free trial"
              className="h-12 px-6 text-[0.9rem]"
            />
            <Link
              href="/getting-started"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/8 px-5 text-[0.85rem] font-medium text-[#b3b9cd] transition-all hover:border-white/15 hover:text-white"
            >
              How it works
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <p className="mt-4 text-[0.75rem] text-[#6b7280]">
            14-day trial &middot; No credit card &middot; 3 screens included
          </p>
        </div>

        {/* Metrics */}
        <div className="mx-auto mt-20 max-w-2xl">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/6 bg-white/6 sm:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="bg-[#0c0e11] px-5 py-4 text-center">
                <div className="text-xl font-black text-white">{m.value}</div>
                <div className="mt-0.5 text-[0.7rem] uppercase tracking-[0.12em] text-[#6b7280]">
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== CONSOLE PREVIEW ========== */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-4xl">
          <div className="relative rounded-2xl border border-white/8 bg-[#0a0c0f] p-1 shadow-[0_40px_80px_rgba(0,0,0,0.5)]">
            <div className="absolute inset-x-16 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(155,182,255,0.3),transparent)]" />

            <div className="rounded-xl bg-[#0e1219] p-5 sm:p-6">
              {/* Window chrome */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="size-2.5 rounded-full bg-white/8" />
                    <div className="size-2.5 rounded-full bg-white/8" />
                    <div className="size-2.5 rounded-full bg-white/8" />
                  </div>
                  <span className="text-[0.7rem] text-[#6b7280]">
                    {siteConfig.appName}
                  </span>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[0.65rem] font-medium text-emerald-400">
                  Trial active
                </span>
              </div>

              {/* Stats */}
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ["Screens", "18", "of 25"],
                  ["Releases", "2", "pending"],
                  ["Uptime", "99.7%", "30 days"],
                ].map(([label, value, sub]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/4 bg-white/[0.02] px-4 py-3.5"
                  >
                    <div className="text-[0.65rem] uppercase tracking-[0.12em] text-[#6b7280]">
                      {label}
                    </div>
                    <div className="mt-1 text-2xl font-black text-white">
                      {value}
                    </div>
                    <div className="text-[0.7rem] text-[#6b7280]">{sub}</div>
                  </div>
                ))}
              </div>

              {/* Device list */}
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  ["Lobby South", true, "4s"],
                  ["Cafe Menu", true, "11s"],
                  ["Studio Window", false, "79s"],
                ].map(([name, online, seen]) => (
                  <div
                    key={name as string}
                    className="flex items-center justify-between rounded-lg border border-white/4 bg-white/[0.02] px-3.5 py-2.5"
                  >
                    <div>
                      <div className="text-[0.8rem] font-medium text-white">
                        {name as string}
                      </div>
                      <div className="text-[0.65rem] text-[#6b7280]">
                        {seen as string} ago
                      </div>
                    </div>
                    <div
                      className={[
                        "size-1.5 rounded-full",
                        online ? "bg-emerald-400" : "bg-amber-400",
                      ].join(" ")}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== CAPABILITIES ========== */}
      <section className="border-y border-white/6 bg-[#090b0d] px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
              Everything to run your fleet
            </h2>
            <p className="mt-4 text-[0.9rem] leading-7 text-[#8d93a6]">
              From claiming the first device to managing hundreds of screens
              across locations.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((cap) => (
              <div
                key={cap.title}
                className="rounded-xl border border-white/6 bg-[#0c0e11] p-5 transition-colors hover:border-white/10"
              >
                <cap.icon className="size-5 text-[#9bb6ff]" />
                <h3 className="mt-3 text-[0.9rem] font-semibold text-white">
                  {cap.title}
                </h3>
                <p className="mt-1.5 text-[0.8rem] leading-6 text-[#8d93a6]">
                  {cap.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
              Live in an afternoon
            </h2>
            <p className="mt-4 text-[0.9rem] leading-7 text-[#8d93a6]">
              You handle the hardware. We handle everything else.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-3xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {setupSteps.map((item) => (
              <div key={item.step}>
                <div className="text-4xl font-black text-white/[0.06]">
                  {item.step}
                </div>
                <h3 className="mt-2 text-[0.9rem] font-semibold text-white">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-[0.8rem] leading-6 text-[#8d93a6]">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== TRUST + PRICING ========== */}
      <section className="border-y border-white/6 bg-[#090b0d] px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
                Transparent by default
              </h2>
              <p className="mt-4 max-w-md text-[0.9rem] leading-7 text-[#8d93a6]">
                Public pricing, published legal docs, billing that maps to
                usage. Everything a buyer needs before saying yes.
              </p>

              <div className="mt-8 space-y-2">
                {trustPoints.map((point) => (
                  <div
                    key={point.label}
                    className="flex items-center gap-3 rounded-lg border border-white/4 bg-white/[0.02] px-4 py-2.5"
                  >
                    <point.icon className="size-4 shrink-0 text-[#7cd39d]" />
                    <span className="text-[0.8rem] text-[#b3b9cd]">
                      {point.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {["/security", "/privacy", "/terms", "/dpa"].map((href) => (
                  <Link
                    key={href}
                    href={href}
                    className="rounded-md border border-white/6 px-2.5 py-1 text-[0.75rem] font-medium text-[#8d93a6] transition-colors hover:text-white"
                  >
                    {href.slice(1).charAt(0).toUpperCase() + href.slice(2)}
                  </Link>
                ))}
              </div>
            </div>

            <PricingShowcase />
          </div>
        </div>
      </section>

      {/* ========== FAQ ========== */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
            Questions
          </h2>

          <div className="mt-10 space-y-3">
            {buyerQuestions.map((entry) => (
              <article
                key={entry.question}
                className="rounded-xl border border-white/6 bg-[#0c0e11]/80 px-5 py-4"
              >
                <h3 className="text-[0.9rem] font-semibold text-white">
                  {entry.question}
                </h3>
                <p className="mt-1.5 text-[0.8rem] leading-6 text-[#8d93a6]">
                  {entry.answer}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FINAL CTA ========== */}
      <section className="px-6 pb-24">
        <div className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/8">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#0e1420_0%,#0c0e11_50%,#0d1414_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(122,161,255,0.08),transparent_60%)]" />

          <div className="relative px-8 py-14 text-center sm:px-12 sm:py-16">
            <h2 className="text-balance text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
              Ready to get started?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[0.9rem] leading-7 text-[#8d93a6]">
              Start a free trial, explore the pricing, or reach out. No sales
              call required.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <CheckoutButton
                planKey="growth"
                billingInterval="month"
                label="Start free trial"
                className="h-12 px-6 text-[0.9rem]"
              />
              <Link
                href="/pricing"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/8 px-5 text-[0.85rem] font-medium text-[#b3b9cd] transition-colors hover:text-white"
              >
                View pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
