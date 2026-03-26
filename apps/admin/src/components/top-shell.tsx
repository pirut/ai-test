"use client";

import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  ChevronRight,
  CalendarRange,
  ImageIcon,
  LayoutDashboard,
  Menu,
  MonitorSmartphone,
  Package2,
  PlaySquare,
  Search,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/screens", label: "Devices", icon: MonitorSmartphone },
  { href: "/media", label: "Media", icon: ImageIcon },
  { href: "/playlists", label: "Playlists", icon: PlaySquare },
  { href: "/schedules", label: "Schedules", icon: CalendarRange },
  { href: "/releases", label: "Releases", icon: Package2 },
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
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="space-y-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-accent text-sm font-semibold text-sidebar-accent-foreground">
              DC
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-sidebar-foreground">Digital Curator</div>
              <div className="truncate text-xs uppercase tracking-[0.24em] text-sidebar-foreground/50">
                Showroom control
              </div>
            </div>
          </Link>

          <div className="rounded-xl border border-sidebar-border bg-background/30 p-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-sidebar-foreground/45">
              Workspace
            </div>
            <div className="mt-2 text-sm text-sidebar-foreground/80">
              Manage screens, playlists, and campaign media from one control surface.
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-6">
          <div>
            <div className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.24em] text-sidebar-foreground/40">
              Navigation
            </div>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      render={<Link href={item.href} />}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </div>

          <div className="rounded-xl border border-sidebar-border bg-background/20 p-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-sidebar-foreground/40">
              Library
            </div>
            <Link
              className="mt-3 flex items-center justify-between rounded-lg px-2 py-2 text-sm text-sidebar-foreground/78 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              href="/media"
            >
              <span>Open media workspace</span>
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </SidebarContent>

        <SidebarFooter>
          <div className="rounded-xl border border-sidebar-border bg-background/20 p-3 text-xs text-sidebar-foreground/58">
            Sidebar navigation now stays persistent on desktop and moves into a sheet on smaller screens.
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-30 border-b border-sidebar-border bg-background/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <SidebarTrigger className="md:hidden">
              <Menu className="size-4" />
              <span className="sr-only">Open navigation</span>
            </SidebarTrigger>

            <div className="hidden max-w-xl flex-1 items-center gap-2 rounded-xl border border-input bg-card px-3 md:flex">
              <Search className="size-4 text-muted-foreground" />
              <Input
                aria-label="Search"
                className="border-0 bg-transparent px-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
                placeholder="Search media, playlists, devices, or schedules"
                type="search"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="hidden lg:block">
                <OrganizationSwitcher
                  afterCreateOrganizationUrl="/dashboard"
                  afterLeaveOrganizationUrl="/"
                  afterSelectOrganizationUrl="/dashboard"
                  appearance={clerkAppearance}
                  hidePersonal
                />
              </div>
              <UserButton afterSignOutUrl="/" appearance={clerkAppearance} />
            </div>
          </div>

          <div className="border-t border-sidebar-border/80">
            <nav className="flex gap-2 overflow-x-auto px-4 py-3 sm:px-6">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;

                return (
                  <Link
                    key={`top-nav-${item.href}`}
                    href={item.href}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
                      isActive
                        ? "border-foreground/18 bg-accent text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        <main className="flex-1">
          <div className="flex min-h-[calc(100vh-3.5rem)] w-full flex-col gap-6 px-4 py-6 sm:px-6">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
