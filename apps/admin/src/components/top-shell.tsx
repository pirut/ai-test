"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  CalendarRange,
  ImageIcon,
  LayoutDashboard,
  MonitorSmartphone,
  Package2,
  PlaySquare,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navGroups = [
  {
    label: "Fleet",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/screens", label: "Screens", icon: MonitorSmartphone },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/media", label: "Media", icon: ImageIcon },
      { href: "/playlists", label: "Playlists", icon: PlaySquare },
      { href: "/schedules", label: "Schedules", icon: CalendarRange },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/releases", label: "Releases", icon: Package2 },
      { href: "/team", label: "Team", icon: Users },
    ],
  },
];
const navItems = navGroups.flatMap((group) => group.items);

export type FleetPulse = { total: number; online: number; attention: number };

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

export function TopShell({
  children,
  authEnabled,
  fleetPulse,
}: {
  children: React.ReactNode;
  authEnabled: boolean;
  fleetPulse: FleetPulse | null;
}) {
  const pathname = usePathname();
  const currentSection = navItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  ) ?? navItems[0];

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3.25rem",
        } as React.CSSProperties
      }
    >
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Digital Curator"
                render={<Link href="/dashboard" />}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                  DC
                </span>
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Digital Curator</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">Fleet operations</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;
                    const attention = item.href === "/screens" ? fleetPulse?.attention ?? 0 : 0;

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={isActive}
                          render={<Link href={item.href} />}
                          tooltip={item.label}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                        {attention > 0 ? (
                          <SidebarMenuBadge
                            aria-label={`${attention} screens need attention`}
                            className="bg-amber-400/15 text-amber-300 peer-hover/menu-button:text-amber-300 peer-data-active/menu-button:text-amber-300"
                          >
                            {attention}
                          </SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        {fleetPulse ? (
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  tooltip={fleetPulseLabel(fleetPulse)}
                  render={<Link href={fleetPulse.attention ? "/screens?view=attention" : "/screens"} />}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
                    <span
                      className={
                        fleetPulse.attention
                          ? "size-2 rounded-full bg-amber-400"
                          : "size-2 rounded-full bg-emerald-400 motion-safe:animate-[pulse-dot_2s_ease-in-out_infinite]"
                      }
                    />
                  </span>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate text-xs font-medium">
                      {fleetPulse.online} of {fleetPulse.total} screens online
                    </span>
                    <span className="truncate text-xs text-sidebar-foreground/60">
                      {fleetPulse.attention
                        ? `${fleetPulse.attention} need${fleetPulse.attention === 1 ? "s" : ""} attention`
                        : "Everything looks good"}
                    </span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        ) : null}
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-svh">
        <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur-sm">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6 lg:px-8">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mx-1 h-4" />
            <span className="truncate text-sm font-medium">{currentSection.label}</span>

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
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
                <Badge variant="outline">Local demo</Badge>
              )}
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function fleetPulseLabel(pulse: FleetPulse) {
  return pulse.attention
    ? `${pulse.attention} of ${pulse.total} screens need attention`
    : `${pulse.online} of ${pulse.total} screens online`;
}
