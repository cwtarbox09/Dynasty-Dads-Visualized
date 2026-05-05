import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase API route timeout for Sleeper data aggregation
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
