import { ArrowRight, ChevronLeft, ShieldCheck, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const navItems = [
  { href: "/#features", label: "Features" },
  { href: "/#workflow", label: "How it works" },
  { href: "/#library", label: "Library" },
  { href: "/#pricing", label: "Pricing" },
];

const logoNames = ["VOLT", "AXON", "NEXUS", "ORBIT", "FLUX"];

export function PublicNav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/6 bg-[#131313]/82 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="flex items-center gap-3 text-white">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white text-sm font-black text-[#131313]">
            S
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Screen</div>
            <div className="text-[11px] text-[#c2c6d6]">Digital curator</div>
          </div>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium tracking-tight text-[#c2c6d6] transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="hidden text-sm font-medium tracking-tight text-[#c2c6d6] transition-colors hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#adc6ff_0%,#4d8eff_100%)] px-4 text-sm font-semibold text-[#002e6a] shadow-[0_12px_30px_rgba(77,142,255,0.22)] transition-transform active:scale-[0.98]"
          >
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function LogoCloud() {
  return (
    <section className="bg-[#131313] py-20">
      <div className="mx-auto max-w-7xl px-6">
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-[#c2c6d6]/60">
          Trusted by modern design teams
        </p>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-10 opacity-45 grayscale sm:gap-20">
          {logoNames.map((name) => (
            <span key={name} className="text-2xl font-black tracking-tight text-white">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-[#424754]/15 bg-[#0e0e0e] py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 md:flex-row md:items-center md:justify-between">
        <div className="text-lg font-bold text-white">Screen</div>
        <div className="flex flex-wrap gap-6 text-[11px] uppercase tracking-[0.22em] text-[#c2c6d6]">
          <Link href="/#features" className="transition-colors hover:text-[#adc6ff]">
            Features
          </Link>
          <Link href="/#workflow" className="transition-colors hover:text-[#adc6ff]">
            Workflow
          </Link>
          <Link href="/sign-in" className="transition-colors hover:text-[#adc6ff]">
            Sign in
          </Link>
          <Link href="/sign-up" className="transition-colors hover:text-[#adc6ff]">
            Get started
          </Link>
        </div>
        <div className="text-[10px] text-[#c2c6d6]/55">
          Designed from Stitch references for the admin app marketing surface.
        </div>
      </div>
    </footer>
  );
}

export function HeroShowcase() {
  return (
    <div className="relative mx-auto mt-14 max-w-6xl">
      <div className="absolute inset-x-14 top-16 h-56 rounded-full bg-[#4d8eff]/18 blur-[120px]" />
      <div className="grid gap-3 overflow-hidden rounded-[28px] border border-white/8 bg-[#1c1b1b] p-2 shadow-[0_30px_80px_rgba(0,0,0,0.45)] lg:grid-cols-[1.15fr_0.85fr]">
        <div className="relative min-h-[360px] overflow-hidden rounded-[24px] bg-[#0e0e0e] lg:min-h-[480px]">
          <Image
            src="/marketing/hero-curation.png"
            alt="Abstract media composition used for the public marketing hero."
            fill
            priority
            className="object-cover grayscale"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(19,19,19,0)_0%,rgba(19,19,19,0.2)_50%,rgba(19,19,19,0.82)_100%)]" />
          <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-4 p-6">
            <div className="max-w-sm">
              <p className="text-sm font-semibold text-white">Quiet authority for screen fleets</p>
              <p className="mt-2 text-sm leading-6 text-[#c2c6d6]">
                Upload, sequence, deploy, and verify without turning the control plane into visual noise.
              </p>
            </div>
            <div className="hidden rounded-2xl border border-white/10 bg-[#131313]/82 px-4 py-3 text-right backdrop-blur sm:block">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#c2c6d6]">Fresh shots</div>
              <div className="mt-2 text-3xl font-black tracking-tight text-white">19</div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-rows-[auto_1fr]">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              ["Release window", "Today, 12:30"],
              ["Fleet health", "24 screens online"],
              ["Pending changes", "03 staged updates"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[22px] bg-[#131313] px-5 py-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#c2c6d6]/72">{label}</div>
                <div className="mt-3 text-lg font-semibold tracking-tight text-white">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 rounded-[24px] bg-[#151515] p-5 lg:grid-cols-[180px_1fr]">
            <div className="overflow-hidden rounded-[18px] border border-white/8 bg-[#1f1f1f]">
              <Image
                src="/marketing/stitch-reference.png"
                alt="Reference screen from the Stitch design exploration."
                width={176}
                height={512}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-col justify-between gap-4 rounded-[18px] bg-[#201f1f] p-5">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#adc6ff]">Operational preview</div>
                <h3 className="mt-4 text-2xl font-black tracking-tight text-white">
                  One surface for library, releases, and proof of playback.
                </h3>
                <p className="mt-4 text-sm leading-6 text-[#c2c6d6]">
                  The marketing page borrows the same dark editorial system from the Stitch source, then adapts it to the actual Screen product model.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#131313] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#c2c6d6]/70">Deployments</div>
                  <div className="mt-2 text-sm font-semibold text-white">Raspberry Pi fleet ready</div>
                </div>
                <div className="rounded-2xl bg-[#131313] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#c2c6d6]/70">Evidence</div>
                  <div className="mt-2 text-sm font-semibold text-white">Screenshots and heartbeats</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <main className="min-h-screen bg-[#131313] text-[#e5e2e1]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#c2c6d6] transition-colors hover:text-white">
            <ChevronLeft className="size-4" />
            Back to home
          </Link>
          <Link
            href={oppositeHref}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-[#424754]/30 px-4 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            {oppositeLabel}
          </Link>
        </div>

        <div className="grid flex-1 gap-6 py-6 lg:grid-cols-[minmax(0,1.08fr)_440px]">
          <section className="relative hidden overflow-hidden rounded-[28px] bg-[#1c1b1b] p-8 lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(77,142,255,0.18),transparent_65%)]" />
            <div className="relative max-w-xl">
              <div className="text-[11px] uppercase tracking-[0.34em] text-[#adc6ff]">Digital curation reinvented</div>
              <h1 className="mt-5 text-5xl font-black tracking-[-0.05em] text-white">
                Curate your digital assets with precision.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-[#c2c6d6]">
                Screen gives operators a cinematic control surface for media libraries, playlists, schedules, and proof of playback.
              </p>
            </div>

            <div className="relative mt-10 overflow-hidden rounded-[24px] border border-white/8 bg-[#131313]">
              <div className="grid lg:grid-cols-[1fr_220px]">
                <div className="relative min-h-[360px]">
                  <Image
                    src="/marketing/hero-curation.png"
                    alt="Abstract curation artwork used in the authentication panel."
                    fill
                    className="object-cover grayscale"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12),rgba(0,0,0,0.62))]" />
                </div>
                <div className="grid gap-3 bg-[#0e0e0e] p-4">
                  <div className="rounded-[18px] bg-[#1c1b1b] p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#c2c6d6]/70">Fleet status</div>
                    <div className="mt-3 text-2xl font-black tracking-tight text-white">24 online</div>
                  </div>
                  <div className="rounded-[18px] bg-[#1c1b1b] p-4">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#c2c6d6]/70">Staged today</div>
                    <div className="mt-3 text-2xl font-black tracking-tight text-white">03 releases</div>
                  </div>
                  <div className="rounded-[18px] bg-[#1c1b1b] p-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 size-4 text-[#adc6ff]" />
                      <p className="text-sm leading-6 text-[#c2c6d6]">
                        Teams work inside Clerk organizations and deploy without exposing devices inbound.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative mt-8 flex items-center gap-4">
              <div className="size-12 overflow-hidden rounded-full bg-[#353534]">
                <Image
                  src="/marketing/testimonial-portrait.png"
                  alt="Portrait used with the stitched testimonial treatment."
                  width={512}
                  height={512}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="max-w-xl text-sm leading-6 text-white">
                  “Screen treats operational media like curated work, not a pile of files.”
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-[#c2c6d6]/75">
                  Julian Thorne, creative director
                </p>
              </div>
            </div>
          </section>

          <section className="flex items-center justify-center">
            <div className="w-full max-w-md rounded-[28px] border border-[#424754]/25 bg-[#1c1b1b] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.38)] sm:p-8">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#adc6ff]">
                {mode === "sign-in" ? "Welcome back" : "Create your workspace"}
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-white">
                {title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#c2c6d6]">{description}</p>
              <div className="mt-8">{children}</div>
              <div className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-[#c2c6d6]/70">
                <Zap className="size-3.5 text-[#adc6ff]" />
                Built from the Stitch design system reference
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export function PublicCtaRow() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
      <Link
        href="/sign-up"
        className="inline-flex h-14 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#adc6ff_0%,#4d8eff_100%)] px-8 text-base font-bold text-[#002e6a] shadow-[0_18px_40px_rgba(77,142,255,0.25)] transition-transform active:scale-[0.98]"
      >
        Get started now
      </Link>
      <Link
        href="/sign-in"
        className="inline-flex h-14 items-center justify-center rounded-xl border border-[#424754]/30 bg-[#2a2a2a]/55 px-8 text-base font-bold text-white transition-colors hover:bg-[#353534]"
      >
        Open workspace
      </Link>
    </div>
  );
}

export function InlineArrowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm font-semibold text-white transition-colors hover:text-[#adc6ff]"
    >
      {children}
      <ArrowRight className="size-4" />
    </Link>
  );
}
