import type { NextConfig } from "next";
import { getBackendUrl } from "./config/deployment.mjs";

const BACKEND_URL = getBackendUrl();

const nextConfig: NextConfig = {
  // Leave room for multipart fields around the 10 MiB chat image limit.
  experimental: { proxyClientMaxBodySize: "12mb", proxyTimeout: 120_000 },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      }
    ]
  },
};

export default nextConfig;
