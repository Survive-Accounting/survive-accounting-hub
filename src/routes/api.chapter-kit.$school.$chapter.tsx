// /api/chapter-kit/<school>/<chapter> — THE SCHOLARSHIP CHAIR KIT ZIP (Build 2, section 6).
//
// One chapter's archive: its flyer, its meeting slide, a one-pager on what Survive is, and a
// how-to-fund-seats walkthrough — every piece branded to the chapter (letters, campus, course
// code). The chapter page and the share panel link straight here.
//
// EVERYTHING IS GENERATED SERVER-SIDE and imported dynamically INSIDE the handler, for the reason
// documented at the top of partner-kit.server.ts and flyer.server.ts: a static import of
// pdf-lib / qrcode / jszip from a client route drags them into the browser bundle and blows the
// build out of memory. Do not hoist these imports.
import { createFileRoute } from "@tanstack/react-router";

async function handle({ params }: { params: { school: string; chapter: string } }): Promise<Response> {
  try {
    const { getGoChapter } = await import("@/lib/greek-go.functions");
    const ch = await getGoChapter({ data: { schoolSlug: params.school, chapterSlug: params.chapter } });
    if (!ch) return new Response("Not found", { status: 404 });

    // The course code the campus actually teaches — the same lookup the /go and share pages use.
    const { listCampusIntroCodes } = await import("@/lib/default-map.functions");
    const codes = await listCampusIntroCodes({ data: { ids: [ch.campusId] } }).catch(() => []);
    const courseCode = codes.find((c) => c.campusId === ch.campusId)?.code ?? null;

    const { chapterKitZip, semesterLabel } = await import("@/lib/partner-kit.server");
    const { zip, placeholders } = await chapterKitZip({
      schoolSlug: ch.schoolSlug,
      schoolName: ch.schoolName,
      courseCode,
      chapterSlug: ch.chapterSlug,
      chapterName: ch.chapterName,
      letters: ch.letters,
      semester: semesterLabel(),
    });

    const safe = (ch.letters && /^[A-Za-z0-9 ]+$/.test(ch.letters) ? ch.letters : ch.chapterName).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const filename = `Survive-${safe || "Chapter"}-Kit.zip`;
    return new Response(new Uint8Array(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
        // Per-chapter, per-semester; short cache so a roster or course-code change shows the same day.
        "cache-control": "public, max-age=900, s-maxage=3600",
        // Any degraded-to-a-note asset is surfaced, never silently invented (section 6).
        ...(placeholders.length ? { "x-sa-kit-placeholders": String(placeholders.length) } : {}),
      },
    });
  } catch (e) {
    console.error("chapter-kit failed:", (e as Error).message);
    return new Response("Kit unavailable", { status: 500 });
  }
}

export const Route = createFileRoute("/api/chapter-kit/$school/$chapter")({
  // `server.handlers` is a runtime feature not present in this version's route-option types.
  server: { handlers: { GET: handle } },
} as never);
