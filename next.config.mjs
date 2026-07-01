const buildTag =
  process.env.VERCEL_DEPLOYMENT_ID?.slice(0, 7) ??
  process.env.VERCEL_ENV ??
  "local";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
    NEXT_PUBLIC_BUILD_TAG: buildTag,
    NEXT_PUBLIC_APP_BOTTOM_NAV: process.env.NEXT_PUBLIC_APP_BOTTOM_NAV ?? "true",
  },
  reactStrictMode: true,
  serverExternalPackages: ["ogg-opus-decoder"],
  watchOptions: {
    pollIntervalMs: 1000,
  },
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "https://web.telegram.org",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
