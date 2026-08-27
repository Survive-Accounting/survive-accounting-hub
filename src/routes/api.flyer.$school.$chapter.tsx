// GET /api/flyer/<school>/<chapter>?f=pdf|png  — the flyer, generated on demand.
//
// `<chapter>` may be the literal "campus" for the campus-wide variant, which is what keeps this one
// route rather than two: the only difference is whether {{CHAPTER_LINE}} is filled and where the QR
// points, and both fall out of the same input.
//
// ON DEMAND, NOT PRE-GENERATED. ~1,100 chapters x 2 formats is 2,200 files that would need
// rebuilding every time a colourway, a course code or the template changes. A flyer takes ~1.2s to
// render and almost nobody presses the button, so the work is done when it is asked for.
//
// CACHING is HTTP caching, deliberately. s-maxage puts it in Vercel's edge cache; the KEY includes
// the course code and colourway, so a school changing either produces a different ETag and the old
// copy is replaced rather than served stale. No cache table, no invalidation job, nothing to get
// out of step with the data.
//
// GRACEFUL FAILURE: any error returns 404, never a 500 and never a broken image. The page's flyer
// block hides itself when the preview fails to load, so a render problem costs the block and not
// the page.
import { createFileRoute } from "@tanstack/react-router";

import type { FlyerInput } from "@/lib/flyer.server";

const CAMPUS = "campus";

/** REP ATTRIBUTION ON THE FLYER (campus-rep V1).
 *  · `?ref=<code>` swaps the QR target to /r/<code> — used by the rep share kit. The code must be
 *    a real, active link that genuinely belongs to this chapter (or, for the campus variant, to a
 *    partner at all) so a stray param can't mint junk-attributed artwork.
 *  · With NO ?ref, a chapter that has a live rep_chapter_assignment for the CURRENT term still
 *    gets the sourcing rep's QR by default — an exec downloading "their" flyer after claiming
 *    keeps crediting the rep who sourced them, without the rep's name appearing anywhere. */
async function repRefForChapter(db: { from: (t: string) => any }, chapterId: string): Promise<string | null> {
  try {
    const { termFor, termId } = await import("@/lib/terms");
    const { data: asg } = await db.from("rep_chapter_assignments").select("referral_link_id")
      .eq("campus_greek_chapter_id", chapterId).eq("term_id", termId(termFor()))
      .in("status", ["reserved", "qualified"]).maybeSingle();
    if (!asg?.referral_link_id) return null;
    const { data: link } = await db.from("referral_links").select("code,active")
      .eq("id", asg.referral_link_id).maybeSingle();
    return link?.active ? (link.code as string) : null;
  } catch { return null; }
}

async function validatedRef(db: { from: (t: string) => any }, ref: string, chapterId: string | null): Promise<string | null> {
  const { data: link } = await db.from("referral_links")
    .select("code,active,campus_greek_chapter_id").eq("code", ref).maybeSingle();
  if (!link?.active) return null;
  // Chapter flyer: the code must be bound to THIS chapter. Campus flyer: any active code passes.
  if (chapterId && link.campus_greek_chapter_id && link.campus_greek_chapter_id !== chapterId) return null;
  return link.code as string;
}

async function resolve(school: string, chapter: string, ref: string | null): Promise<FlyerInput | null> {
  // /go/demo — the demo chapter page's flyer. No campus, no chapter, no DB: a fixed generic
  // input ("Your Chapter" at "Your School", ACCT 101) in the brand colourway. The QR encodes
  // /go/demo/demo, which 301s to /go/demo — a scanned demo flyer lands back on the demo.
  if (school === "demo" && chapter === "demo") {
    return { schoolSlug: "demo", schoolName: "Your School", courseCode: "ACCT 101", chapterSlug: "demo", chapterName: "Your Chapter" };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as { from: (t: string) => any };

  const { data: campus } = await db.from("campuses")
    .select("id,name,course_family_codes_json").eq("slug", school).maybeSingle();
  if (!campus?.id) return null;

  const raw = campus.course_family_codes_json;
  const codes = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
  const courseCode = ((codes?.intro_1 ?? "") as string).trim() || null;

  // The canonical display name, not the DB's formal one — a flyer saying "UNIVERSITY OF
  // MISSISSIPPI STUDENTS" when every other surface says "Ole Miss" is the same drift schools.ts
  // exists to prevent.
  const { schoolBySlug } = await import("@/lib/schools");
  const schoolName = schoolBySlug(school)?.name ?? (campus.name as string);

  if (chapter === CAMPUS) {
    const refCode = ref ? await validatedRef(db, ref, null) : null;
    return { schoolSlug: school, schoolName, courseCode, ...(refCode ? { refCode } : {}) };
  }

  // nickname preferred for the "Shared by" line — it is what students call the chapter ("ADPi"),
  // and the flyer hangs in their house. Falls back to the org's display name; NEVER the
  // chapter_designation, which is store-only. The nickname select degrades pre-migration
  // (20260820_1209) so a deploy order mistake can't 404 every flyer.
  let ch: { id: string; greek_org_id: string | null; nickname?: string | null } | null = null;
  {
    const r1 = await db.from("campus_greek_chapters")
      .select("id,greek_org_id,nickname").eq("campus_id", campus.id).eq("slug", chapter).maybeSingle();
    if (r1.error) {
      const r2 = await db.from("campus_greek_chapters")
        .select("id,greek_org_id").eq("campus_id", campus.id).eq("slug", chapter).maybeSingle();
      ch = r2.data ?? null;
    } else ch = r1.data ?? null;
  }
  if (!ch) return null;
  let chapterName = chapter;
  if (ch.greek_org_id) {
    const { data: org } = await db.from("greek_orgs").select("name").eq("id", ch.greek_org_id).maybeSingle();
    chapterName = ((org?.name ?? "") as string).trim() || chapter;
  }
  const sharedBy = (ch.nickname ?? "").trim() || chapterName;
  // Explicit ?ref wins (validated against this chapter); otherwise the term's sourcing rep, if any.
  const refCode = (ref ? await validatedRef(db, ref, ch.id) : null) ?? (await repRefForChapter(db, ch.id));
  return { schoolSlug: school, schoolName, courseCode, chapterSlug: chapter, chapterName: sharedBy, ...(refCode ? { refCode } : {}) };
}

async function handle({ request, params }: { request: Request; params: { school: string; chapter: string } }): Promise<Response> {
  try {
    const url = new URL(request.url);
    // ?f=pdf (default, the printable flyer) · ?f=svg (the same flyer as vector)
    // ?f=slide (16:9 for a chapter meeting projector — same message, same colourway, big QR)
    const raw = url.searchParams.get("f");
    const format = raw === "svg" ? "svg" : raw === "slide" ? "slide" : "pdf";
    const ref = (url.searchParams.get("ref") ?? "").trim() || null;
    const input = await resolve(params.school, params.chapter, ref);
    if (!input) return new Response("Not found", { status: 404 });

    // Imported HERE, not at module scope: this file lives in the CLIENT route tree, and a static
    // import drags pdf-lib and qrcode into the browser bundle — which is what produced the
    // out-of-memory build. See the header of flyer.server.ts.
    const { flyerSvg, flyerPdf, slideSvg } = await import("@/lib/flyer.server");
    const body = format === "svg" ? Buffer.from(await flyerSvg(input), "utf8")
      : format === "slide" ? Buffer.from(await slideSvg(input), "utf8")
      : await flyerPdf(input);

    // The ETag carries everything that changes the artwork, so a course-code or colourway edit
    // invalidates by itself.
    const etag = `"${Buffer.from(`${params.school}|${params.chapter}|${input.courseCode ?? ""}|${input.refCode ?? ""}|${format}|${body.length}`).toString("base64url")}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });

    const filename = `survive-${params.school}-${params.chapter}-flyer.${format}`;
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": (format === "svg" || format === "slide") ? "image/svg+xml; charset=utf-8" : "application/pdf",
        // inline: the download button supplies its own filename via the anchor's `download`
        // attribute, and Print needs the PDF to open in the viewer rather than save.
        "content-disposition": `inline; filename="${filename}"`,
        "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        etag,
      },
    });
  } catch (e) {
    // 404 rather than 500 — the page treats a missing flyer as "hide the block", and a 500 would
    // show up as an error in monitoring for something that is cosmetic.
    console.warn("flyer render failed:", (e as Error).message);
    return new Response("Not found", { status: 404 });
  }
}

export const Route = createFileRoute("/api/flyer/$school/$chapter")({
  // `server.handlers` is a runtime feature not present in this version's route-option types.
  server: { handlers: { GET: handle } },
} as never);
