"use client";

import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  CalendarRange,
  ImageIcon,
  LayoutDashboard,
  Menu,
  MonitorSmartphone,
  Package2,
  PlaySquare,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";

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
    fontFamily: "var(--font-app-sans)",
    borderRadius: "8px",
    fontSize: "14px",
  },
} as const;

export function TopShell({ children, authEnabled }: { children: React.ReactNode; authEnabled: boolean }) {
  const pathname = usePathname();
  const currentSection = navItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  ) ?? navItems[0];
  const CurrentIcon = currentSection.icon;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="pb-5">
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

        </SidebarHeader>

        <SidebarContent>
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

        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border pt-3">
          <p className="px-2 text-xs leading-5 text-sidebar-foreground/50">
            Content control for every connected showroom screen.
          </p>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-30 border-b border-sidebar-border bg-background/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <SidebarTrigger className="md:hidden">
              <Menu className="size-4" />
              <span className="sr-only">Open navigation</span>
            </SidebarTrigger>

            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
              <CurrentIcon className="size-4 text-primary" />
              <span className="truncate">{currentSection.label}</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {authEnabled ? (
                <>
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
                </>
              ) : (
                <span className="rounded-full border border-warning/20 bg-warning/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">
                  Local demo
                </span>
              )}
            </div>
          </div>

        </header>

        <main className="flex-1">
          <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
