// A BLAST OFF VIDEO ON THE SITE — the publication a "Post to the site" press writes onto the set's
// deck, as pure data (site-publish.functions.ts does the writing). Shape: docs/DESIGN-SITE-PUBLISH.md
// §4.2.
//
// Lee, 2026-09-11: "How to actually POST the thing to the site? … Can we have a bypass for that?
// I don't see anywhere where I could just upload a file and have it post." He chose a post button,
// and said a new vertical video may replace a set's existing one.
//
// ONE PUBLICATION PER VIDEO (a split is a video), id `pb:blastoff:<pubKey>`, so pressing again
// REPLACES it instead of stacking a second. Kind "blast", state "shipped" — the kind the student
// tree already reads — with `framing: "9:16"`, the split's position (`takeIndex`) and its name, so
// the tree can list a set's parts in order (student-shorts.ts). `source: "blastoff"` marks it; the
// `pb:blastoff:` namespace can't collide with the Studio's `pb:set:` / `pb:lesson:` ids.
//
// Module-scope callables are function declarations (the render-path TDZ rule).

export interface SitePostInput {
  pubKey: string;
  takeIndex: number;
  takeName: string;
  title: string;
  description?: string;
  muxAssetId: string;
  muxPlaybackId: string;
  durationS: number | null;
  access: "free" | "paid";
  /** Where the bytes came from (the canvas-media take), so a re-ingest has a source. */
  sourceUrl: string;
  now?: Date;
}

export function sitePublicationId(pubKey: string): string {
  return `pb:blastoff:${pubKey}`;
}

export function sitePublication(i: SitePostInput): Record<string, unknown> {
  const now = i.now ?? new Date();
  return {
    id: sitePublicationId(i.pubKey),
    kind: "blast",
    state: "shipped",
    destinations: ["site"],
    framing: "9:16",
    takeIndex: i.takeIndex,
    takeName: i.takeName,
    pubKey: i.pubKey,
    source: "blastoff",
    meta: { title: i.title, description: i.description ?? "" },
    render: { at: now.getTime(), muxAssetId: i.muxAssetId, muxPlaybackId: i.muxPlaybackId, durationS: i.durationS },
    shipped: { at: now.getTime(), access: i.access === "paid" ? "PAID" : "FREE" },
    sourceUrl: i.sourceUrl,
    createdAt: now.toISOString(),
  };
}

/** Replace the publication with the same id, or append it. A new array; the input is untouched. */
export function upsertPublication(pubs: readonly Record<string, unknown>[] | undefined, pub: Record<string, unknown>): Record<string, unknown>[] {
  const list = [...(pubs ?? [])];
  const i = list.findIndex((p) => p?.id === pub.id);
  if (i >= 0) list[i] = pub;
  else list.push(pub);
  return list;
}

/** The asset's PUBLIC playback id, or null. Strictly public: the student player streams unsigned
 *  HLS, so falling back to a signed id would post a video no student can play. */
export function publicPlaybackIdOf(asset: { playback_ids?: { id: string; policy: string }[] }): string | null {
  return asset.playback_ids?.find((p) => p.policy === "public")?.id ?? null;
}

/** The set and the part a publish key names: "<setId>" is part 1 (index 0), "<setId>#N" is part N
 *  (index N-1) — the /v3/post row key (v3.post.tsx). The /v3 map opens post-production with the
 *  key alone, so the panel reads the split from it. */
export function splitOfPubKey(pubKey: string): { setId: string; takeIndex: number } {
  const m = pubKey.match(/^(.+)#(\d+)$/);
  return m ? { setId: m[1], takeIndex: Math.max(0, Number(m[2]) - 1) } : { setId: pubKey, takeIndex: 0 };
}

/** The link the row's site tick opens: the set on /learn. */
export function siteLinkFor(setId: string, origin = "https://surviveaccounting.com"): string {
  return `${origin}/learn?set=${encodeURIComponent(setId)}`;
}
