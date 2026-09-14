// GET /api/og/<school>/<chapter> — the CHAPTER link-preview card (1200x630 PNG).
//
// Chapter cards can't be prerendered like the campus set: ~2,270 (letters x colorway) combos is
// ~90MB of repo, so this renders per request with satori (text layout → outlined SVG paths) and
// @resvg/resvg-wasm (SVG → PNG). NOT @vercel/og — its edge-only `yoga.wasm?module` import is
// unparseable by the Vite client build (the route graph reaches even dynamic imports). And NOT
// @resvg/resvg-js — its native binary broke deploys (see flyer.server.ts). The wasm binary is a
// committed copy at public/resvg.wasm, fetched and initialised once per instance.
//
// FONT LAW (learned the hard way, twice on this feature):
//   * Satori takes fonts ONLY as ArrayBuffers in fonts[] — it inherits nothing from the site.
//   * .ttf works; .woff2 silently falls back to a default face. The committed files under
//     public/fonts are real TTFs, fetched from Google with an UNKNOWN user-agent (a modern UA
//     gets woff2 and the old MSIE trick now gets EOT).
//   * Rubik has NO GREEK subset — "ΑΤΩ" would tofu — so the big letters set in Inter ExtraBold
//     (full Greek coverage) and Rubik appears nowhere on this card.
//
// NEVER 404s AND NEVER BLANKS A TEXT THREAD: any failure — unknown chapter, font fetch, satori —
// falls back to the campus card bytes, then the default card bytes. A boring-but-correct preview
// always beats a broken image icon in GroupMe.
//
// Cached hard at the edge (s-maxage + SWR): the inputs only change on a roster edit, and iMessage
// re-fetches rarely anyway.
import { createFileRoute } from "@tanstack/react-router";

import { fetchBuf } from "@/lib/rasterize.server";

const W = 1200, H = 630;
const NAVY = "#14213D", CREAM = "#F5EFE6", GOLD = "#FCA311", WHITE = "#FFFFFF";

// Canonical bolt geometry — same paths brand.tsx draws and og-cards.mjs prints.
const BOLT_OUTER = "M85.46 8.38 L66.89 32.29 L85.06 31.98 L54.88 51.08 L77.05 50.77 L43.48 73.57 L76.74 73.57 L49.77 92.03 L63.19 94.82 L28.39 111.14 L42.56 112.07 L18.22 120.69 L22.53 128.7 L-8.27 137.63 L15.14 108.99 L-10.73 108.06 L26.85 92.35 L-11.54 90.51 L34.22 62.78 L3.83 64.94 L41.41 44 L25.99 39.73 Z";
const BOLT_RIGHT = "M84.97 8.22 L25.96 40.07 L42.92 44.46 L2.88 65.4 L34.3 61.71 L-10.67 90.66 L28.14 91.89 L-12.21 106.98 L14.99 110.04 L-10.11 138.7 L24.54 129.73 L19.03 121.61 L20.48 114.36 L23.38 107.69 L9.17 105.37 L46.87 95.8 L37.59 91.74 L61.08 78.4 L8.3 85.94 L59.34 56.36 L40.77 54.14 L70.06 35.77 L44.26 35.77 L69.77 22.72 Z";
const VB = { x: -18.21, y: -2.26, w: 109.27, h: 146.96 };

const boltDataUri = (c1: string, c2: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB.w} ${VB.h}"><g transform="translate(${-VB.x} ${-VB.y}) rotate(2 ${VB.w} ${VB.h * 0.51})"><path d="${BOLT_OUTER}" fill="${c1}" stroke="${WHITE}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/><path d="${BOLT_RIGHT}" fill="${c2}"/></g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

// Fonts, the wasm binary and the fallback PNGs are cached per instance by rasterize.server.ts,
// which also owns the one-and-only initWasm() call — see its header for why that guard cannot
// live in a route (2026-09-09: /api/thumb rasterising beside this route threw "Already
// initialized" until both came through the same door).

async function render(origin: string, school: string, chapter: string): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as { from: (t: string) => any };
  const { schoolBySlug, boltForSlug, canonicalSchoolName } = await import("@/lib/schools");
  const { chapterShortName } = await import("@/components/site/ChapterShare");

  const { data: campus } = await db.from("campuses").select("id,name,short_name,course_family_codes_json").eq("slug", school).maybeSingle();
  if (!campus?.id) throw new Error("campus");
  let ch: { greek_org_id: string | null; letters: string | null; nickname?: string | null } | null = null;
  {
    const r1 = await db.from("campus_greek_chapters").select("greek_org_id,letters,nickname").eq("campus_id", campus.id).eq("slug", chapter).maybeSingle();
    if (r1.error) { const r2 = await db.from("campus_greek_chapters").select("greek_org_id,letters").eq("campus_id", campus.id).eq("slug", chapter).maybeSingle(); ch = r2.data ?? null; }
    else ch = r1.data ?? null;
  }
  if (!ch) throw new Error("chapter");
  const { data: org } = ch.greek_org_id ? await db.from("greek_orgs").select("name").eq("id", ch.greek_org_id).maybeSingle() : { data: null };
  const orgName = ((org?.name ?? "") as string).trim() || "Your chapter";

  // The big mark: real Greek letters when the roster has them, else the nickname/shorthand —
  // both truncated before they can shrink below legibility.
  const letters = (ch.letters ?? "").trim() || chapterShortName(orgName, ch.letters, ch.nickname);
  const big = letters.length > 12 ? `${letters.slice(0, 11)}…` : letters;
  const campusName = canonicalSchoolName(school, (campus.short_name as string) || (campus.name as string));
  const shortCampus = campusName.length > 26 ? `${campusName.slice(0, 25)}…` : campusName;
  const raw = campus.course_family_codes_json;
  const codes = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
  const courseCode = ((codes?.intro_1 ?? "") as string).trim() || "Intro Accounting";
  const { c1, c2 } = schoolBySlug(school) ? boltForSlug(school) : { c1: "#006BA6", c2: "#00456E" };

  // THE CARD (redesigned 2026-09-14 — lib/share-card.server.tsx): letters · "Alpha Tau Omega - Ole
  // Miss" · "Share ACCY 201 exam prep" · the surv⚡ve wordmark at the foot. No "free" on the card.
  const { renderShareCard, shareAskLine, shareWhoLine, shareCardHeaders } = await import("@/lib/share-card.server");
  const png = await renderShareCard(origin, { mark: big, who: shareWhoLine(orgName, shortCampus), ask: shareAskLine(courseCode === "Intro Accounting" ? null : courseCode), c1, c2 });
  return new Response(Buffer.from(png), { headers: shareCardHeaders() });
}

/** Fallback chain: campus static card → default card. Never a 404. */
async function fallback(origin: string, school: string): Promise<Response> {
  for (const url of [`${origin}/og/campus/${school}.png`, `${origin}/og-card.png`]) {
    try {
      const buf = await fetchBuf(url);
      return new Response(buf, { headers: { "content-type": "image/png", "cache-control": "public, max-age=600, s-maxage=3600" } });
    } catch { /* next */ }
  }
  return new Response("Not found", { status: 404 });
}

async function handle({ request, params }: { request: Request; params: { school: string; chapter: string } }): Promise<Response> {
  // Assets (fonts, fallback PNGs) come from the DEPLOYMENT THAT IS SERVING THIS REQUEST — the
  // canonical prod origin would 404 on a preview or local run whose assets haven't shipped yet.
  const origin = new URL(request.url).origin;
  try {
    return await render(origin, params.school, params.chapter);
  } catch {
    return fallback(origin, params.school);
  }
}

export const Route = createFileRoute("/api/og/$school/$chapter")({
  server: { handlers: { GET: handle } },
} as never);
