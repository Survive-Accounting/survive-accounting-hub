// /api/partner-kit/<school>/<council> — THE PARTNER KIT ZIP (2026-08-28).
//
// One archive per campus council: the four cover PDFs plus a flyer and a meeting slide for every
// chapter, each carrying that chapter's own QR. The council page's "Bring it to the meeting" door
// links straight here.
//
// EVERYTHING IS GENERATED SERVER-SIDE and imported dynamically INSIDE the handler, for the exact
// reason documented at the top of flyer.server.ts: this file lives in the CLIENT route tree, and a
// static import of pdf-lib / qrcode / jszip drags them into the browser bundle and blows the build
// out of memory. Do not hoist these imports.
//
// ?council_name=… stamps the READ-ME cover ("Prepared for Panhellenic at Alabama · Fall 2026").
// It is display text only — never a person's name, and never trusted for anything but the cover.
import { createFileRoute } from "@tanstack/react-router";

const MAX_CHAPTERS = 60; // a real council is 8–35; the cap is a runaway guard, and it is reported

async function handle({ request, params }: { request: Request; params: { school: string; council: string } }): Promise<Response> {
  try {
    const url = new URL(request.url);
    const councilName = (url.searchParams.get("council_name") ?? "").trim().slice(0, 80) || null;

    const { getCouncilPartner } = await import("@/lib/partners.functions");
    const page = await getCouncilPartner({ data: { schoolSlug: params.school, councilSlug: params.council } });
    if (!page) return new Response("Not found", { status: 404 });

    const { partnerKitZip, semesterLabel } = await import("@/lib/partner-kit.server");
    const chapters = page.chapters.slice(0, MAX_CHAPTERS).map((c) => ({ name: c.name, slug: c.slug, letters: c.letters }));

    const zip = await partnerKitZip({
      schoolSlug: page.schoolSlug,
      schoolName: page.schoolName,
      courseCode: page.courseCode,
      councilName: councilName ?? page.councilName,
      semester: semesterLabel(),
      chapters,
    });

    const filename = `Survive-${page.schoolName.replace(/[^A-Za-z0-9]+/g, "-")}-Partner-Kit.zip`;
    return new Response(new Uint8Array(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
        // Per-council and per-semester; short cache so a roster change shows up the same day.
        "cache-control": "public, max-age=900, s-maxage=3600",
        ...(page.chapters.length > MAX_CHAPTERS ? { "x-sa-chapters-truncated": String(page.chapters.length - MAX_CHAPTERS) } : {}),
      },
    });
  } catch (e) {
    console.error("partner-kit failed:", (e as Error).message);
    return new Response("Kit unavailable", { status: 500 });
  }
}

export const Route = createFileRoute("/api/partner-kit/$school/$council")({
  // `server.handlers` is a runtime feature not present in this version's route-option types.
  server: { handlers: { GET: handle } },
} as never);
