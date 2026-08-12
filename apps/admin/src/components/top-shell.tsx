"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  CalendarRange,
  CircleCheck,
  ImageIcon,
  LayoutDashboard,
  MonitorSmartphone,
  Package2,
  PlaySquare,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
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

  return (
    <SidebarProvider
      className="dashboard-theme"
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
                isActive
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
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;

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
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip="Control plane online">
                <CircleCheck className="text-signal" />
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-xs font-medium">Control plane online</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">Monitoring fleet</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-svh">
        <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur-sm">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6 lg:px-8">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mx-1 h-4" />
            <span className="truncate text-sm font-medium">{currentSection.label}</span>

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
