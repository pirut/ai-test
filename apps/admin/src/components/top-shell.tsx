"use client";

import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

import { classNames } from "@/lib/utils";

const items = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="navIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
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
      <svg className="navIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="2" width="14" height="9" rx="1.5" />
        <path d="M5 14h6M8 11v3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/media",
    label: "Media",
    icon: (
      <svg className="navIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="14" height="14" rx="2" />
        <path d="M6 5.5l5 2.5-5 2.5V5.5z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/playlists",
    label: "Playlists",
    icon: (
      <svg className="navIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
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
      <svg className="navIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="2" width="14" height="13" rx="2" />
        <path d="M5 1v3M11 1v3M1 7h14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/team",
    label: "Team",
    icon: (
      <svg className="navIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="5" r="2.5" />
        <path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5" strokeLinecap="round" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 9c1.66 0 3 1.34 3 3" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function TopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="chrome">
      <aside className="sideRail">
        <div>
          <div className="sideRailBrand">
            <p className="eyebrow">Showroom Control</p>
            <h1>Signal Room</h1>
          </div>
          <nav className="navStack">
            {items.map((item) => (
              <Link
                key={item.href}
                className={classNames("navLink", pathname === item.href && "navLinkActive")}
                href={item.href}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="railFooter">
          <OrganizationSwitcher
            afterCreateOrganizationUrl="/dashboard"
            afterLeaveOrganizationUrl="/"
            afterSelectOrganizationUrl="/dashboard"
            hidePersonal
          />
          <UserButton afterSignOutUrl="/" />
        </div>
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}
