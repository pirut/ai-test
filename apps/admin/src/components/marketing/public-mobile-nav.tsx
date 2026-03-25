"use client";

import Link from "next/link";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type NavItem = {
  href: string;
  label: string;
};

export function PublicMobileNav({
  navItems,
  title,
}: {
  navItems: NavItem[];
  title: string;
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="border border-white/8 text-white md:hidden"
          />
        }
      >
        <Menu className="size-4" />
        <span className="sr-only">Open navigation</span>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[82vw] border-white/10 bg-[#0d1016] px-0 text-white sm:max-w-sm"
      >
        <SheetHeader className="border-b border-white/8 px-5 py-5">
          <SheetTitle className="text-white">{title}</SheetTitle>
          <SheetDescription className="text-[#aeb8d2]">
            Navigate the public product, pricing, and launch resources.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 p-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/8"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/sign-in"
            className="rounded-2xl border border-white/8 px-4 py-3 text-sm font-medium text-[#d2dcf7] transition-colors hover:bg-white/5"
          >
            Sign in
          </Link>
          <Link
            href="/pricing"
            className="rounded-2xl bg-[linear-gradient(135deg,#b9ccff_0%,#7aa1ff_100%)] px-4 py-3 text-sm font-semibold text-[#082354]"
          >
            Start trial
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
