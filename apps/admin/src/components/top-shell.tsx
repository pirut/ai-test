"use client";

import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  CalendarRange,
  CircleCheck,
  ImageIcon,
  LayoutDashboard,
  Menu,
  MonitorSmartphone,
  Package2,
  PlaySquare,
  Settings2,
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
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/screens", label: "Screens", icon: MonitorSmartphone },
  { href: "/media", label: "Media", icon: ImageIcon },
  { href: "/playlists", label: "Playlists", icon: PlaySquare },
  { href: "/schedules", label: "Schedules", icon: CalendarRange },
  { href: "/releases", label: "Releases", icon: Package2 },
  { href: "/team", label: "Team", icon: Users },
];

const clerkAppearance = {
  variables: {
    colorPrimary: "#295dff",
    colorBackground: "#ffffff",
    colorText: "#111827",
    colorTextSecondary: "#697386",
    colorInputBackground: "#f4f6f8",
    colorInputText: "#111827",
    colorNeutral: "#111827",
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
    <SidebarProvider className="dashboard-theme">
      <Sidebar className="w-60">
        <SidebarHeader className="px-5 py-5">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white shadow-sm">
              DC
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-sidebar-foreground">Digital Curator</div>
              <div className="truncate text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/45">
                Fleet operations
              </div>
            </div>
          </Link>

        </SidebarHeader>

        <SidebarContent>
          <div>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">
              Workspace
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

        <SidebarFooter className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-2 rounded-lg bg-white/[0.045] px-3 py-2.5">
            <CircleCheck className="size-4 text-emerald-400" />
            <div>
              <p className="text-xs font-medium text-sidebar-foreground">Control plane online</p>
              <p className="mt-0.5 text-[10px] text-sidebar-foreground/45">Monitoring fleet</p>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <SidebarTrigger className="md:hidden">
              <Menu className="size-4" />
              <span className="sr-only">Open navigation</span>
            </SidebarTrigger>

            <Link href="/dashboard" className="mr-1 flex size-8 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-white md:hidden">DC</Link>
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
              <CurrentIcon className="hidden size-4 text-primary sm:block" />
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
                <span className="rounded-md border border-warning/20 bg-warning/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning">
                  Local demo
                </span>
              )}
            </div>
          </div>

        </header>

        <main className="flex-1">
          <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1500px] flex-col gap-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
            {children}
          </div>
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
          {[
            { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
            { href: "/screens", label: "Screens", icon: MonitorSmartphone },
            { href: "/media", label: "Media", icon: ImageIcon },
            { href: "/playlists", label: "More", icon: Settings2 },
          ].map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link key={item.label} href={item.href} className={`flex flex-col items-center gap-1 rounded-md py-1 text-[10px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SidebarInset>
    </SidebarProvider>
  );
}
