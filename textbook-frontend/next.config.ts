import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Leave room for multipart fields around the 10 MiB chat image limit.
  experimental: { proxyClientMaxBodySize: "12mb" },
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
