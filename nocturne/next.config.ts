import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The floating dev badge covers the chat composer on phones.
  devIndicators: false,
  // The Agent SDK spawns the Claude Code binary; load it from node_modules at runtime.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
  // `npm run phone` serves the dev server on the local network; allow phones on
  // private (RFC 1918) addresses and .local hostnames to load dev assets.
  allowedDevOrigins: process.env.NOCTURNE_PHONE_DEV
    ? ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local", ...(process.env.NOCTURNE_DEV_ORIGINS ?? "").split(",").filter(Boolean)]
    : [],
  experimental: {
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
