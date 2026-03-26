import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Script from "next/script";

import { CheckoutButton } from "@/components/marketing/checkout-button";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PricingShowcase } from "@/components/marketing/pricing-showcase";
import { absoluteUrl, buildMarketingMetadata, siteConfig } from "@/lib/site";

const operatingLayers = [
  {
    title: "Claim and configure",
    copy:
      "Turn a Pi on, claim it with a six-digit code, and assign its default playlist and site identity.",
  },
  {
    title: "Publish and schedule",
    copy:
      "Ship playlists, stage timed schedule windows, and push releases across the fleet without SSH sessions.",
  },
  {
    title: "Verify and recover",
    copy:
      "Use screenshots, heartbeats, billing state, and release visibility to keep every screen honest.",
  },
];

const setupSteps = [
  "Start a 14-day trial and create a workspace with no card upfront.",
  "Flash the Raspberry Pi image, boot the device, and wait for the claim code.",
  "Claim the screen, upload media, and publish the first playlist from the web console.",
  "Verify screenshots, heartbeats, and current playback state before scaling the fleet.",
];

const buyerQuestions = [
  {
    question: "Do I need to talk to sales first?",
    answer:
      "No. The product is built around self-serve onboarding, a 14-day trial, and public pricing.",
  },
  {
    question: "What counts as a billable screen?",
    answer:
      "A claimed, non-archived device attached to a workspace. Archive a device to stop counting it without deleting history.",
  },
  {
    question: "What happens if billing lapses?",
    answer:
      "The workspace becomes read-only for uploads, claims, schedule changes, and releases. Existing manifests keep serving for 30 days.",
  },
  {
    question: "Do you sell hardware?",
    answer:
      "No. Screen is software-only. Teams manage their own Raspberry Pi hardware while the SaaS handles orchestration and visibility.",
  },
];

export const metadata = buildMarketingMetadata({
  title: "Self-Serve Digital Signage SaaS",
  description:
    "Claim Raspberry Pi screens, publish playlists, schedule content, verify playback, and scale with transparent SaaS pricing.",
  path: "/",
});

export default async function LandingPage() {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const session = await auth();
    if (session.userId) {
      redirect(session.orgId ? "/dashboard" : "/team");
    }
  }

  return (
    <MarketingShell>
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

      <section className="relative overflow-hidden px-6 pb-24 pt-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(122,161,255,0.18),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(255,255,255,0.08),transparent_20%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,1.05fr)_460px] lg:items-center">
          <div>
            <div className="text-[11px] uppercase tracking-[0.32em] text-[#9bb6ff]">
              Screen control, without internal-tool edges
            </div>
            <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[0.92] tracking-[-0.06em] text-white sm:text-7xl">
              Run a Raspberry Pi signage fleet like a product, not a side project.
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[#c5cad8]">
              {siteConfig.name} is the hosted control plane for signage operators who want
              public pricing, trial-based onboarding, legal pages, billing, and operational
              visibility from day one. Claim screens, publish playlists, stage schedules,
              push releases, and confirm playback from one workspace.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <CheckoutButton
                planKey="growth"
                billingInterval="month"
                label="Start 14-day trial"
                className="h-12 px-5"
              />
              <Link
                href="/getting-started"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5"
              >
                See setup workflow
              </Link>
              <Link
                href="/contact"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-transparent px-5 text-sm font-medium text-[#9bb6ff] transition-colors hover:text-white"
              >
                Talk to support
              </Link>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                ["Trial-first", "14 days and 3 claimed screens before checkout"],
                ["Transparent pricing", "Monthly and annual plans from $99"],
                ["Trust surface", "Security, privacy, DPA, terms, status"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[22px] border border-white/8 bg-[#11151b]/85 p-4"
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#9bb6ff]">
                    {label}
                  </div>
                  <div className="mt-3 text-sm font-semibold text-white">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,#121722_0%,#0c0f15_100%)] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
            <div className="absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(185,204,255,0.65),transparent)]" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">
                  Live SaaS surface
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  One console for fleet control, billing, and proof of playback
                </div>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-200">
                Trial active
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[24px] border border-white/8 bg-[#0e1219] p-5">
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-[#9bb6ff]">
                    <span>Workspace overview</span>
                    <span>Growth</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[
                      ["Claimed screens", "18"],
                      ["Pending releases", "2"],
                      ["Trial / period end", "Apr 7"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-white/6 bg-white/4 p-4">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-[#7f8aa6]">
                          {label}
                        </div>
                        <div className="mt-3 text-2xl font-black text-white">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/8 bg-[#0e1219] p-5">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#9bb6ff]">
                    Billing state
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      "No card required for the 14-day trial",
                      "Archive screens to stop billing without losing history",
                      "Read-only mode protects existing playback during billing issues",
                    ].map((item) => (
                      <div key={item} className="rounded-2xl bg-white/4 px-4 py-3 text-sm leading-6 text-[#d7def4]">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-[24px] border border-white/8 bg-[#0e1219] p-5">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#9bb6ff]">
                    Fleet heartbeat
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      ["Lobby South", "online", "04s ago"],
                      ["Cafe Menu", "online", "11s ago"],
                      ["Studio Window", "stale", "79s ago"],
                    ].map(([name, status, seen]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-2xl bg-white/4 px-4 py-3"
                      >
                        <div>
                          <div className="text-sm font-medium text-white">{name}</div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#7f8aa6]">
                            {seen}
                          </div>
                        </div>
                        <div
                          className={[
                            "rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em]",
                            status === "online"
                              ? "bg-emerald-400/10 text-emerald-200"
                              : "bg-amber-400/10 text-amber-200",
                          ].join(" ")}
                        >
                          {status}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/8 bg-[#0e1219] p-5">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#9bb6ff]">
                    What ships now
                  </div>
                  <div className="mt-4 grid gap-3">
                    {operatingLayers.map((feature) => (
                      <article key={feature.title} className="rounded-[20px] bg-white/4 p-4">
                        <h2 className="text-base font-semibold text-white">{feature.title}</h2>
                        <p className="mt-2 text-sm leading-7 text-[#c5cad8]">{feature.copy}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/6 bg-[#090b0d] px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="max-w-2xl">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">
                Operator workflow
              </div>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
                Go from first boot to managed playback in an afternoon.
              </h2>
              <p className="mt-6 text-base leading-8 text-[#c5cad8]">
                The product is designed for teams that already know how to source Raspberry
                Pis, but do not want to spend the next year building the control plane around
                them.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  "Software-only positioning with public pricing",
                  "Hosted admin, billing, legal, and support surface",
                  "Device protocol compatible with the current agent",
                  "Read-only protection when billing changes state",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[20px] border border-white/8 bg-[#11151b] px-4 py-3 text-sm text-[#d7def4]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {setupSteps.map((step, index) => (
                <div
                  key={step}
                  className="rounded-[24px] border border-white/8 bg-[#11151b] p-5"
                >
                  <div className="text-4xl font-black text-[#9bb6ff]/20">0{index + 1}</div>
                  <p className="mt-4 text-sm leading-7 text-[#d6daea]">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="max-w-2xl">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">
                Built for SaaS buyers
              </div>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
                Transparent pricing and a trust surface you can actually send to customers.
              </h2>
              <p className="mt-5 text-base leading-8 text-[#c5cad8]">
                The product now has the public pages, pricing model, support route, billing
                behaviors, and deployment-ready onboarding flow expected from a real B2B SaaS.
              </p>
              <div className="mt-8 space-y-3">
                {[
                  "Monthly or annual contracts with 15% annual savings",
                  "Billing tied to claimed, non-archived screens",
                  "Screenshot retention and storage mapped to plan tiers",
                  "Security, privacy, DPA, acceptable use, and cookie policy already published",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[22px] border border-white/8 bg-[#11151b] px-5 py-4 text-sm leading-7 text-[#d6daea]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <PricingShowcase />
          </div>
        </div>
      </section>

      <section className="border-y border-white/6 bg-[#090b0d] px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">FAQ</div>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
                Clear answers before a buyer ever reaches checkout.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#c5cad8]">
                The onboarding, pricing, and billing policy are public by design. That is the
                difference between a useful internal control panel and a product a customer can
                trust.
              </p>
            </div>

            <div className="grid gap-4">
              {buyerQuestions.map((entry) => (
                <article
                  key={entry.question}
                  className="rounded-[24px] border border-white/8 bg-[#11151b] p-5"
                >
                  <h3 className="text-lg font-semibold text-white">{entry.question}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#c5cad8]">{entry.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto grid max-w-7xl gap-10 rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,#10141d_0%,#0a0d12_100%)] px-8 py-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-10">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">
              Ready to launch
            </div>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              Start the trial, or audit the public surface first.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[#c5cad8]">
              Pricing, security, legal, contact, billing, device control, and onboarding now
              live inside the same product surface. This is the point where the stack stops
              being a private dashboard and starts behaving like a SaaS company.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CheckoutButton
                planKey="growth"
                billingInterval="month"
                label="Start free trial"
                className="h-12 px-5"
              />
              <Link
                href="/pricing"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5"
              >
                Review pricing
              </Link>
            </div>
          </div>
          <div className="space-y-3">
            {[
              "/security",
              "/privacy",
              "/terms",
              "/acceptable-use",
              "/dpa",
              "/cookie-policy",
            ].map((href) => (
              <Link
                key={href}
                href={href}
                className="block rounded-[20px] border border-white/8 bg-[#11151b] px-5 py-4 text-sm text-white transition-colors hover:bg-white/5"
              >
                {href}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
