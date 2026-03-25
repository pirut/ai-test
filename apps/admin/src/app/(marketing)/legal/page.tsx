import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";

import { buildMarketingMetadata } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Legal",
  description: "Legal and compliance documents for Screen.",
  path: "/legal",
});

const pages = [
  {
    href: "/terms",
    title: "Terms of Service",
    description: "What you agree to when using the platform.",
  },
  {
    href: "/privacy",
    title: "Privacy Policy",
    description: "What we collect, why, and how to reach us.",
  },
  {
    href: "/acceptable-use",
    title: "Acceptable Use Policy",
    description: "Rules of the road for using the service.",
  },
  {
    href: "/dpa",
    title: "Data Processing Addendum",
    description: "How we handle data as a processor.",
  },
  {
    href: "/cookie-policy",
    title: "Cookie Policy",
    description: "Our current cookie posture.",
  },
];

export default function LegalHubPage() {
  return (
    <section className="px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
            Legal
          </h1>
          <p className="mt-4 text-[0.95rem] leading-7 text-[#8d93a6]">
            All compliance and policy documents in one place.
          </p>
        </div>

        <div className="mt-12 space-y-2">
          {pages.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="group flex items-center justify-between rounded-xl border border-white/6 bg-[#0c0e11] px-5 py-4 transition-colors hover:border-white/10"
            >
              <div className="flex items-center gap-3">
                <FileText className="size-4 shrink-0 text-[#7f8aa6]" />
                <div>
                  <div className="text-[0.9rem] font-semibold text-white">
                    {page.title}
                  </div>
                  <div className="text-[0.75rem] text-[#6b7280]">
                    {page.description}
                  </div>
                </div>
              </div>
              <ArrowRight className="size-4 text-[#6b7280] transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
