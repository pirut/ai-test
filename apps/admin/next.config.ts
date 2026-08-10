import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@showroom/contracts"],
};

export default nextConfig;
