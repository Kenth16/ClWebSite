import type { NextConfig } from "next";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Les paquets du monorepo sont publiés en TypeScript source.
  transpilePackages: ["@kenpai/content", "@kenpai/shared"],
  poweredByHeader: false,
  devIndicators: false,
  // En développement, Next relaie /api/* vers l'API Fastify (même origine).
  // En production Docker, c'est le proxy Caddy qui s'en charge.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
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
