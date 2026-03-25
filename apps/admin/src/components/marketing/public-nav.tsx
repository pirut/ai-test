import Link from "next/link";

import { PublicMobileNav } from "@/components/marketing/public-mobile-nav";
import { siteConfig } from "@/lib/site";

const navItems = [
  { href: "/", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
  { href: "/getting-started", label: "Getting Started" },
  { href: "/contact", label: "Contact" },
];

export function PublicNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/6 bg-[#0c0e11]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="flex items-center gap-3 text-white">
          <div className="flex size-10 items-center justify-center rounded-xl bg-white text-sm font-black text-[#0c0e11]">
            S
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">{siteConfig.name}</div>
            <div className="text-[11px] text-[#9ca3b7]">Self-serve signage SaaS</div>
          </div>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium tracking-tight text-[#c5cad8] transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <PublicMobileNav navItems={navItems} title={siteConfig.name} />
          <Link
            href="/sign-in"
            className="hidden text-sm font-medium tracking-tight text-[#c5cad8] transition-colors hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#b9ccff_0%,#7aa1ff_100%)] px-4 text-sm font-semibold text-[#082354] shadow-[0_12px_30px_rgba(94,138,255,0.25)] transition-transform active:scale-[0.98]"
          >
            Start trial
          </Link>
        </div>
      </div>
    </nav>
  );
}
