import { ClerkProvider } from "@clerk/nextjs";

import { ConvexClientProvider } from "@/components/convex-client-provider";
import { env } from "@/lib/env";

export function AuthProviders({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return <ConvexClientProvider url={env.convexUrl}>{children}</ConvexClientProvider>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ConvexClientProvider url={env.convexUrl}>{children}</ConvexClientProvider>
    </ClerkProvider>
  );
}

