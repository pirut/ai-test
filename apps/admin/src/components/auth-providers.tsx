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

// The product calls a Clerk organization a workspace.
const clerkLocalization = {
  createOrganization: {
    title: "Name your workspace",
    formButtonSubmit: "Create workspace",
  },
  organizationList: {
    createOrganization: "Create workspace",
    action__createOrganization: "Create workspace",
    titleWithoutPersonal: "Choose a workspace",
  },
} as const;

export function AuthProviders({ children, localMockMode }: { children: React.ReactNode; localMockMode: boolean }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const content = (
    <ConvexClientProvider url={env.convexUrl} authenticated={!localMockMode}>
      {children}
    </ConvexClientProvider>
  );
  return publishableKey && !localMockMode ? (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={clerkAppearance}
      localization={clerkLocalization}
      // A new account names its workspace before anything else.
      signUpFallbackRedirectUrl="/welcome"
    >
      {content}
    </ClerkProvider>
  ) : content;
}
