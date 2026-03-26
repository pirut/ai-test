import Script from "next/script";

import { PricingShowcase } from "@/components/marketing/pricing-showcase";
import { buildMarketingMetadata } from "@/lib/site";

const pricingFaqs = [
  {
    question: "Can I start without a credit card?",
    answer: "Yes. Every workspace starts with a 14-day trial and up to three claimed screens.",
  },
  {
    question: "How do extra screens get billed?",
    answer:
      "Each plan includes a base number of screens, and any additional claimed screens bill at that plan's overage rate.",
  },
  {
    question: "Do archived devices still count?",
    answer: "No. Archive a device to remove it from billable screen counts while keeping its history.",
  },
];

export const metadata = buildMarketingMetadata({
  title: "Pricing",
  description: "Transparent monthly and annual pricing for Screen digital signage SaaS.",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <section className="px-6 py-20">
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
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">Pricing</div>
          <h1 className="mt-4 text-5xl font-black tracking-[-0.05em] text-white">
            Base platform fee plus predictable per-screen growth.
          </h1>
          <p className="mt-6 text-base leading-8 text-[#c5cad8]">
            Start with a 14-day trial, claim up to three screens before checkout, then
            pick the plan that matches your fleet size and retention needs.
          </p>
        </div>

        <div className="mt-12">
          <PricingShowcase />
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {[
            "Annual billing is 15% lower than month-to-month pricing.",
            "Billable screens are claimed, non-archived devices attached to a workspace.",
            "Expired or unpaid workspaces become read-only, but existing manifests continue for 30 days.",
          ].map((item) => (
            <div
              key={item}
              className="rounded-[22px] border border-white/8 bg-[#11151b] p-5 text-sm leading-7 text-[#d6daea]"
            >
              {item}
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-4">
          {pricingFaqs.map((entry) => (
            <article key={entry.question} className="rounded-[22px] border border-white/8 bg-[#11151b] p-5">
              <h2 className="text-lg font-semibold text-white">{entry.question}</h2>
              <p className="mt-3 text-sm leading-7 text-[#d6daea]">{entry.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
