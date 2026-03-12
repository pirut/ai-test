import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";

import { uploadRouter } from "@/app/api/uploadthing/core";
import { AuthProviders } from "@/components/auth-providers";
import { cn } from "@/lib/utils";

import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Showroom Control",
  description: "Remote management for Raspberry Pi showroom displays.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(ibmPlexSans.variable, ibmPlexMono.variable)}
    >
      <body>
        <NextSSRPlugin routerConfig={extractRouterConfig(uploadRouter)} />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          <AuthProviders>{children}</AuthProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
