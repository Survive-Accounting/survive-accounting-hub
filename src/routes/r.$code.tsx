// GET /r/<code> — the trackable-link redirector. ONE generic layer in front of any destination:
// a chapter flyer, a campus page, an Ole Miss Exam 1 page, a scratch promo link. It is a pure
// SERVER route (no client bundle, no interstitial): resolve the code, set the first-party
// attribution cookie, record the click, 302 to the destination. Fast by construction.
//
// PERFORMANCE / RESILIENCE: the redirect is never blocked on analytics. The only awaited DB work is
// the code lookup (one indexed read) needed to know where to send the user; the click insert is
// wrapped so a DB hiccup can never turn a redirect into an error. An unknown/inactive code falls
// through to the homepage rather than 404-ing a printed flyer.
//
// SECURITY: <code> is an opaque random base62 string — it exposes no ids. The cookie is HttpOnly.
// This file lives in the client route tree, so all server-only work is behind `await import(...)`.
import { createFileRoute } from "@tanstack/react-router";

const HOME = "/";

async function handle({
  request,
  params,
}: {
  request: Request;
  params: { code: string };
}): Promise<Response> {
  const now = Date.now();
  const origin = safeOrigin(request);
  const code = (params.code || "").trim();

  try {
    const {
      resolveLinkByCode,
      decorateDestination,
      buildAttributionCookies,
      readAnonCookie,
      recordClick,
    } = await import("@/lib/referral.server");

    const link = await resolveLinkByCode(code);
    // Unknown, disabled, or a partner that has been archived/paused → send home, don't dead-end.
    if (!link || !link.active || link.partner_status === "archived") {
      return Response.redirect(new URL(HOME, origin).toString(), 302);
    }

    const target = decorateDestination(link, origin);
    const existingAnon = readAnonCookie(request);
    const { anonId, setCookies } = buildAttributionCookies(link.code, existingAnon, now);

    // Best-effort click record — never blocks or breaks the redirect.
    try {
      await recordClick({ link, anonId, request, nowMs: now });
    } catch (e) {
      console.warn("referral click record failed:", (e as Error).message);
    }

    const headers = new Headers({ Location: target, "cache-control": "no-store" });
    for (const c of setCookies) headers.append("set-cookie", c);
    return new Response(null, { status: 302, headers });
  } catch (e) {
    console.warn("referral redirect failed:", (e as Error).message);
    return Response.redirect(new URL(HOME, origin).toString(), 302);
  }
}

function safeOrigin(request: Request): string {
  try {
    return new URL(request.url).origin;
  } catch {
    return "https://surviveaccounting.com";
  }
}

export const Route = createFileRoute("/r/$code")({
  // `server.handlers` is a runtime feature not present in this version's route-option types
  // (same pattern as api.flyer.$school.$chapter.tsx / api.og.$school.$chapter.tsx).
  server: { handlers: { GET: handle } },
} as never);
