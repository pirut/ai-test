"use client";

import { useState } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

type Props = {
  children: React.ReactNode;
  url?: string;
  authenticated?: boolean;
};

export function ConvexClientProvider({ children, url, authenticated = true }: Props) {
  const [client] = useState(() => (url ? new ConvexReactClient(url) : null));
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  if (!client || !authenticated) {
    return <>{children}</>;
  }

  if (!hasClerk) {
    return <ConvexProvider client={client}>{children}</ConvexProvider>;
  }

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
