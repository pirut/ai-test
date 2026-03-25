import Link from "next/link";
import { Monitor } from "lucide-react";

import { PublicMobileNav } from "@/components/marketing/public-mobile-nav";
import { siteConfig } from "@/lib/site";

const navItems = [
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
  { href: "/getting-started", label: "Docs" },
  { href: "/contact", label: "Contact" },
];

export function PublicNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/6 bg-[#0c0e11]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#b9ccff_0%,#7aa1ff_100%)]">
            <Monitor className="size-4 text-[#082354]" />
          </div>
          <span className="text-[0.9rem] font-bold tracking-tight">
            {siteConfig.name}
          </span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[0.8rem] font-medium text-[#8d93a6] transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <PublicMobileNav navItems={navItems} title={siteConfig.name} />
          <Link
            href="/sign-in"
            className="hidden text-[0.8rem] font-medium text-[#8d93a6] transition-colors hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-white px-4 text-[0.8rem] font-semibold text-[#0c0e11] transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}
