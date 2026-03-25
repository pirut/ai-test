import Script from "next/script";

import { PricingShowcase } from "@/components/marketing/pricing-showcase";
import { buildMarketingMetadata } from "@/lib/site";

const pricingFaqs = [
  {
    question: "Can I try it without a credit card?",
    answer:
      "Yes. Every workspace starts with a 14-day trial and up to three claimed screens. No card required.",
  },
  {
    question: "How does screen-based billing work?",
    answer:
      "Each plan includes a base number of screens. Additional claimed screens bill at the plan's per-screen rate. Archive a device to stop billing it.",
  },
  {
    question: "What happens when I archive a device?",
    answer:
      "It stops counting toward your bill immediately. History and screenshots are preserved.",
  },
];

export const metadata = buildMarketingMetadata({
  title: "Pricing",
  description:
    "Simple, transparent pricing for Screen. Monthly and annual plans starting at $99.",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <section className="px-6 py-16 sm:py-24">
      <Script
        id="pricing-faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: pricingFaqs.map((entry) => ({
              "@type": "Question",
              name: entry.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: entry.answer,
              },
            })),
          }),
        }}
      />

      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
            Simple, predictable pricing
          </h1>
          <p className="mt-4 text-[0.95rem] leading-7 text-[#8d93a6]">
            Start with a free trial. Pick a plan when you&apos;re ready. Scale
            by adding screens.
          </p>
        </div>

        {/* Pricing toggle + grid */}
        <div className="mt-12">
          <PricingShowcase />
        </div>

        {/* Billing notes */}
        <div className="mx-auto mt-14 grid max-w-4xl gap-3 sm:grid-cols-3">
          {[
            "Annual billing saves 15% compared to monthly.",
            "You only pay for claimed, non-archived screens.",
            "If billing lapses, existing content keeps playing for 30 days.",
          ].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-white/6 bg-[#0c0e11] px-4 py-3 text-[0.8rem] leading-6 text-[#8d93a6]"
            >
              {item}
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="mx-auto mt-16 max-w-2xl">
          <h2 className="text-center text-2xl font-black tracking-[-0.03em] text-white">
            Pricing FAQ
          </h2>
          <div className="mt-8 space-y-3">
            {pricingFaqs.map((entry) => (
              <article
                key={entry.question}
                className="rounded-xl border border-white/6 bg-[#0c0e11]/80 px-5 py-4"
              >
                <h3 className="text-[0.9rem] font-semibold text-white">
                  {entry.question}
                </h3>
                <p className="mt-1.5 text-[0.8rem] leading-6 text-[#8d93a6]">
                  {entry.answer}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
