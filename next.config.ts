import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["node:sqlite", "libsql"],
  outputFileTracingIncludes: {
    "/*": ["node_modules/@libsql/*/**/*"],
  },
  poweredByHeader: false,
  devIndicators: false,
};
export default config;
