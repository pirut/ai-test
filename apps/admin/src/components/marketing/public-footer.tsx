import Link from "next/link";

import { siteConfig } from "@/lib/site";

const productLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
  { href: "/getting-started", label: "Getting started" },
  { href: "/contact", label: "Contact" },
  { href: "/status", label: "System status" },
];

const legalLinks = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/dpa", label: "DPA" },
  { href: "/acceptable-use", label: "Acceptable use" },
  { href: "/cookie-policy", label: "Cookies" },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-white/6 bg-[#090b0d]">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="text-sm font-bold text-white">{siteConfig.name}</div>
            <p className="mt-2 max-w-sm text-[0.8rem] leading-6 text-[#6b7280]">
              {siteConfig.tagline}
            </p>
          </div>

          {/* Product */}
          <div>
            <div className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#6b7280]">
              Product
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {productLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-[0.8rem] text-[#9ca3af] transition-colors hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Legal */}
          <div>
            <div className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#6b7280]">
              Legal
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {legalLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-[0.8rem] text-[#9ca3af] transition-colors hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col justify-between gap-4 border-t border-white/6 pt-6 sm:flex-row sm:items-center">
          <div className="text-[0.75rem] text-[#6b7280]">
            {siteConfig.companyName}
          </div>
          <div className="flex gap-4 text-[0.75rem] text-[#6b7280]">
            <a href={`mailto:${siteConfig.supportEmail}`} className="hover:text-white">
              {siteConfig.supportEmail}
            </a>
            <Link href="/status" className="hover:text-white">
              Status
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
