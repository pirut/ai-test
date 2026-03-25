import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@showroom/contracts"],
  async rewrites() {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\/$/, "");
    const shouldProxyDeviceApi =
      Boolean(convexUrl) &&
      process.env.SHOWROOM_MOCK_MODE !== "true";

    if (!convexUrl || !shouldProxyDeviceApi) {
      return [];
    }

    return [
      {
        source: "/api/device/register-temporary",
        destination: `${convexUrl}/api/device/register-temporary`,
      },
      {
        source: "/api/device/claim-status",
        destination: `${convexUrl}/api/device/claim-status`,
      },
      {
        source: "/api/device/auth/refresh",
        destination: `${convexUrl}/api/device/auth/refresh`,
      },
      {
        source: "/api/device/manifest",
        destination: `${convexUrl}/api/device/manifest`,
      },
      {
        source: "/api/device/commands",
        destination: `${convexUrl}/api/device/commands`,
      },
      {
        source: "/api/device/heartbeat",
        destination: `${convexUrl}/api/device/heartbeat`,
      },
      {
        source: "/api/device/command-result",
        destination: `${convexUrl}/api/device/command-result`,
      },
    ];
  },
};

const sentryEnabled = Boolean(
  process.env.SENTRY_DSN ||
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    process.env.SENTRY_AUTH_TOKEN,
);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      silent: true,
      disableLogger: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
    })
  : nextConfig;
