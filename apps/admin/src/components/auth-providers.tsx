"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { env } from "@/lib/env";

const clerkAppearance = {
  variables: {
    colorPrimary:         "var(--primary)",
    colorBackground:      "var(--popover)",
    colorText:            "var(--foreground)",
    colorTextSecondary:   "var(--muted-foreground)",
    colorInputBackground: "var(--background)",
    colorInputText:       "var(--foreground)",
    colorNeutral:         "var(--foreground)",
    colorDanger:          "var(--destructive)",
    colorSuccess:         "var(--signal)",
    fontFamily:           "var(--font-sans)",
    borderRadius:         "8px",
    fontSize:             "14px",
  },
} as const;

export function AuthProviders({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const content = (
    <ConvexClientProvider url={env.convexUrl}>{children}</ConvexClientProvider>
  );
  return publishableKey ? (
    <ClerkProvider publishableKey={publishableKey} appearance={clerkAppearance}>
      {content}
    </ClerkProvider>
  ) : content;
}
