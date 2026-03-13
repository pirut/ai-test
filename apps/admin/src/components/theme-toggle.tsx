"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground",
          "transition-colors",
        )}
        aria-hidden="true"
        disabled
        type="button"
      >
        <span className="size-[15px] shrink-0 opacity-50" />
        Theme
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground",
        "transition-colors hover:bg-accent/60 hover:text-foreground",
      )}
      type="button"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? (
        <svg className="size-[15px] shrink-0 opacity-50" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <circle cx="8" cy="8" r="2.75" />
          <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M11.54 4.46l1.06-1.06M3.4 12.6l1.06-1.06" />
        </svg>
      ) : (
        <svg className="size-[15px] shrink-0 opacity-50" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M13.5 10a6 6 0 01-8-8 6 6 0 108 8z" />
        </svg>
      )}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
