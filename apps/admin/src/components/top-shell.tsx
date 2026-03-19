"use client";

import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  CalendarRange,
  ImageIcon,
  LayoutDashboard,
  MonitorSmartphone,
  Rocket,
  Search,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/screens", label: "Devices", icon: MonitorSmartphone },
  { href: "/media", label: "Media", icon: ImageIcon },
  { href: "/playlists", label: "Playlists", icon: Rocket },
  { href: "/schedules", label: "Schedules", icon: CalendarRange },
  { href: "/releases", label: "Releases", icon: Rocket },
  { href: "/team", label: "Team", icon: Users },
];

const clerkAppearance = {
  variables: {
    colorPrimary: "#8dacff",
    colorBackground: "#111417",
    colorText: "#f9f9fd",
    colorTextSecondary: "#aaabaf",
    colorInputBackground: "#1d2024",
    colorInputText: "#f9f9fd",
    colorNeutral: "#f9f9fd",
    fontFamily: "var(--font-sans)",
    borderRadius: "8px",
    fontSize: "14px",
  },
} as const;

export function TopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r border-sidebar-border bg-card md:flex">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md bg-accent text-xs font-semibold text-foreground">
              DC
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">Digital Curator</div>
              <div className="truncate text-xs text-muted-foreground">Media manager</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-3">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-foreground"
                      : "text-foreground/80 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <Link
            href="/media"
            className="flex h-9 items-center rounded-md px-3 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
          >
            Open media library
          </Link>
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 border-b border-sidebar-border bg-background md:left-60">
        <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3 md:hidden">
            <div className="flex size-8 items-center justify-center rounded-md bg-accent text-xs font-semibold text-foreground">
              DC
            </div>
            <span className="truncate text-sm font-medium text-foreground">Digital Curator</span>
          </Link>

          <div className="hidden max-w-xl flex-1 items-center gap-2 rounded-md border border-input bg-card px-3 md:flex">
            <Search className="size-4 text-muted-foreground" />
            <input
              aria-label="Search"
              className="h-9 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Search media, playlists, devices, or schedules"
              type="search"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:block">
              <OrganizationSwitcher
                afterCreateOrganizationUrl="/dashboard"
                afterLeaveOrganizationUrl="/"
                afterSelectOrganizationUrl="/dashboard"
                hidePersonal
                appearance={clerkAppearance}
              />
            </div>
            <UserButton afterSignOutUrl="/" appearance={clerkAppearance} />
          </div>
        </div>

        <div className="border-t border-sidebar-border md:hidden">
          <nav className="flex gap-1 overflow-x-auto px-2 py-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="pt-[6.5rem] md:pl-60 md:pt-14">
        <div className="flex min-h-[calc(100vh-3.5rem)] w-full flex-col gap-6 px-4 py-6 sm:px-6 md:px-6">
          {children}
        </div>
      </main>
    </div>
  );
}
