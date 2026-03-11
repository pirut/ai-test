import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="w-full max-w-md">
        {/* Logo mark */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold select-none">
            SR
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight">Signal Room</span>
        </div>

        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-foreground">
          Showroom signage control
        </h1>
        <p className="mb-8 text-sm text-muted-foreground leading-relaxed">
          Deploy Raspberry Pi displays, schedule media, verify playback with
          screenshots, and control devices remotely — without exposing them to
          inbound traffic.
        </p>

        <div className="flex gap-3 mb-10">
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Open dashboard
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Sign in
          </Link>
        </div>

        <ul className="flex flex-col gap-2 border-t border-border pt-8">
          {[
            "Team access scoped to Clerk organizations",
            "Device claim flow with rotating credentials",
            "Media library, playlists, and daypart schedules",
            "Live heartbeats, screenshots, and remote commands",
            "Offline-capable playback from cached manifests",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <svg className="mt-0.5 size-4 shrink-0 text-primary" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 8l3.5 3.5L13 4" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
