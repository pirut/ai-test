import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <main className="grid min-h-screen items-center gap-12 px-20 py-16 grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
      <section>
        <p className="mb-3 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-brand">
          <span className="inline-block h-px w-4 bg-brand opacity-70" />
          Showroom signage stack
        </p>
        <h1 className="mb-6 text-[clamp(3.2rem,8vw,6.5rem)] font-semibold uppercase leading-[0.9] tracking-[-0.06em]">
          Own the{" "}
          <span className="text-brand">screen</span>{" "}
          room.
        </h1>
        <p className="max-w-[48ch] text-muted-foreground leading-[1.7]">
          Deploy Raspberry Pi players, assign scheduled media, verify playback
          with screenshots, and control devices remotely — without exposing them
          to inbound network traffic.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">Open control room</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardContent className="pt-2">
          <p className="mb-3 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
            <span className="inline-block h-px w-4 bg-brand opacity-70" />
            What ships in v1
          </p>
          <ul className="grid gap-3">
            {[
              "Clerk team access with organization scoping",
              "Device claim flow and rotating credentials",
              "Media library, playlists, and daypart schedules",
              "Live heartbeats, screenshots, and remote commands",
              "Offline-capable playback from cached manifests",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-[0.9rem] text-muted-foreground leading-snug">
                <span className="mt-[0.35rem] size-1.5 rounded-full bg-brand flex-shrink-0" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
