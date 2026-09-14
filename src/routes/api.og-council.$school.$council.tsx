// GET /api/og-council/<school>/<council> — the COUNCIL link-preview card (1200x630 PNG), 2026-09-14.
// What the council exec's link to scholarship chairs (/<school>/<council> → /chapters?school&c) and
// the council page preview as: IFC / PHC / NPHC · "Interfraternity Council - Ole Miss" · "Share ACCY
// 201 exam prep" · the wordmark. Same card as the chapter's (lib/share-card.server.tsx). Never 404s:
// a failure falls back to the default card.
import { createFileRoute } from "@tanstack/react-router";

import { fetchBuf } from "@/lib/rasterize.server";

const MARK: Record<string, { mark: string; full: string }> = {
  ifc: { mark: "IFC", full: "Interfraternity Council" },
  panhellenic: { mark: "PHC", full: "Panhellenic Council" },
  nphc: { mark: "NPHC", full: "National Pan-Hellenic Council" },
  mgc: { mark: "MGC", full: "Multicultural Greek Council" },
};

async function handle({ request, params }: { request: Request; params: { school: string; council: string } }): Promise<Response> {
  const origin = new URL(request.url).origin;
  try {
    const c = MARK[params.council.toLowerCase()];
    if (!c) throw new Error("council");
    const { schoolByAny, boltForSlug } = await import("@/lib/schools");
    const school = schoolByAny(params.school);
    if (!school) throw new Error("school");
    const { c1, c2 } = boltForSlug(school.slug);
    const { renderShareCard, shareAskLine, shareWhoLine, shareCardHeaders } = await import("@/lib/share-card.server");
    const png = await renderShareCard(origin, { mark: c.mark, who: shareWhoLine(c.full, school.name), ask: shareAskLine(school.courseCode ?? null), c1, c2 });
    return new Response(Buffer.from(png), { headers: shareCardHeaders() });
  } catch {
    try {
      const buf = await fetchBuf(`${origin}/og-card.png`);
      return new Response(buf, { headers: { "content-type": "image/png", "cache-control": "public, max-age=600, s-maxage=3600" } });
    } catch { return new Response("Not found", { status: 404 }); }
  }
}

export const Route = createFileRoute("/api/og-council/$school/$council")({
  server: { handlers: { GET: handle } },
} as never);
