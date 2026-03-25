import type { Metadata } from "next";

import { getAppUrl, env } from "@/lib/env";

export const siteConfig = {
  name: "Screen",
  appName: "Screen Console",
  tagline: "Digital signage infrastructure for Raspberry Pi.",
  description:
    "Manage Raspberry Pi signage fleets with a hosted control plane. Playlists, schedules, releases, and proof of playback.",
  companyName: env.legalCompanyName ?? "Screen Labs LLC",
  companyAddress:
    env.legalCompanyAddress ?? "123 Market Street, New York, NY 10001",
  legalEmail: env.legalEmail ?? "legal@example.com",
  supportEmail: env.supportEmail ?? "support@example.com",
  salesEmail: env.salesEmail ?? env.supportEmail ?? "sales@example.com",
  statusPageUrl: env.statusPageUrl ?? "https://status.example.com",
  appUrl: getAppUrl(),
} as const;

export function absoluteUrl(path = "/") {
  const base = siteConfig.appUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildMarketingMetadata(input: {
  title?: string;
  description?: string;
  path?: string;
}): Metadata {
  const path = input.path ?? "/";
  const title = input.title ?? siteConfig.tagline;
  const description = input.description ?? siteConfig.description;
  const url = absoluteUrl(path);
  const socialTitle =
    title.includes(siteConfig.name) ? title : `${title} | ${siteConfig.name}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: socialTitle,
      description,
      url,
      siteName: siteConfig.name,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
    },
  };
}
