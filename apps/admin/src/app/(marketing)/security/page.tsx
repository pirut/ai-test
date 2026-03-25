import { buildMarketingMetadata } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Security",
  description: "Security overview for Screen.",
  path: "/security",
});

const securityPoints = [
  "Workspace access is scoped through Clerk Organizations and role-aware admin checks.",
  "Device credentials are hashed and rotated instead of keeping long-lived plaintext secrets in the database.",
  "Operational events, billing state, and media metadata live in Convex with explicit org scoping.",
  "Uploads use signed URLs and screenshots can expire automatically based on plan retention.",
  "Public billing and webhook endpoints are signature-verified, isolated from the protected admin surface, and monitored with Sentry.",
];

export default function SecurityPage() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">Security</div>
        <h1 className="mt-4 text-5xl font-black tracking-[-0.05em] text-white">
          Security for a product that is finally public.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-[#c5cad8]">
          Screen is built from the existing multi-tenant showroom stack. This page makes the
          trust posture explicit instead of leaving buyers to infer it from a private dashboard.
        </p>

        <div className="mt-12 grid gap-4">
          {securityPoints.map((item) => (
            <div key={item} className="rounded-[22px] border border-white/8 bg-[#11151b] p-5 text-sm leading-7 text-[#d6daea]">
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
