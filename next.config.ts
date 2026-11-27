import type { NextConfig } from "next";

// Security headers for every response (HRD-1). Follows the "Without Nonces" setup in
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
//
// ponytail: scripts allow 'unsafe-inline' because Next's inline bootstrap scripts need it
// without nonces. A per-request nonce in proxy.ts would remove it, but forces every page to
// render dynamically. Do that if we ever render user-supplied HTML.
const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  // React uses eval in dev only, for better error stacks.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // OpenStreetMap tiles for the /search results map (components/leaflet-map.tsx).
  "img-src 'self' blob: data: https://tile.openstreetmap.org",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Skipped in dev so http://localhost isn't upgraded to https in Safari.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

export const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Older browsers ignore frame-ancestors; this covers them.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
