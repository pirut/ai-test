import Link from "next/link";

import { siteConfig } from "@/lib/site";

const footerLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
  { href: "/getting-started", label: "Getting Started" },
  { href: "/legal", label: "Legal" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/acceptable-use", label: "Acceptable Use" },
  { href: "/dpa", label: "DPA" },
  { href: "/cookie-policy", label: "Cookie Policy" },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-white/6 bg-[#090b0d] py-10">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-[minmax(0,1fr)_1.2fr]">
        <div className="space-y-3">
          <div className="text-lg font-bold text-white">{siteConfig.name}</div>
          <p className="max-w-md text-sm leading-7 text-[#b3b7c5]">
            {siteConfig.description}
          </p>
          <div className="text-sm text-[#8d93a6]">
            {siteConfig.companyName}
            <br />
            {siteConfig.companyAddress}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-[#c5cad8]">
            <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
            <a href={`mailto:${siteConfig.legalEmail}`}>{siteConfig.legalEmail}</a>
            <a href={siteConfig.statusPageUrl} target="_blank" rel="noreferrer">
              System status
            </a>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {footerLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-[#c5cad8] transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
