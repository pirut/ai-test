import { Shield, Lock, Database, Upload, Webhook } from "lucide-react";

import { buildMarketingMetadata } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Security",
  description: "How Screen protects your data, devices, and workflows.",
  path: "/security",
});

const securityPoints = [
  {
    icon: Lock,
    title: "Role-based access",
    description:
      "Workspace access is scoped through organizations with role-aware admin checks. Only org admins can modify fleet settings.",
  },
  {
    icon: Shield,
    title: "Credential rotation",
    description:
      "Device credentials are hashed and rotated automatically. No long-lived plaintext secrets in the database.",
  },
  {
    icon: Database,
    title: "Org-scoped data",
    description:
      "All operational data, billing state, and media metadata are isolated per organization with explicit scoping.",
  },
  {
    icon: Upload,
    title: "Signed uploads",
    description:
      "File uploads use signed URLs. Screenshots auto-expire based on your plan's retention window.",
  },
  {
    icon: Webhook,
    title: "Verified webhooks",
    description:
      "Billing and webhook endpoints are signature-verified, isolated from the admin surface, and monitored with Sentry.",
  },
];

export default function SecurityPage() {
  return (
    <section className="px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
            Security
          </h1>
          <p className="mt-4 text-[0.95rem] leading-7 text-[#8d93a6]">
            How we protect your workspace, devices, and data at every layer.
          </p>
        </div>

        {/* Security points */}
        <div className="mt-14 space-y-3">
          {securityPoints.map((point) => (
            <div
              key={point.title}
              className="flex gap-4 rounded-xl border border-white/6 bg-[#0c0e11] p-5"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/6 bg-white/[0.03]">
                <point.icon className="size-4 text-[#9bb6ff]" />
              </div>
              <div>
                <h2 className="text-[0.9rem] font-semibold text-white">
                  {point.title}
                </h2>
                <p className="mt-1 text-[0.8rem] leading-6 text-[#8d93a6]">
                  {point.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
