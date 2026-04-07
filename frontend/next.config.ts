import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Fix turbopack workspace root detection (avoids picking up ~/package-lock.json)
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
