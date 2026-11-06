import type { NextConfig } from "next";

const appRoot = process.cwd();

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone (copied to hospital machines).
  output: "standalone",
  // Pin the project root to this app's folder, so the standalone output is flat
  // and never references files elsewhere in the repository.
  outputFileTracingRoot: appRoot,
  turbopack: { root: appRoot },
  // Do not advertise the framework in response headers.
  poweredByHeader: false,
  // No next/image optimisation (so the native "sharp" module is never needed).
  images: { unoptimized: true },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
