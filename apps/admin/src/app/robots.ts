import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/pricing",
          "/security",
          "/getting-started",
          "/contact",
          "/legal",
          "/terms",
          "/privacy",
          "/acceptable-use",
          "/dpa",
          "/cookie-policy",
          "/sign-in",
          "/sign-up",
        ],
        disallow: ["/dashboard", "/media", "/playlists", "/screens", "/team", "/billing"],
      },
    ],
    sitemap: `${siteConfig.appUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}
