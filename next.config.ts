import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy: the browser may only load scripts, styles, images
 * and connections from this site itself. Inline scripts / styles are still
 * allowed because Next.js writes its own into every page (a nonce-based
 * policy is the next step, see docs). Set CSP_REPORT_ONLY=1 to have the
 * browser only *report* violations in its console instead of blocking them
 * (useful for a first look after a new deployment).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const cspHeader =
  process.env.CSP_REPORT_ONLY === "1"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

const commonHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // A private clinic system: ask search engines not to index any page.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  // Only over HTTPS, and only in production (a development server on
  // http://localhost must not be pinned to HTTPS).
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Every page and API route except uploaded files: a PDF opened in a
        // browser tab is shown by the browser's own viewer, which a strict
        // policy (object-src 'none') can block.
        source: "/((?!api/cashflow/attachments).*)",
        headers: [
          ...commonHeaders,
          { key: cspHeader, value: contentSecurityPolicy },
        ],
      },
      {
        source: "/api/cashflow/attachments/:path*",
        headers: commonHeaders,
      },
    ];
  },
};

export default nextConfig;
