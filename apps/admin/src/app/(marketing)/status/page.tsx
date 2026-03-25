import { buildMarketingMetadata, siteConfig } from "@/lib/site";
import { StatusDashboard } from "@/components/marketing/status-dashboard";

export const metadata = buildMarketingMetadata({
  title: "System Status",
  description: `Real-time status of ${siteConfig.name} services and infrastructure.`,
  path: "/status",
});

export default function StatusPage() {
  return (
    <section className="px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
            System Status
          </h1>
          <p className="mt-4 text-[0.95rem] leading-7 text-[#8d93a6]">
            Real-time health of {siteConfig.name} services.
          </p>
        </div>

        {/* Status dashboard */}
        <div className="mt-12">
          <StatusDashboard />
        </div>
      </div>
    </section>
  );
}
