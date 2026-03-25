import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

const publicRoutes = [
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
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
