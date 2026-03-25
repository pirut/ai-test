import { Mail, MessageSquare, Activity } from "lucide-react";

import { ContactForm } from "@/components/marketing/contact-form";
import { buildMarketingMetadata, siteConfig } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Contact",
  description: "Get in touch with the Screen team.",
  path: "/contact",
});

const channels = [
  {
    icon: Mail,
    label: "Sales",
    value: siteConfig.salesEmail,
    href: `mailto:${siteConfig.salesEmail}`,
  },
  {
    icon: MessageSquare,
    label: "Support",
    value: siteConfig.supportEmail,
    href: `mailto:${siteConfig.supportEmail}`,
  },
  {
    icon: Activity,
    label: "System status",
    value: "Status page",
    href: siteConfig.statusPageUrl,
    external: true,
  },
];

export default function ContactPage() {
  return (
    <section className="px-6 py-16 sm:py-24">
      <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[1fr_400px]">
        <div>
          <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
            Get in touch
          </h1>
          <p className="mt-4 max-w-md text-[0.95rem] leading-7 text-[#8d93a6]">
            Questions about setup, billing, or anything else? Send us a message
            and we&apos;ll get back to you by email.
          </p>

          <div className="mt-8 space-y-2">
            {channels.map((ch) => (
              <a
                key={ch.label}
                href={ch.href}
                target={ch.external ? "_blank" : undefined}
                rel={ch.external ? "noreferrer" : undefined}
                className="flex items-center gap-3 rounded-xl border border-white/6 bg-[#0c0e11] px-4 py-3 transition-colors hover:border-white/10"
              >
                <ch.icon className="size-4 shrink-0 text-[#9bb6ff]" />
                <div>
                  <div className="text-[0.7rem] uppercase tracking-[0.1em] text-[#6b7280]">
                    {ch.label}
                  </div>
                  <div className="text-[0.8rem] font-medium text-white">
                    {ch.value}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/6 bg-[#0c0e11] p-6">
          <h2 className="text-[0.9rem] font-semibold text-white">
            Send a message
          </h2>
          <p className="mt-1 text-[0.75rem] text-[#6b7280]">
            We typically respond within a business day.
          </p>
          <div className="mt-5">
            <ContactForm />
          </div>
        </div>
      </div>
    </section>
  );
}
