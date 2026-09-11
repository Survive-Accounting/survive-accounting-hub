// GET /api/slide/<school>/council/<council>[?pdf=1] — THE COUNCIL MEETING SLIDE (2026-09-11).
//
// The council chair's page (ChairPromo) hands out one thing for the room: a 16:9 slide whose QR
// lands every member on the campus /learn page with the chapter bar preset to this council, so
// each member picks their own house from it. Same slide design as the chapter one (there is
// exactly one in this codebase — see SlideBlock.tsx), stamped "Shared by IFC" instead of a
// chapter, in the campus colourway. SVG is the on-screen preview; ?pdf=1 is the file.
//
// EVERYTHING IS IMPORTED INSIDE THE HANDLER, for the reason documented at the top of
// flyer.server.ts: this file lives in the CLIENT route tree, and a static import of pdf-lib /
// qrcode drags them into the browser bundle. Do not hoist these imports.
import { createFileRoute } from "@tanstack/react-router";

async function handle({ request, params }: { request: Request; params: { school: string; council: string } }): Promise<Response> {
  try {
    const url = new URL(request.url);
    const wantsPdf = url.searchParams.get("pdf") === "1";

    const { getCouncilPartner } = await import("@/lib/partners.functions");
    const page = await getCouncilPartner({ data: { schoolSlug: params.school, councilSlug: params.council } });
    if (!page) return new Response("Not found", { status: 404 });

    const { schoolBySlug } = await import("@/lib/schools");
    const { chairShareUrl } = await import("@/components/site/chair-promo");
    const input = {
      schoolSlug: params.school,
      schoolName: page.schoolName,
      courseCode: page.courseCode,
      chapterName: page.councilName,
      targetUrl: chairShareUrl("council", schoolBySlug(params.school)?.id ?? params.school, page.councilSlug),
    };

    const { slideSvg, slidePdf } = await import("@/lib/flyer.server");
    const body = wantsPdf ? await slidePdf(input) : Buffer.from(await slideSvg(input), "utf8");
    const etag = `"${Buffer.from(`${params.school}|${params.council}|${page.courseCode ?? ""}|${wantsPdf ? "pdf" : "svg"}|${body.length}`).toString("base64url")}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });

    const filename = `survive-${params.school}-${params.council}-slide.${wantsPdf ? "pdf" : "svg"}`;
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": wantsPdf ? "application/pdf" : "image/svg+xml; charset=utf-8",
        "content-disposition": `inline; filename="${filename}"`,
        "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        etag,
      },
    });
  } catch (e) {
    console.warn("council slide render failed:", (e as Error).message);
    return new Response("Not found", { status: 404 });
  }
}

export const Route = createFileRoute("/api/slide/$school/council/$council")({
  // `server.handlers` is a runtime feature not present in this version's route-option types.
  server: { handlers: { GET: handle } },
} as never);
