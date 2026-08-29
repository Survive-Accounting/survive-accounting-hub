// GET /api/practice-pack?school=<slug>&code=<course> — the Exam 1 Practice
// Pack PDF, generated on demand from the LIVE bank (never stale) and
// HTTP-cached by the bank's content hash (the flyer's caching philosophy:
// the ETag IS the invalidation; no cache table, nothing to drift).
//
// HARD RULE: only free, live-candidate Exam-1 content can render —
// buildPackQuestions reads the student player's own deduped live decks
// through the free + Exam-1-unit filter and assertPackSafety re-checks every
// deck before a byte is drawn (tested directly). Paid tabs have no path here.
//
// GRACEFUL FAILURE: any error is a 404, never a 500 — the email link failing
// closed beats a broken-looking pack.
import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }): Promise<Response> {
  try {
    const url = new URL(request.url);
    const school = (url.searchParams.get("school") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60) || null;
    const code = (url.searchParams.get("code") ?? "").trim().slice(0, 20) || "Intro Accounting";

    // Dynamic imports keep pdf-lib/qrcode out of the client bundle (the flyer's
    // hard-won lesson — see flyer.server.ts's header).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as { from: (t: string) => any };
    const { buildPackQuestions, practicePackPdf } = await import("@/lib/practice-pack.server");

    const { topics, hash } = await buildPackQuestions(admin);
    if (!topics.length) return new Response("Not found", { status: 404 });

    const etag = `"pack-${hash}-${school ?? "any"}-${code.replace(/[^A-Za-z0-9]/g, "")}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });

    let schoolName: string | null = null;
    if (school) {
      const { data } = await admin.from("campuses").select("school_name").eq("slug", school).maybeSingle();
      schoolName = (data?.school_name as string | undefined) ?? null;
    }

    const origin = process.env.SITE_ORIGIN || "https://surviveaccounting.com";
    const body = await practicePackPdf({
      topics, hash,
      courseCode: code,
      schoolName,
      promoCode: (process.env.PDF_PROMO_CODE ?? "").trim() || null,
      qrTarget: `${origin}/${school ?? ""}?via=pdf`,
    });

    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="Survive-${code.replace(/\s+/g, "")}-Exam1-Practice-Pack.pdf"`,
        "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        etag,
      },
    });
  } catch (e) {
    console.warn("practice pack render failed:", (e as Error).message);
    return new Response("Not found", { status: 404 });
  }
}

export const Route = createFileRoute("/api/practice-pack")({
  // `server.handlers` is a runtime feature not present in this version's route-option types.
  server: { handlers: { GET: handle } },
} as never);
