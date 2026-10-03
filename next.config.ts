import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Receipt screenshots (up to 5 MB) are uploaded through a Server Action.
      // Stay well under the proxy's 10 MB body limit, which truncates silently.
      bodySizeLimit: "6mb",
    },
  },
  // Pin the project root; a stray lockfile higher up the tree confuses detection.
  turbopack: { root: path.join(__dirname) },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
