"use client";

import { useState } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

type Props = {
  children: React.ReactNode;
  url?: string;
};

export function ConvexClientProvider({ children, url }: Props) {
  const [client] = useState(() => (url ? new ConvexReactClient(url) : null));

  if (!client) {
    return <>{children}</>;
  }

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
