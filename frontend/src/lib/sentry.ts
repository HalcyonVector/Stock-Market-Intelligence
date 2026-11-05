"use client";
/* Optional front-end error tracking on Sentry's free tier (5K errors/month).
 *
 * Off unless NEXT_PUBLIC_SENTRY_DSN is set at build time. The SDK is loaded
 * with a dynamic import, so visitors download nothing extra when it's off.
 * Errors only: no performance tracing or session replay, so the free quota
 * goes to real crashes.
 */
let started = false;

export function initErrorTracking() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || started || typeof window === "undefined") return;
  started = true;
  import("@sentry/browser")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 0,
        sendDefaultPii: false,
        // Browser-extension and network noise that isn't our bug.
        ignoreErrors: ["ResizeObserver loop", "Failed to fetch", "NetworkError", "Load failed", "AbortError"],
      });
    })
    .catch(() => { /* tracking is best-effort */ });
}
