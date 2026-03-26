import Link from "next/link";
import { buildMarketingMetadata } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Legal",
  description: "Legal and compliance pages for Screen.",
  path: "/legal",
});

const pages = [
  ["/terms", "Terms of Service"],
  ["/privacy", "Privacy Policy"],
  ["/acceptable-use", "Acceptable Use Policy"],
  ["/dpa", "Data Processing Addendum"],
  ["/cookie-policy", "Cookie Policy"],
];

export default function LegalHubPage() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">Legal</div>
        <h1 className="mt-4 text-5xl font-black tracking-[-0.05em] text-white">
          The compliance surface buyers expect.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-[#c5cad8]">
          These pages are productized, versioned, and linked from the footer so the SaaS
          experience is no longer missing basic legal and trust context.
        </p>
        <div className="mt-12 grid gap-4">
          {pages.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-[22px] border border-white/8 bg-[#11151b] px-5 py-4 text-sm text-white transition-colors hover:bg-white/5"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
