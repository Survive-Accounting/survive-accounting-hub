// Sentry (client error monitoring). The ONE init point + tiny helpers.
//
// Mirrors the analytics.ts contract: initializes ONLY when
// VITE_PUBLIC_SENTRY_DSN is set, loads @sentry/react via dynamic import (so its
// code is never fetched when disabled), and every helper is a no-op that
// swallows its own errors — Sentry must never break a page. Sends only in
// production, so local dev stays quiet.
//
// The DSN is browser-safe by design (that's what a DSN is for). The SEPARATE
// server-side read credentials (SENTRY_AUTH_TOKEN/ORG/PROJECT) power the Site QA
// error badges and are never exposed here.

type SentryModule = typeof import("@sentry/react");

let sentry: SentryModule | null = null;
let started = false;

export function sentryEnabled(): boolean {
  return Boolean(import.meta.env.VITE_PUBLIC_SENTRY_DSN);
}

/** Initialize Sentry once, on the client. No-op when disabled or on the server. */
export async function initSentry(): Promise<void> {
  if (typeof window === "undefined") return;
  if (started) return;
  const dsn = import.meta.env.VITE_PUBLIC_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  started = true;
  try {
    const S = await import("@sentry/react");
    S.init({
      dsn,
      environment: import.meta.env.MODE,
      // Errors only — no performance tracing / replay overhead by default.
      tracesSampleRate: 0,
      // Don't ship dev noise to the project; only real deploys report.
      enabled: import.meta.env.PROD,
    });
    sentry = S;
  } catch {
    sentry = null; // best-effort
  }
}

/** Tag the current route so errors group by page. /admin/site-qa uses this
 *  (via the issue's route context) to attribute errors to templates. */
export function setSentryRoute(pathname: string): void {
  try {
    const scope = sentry?.getCurrentScope();
    scope?.setTag("route", pathname);
    scope?.setTransactionName(pathname);
  } catch {
    /* ignore */
  }
}

/** Report a caught error (e.g. from a React error boundary). */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  try {
    sentry?.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* ignore */
  }
}
