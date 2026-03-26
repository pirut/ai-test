import { buildMarketingMetadata } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Getting Started",
  description: "Provision a Raspberry Pi and connect it to Screen.",
  path: "/getting-started",
});

const steps = [
  "Install the admin app, create an organization, and start the 14-day trial.",
  "Build or flash the Raspberry Pi image from the repo’s `infra/pi-image` workflow.",
  "Boot the Pi, connect it to Wi-Fi if needed, and wait for the claim code screen.",
  "Claim the device in the dashboard, upload media, and assign a default playlist.",
  "Verify screenshots and heartbeats from the dashboard after the first deployment.",
];

const prerequisites = [
  "A Raspberry Pi you control",
  "The repo's `infra/pi-image` workflow or a prebuilt image",
  "A browser session for the admin workspace",
  "Network access for the screen to reach the hosted control plane",
];

export default function GettingStartedPage() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">Getting Started</div>
        <h1 className="mt-4 text-5xl font-black tracking-[-0.05em] text-white">
          Provision the hardware, then let the SaaS take over.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-[#c5cad8]">
          Screen remains software-only. Customers manage their own Raspberry Pi hardware while
          the hosted product handles control, schedules, releases, screenshots, and billing.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {prerequisites.map((item) => (
            <div
              key={item}
              className="rounded-[20px] border border-white/8 bg-[#11151b] px-4 py-3 text-sm text-[#d6daea]"
            >
              {item}
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-4">
          {steps.map((step, index) => (
            <div key={step} className="rounded-[22px] border border-white/8 bg-[#11151b] p-5">
              <div className="text-3xl font-black text-[#9bb6ff]/20">0{index + 1}</div>
              <p className="mt-3 text-sm leading-7 text-[#d6daea]">{step}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
