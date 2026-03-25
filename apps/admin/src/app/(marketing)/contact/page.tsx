import { ContactForm } from "@/components/marketing/contact-form";
import { buildMarketingMetadata, siteConfig } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Contact",
  description: "Contact Screen sales or support.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">Contact</div>
          <h1 className="mt-4 text-5xl font-black tracking-[-0.05em] text-white">
            Reach the team without going through an enterprise funnel.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[#c5cad8]">
            Use this form for onboarding questions, billing help, and support requests.
            The route is wired to Resend so the page is part of the actual SaaS surface.
          </p>
          <div className="mt-10 grid gap-3 text-sm text-[#d6daea]">
            {[
              ["Sales", siteConfig.salesEmail, `mailto:${siteConfig.salesEmail}`],
              ["Support", siteConfig.supportEmail, `mailto:${siteConfig.supportEmail}`],
              ["Status", siteConfig.statusPageUrl, siteConfig.statusPageUrl],
            ].map(([label, value, href]) => (
              <a
                key={label}
                href={href}
                target={String(href).startsWith("http") ? "_blank" : undefined}
                rel={String(href).startsWith("http") ? "noreferrer" : undefined}
                className="rounded-[20px] border border-white/8 bg-[#11151b] px-5 py-4 transition-colors hover:bg-white/5"
              >
                <div className="text-[11px] uppercase tracking-[0.16em] text-[#9bb6ff]">
                  {label}
                </div>
                <div className="mt-2 text-sm font-medium text-white">{value}</div>
              </a>
            ))}
          </div>
        </div>
        <div className="rounded-[28px] border border-white/8 bg-[#11151b] p-6">
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
