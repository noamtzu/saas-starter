import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is per-user and per-tenant, so we use plain dynamic
  // rendering rather than Cache Components.
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
