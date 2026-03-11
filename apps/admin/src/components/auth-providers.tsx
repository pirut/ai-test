"use client";

import { ClerkProvider } from "@clerk/nextjs";

import { ConvexClientProvider } from "@/components/convex-client-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { env } from "@/lib/env";

// CSS variables are passed as values to Clerk's appearance system.
// The browser resolves var(--token) against the active data-theme,
// so this single appearance object works for both dark and light modes.
const clerkAppearance = {
  variables: {
    colorPrimary:          "var(--accent)",
    colorBackground:       "var(--bg-3)",
    colorText:             "var(--text)",
    colorTextSecondary:    "var(--muted)",
    colorInputBackground:  "var(--bg-2)",
    colorInputText:        "var(--text)",
    colorNeutral:          "var(--text)",
    colorDanger:           "var(--danger)",
    colorSuccess:          "var(--signal)",
    colorWarning:          "var(--warning)",
    fontFamily:            '"IBM Plex Sans", "Avenir Next", system-ui, sans-serif',
    borderRadius:          "10px",
    fontSize:              "14.5px",
  },
  elements: {
    card:                  "clerkCard",
    rootBox:               "clerkRootBox",
    organizationSwitcherTrigger: "clerkOrgSwitcher",
    userButtonTrigger:     "clerkUserBtn",
  },
} as const;

export function AuthProviders({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const content = (
    <ConvexClientProvider url={env.convexUrl}>{children}</ConvexClientProvider>
  );

  return (
    <ThemeProvider>
      {publishableKey ? (
        <ClerkProvider publishableKey={publishableKey} appearance={clerkAppearance}>
          {content}
        </ClerkProvider>
      ) : (
        content
      )}
    </ThemeProvider>
  );
}
