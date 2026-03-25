import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { siteConfig } from "@/lib/site";

export function PublicAuthShell({
  mode,
  title,
  description,
  children,
}: {
  mode: "sign-in" | "sign-up";
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const oppositeHref = mode === "sign-in" ? "/sign-up" : "/sign-in";
  const oppositeLabel = mode === "sign-in" ? "Create account" : "Sign in";

  return (
    <main className="min-h-screen bg-[#0c0e11] text-[#f5f7fd]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#b3b7c5] transition-colors hover:text-white"
          >
            <ChevronLeft className="size-4" />
            Back to home
          </Link>
          <Link
            href={oppositeHref}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-white/12 px-4 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            {oppositeLabel}
          </Link>
        </div>

        <div className="grid flex-1 gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_440px]">
          <section className="hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,#11151b_0%,#0c0e11_100%)] p-8 lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-[#9bb6ff]">
                Self-serve signage SaaS
              </div>
              <h1 className="mt-5 text-5xl font-black tracking-[-0.05em] text-white">
                Run your Raspberry Pi screen fleet without the enterprise bloat.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-[#c5cad8]">
                {siteConfig.name} gives operators one control surface for media, playlists,
                schedules, releases, screenshots, and billing.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["14-day trial", "No card upfront"],
                ["Pure self-serve", "Clerk + Stripe onboarding"],
                ["Proof of playback", "Screenshots and heartbeats"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[20px] border border-white/8 bg-white/3 p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#9bb6ff]">
                    {label}
                  </div>
                  <div className="mt-3 text-sm font-semibold text-white">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/8 bg-[#11151b] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="mb-6">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">
                {siteConfig.name}
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">{title}</h1>
              <p className="mt-3 text-sm leading-7 text-[#c5cad8]">{description}</p>
            </div>
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
