"use client";

import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <rect x="1" y="1" width="6" height="6" rx="1.5" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/screens",
    label: "Screens",
    icon: (
      <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <rect x="1" y="2" width="14" height="9" rx="1.5" />
        <path d="M5 14h6M8 11v3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/media",
    label: "Media",
    icon: (
      <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <rect x="1" y="1" width="14" height="14" rx="2" />
        <path d="M6 5.5l5 2.5-5 2.5V5.5z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/playlists",
    label: "Playlists",
    icon: (
      <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M2 4h12M2 8h9M2 12h7" strokeLinecap="round" />
        <circle cx="13" cy="10" r="2" />
        <path d="M13 8V4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/schedules",
    label: "Schedules",
    icon: (
      <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <rect x="1" y="2" width="14" height="13" rx="2" />
        <path d="M5 1v3M11 1v3M1 7h14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/team",
    label: "Team",
    icon: (
      <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
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

  // Clerk popovers render in a detached portal, so we pass explicit hex
  // values per theme rather than CSS variable references.
  if (resolvedTheme === "light") {
    return {
      variables: {
        colorPrimary:         "#00a87a",
        colorBackground:      "#ffffff",
        colorText:            "#0c1e19",
        colorTextSecondary:   "#527068",
        colorInputBackground: "#f0f5f2",
        colorInputText:       "#0c1e19",
        colorNeutral:         "#0c1e19",
        fontFamily:           "var(--font-sans)",
        borderRadius:         "10px",
        fontSize:             "14.5px",
      },
    } as const;
  }

  return {
    variables: {
      colorPrimary:         "#00d9a0",
      colorBackground:      "#08121a",
      colorText:            "#cce6de",
      colorTextSecondary:   "#4e7a74",
      colorInputBackground: "#050b0e",
      colorInputText:       "#cce6de",
      colorNeutral:         "#cce6de",
      fontFamily:           "var(--font-sans)",
      borderRadius:         "10px",
      fontSize:             "14.5px",
    },
  } as const;
}

export function TopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const clerkAppearance = useClerkAppearance();

  return (
    <div className="grid min-h-screen grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside
        className="sticky top-0 flex h-screen flex-col gap-0 overflow-y-auto border-r border-border"
        style={{ background: "var(--sidebar-bg)" }}
      >
        {/* Brand */}
        <div className="px-4 py-5 border-b border-border">
          <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand flex items-center gap-2">
            <span className="inline-block h-px w-4 bg-brand opacity-70" />
            Showroom Control
          </p>
          <h1 className="text-xl font-semibold uppercase tracking-tight text-foreground leading-none">
            Signal Room
          </h1>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.88rem] font-medium transition-colors",
                  isActive
                    ? "bg-brand/10 text-brand border border-brand/20"
                    : "text-muted-foreground border border-transparent hover:bg-accent hover:text-foreground"
                )}
              >
                <span className={cn("opacity-50 transition-opacity", isActive && "opacity-100")}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-border flex flex-col gap-2">
          <ThemeToggle />
          <Separator className="my-1" />
          <OrganizationSwitcher
            afterCreateOrganizationUrl="/dashboard"
            afterLeaveOrganizationUrl="/"
            afterSelectOrganizationUrl="/dashboard"
            hidePersonal
            appearance={clerkAppearance}
          />
          <UserButton afterSignOutUrl="/" appearance={clerkAppearance} />
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 p-8">{children}</main>
    </div>
  );
}
