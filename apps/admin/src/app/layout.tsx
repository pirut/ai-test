import type { Metadata } from "next";

import { AuthProviders } from "@/components/auth-providers";

import "./globals.css";

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
    <html lang="en">
      <body>
        <AuthProviders>{children}</AuthProviders>
      </body>
    </html>
  );
}
