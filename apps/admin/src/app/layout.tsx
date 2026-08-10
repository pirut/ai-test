import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";

import { uploadRouter } from "@/app/api/uploadthing/core";
import { AuthProviders } from "@/components/auth-providers";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Digital Curator",
    template: "%s · Digital Curator",
  },
  description: "Remote management for Raspberry Pi showroom displays.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const localMockMode =
    process.env.NODE_ENV !== "production" &&
    new Set(["1", "true", "yes", "on"]).has(
      (process.env.SHOWROOM_MOCK_MODE ?? "false").toLowerCase(),
    );
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <NextSSRPlugin routerConfig={extractRouterConfig(uploadRouter)} />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          <TooltipProvider>
            <AuthProviders localMockMode={localMockMode}>{children}</AuthProviders>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
