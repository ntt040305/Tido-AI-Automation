import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  } as any,
};

export default nextConfig;
