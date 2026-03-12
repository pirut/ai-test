"use client";

import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="size-[15px] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.25" />
        <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.25" />
        <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.25" />
        <rect x="9" y="9" width="5.5" height="5.5" rx="1.25" />
      </svg>
    ),
  },
  {
    href: "/screens",
    label: "Screens",
    icon: (
      <svg className="size-[15px] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="1" y="2" width="14" height="9" rx="1.5" />
        <path d="M5.5 14h5M8 11v3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/media",
    label: "Media",
    icon: (
      <svg className="size-[15px] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="1" y="1" width="14" height="14" rx="2" />
        <path d="M6.5 5.5l4.5 2.5-4.5 2.5V5.5z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/playlists",
    label: "Playlists",
    icon: (
      <svg className="size-[15px] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M2 4h12M2 8h8.5M2 12h6" strokeLinecap="round" />
        <circle cx="13" cy="10.5" r="1.75" />
        <path d="M13 8.75V5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/schedules",
    label: "Schedules",
    icon: (
      <svg className="size-[15px] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="1" y="2.5" width="14" height="12" rx="1.5" />
        <path d="M5 1v3M11 1v3M1 7.5h14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/releases",
    label: "Releases",
    icon: (
      <svg className="size-[15px] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M3 13.5h10M8 2v8.5M5.5 5.5L8 3l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/team",
    label: "Team",
    icon: (
      <svg className="size-[15px] shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="6" cy="5" r="2.5" />
        <path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5" strokeLinecap="round" />
        <circle cx="12.5" cy="5" r="2" />
        <path d="M12.5 9c1.93 0 3.5 1.34 3.5 3" strokeLinecap="round" />
      </svg>
    ),
  },
];

function useClerkAppearance() {
  const { resolvedTheme } = useTheme();

  if (resolvedTheme === "light") {
    return {
      variables: {
        colorPrimary:         "#0284c7",
        colorBackground:      "#ffffff",
        colorText:            "#0f172a",
        colorTextSecondary:   "#64748b",
        colorInputBackground: "#f8fafc",
        colorInputText:       "#0f172a",
        colorNeutral:         "#0f172a",
        fontFamily:           "var(--font-sans)",
        borderRadius:         "8px",
        fontSize:             "14px",
      },
    } as const;
  }

  return {
    variables: {
      colorPrimary:         "#38bdf8",
      colorBackground:      "#0f1722",
      colorText:            "#dde9f0",
      colorTextSecondary:   "#526475",
      colorInputBackground: "#0b1018",
      colorInputText:       "#dde9f0",
      colorNeutral:         "#dde9f0",
      fontFamily:           "var(--font-sans)",
      borderRadius:         "8px",
      fontSize:             "14px",
    },
  } as const;
}

export function TopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const clerkAppearance = useClerkAppearance();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        {/* Wordmark */}
        <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-[10px] font-bold tracking-tight select-none">
            SR
          </div>
          <span className="text-[0.88rem] font-semibold text-foreground tracking-tight">Signal Room</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-px px-2 py-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <span className={cn("transition-opacity", isActive ? "opacity-80" : "opacity-40 group-hover:opacity-60")}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="flex flex-col gap-2 border-t border-sidebar-border p-3">
          <ThemeToggle />
          <div className="flex items-center justify-between">
            <OrganizationSwitcher
              afterCreateOrganizationUrl="/dashboard"
              afterLeaveOrganizationUrl="/"
              afterSelectOrganizationUrl="/dashboard"
              hidePersonal
              appearance={clerkAppearance}
            />
            <UserButton afterSignOutUrl="/" appearance={clerkAppearance} />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
