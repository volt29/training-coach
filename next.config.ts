import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.30.208.1", "192.168.0.157"],
  typedRoutes: true
};

export default nextConfig;
