// STITCHES & PUBLICATIONS — the layer between takes and Mux.
//
//   takes are captured · stitches are cut · publications are shipped.
//
// (Sets are still filmed, topics are still sold. Nothing existing is renamed.)
//
// A TAKE is one raw recording; the local original is never deleted. A STITCH is
// an ordered assembly of takes plus its edit decisions — trims, gaps, room tone,
// crossfades, loudness. A PUBLICATION is a stitch plus a destination, a framing
// and its own metadata. One stitch → many publications, which is the whole point:
// the same edit ships as a 16:9 blast on the site and a 9:16 short on YouTube.
//
// THE CENTRAL RULE: a stitch is a RECIPE over immutable takes, never a
// destructive bake. `cut` caches the last render; `items` is the truth. Re-cutting
// with different settings must always be possible, so nothing in here ever
// rewrites a take or drops one — `muted` removes a clip from the cut while keeping
// the decision.
//
// Everything in this file is pure. It is deliberately free of React, of the
// scene, and of the network, so the migration can be dry-run in a test.

import type { TakeRef } from "./types";

// ---------------------------------------------------------------- the records

export interface StitchItem {
  /** → TakeRef.path. The storage path is already unique and durable, so takes
   *  need no new id and no migration to acquire one. */
  takePath: string;
  /** DEFAULTS, not bakes: undefined ⇒ slateEndMs/1000, else silence detection.
   *  A number here is an explicit override and always wins. */
  trimInS?: number;
  trimOutS?: number;
  gapAfterMs?: number;
  /** What this clip covers — drives chapters. */
  ceqId?: string;
  momentId?: string;
  /** Dropped from the cut WITHOUT losing the decision. */
  muted?: boolean;
}

export type StitchScope =
  | { kind: "ceq"; ceqId: string }
  | { kind: "run"; run: string }
  | { kind: "set" };

export interface StitchDef {
  id: string;
  scope: StitchScope;
  label?: string;
  items: StitchItem[];
  audio?: {
    roomTonePath?: string;
    gapMs?: number;
    jitterMs?: number;
    crossfadeMs?: number;
    loudnessLufs?: number;
  };
  /** CACHE of the last cut — never authoritative over `items`. */
  cut?: {
    at: number;
    totalS: number;
    chapters: { ceqId?: string; momentId?: string; start: number; end: number }[];
    asset?: TakeRef;
  };
  /** Bumps on every re-cut. A publication carries the rev it rendered from, so a
   *  mismatch IS the staleness signal — one integer, no timestamp arithmetic and
   *  no content hashing to get subtly wrong. */
  rev: number;
}

export type PublicationKind = "blast" | "short" | "lookback";
export type Destination = "site" | "youtube";
export type Framing = "16:9" | "9:16";
export type PublicationState = "draft" | "rendered" | "shipped";

export interface PublicationDef {
  id: string;
  stitchId: string;
  /** The stitch rev this was rendered from. Absent until first render. */
  stitchRev?: number;
  kind: PublicationKind;
  destinations: Destination[];
  framing: Framing;
  /** REQUIRED for 9:16 — there is no auto-crop path anywhere in the code. */
  reframeId?: string;
  state: PublicationState;
  meta: { title?: string; description?: string; chapters?: { t: number; label: string }[] };
  render?: { at: number; muxAssetId?: string; muxPlaybackId?: string; durationS?: number };
  shipped?: { at: number; lessonId?: string; access?: "FREE" | "PAID"; youtubeUrl?: string };
  /** Every gate clicked past, recorded. A blocked publish that ships anyway
   *  leaves a trail. */
  overrides?: { gateId: string; at: number; why?: string }[];
}

export interface Rect { x: number; y: number; w: number; h: number }

/** An AUTHORED vertical layout. Composite, not crop: each slot takes a region of
 *  the 1920×1080 source and places it into the 1080×1920 canvas, so the CEQ card
 *  and the camera cutout both survive — which a center crop loses. Saved and
 *  reusable, so the second short costs one click. */
export interface ReframeDef {
  id: string;
  name: string;
  framing: "9:16";
  slots: { role: "card" | "camera"; src: Rect; dst: Rect }[];
  background?: string;
}

export const VERTICAL_W = 1080;
export const VERTICAL_H = 1920;
export const SOURCE_W = 1920;
export const SOURCE_H = 1080;

// ------------------------------------------------------------- pure behaviour

/** DETERMINISTIC ids. The migration must be idempotent — running it twice can
 *  never double a set's records — so every migrated id is derived from what it
 *  came from rather than from a counter or a clock. */
export const ceqStitchId = (ceqId: string): string => `st:ceq:${ceqId}`;
export const setStitchId = (deckId: string): string => `st:set:${deckId}`;
export const runStitchId = (deckId: string, run: string): string => `st:run:${deckId}:${run}`;
export const lessonPubId = (lessonId: string): string => `pb:lesson:${lessonId}`;

/** A publication is STALE when its stitch has been re-cut since it rendered.
 *  A draft has nothing rendered yet, so it is never stale. */
export function isStale(pub: PublicationDef, stitch: StitchDef | undefined): boolean {
  if (!stitch || pub.state === "draft" || pub.stitchRev == null) return false;
  return stitch.rev > pub.stitchRev;
}

/** The clips that actually make the cut, in order. */
export const liveItems = (s: StitchDef): StitchItem[] => s.items.filter((i) => !i.muted);

/** Build a stitch's items from a CEQ's clip stack. Trims are left UNDEFINED so
 *  the slate offset (or silence detection) still decides them at cut time — the
 *  recipe records what to assemble, not what the assembler already knows. */
export function itemsFromTakes(takes: TakeRef[], ceqId?: string): StitchItem[] {
  return takes.map((t) => ({
    takePath: t.path,
    ...(ceqId ? { ceqId } : {}),
    ...(t.momentId ? { momentId: t.momentId } : {}),
  }));
}

export function newStitch(id: string, scope: StitchScope, items: StitchItem[], label?: string): StitchDef {
  return { id, scope, items, rev: 1, ...(label ? { label } : {}) };
}

/** Re-cutting bumps the rev. Callers must route every edit to `items`/`audio`
 *  through this, or staleness silently stops working. */
export function recut(s: StitchDef, patch: Partial<Pick<StitchDef, "items" | "audio" | "label">>): StitchDef {
  return { ...s, ...patch, rev: s.rev + 1 };
}

// ------------------------------------------------------------- the publish gate

export interface GateItem {
  id: string;
  level: "block" | "confirm";
  text: string;
}

export interface GateContext {
  /** Total runtime of the cut, seconds — from `stitch.cut`, or measured. */
  totalS?: number;
  /** Does the render plan bake a brand overlay? Color/LUT and the slate trim bake;
   *  brand overlays must not. */
  bakesWatermark?: boolean;
  /** Site publishing needs a resolved lesson + an explicit tier. */
  lessonId?: string | null;
  access?: "FREE" | "PAID" | null;
  /** Does a saved reframe with this id exist? */
  reframeExists?: boolean;
  /** Is the LAST item in the cut the rip? Shorts rip only at the end. */
  ripAtEnd?: boolean;
}

export const SHORT_MIN_S = 22;
export const SHORT_MAX_S = 30;

/** Every rule Lee shouldn't have to remember, in one place. `block` cannot
 *  proceed without an explicit override click; `confirm` is a checkbox, used
 *  ONLY where the machine genuinely cannot verify the thing.
 *
 *  Pure — it returns the list, it never publishes. */
export function publishGate(pub: PublicationDef, stitch: StitchDef | undefined, ctx: GateContext = {}): GateItem[] {
  const out: GateItem[] = [];
  const has = (s?: string) => !!s && s.trim().length > 0;

  if (!stitch) out.push({ id: "all/stitch-missing", level: "block", text: "this publication points at a stitch that no longer exists" });

  // ---- framing ------------------------------------------------------------
  if (pub.framing === "9:16" && (!pub.reframeId || ctx.reframeExists === false)) {
    out.push({ id: "framing/no-reframe", level: "block", text: "this vertical has no authored reframe — author one or pick a saved one. There is no auto-crop: a center crop loses the CEQ card and the cutout" });
  }

  // ---- shorts -------------------------------------------------------------
  if (pub.kind === "short") {
    // Not automatable. Prompt, never guess.
    out.push({ id: "short/no-solved-je", level: "confirm", text: "Confirm by eye: no legible SOLVED journal entry is visible anywhere in this short" });
    if (ctx.ripAtEnd === false) out.push({ id: "short/rip-at-end", level: "block", text: "a short rips only at the END — the rip is not the last clip in this cut" });
    const t = ctx.totalS ?? stitch?.cut?.totalS;
    if (t != null && (t < SHORT_MIN_S || t > SHORT_MAX_S)) {
      out.push({ id: "short/duration", level: "block", text: `a short runs ${SHORT_MIN_S}–${SHORT_MAX_S}s — this cut is ${t.toFixed(1)}s` });
    }
  }

  // ---- destinations -------------------------------------------------------
  if (pub.destinations.includes("youtube")) {
    if (!has(pub.meta.title)) out.push({ id: "yt/title", level: "block", text: "YouTube needs a title" });
    if (!has(pub.meta.description)) out.push({ id: "yt/description", level: "block", text: "YouTube needs a description" });
    else if (!/surviveaccounting\.com/i.test(pub.meta.description ?? "")) out.push({ id: "yt/description-line", level: "block", text: "the YouTube description is missing the surviveaccounting.com line" });
    if ((stitch?.cut?.chapters?.length ?? 0) > 0 && !(pub.meta.chapters?.length)) {
      out.push({ id: "yt/chapters", level: "block", text: "this stitch has chapters — attach them as YouTube timestamps" });
    }
    // APPROVED 08-16: YouTube has no overlay layer we control, so a YouTube
    // publication ships UNWATERMARKED. Surfaced as a confirm, never a block.
    out.push({ id: "yt/unwatermarked", level: "confirm", text: "this ships to YouTube UNWATERMARKED — there is no overlay layer we control off-site" });
  }
  if (pub.destinations.includes("site")) {
    if (!ctx.lessonId) out.push({ id: "site/attached", level: "block", text: "not attached to a CEQ / run / set that resolves to a lesson" });
    if (!ctx.access) out.push({ id: "site/tier", level: "block", text: "free-vs-paid is not set — a tier must be chosen, never inferred" });
  }
  if (!pub.destinations.length) out.push({ id: "all/no-destination", level: "block", text: "no destination chosen" });

  // ---- everything ---------------------------------------------------------
  if (ctx.bakesWatermark) {
    out.push({ id: "all/no-baked-watermark", level: "block", text: "the render plan BAKES a watermark — color/LUT and the slate trim bake, brand overlays never do" });
  }
  return out;
}

export const gateBlocks = (items: GateItem[]): GateItem[] => items.filter((i) => i.level === "block");
export const gateReady = (items: GateItem[], acked: Set<string>): boolean =>
  items.every((i) => acked.has(i.id));

// ------------------------------------------------------------- the migration

export interface MigrationCard {
  id: string;
  deckId: string;
  run?: string;
  takes: TakeRef[];
  stitched?: TakeRef;
  moments?: { id: string; startMs?: number; label?: string }[];
}
export interface MigrationLesson {
  id: string;
  deckId: string;
  access?: "FREE" | "PAID";
  muxAssetId?: string | null;
  muxPlaybackId?: string | null;
  muxPublishedAt?: number;
  muxDurationS?: number;
  ceqManifest?: { ceqId?: string; start: number; end: number }[];
}
export interface MigrationDeck {
  id: string;
  name: string;
  stitches?: StitchDef[];
  publications?: PublicationDef[];
  intro?: TakeRef;
  outro?: TakeRef;
  wrap?: TakeRef[];
  lookback?: TakeRef;
}
export interface MigrationInput {
  decks: MigrationDeck[];
  cards: MigrationCard[];
  lessons: MigrationLesson[];
}

export interface DeckPlan {
  deckId: string;
  deckName: string;
  ceqStitches: StitchDef[];
  setStitches: StitchDef[];
  publications: PublicationDef[];
  /** Records already present, skipped so a second run changes nothing. */
  skipped: number;
}
export interface MigrationPlan {
  perDeck: DeckPlan[];
  totals: { decks: number; ceqStitches: number; setStitches: number; publications: number; skipped: number };
  /** Things that could not be mapped, named rather than dropped silently. */
  orphans: { what: string; why: string }[];
  /** WHAT WAS SCANNED. A bare "0 to migrate" is indistinguishable from a broken
   *  scanner, so the report says what it looked at as well as what it found. */
  scanned: { decks: number; cards: number; cardsWithClips: number; lessons: number; publishedLessons: number };
}

/** Build the whole plan WITHOUT writing anything. This is the dry run: the same
 *  function produces the report and the records that `applyPlan` would commit, so
 *  what Lee reads is exactly what would land. Idempotent by construction — an id
 *  that already exists on the deck is skipped, never duplicated. */
export function migrationPlan(input: MigrationInput): MigrationPlan {
  const perDeck: DeckPlan[] = [];
  const orphans: { what: string; why: string }[] = [];
  const deckById = new Map(input.decks.map((d) => [d.id, d]));

  for (const deck of input.decks) {
    const have = new Set([...(deck.stitches ?? []).map((s) => s.id), ...(deck.publications ?? []).map((p) => p.id)]);
    const plan: DeckPlan = { deckId: deck.id, deckName: deck.name, ceqStitches: [], setStitches: [], publications: [], skipped: 0 };

    // --- per-CEQ: the clip stack becomes a stitch (n=1 is the common case) ---
    for (const card of input.cards.filter((c) => c.deckId === deck.id)) {
      if (!card.takes.length && !card.stitched) continue;
      const id = ceqStitchId(card.id);
      if (have.has(id)) { plan.skipped++; continue; }
      const s = newStitch(id, { kind: "ceq", ceqId: card.id }, itemsFromTakes(card.takes, card.id));
      // An ALREADY-BAKED dissect asset is preserved as the cached cut, so
      // migrating re-renders nothing.
      if (card.stitched) {
        const chapters = (card.moments ?? [])
          .filter((m) => m.startMs != null)
          .map((m, i, arr) => ({
            momentId: m.id,
            ceqId: card.id,
            start: (m.startMs as number) / 1000,
            end: (arr[i + 1]?.startMs != null ? (arr[i + 1].startMs as number) / 1000 : card.stitched?.duration ?? (m.startMs as number) / 1000),
          }));
        s.cut = { at: 0, totalS: card.stitched.duration ?? 0, chapters, asset: card.stitched };
      }
      plan.ceqStitches.push(s);
    }

    // --- set level: intro / bumpers / wrap / outro ---------------------------
    const setTakes = [deck.intro, ...(deck.wrap ?? []), deck.outro].filter((t): t is TakeRef => !!t);
    if (setTakes.length) {
      const id = setStitchId(deck.id);
      if (have.has(id)) plan.skipped++;
      else plan.setStitches.push(newStitch(id, { kind: "set" }, itemsFromTakes(setTakes), "set frame"));
    }

    // --- the lookback: its own pass, never derived from blast material -------
    if (deck.lookback) {
      const id = `${setStitchId(deck.id)}:lookback`;
      if (have.has(id)) plan.skipped++;
      else {
        plan.setStitches.push(newStitch(id, { kind: "set" }, itemsFromTakes([deck.lookback]), "lookback"));
        plan.publications.push({
          id: `pb:lookback:${deck.id}`,
          stitchId: id,
          kind: "lookback",
          destinations: [],
          framing: "9:16",
          state: "draft",
          meta: {},
        });
      }
    }

    // --- published lessons become shipped publications ----------------------
    for (const les of input.lessons.filter((l) => l.deckId === deck.id)) {
      if (!les.muxPlaybackId && !les.muxAssetId) continue;
      const id = lessonPubId(les.id);
      if (have.has(id)) { plan.skipped++; continue; }
      const stitchId = setStitchId(deck.id);
      plan.publications.push({
        id,
        stitchId,
        stitchRev: 1,
        kind: "blast",
        destinations: ["site"],
        framing: "16:9",
        state: "shipped",
        meta: {
          ...(les.ceqManifest?.length ? { chapters: les.ceqManifest.map((c, i) => ({ t: c.start, label: c.ceqId ?? `part ${i + 1}` })) } : {}),
        },
        render: {
          at: les.muxPublishedAt ?? 0,
          ...(les.muxAssetId ? { muxAssetId: les.muxAssetId } : {}),
          ...(les.muxPlaybackId ? { muxPlaybackId: les.muxPlaybackId } : {}),
          ...(les.muxDurationS != null ? { durationS: les.muxDurationS } : {}),
        },
        shipped: { at: les.muxPublishedAt ?? 0, lessonId: les.id, ...(les.access ? { access: les.access } : {}) },
      });
    }
    perDeck.push(plan);
  }

  // --- what could NOT be mapped, said out loud ------------------------------
  for (const les of input.lessons) {
    if (!les.muxPlaybackId && !les.muxAssetId) continue;
    if (!deckById.has(les.deckId)) orphans.push({ what: `lesson ${les.id}`, why: "published, but belongs to no set in this scene — left exactly as it is" });
  }
  for (const c of input.cards) {
    if (!deckById.has(c.deckId) && (c.takes.length || c.stitched)) orphans.push({ what: `frame ${c.id}`, why: "has clips, but belongs to no set in this scene" });
  }

  const totals = perDeck.reduce(
    (a, p) => ({
      decks: a.decks + (p.ceqStitches.length + p.setStitches.length + p.publications.length ? 1 : 0),
      ceqStitches: a.ceqStitches + p.ceqStitches.length,
      setStitches: a.setStitches + p.setStitches.length,
      publications: a.publications + p.publications.length,
      skipped: a.skipped + p.skipped,
    }),
    { decks: 0, ceqStitches: 0, setStitches: 0, publications: 0, skipped: 0 },
  );
  const scanned = {
    decks: input.decks.length,
    cards: input.cards.length,
    cardsWithClips: input.cards.filter((c) => c.takes.length || c.stitched).length,
    lessons: input.lessons.length,
    publishedLessons: input.lessons.filter((l) => l.muxPlaybackId || l.muxAssetId).length,
  };
  return { perDeck, totals, orphans, scanned };
}

/** The plan as the table Lee reads before approving. Pure string building — the
 *  report and the write come from the SAME plan object, so the report can't drift
 *  from what would land. */
export function planReport(plan: MigrationPlan): string {
  const L: string[] = [];
  L.push("STITCH / PUBLICATION MIGRATION — DRY RUN (nothing written)");
  L.push("");
  L.push();
  L.push("");
  // Say what was LOOKED AT, not just what was found — a bare "0 to migrate" is
  // indistinguishable from a scanner that read nothing.
  L.push(`SCANNED: ${plan.scanned.decks} sets · ${plan.scanned.cardsWithClips} frames carrying clips · ${plan.scanned.publishedLessons} of ${plan.scanned.lessons} resolved lessons published`);
  L.push("");
  L.push("set                              ceq   set   pub   skipped");
  L.push("─".repeat(60));
  for (const p of plan.perDeck) {
    if (!p.ceqStitches.length && !p.setStitches.length && !p.publications.length && !p.skipped) continue;
    const name = p.deckName.length > 30 ? p.deckName.slice(0, 29) + "…" : p.deckName.padEnd(30);
    L.push(`${name}  ${String(p.ceqStitches.length).padStart(4)}  ${String(p.setStitches.length).padStart(4)}  ${String(p.publications.length).padStart(4)}  ${String(p.skipped).padStart(7)}`);
  }
  L.push("─".repeat(60));
  L.push(`TOTAL: ${plan.totals.ceqStitches} ceq-stitches · ${plan.totals.setStitches} set-stitches · ${plan.totals.publications} publications · ${plan.totals.skipped} already present (skipped)`);
  L.push("");
  L.push("NOTHING IS DELETED OR MOVED. Every record above ADDS a recipe that points");
  L.push("at takes that stay exactly where they are. Lesson mux fields are untouched —");
  L.push("they remain the student read path; publications become the record behind them.");
  if (plan.orphans.length) {
    L.push("");
    L.push(`COULD NOT MAP (${plan.orphans.length}) — left alone, never guessed at:`);
    for (const o of plan.orphans) L.push(`  · ${o.what} — ${o.why}`);
  }
  return L.join("\n");
}

/** Fold a deck's planned records into it. Pure: returns the patch, writes nothing. */
export function applyToDeck(deck: MigrationDeck, plan: DeckPlan): { stitches: StitchDef[]; publications: PublicationDef[] } {
  return {
    stitches: [...(deck.stitches ?? []), ...plan.ceqStitches, ...plan.setStitches],
    publications: [...(deck.publications ?? []), ...plan.publications],
  };
}
