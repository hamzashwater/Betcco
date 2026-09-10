import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  distDir: process.env.BETCCO_NEXT_DIST_DIR ?? ".next",
  // Produces a minimal, self-contained server bundle for the non-root
  // production image. Local development keeps using `next dev` unchanged.
  output: "standalone",
  async rewrites() {
    const apiUrl = process.env.BETCCO_API_URL ?? "http://localhost:5085";
    return [
      { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
      { source: "/hubs/:path*", destination: `${apiUrl}/hubs/:path*` },
    ];
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
