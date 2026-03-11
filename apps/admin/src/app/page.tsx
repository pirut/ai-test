import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="landing">
      <section className="landingHero">
        <p className="eyebrow">Showroom signage stack</p>
        <h1>
          Own the <span>screen</span> room.
        </h1>
        <p>
          Deploy Raspberry Pi players, assign scheduled media, verify playback
          with screenshots, and control devices remotely — without exposing them
          to inbound network traffic.
        </p>
        <div className="landingActions">
          <Link className="primaryButton" href="/dashboard">
            Open control room
          </Link>
          <Link className="secondaryButton" href="/sign-in">
            Sign in
          </Link>
        </div>
      </section>

      <aside className="landingCard">
        <p className="eyebrow">What ships in v1</p>
        <ul>
          <li>Clerk team access with organization scoping</li>
          <li>Device claim flow and rotating credentials</li>
          <li>Media library, playlists, and daypart schedules</li>
          <li>Live heartbeats, screenshots, and remote commands</li>
          <li>Offline-capable playback from cached manifests</li>
        </ul>
      </aside>
    </main>
  );
}
