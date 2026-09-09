// GET /api/thumb/<setId> — THE SHORT'S COVER, as a PNG you can save.
//
// Lee, 2026-09-09, after finishing the first Blast Off short: "Thumbnails too that I can download
// that it generates?" There was nothing: no thumbnail renderer, no download anywhere in /v3. This
// is it. The composition and the rules for it live in lib/thumb-card.ts; this file is the plumbing.
//
// SAME PIPELINE AS THE OG CARD, for the same hard-won reasons (see api.og.$school.$chapter.tsx,
// which documents them at length): satori lays the text out and outlines it to SVG paths,
// @resvg/resvg-wasm turns that into a PNG from the committed public/resvg.wasm. NOT @vercel/og
// (its edge-only wasm import breaks the Vite client build) and NOT @resvg/resvg-js (its native
// binary broke deploys). Fonts are ArrayBuffers of real .ttf files — .woff2 silently tofus.
//
// ADMIN ONLY, unlike the OG card. An OG card renders what the database already says; this one
// paints ANY text the caller passes onto a Survive-branded frame, so it is gated on the same
// admin cookie every other production surface uses. /v3/post is admin-only anyway, and an <img>
// or a download link carries the cookie same-origin.
//
// QUERY:
//   ?line=  the hook (default: the first card's question, cleaned and trimmed)
//   ?topic= the eyebrow (default: the set's name — the client knows the topic, the deck doesn't)
//   ?ground=navy|gold|cream    ?ar=9x16|16x9    ?dl=1 to force Save-as
import { createFileRoute } from "@tanstack/react-router";

import { fetchBuf, rasterizePng } from "@/lib/rasterize.server";

import {
  cleanHook, defaultHook, eyebrowText, fitHook, isThumbGround, isThumbRatio,
  THUMB_SIZE, THUMB_SKIN, thumbFilename, trimToHook,
  type ThumbGround, type ThumbRatio,
} from "@/lib/thumb-card";

// Canonical bolt geometry — the same paths brand.tsx draws and the OG card prints.
const BOLT_OUTER = "M85.46 8.38 L66.89 32.29 L85.06 31.98 L54.88 51.08 L77.05 50.77 L43.48 73.57 L76.74 73.57 L49.77 92.03 L63.19 94.82 L28.39 111.14 L42.56 112.07 L18.22 120.69 L22.53 128.7 L-8.27 137.63 L15.14 108.99 L-10.73 108.06 L26.85 92.35 L-11.54 90.51 L34.22 62.78 L3.83 64.94 L41.41 44 L25.99 39.73 Z";
const BOLT_RIGHT = "M84.97 8.22 L25.96 40.07 L42.92 44.46 L2.88 65.4 L34.3 61.71 L-10.67 90.66 L28.14 91.89 L-12.21 106.98 L14.99 110.04 L-10.11 138.7 L24.54 129.73 L19.03 121.61 L20.48 114.36 L23.38 107.69 L9.17 105.37 L46.87 95.8 L37.59 91.74 L61.08 78.4 L8.3 85.94 L59.34 56.36 L40.77 54.14 L70.06 35.77 L44.26 35.77 L69.77 22.72 Z";
const VB = { x: -18.21, y: -2.26, w: 109.27, h: 146.96 };

function boltDataUri(c1: string, c2: string, stroke: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB.w} ${VB.h}"><g transform="translate(${-VB.x} ${-VB.y}) rotate(2 ${VB.w} ${VB.h * 0.51})"><path d="${BOLT_OUTER}" fill="${c1}" stroke="${stroke}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/><path d="${BOLT_RIGHT}" fill="${c2}"/></g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** The set's own words: its name and its first card's question, straight out of the bank. */
async function setFacts(setId: string): Promise<{ name: string; stems: string[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as { from: (t: string) => unknown };
  const { loadDecksDeduped } = await import("@/lib/student.functions");
  const owned = await loadDecksDeduped(db as never);
  const o = owned.get(setId);
  if (!o) throw new Error("set not found");
  type CeqData = { prompt?: string; stageOrder?: number; noteOnly?: boolean; draft?: boolean; bankArchived?: string };
  const cards = (o.nodes as { type?: string; data?: CeqData }[])
    .filter((n) => n?.type === "ceq" && !n.data?.noteOnly && !n.data?.draft && !n.data?.bankArchived)
    .sort((a, b) => (a.data?.stageOrder ?? 0) - (b.data?.stageOrder ?? 0));
  return {
    name: String((o.deck as { name?: string }).name ?? "").trim(),
    stems: cards.map((n) => (n.data?.prompt ?? "").trim()).filter(Boolean),
  };
}

async function render(origin: string, setId: string, q: URLSearchParams): Promise<Response> {
  const ratio: ThumbRatio = isThumbRatio(q.get("ar")) ? (q.get("ar") as ThumbRatio) : "9x16";
  const ground: ThumbGround = isThumbGround(q.get("ground")) ? (q.get("ground") as ThumbGround) : "navy";
  const { w: W, h: H } = THUMB_SIZE[ratio];
  const skin = THUMB_SKIN[ground];

  const facts = await setFacts(setId);
  const asked = cleanHook(q.get("line") ?? "");
  const hook = asked ? trimToHook(asked, 90) : defaultHook(facts.name, "", facts.stems);
  const eyebrow = eyebrowText(q.get("topic") ?? "", facts.name);

  // THE BOX. The Shorts safe column (layout.ts) keeps content off the phone's own chrome: the
  // status bar at the top, the caption and sound rail at the bottom, the like/share rail on the
  // right. 16:9 has none of that, so it gets a plain margin.
  const pad = ratio === "9x16" ? Math.round(W * 0.085) : Math.round(W * 0.07);
  const inner = W - pad * 2;
  const hookBox = { width: inner, height: ratio === "9x16" ? Math.round(H * 0.46) : Math.round(H * 0.5) };
  const fit = fitHook(hook, hookBox, ratio === "16x9" ? { sizes: [128, 112, 98, 86, 76, 66, 58, 50] } : undefined);
  const eyeSize = Math.round(W * (ratio === "9x16" ? 0.033 : 0.028));
  const markSize = Math.round(W * (ratio === "9x16" ? 0.062 : 0.05));

  const [rubik, inter] = await Promise.all([
    fetchBuf(`${origin}/fonts/Rubik-Black.ttf`),
    fetchBuf(`${origin}/fonts/Inter-SemiBold.ttf`),
  ]);

  // ── THE CARD ────────────────────────────────────────────────────────────────────────────────
  // Left-aligned and top-weighted, because a cover is read in a grid at about 160px wide and the
  // eye lands top-left. Largest first:
  //
  //     ▍ACCOUNT CLASSIFICATION   the eyebrow — whose exam this is
  //     IS PREPAID RENT           the hook — the question, as large as it will go
  //     AN ASSET?
  //     ───
  //     survive ⚡                 the signature, small
  //
  // The bolt sits behind, bled off the right edge at low opacity: brand presence with nothing
  // competing against the hook for attention.
  const { default: satori } = await import("satori");
  const svg = await satori(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: skin.bg, position: "relative" }}>
        {/* THE BOLT, bled off the right edge. Sized to the frame's height so 16:9 doesn't swallow it. */}
        <img
          src={boltDataUri(skin.boltA, skin.boltB, skin.bg)}
          width={Math.round(H * 0.52 * (VB.w / VB.h))}
          height={Math.round(H * 0.52)}
          style={{ position: "absolute", right: -Math.round(W * 0.06), top: Math.round(H * (ratio === "9x16" ? 0.30 : 0.24)), opacity: ground === "gold" ? 0.16 : 0.13 }}
        />
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: pad, justifyContent: "flex-start" }}>
          {/* THE EYEBROW, with the accent bar that marks where the column starts. */}
          {!!eyebrow && (
            <div style={{ display: "flex", alignItems: "center", marginBottom: Math.round(H * 0.032) }}>
              <div style={{ display: "flex", width: Math.round(eyeSize * 0.34), height: eyeSize, backgroundColor: skin.accent, marginRight: Math.round(eyeSize * 0.6) }} />
              <div style={{ display: "flex", fontFamily: "Inter", fontSize: eyeSize, letterSpacing: eyeSize * 0.14, color: skin.accent }}>{eyebrow}</div>
            </div>
          )}
          {/* THE HOOK. One div per line — the wrap is ours, decided in thumb-card.ts. */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {fit.lines.map((line, i) => (
              <div key={i} style={{ display: "flex", fontFamily: "Rubik", fontSize: fit.size, lineHeight: 1.06, color: skin.ink }}>{line}</div>
            ))}
          </div>
          <div style={{ display: "flex", width: Math.round(inner * 0.16), height: Math.round(H * 0.006), backgroundColor: skin.accent, marginTop: Math.round(H * 0.034) }} />
          <div style={{ display: "flex", flexGrow: 1 }} />
          {/* THE SIGNATURE. */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", fontFamily: "Rubik", fontSize: markSize, color: skin.ink, opacity: 0.92 }}>survive</div>
            <img src={boltDataUri(skin.boltA, skin.boltB, skin.bg)} width={Math.round(markSize * 0.74)} height={Math.round(markSize * 1.0)} style={{ marginLeft: Math.round(markSize * 0.3) }} />
            <div style={{ display: "flex", flexGrow: 1 }} />
            <div style={{ display: "flex", fontFamily: "Inter", fontSize: Math.round(markSize * 0.42), color: skin.ink, opacity: 0.55 }}>surviveaccounting.com</div>
          </div>
        </div>
      </div>
    ),
    {
      width: W, height: H,
      fonts: [
        { name: "Rubik", data: rubik, weight: 900, style: "normal" },
        { name: "Inter", data: inter, weight: 600, style: "normal" },
      ],
    },
  );

  const png = await rasterizePng(origin, svg, W);
  const disposition = q.get("dl") ? `attachment; filename="${thumbFilename(facts.name || hook, ratio)}"` : "inline";
  return new Response(Buffer.from(png), {
    headers: {
      "content-type": "image/png",
      "content-disposition": disposition,
      // Private and short: the inputs are query text Lee is actively editing, and the response is
      // admin-gated — a shared cache must never hold it.
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}

async function handle({ request, params }: { request: Request; params: { setId: string } }): Promise<Response> {
  // Assets (fonts, wasm) come from the DEPLOYMENT SERVING THIS REQUEST — the canonical prod origin
  // would 404 on a preview or a local run whose assets haven't shipped yet.
  const url = new URL(request.url);
  try {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
  } catch {
    return new Response("Not authorized", { status: 403 });
  }
  try {
    return await render(url.origin, params.setId, url.searchParams);
  } catch (e) {
    // Loud, not blank: a broken thumbnail must say why, or the sheet shows a dead image icon and
    // there is nothing to act on.
    return new Response(`thumbnail: ${e instanceof Error ? e.message : String(e)}`, { status: 500, headers: { "content-type": "text/plain" } });
  }
}

export const Route = createFileRoute("/api/thumb/$setId")({
  server: { handlers: { GET: handle } },
} as never);

