"use client";

import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

import { classNames } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/screens", label: "Screens" },
  { href: "/media", label: "Media" },
  { href: "/playlists", label: "Playlists" },
  { href: "/schedules", label: "Schedules" },
  { href: "/team", label: "Team" },
];

export function TopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="chrome">
      <aside className="sideRail">
        <div>
          <p className="eyebrow">Showroom Control</p>
          <h1>Signal room</h1>
          <p className="railCopy">
            Monitor screens, push media, and prove playback from one place.
          </p>
        </div>
        <nav className="navStack">
          {items.map((item) => (
            <Link
              key={item.href}
              className={classNames("navLink", pathname === item.href && "navLinkActive")}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
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

