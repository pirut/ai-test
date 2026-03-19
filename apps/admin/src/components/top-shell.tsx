"use client";

import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  Bell,
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
    borderRadius: "10px",
    fontSize: "14px",
  },
} as const;

export function TopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-background/95 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:pl-[18rem] lg:pr-10">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-3 lg:hidden">
              <div className="flex size-8 items-center justify-center rounded-md bg-[linear-gradient(135deg,#296cf0,#8dacff)] text-[11px] font-bold text-primary-foreground">
                DC
              </div>
              <div className="min-w-0">
                <p className="font-heading truncate text-sm font-bold text-foreground">
                  Digital Curator
                </p>
                <p className="truncate text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Media manager
                </p>
              </div>
            </Link>

            <div className="hidden max-w-xl flex-1 items-center gap-2 rounded-lg bg-card px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ring-1 ring-white/6 md:flex">
              <Search className="size-4 text-muted-foreground" />
              <input
                aria-label="Search"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="Search assets, devices, playlists, or schedules..."
                type="search"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              aria-label="Notifications"
              className="hidden size-9 items-center justify-center rounded-md border border-white/6 bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:inline-flex"
              type="button"
            >
              <Bell className="size-4" />
            </button>
            <div className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary lg:flex">
              <span className="size-2 rounded-full bg-primary shadow-[0_0_10px_rgba(141,172,255,0.65)]" />
              Operational
            </div>
            <div className="lg:hidden">
              <UserButton afterSignOutUrl="/" appearance={clerkAppearance} />
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 lg:hidden">
          <nav className="flex gap-1 overflow-x-auto px-2 py-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors",
                    isActive
                      ? "bg-accent text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar/90 px-4 py-6 backdrop-blur-xl lg:flex">
        <Link href="/dashboard" className="flex items-start gap-3 px-2 pb-8 pt-1">
          <div className="flex size-10 items-center justify-center rounded-md bg-[linear-gradient(135deg,#296cf0,#8dacff)] text-[12px] font-bold text-primary-foreground">
            DC
          </div>
          <div>
            <p className="font-heading text-base font-bold text-foreground">Digital Curator</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Media manager
            </p>
          </div>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors",
                  isActive
                    ? "border-l-2 border-primary bg-accent text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-white/6 bg-card p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Workspace
            </p>
            <OrganizationSwitcher
              afterCreateOrganizationUrl="/dashboard"
              afterLeaveOrganizationUrl="/"
              afterSelectOrganizationUrl="/dashboard"
              hidePersonal
              appearance={clerkAppearance}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/6 bg-card px-3 py-2.5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Account
              </p>
              <p className="mt-1 text-sm text-foreground">Signed in</p>
            </div>
            <UserButton afterSignOutUrl="/" appearance={clerkAppearance} />
          </div>
        </div>
      </aside>

      <main className="pt-[7.25rem] lg:pl-64 lg:pt-16">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1600px] flex-col gap-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
