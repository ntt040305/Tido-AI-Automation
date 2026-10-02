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
  // The prompt-v2 meta-prompt and playbooks are .txt files read with `fs` at
  // request time, so nothing in the module graph references them and the build's
  // file tracing cannot see them. Without this they are missing from a production
  // build: the engine throws ENOENT, falls back to v1, and the only symptom is an
  // image that looks like v1 — which is exactly how this went unnoticed in dev.
  //
  // Keys are route globs; values are globs resolved from this project root
  // (apps/web). Verified against node_modules/next/dist/docs/01-app/03-api-reference/
  // 05-config/01-next-config-js/output.md for this Next version.
  outputFileTracingIncludes: {
    "/api/image/*": ["./lib/image-engine/prompt-v2/templates/**/*"],
  },
};

export default nextConfig;
