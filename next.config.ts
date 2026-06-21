import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable instrumentation hook (cron scheduler starts on server boot).
  // This is enabled by default in Next.js 16 when src/instrumentation.ts exists.
  // If needed in older versions, add: experimental: { instrumentationHook: true }

  // ── pi.dev SDK (future) ─────────────────────────────────────────────
  // When integrating the pi.dev SDK, configure it here:
  // - Set env vars for pi API keys
  // - Configure server-side runtime for pi agent hooks
  // - Import and init SDK in src/lib/pi/
};

export default nextConfig;
