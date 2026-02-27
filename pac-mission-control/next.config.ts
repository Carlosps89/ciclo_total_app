import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // @ts-ignore - disabling server actions to resolve persistent mismatch error
    serverActions: false
  }
};

export default nextConfig;
