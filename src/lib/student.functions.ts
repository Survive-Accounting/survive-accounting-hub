// STUDENT SHELL (server, #7) — the ONLY path that serves CEQ sets to students. It filters
// DeckDef.status='live' SERVER-SIDE so draft content never reaches the client (#6 contract),
// resolves each live set's published Mux playback id (lessonId → lesson_videos, newest ready),
// and groups by course → topic (chapters). Signed-out students hit this too — service-role
// reads bypass RLS, and only live sets ever leave the server.
//
// Sets live in canvas_scenes.nodes_json (SceneDoc.decks[]), not a table, so this scans scenes
// and flattens their live card-decks. Fine at current scale; revisit if scenes balloon.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** A SET is one Cram Blast → Practice → Review sequence (the product model, 08-20).
 *
 *  Stage sources, all already authored per set:
 *   - CRAM   = the set's shipped `blast` publication (DeckDef.publications), falling back to
 *              the legacy lesson_videos path. Carried in `playbackId`/`runtimeSec` so every
 *              existing consumer keeps reading the cram video unchanged.
 *   - PRACTICE = the set's CEQ cards (fetchSetPractice) — `ceqCount` is the count.
 *   - REVIEW = the set's shipped `lookback` publication. OPTIONAL by design — most sets have
 *              none yet; `hasReview` is the flag, ids are never invented.
 *  Paid sets have ALL playback ids withheld (getSetPlayback re-checks the grant per stage). */
export interface StudentSet {
  id: string; // DeckDef.id
  name: string;
  access: "free" | "paid";
  orientation: "landscape" | "portrait"; // 16:9 lesson vs 9:16 lookback — player switches aspect
  playbackId: string | null; // CRAM video; null = live set with no published cram yet ("coming soon")
  ceqCount: number; // # of CEQ question cards in the set (notes excluded) — the practice stage size
  runtimeSec: number | null; // cram runtime in seconds (blast publication, else lesson_videos.duration_sec)
  /** SHORTHAND (08-23) — the problem-type label the left-rail row should show ("Account
   *  classification", "Accounting equation effects"). Comes from the FIRST CEQ's authored
   *  `shorthand` field. Null when no shorthand is authored; the rail falls back to `name`. */
  shortLabel: string | null;
  /** REVIEW stage — Lee working the questions. Shipped for only some sets; never faked. */
  hasReview: boolean;
  reviewPlaybackId: string | null; // withheld for paid sets even when hasReview
  reviewRuntimeSec: number | null;
  /** First question's stem — the outline row TEASER. For PAID sets, author-marked blurRanges are
   *  redacted SERVER-SIDE into ░ blocks before this ever leaves the server (the hidden words never
   *  reach an unentitled client). Free sets carry the full stem. Null = set has no CEQ yet. */
  firstStem: string | null;
}
export interface StudentTopic { id: string; name: string; shortLabel: string | null; number: number | null; sets: StudentSet[] }
export interface StudentUnit { id: string; name: string; topics: StudentTopic[] }
export interface StudentCourse { id: string; name: string; family: string | null; units: StudentUnit[]; topics: StudentTopic[] }

const COURSE_ORDER = ["Start Here", "Intro 1", "Intro 2", "IA1", "IA2"];
const courseRank = (n: string) => { const i = COURSE_ORDER.findIndex((o) => o.toLowerCase() === n.trim().toLowerCase()); return i < 0 ? COURSE_ORDER.length + 1 : i; };
const setName = (n?: string) => (n ?? "Set").replace(/^\s*ch\s*\d+\s*·\s*/i, "").trim() || "Set";

/** A shipped per-set publication (DeckDef.publications) — `blast` = cram, `lookback` = review. */
export type RawPub = { id?: string; kind?: string; state?: string; render?: { muxPlaybackId?: string | null; durationS?: number | null } };
type RawDeck = { id: string; name?: string; payloadType?: string; status?: string; access?: string; lessonId?: string | null; topicId?: string | null; courseId?: string | null; parked?: boolean; sortOrder?: number; publications?: RawPub[] };
/** The set's shipped publication of a kind, or null. state must be "shipped" WITH a playback id —
 *  a rendered-but-never-shipped cut is not student content. */
export const shippedPub = (d: { publications?: RawPub[] }, kind: "blast" | "lookback"): RawPub | null =>
  (d.publications ?? []).find((p) => p?.kind === kind && p?.state === "shipped" && p?.render?.muxPlaybackId) ?? null;
const pubDur = (p: RawPub | null): number | null => (p?.render?.durationS != null ? Math.round(p.render.durationS) : null);

// ---- SCENE DEDUPE (launch blocker, 08-21) ------------------------------------------------------
// Every set exists in TWO scenes: the 30-set workspace scene (08-14) and its own per-set scene
// (edited 08-19/20). Ownership order: PER-SET scenes (exactly one card deck) first, then by
// updated_at newest-first — so even if the workspace is touched later and becomes "newest", the
// per-set copy still wins. A deck's cards are read only from its winning scene. Shared by the
// tree, practice, and playback.
export type RawNode = { id?: string; type?: string; data?: Record<string, unknown> };
export interface OwnedDeck { deck: RawDeck; sceneId: string; nodes: RawNode[] }
export async function loadDecksDeduped(admin: { from: (t: string) => any }): Promise<Map<string, OwnedDeck>> {
  const { data: scenes, error } = await admin.from("canvas_scenes").select("id,updated_at,nodes_json").order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const owned = new Map<string, OwnedDeck>();
  const cardDecks = (s: { nodes_json?: { decks?: RawDeck[] } }) => (s.nodes_json?.decks ?? []).filter((d) => d.payloadType === "cards").length;
  const ordered = ((scenes ?? []) as { id: string; nodes_json?: { decks?: RawDeck[]; nodes?: RawNode[] } }[]).slice().sort((a, b) => (cardDecks(a) === 1 ? 0 : 1) - (cardDecks(b) === 1 ? 0 : 1));
  for (const s of ordered) {
    const nodes = s.nodes_json?.nodes ?? [];
    for (const d of s.nodes_json?.decks ?? []) {
      if (d.payloadType !== "cards" || owned.has(d.id)) continue;
      owned.set(d.id, { deck: d, sceneId: s.id, nodes: nodes.filter((n) => n?.type === "ceq" && n.data?.deckId === d.id) });
    }
  }
  return owned;
}
/** Live, unparked card decks only — the student visibility gate, after dedupe. */
export const liveDecks = (owned: Map<string, OwnedDeck>): OwnedDeck[] =>
  [...owned.values()].filter((o) => o.deck.status === "live" && o.deck.parked !== true);

export const fetchStudentTree = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data: input }): Promise<StudentCourse[]> => {
  const campusId = input?.campusId;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as { from: (t: string) => any };

  // 1) Every scene → LIVE card-decks only (the server-side visibility gate), DEDUPED by deck id.
  const owned = await loadDecksDeduped(admin);
  const live: RawDeck[] = [];
  // CEQ count per deck: a set's question count = nodes of type "ceq" whose data.deckId is the deck
  // (the same membership the Studio uses). Powers the "N questions" line on each outline set row.
  const ceqCountByDeck = new Map<string, number>();
  // FIRST STEM per deck (lowest stageOrder) — the outline teaser, with its blur ranges for paid redaction.
  const firstCeqByDeck = new Map<string, { order: number; prompt: string; blur: { s: number; e: number }[]; shorthand: string | null }>();
  type RawCeqData = { deckId?: string; stageOrder?: number; prompt?: string; blurRanges?: { s: number; e: number }[]; noteOnly?: boolean; draft?: boolean; bankArchived?: string };
  // PARKED sets are authoring-only — never served, regardless of status (same law as parked topics).
  for (const o of liveDecks(owned)) {
    live.push(o.deck);
    for (const n of o.nodes as { type?: string; data?: RawCeqData }[]) {
      if (n?.type !== "ceq") continue;
      // NOTE frames are film chrome, not questions — excluded from the counter AND practice,
      // per the CeqCard contract ("excluded from the student question counter").
      if (n.data?.noteOnly) continue;
      // DRAFTS and soft-archived cards are studio-only (master-sheet status law):
      // they never count, never tease, never reach a student surface.
      if (n.data?.draft || n.data?.bankArchived) continue;
      const did = n.data?.deckId;
      if (!did) continue;
      ceqCountByDeck.set(did, (ceqCountByDeck.get(did) ?? 0) + 1);
      const order = n.data?.stageOrder ?? 0;
      const cur = firstCeqByDeck.get(did);
      const sh = (n.data as { shorthand?: string } | undefined)?.shorthand?.trim() || null;
      if (!cur || order < cur.order) firstCeqByDeck.set(did, { order, prompt: (n.data?.prompt ?? "").trim(), blur: Array.isArray(n.data?.blurRanges) ? n.data!.blurRanges! : [], shorthand: sh });
    }
  }
  if (!live.length) return [];

  // SERVER-SIDE redaction for paid display: replace each author-marked range with a ░ block. The
  // redacted words never leave the server for a paid set — the tease is the shape, not the specifics.
  const redact = (text: string, ranges: { s: number; e: number }[]): string => {
    if (!ranges.length) return text;
    const sorted = ranges.slice().sort((a, b) => a.s - b.s);
    let out = "", pos = 0;
    for (const r of sorted) {
      const s = Math.max(0, Math.min(text.length, r.s)), e = Math.max(s, Math.min(text.length, r.e));
      if (s > pos) out += text.slice(pos, s);
      if (e > s) out += "░░░░";
      pos = Math.max(pos, e);
    }
    return out + text.slice(pos);
  };
  const stemFor = (deckId: string, paid: boolean): string | null => {
    const c = firstCeqByDeck.get(deckId);
    if (!c || !c.prompt) return null;
    return paid ? redact(c.prompt, c.blur) : c.prompt;
  };
  const shortFor = (deckId: string): string | null => firstCeqByDeck.get(deckId)?.shorthand ?? null;

  // 2) Published playback ids by lessonId (newest ready). A missing lesson_videos table just
  //    means "no videos yet" — degrade to null, never crash the shell.
  const lessonIds = [...new Set(live.map((d) => d.lessonId).filter((x): x is string => !!x))];
  const pb = new Map<string, string>();
  const dur = new Map<string, number>(); // lesson_id → duration_sec (the runtime badge)
  if (lessonIds.length) {
    // duration_sec ships in 20260820_1500 (manual-apply) — degrade to the old select until applied.
    let r = await admin.from("lesson_videos").select("lesson_id,playback_id,version,stage,duration_sec").in("lesson_id", lessonIds).eq("stage", "ready").order("version", { ascending: false });
    if (r.error && /duration_sec|column/i.test(String(r.error.message ?? ""))) r = await admin.from("lesson_videos").select("lesson_id,playback_id,version,stage").in("lesson_id", lessonIds).eq("stage", "ready").order("version", { ascending: false });
    for (const v of (r.data ?? []) as { lesson_id: string; playback_id: string | null; duration_sec?: number | null }[]) {
      if (v.playback_id && !pb.has(v.lesson_id)) {
        pb.set(v.lesson_id, v.playback_id);
        if (v.duration_sec != null) dur.set(v.lesson_id, v.duration_sec);
      }
    }
  }

  // 3) Topics (chapters) + their courses.
  const topicIds = [...new Set(live.map((d) => d.topicId).filter((x): x is string => !!x))];
  const chById = new Map<string, { id: string; name: string | null; short: string | null; number: number | null; courseId: string | null }>();
  if (topicIds.length) {
    // short_label ships in 0101 (manual-apply) — degrade gracefully until it's applied.
    let r = await admin.from("chapters").select("id,chapter_name,short_label,chapter_number,course_id").in("id", topicIds);
    if (r.error && /short_label|column/i.test(String(r.error.message ?? ""))) r = await admin.from("chapters").select("id,chapter_name,chapter_number,course_id").in("id", topicIds);
    for (const c of (r.data ?? []) as { id: string; chapter_name: string | null; short_label?: string | null; chapter_number: number | null; course_id: string | null }[]) chById.set(c.id, { id: c.id, name: c.chapter_name, short: c.short_label ?? null, number: c.chapter_number ?? null, courseId: c.course_id ?? null });
  }
  const courseIds = [...new Set([...chById.values()].map((c) => c.courseId).filter((x): x is string => !!x))];
  const coById = new Map<string, { id: string; name: string; family: string | null }>();
  if (courseIds.length) {
    const { data: cos } = await admin.from("courses").select("id,course_name,code,course_family").in("id", courseIds);
    for (const c of (cos ?? []) as { id: string; course_name: string | null; code: string | null; course_family: string | null }[]) coById.set(c.id, { id: c.id, name: c.course_name ?? c.code ?? "Course", family: c.course_family ?? null });
  }

  // 4) Build course → topic → sets. A set with no resolvable course is dropped (unplaceable).
  const courses = new Map<string, StudentCourse>();
  const topics = new Map<string, StudentTopic>();
  // Set order WITHIN a topic = DeckDef.sortOrder (outline drag-order), name as the tiebreak —
  // "Set 1 → Set 2 → Set 3" must match the authored outline, not scene-scan order.
  const setOrderKey = new Map<string, number>();
  const ensureCourse = (id: string, name: string, family: string | null): StudentCourse => { let c = courses.get(id); if (!c) { c = { id, name, family, units: [], topics: [] }; courses.set(id, c); } return c; };
  const ensureTopic = (course: StudentCourse, t: { id: string; name: string | null; short: string | null; number: number | null }): StudentTopic => {
    let top = topics.get(t.id); if (!top) { top = { id: t.id, name: t.name ?? "Topic", shortLabel: t.short, number: t.number, sets: [] }; topics.set(t.id, top); course.topics.push(top); } return top;
  };
  for (const d of live) {
    // ALL-DRAFT SETS never reach a student (master status law): a set whose
    // every question is draft/soft-archived AND that has no published video
    // would render as a "0 questions" row — a count that doesn't exist. The
    // check runs BEFORE ensureTopic so it can't materialize an empty topic.
    if ((ceqCountByDeck.get(d.id) ?? 0) === 0 && !shippedPub(d, "blast") && !d.lessonId) continue;
    const ch = d.topicId ? chById.get(d.topicId) : undefined;
    const courseId = ch?.courseId ?? d.courseId ?? null;
    if (!courseId) continue;
    const co = coById.get(courseId);
    const course = ensureCourse(courseId, co?.name ?? "Course", co?.family ?? null);
    const topic = ch ? ensureTopic(course, ch) : ensureTopic(course, { id: `__more_${courseId}`, name: "More", short: null, number: 9999 });
    // WITHHOLD the playback id for PAID sets (#Prompt 4) — the tree never carries a locked
    // video's id. The client fetches it via getSetPlayback, which re-checks the entitlement.
    const paid = d.access === "paid";
    // CRAM = shipped blast publication, else the legacy lesson_videos path. REVIEW = shipped
    // lookback publication or nothing. Runtimes serve even for paid sets — they tease length,
    // never content; playback ids are withheld for paid (getSetPlayback re-checks per stage).
    const blast = shippedPub(d, "blast");
    const look = shippedPub(d, "lookback");
    const cramPid = blast?.render?.muxPlaybackId ?? ((d.lessonId && pb.get(d.lessonId)) || null);
    const cramDur = pubDur(blast) ?? ((d.lessonId ? dur.get(d.lessonId) : undefined) ?? null);
    setOrderKey.set(d.id, d.sortOrder ?? Number.MAX_SAFE_INTEGER);
    topic.sets.push({ id: d.id, name: setName(d.name), access: paid ? "paid" : "free", orientation: "landscape", playbackId: paid ? null : cramPid, ceqCount: ceqCountByDeck.get(d.id) ?? 0, runtimeSec: cramDur, hasReview: !!look, reviewPlaybackId: paid ? null : (look?.render?.muxPlaybackId ?? null), reviewRuntimeSec: pubDur(look), firstStem: stemFor(d.id, paid), shortLabel: shortFor(d.id) });
  }

  for (const t of topics.values()) t.sets.sort((a, b) => (setOrderKey.get(a.id) ?? 0) - (setOrderKey.get(b.id) ?? 0) || a.name.localeCompare(b.name));

  const ordered = [...courses.values()].sort((a, b) => courseRank(a.name) - courseRank(b.name) || a.name.localeCompare(b.name));

  // CAMPUS OVERRIDES (Prompt 3, sparse) — when a campus context is given, a topic's chapter
  // NUMBER and display ORDER come from campus_chapter_overrides where a row exists, else the
  // course default (chapters.chapter_number). Textbook-agnostic by default; a campus's local
  // "Ch N" surfaces only when that campus is selected. Degrades to default if 0103 unapplied.
  const orderKey = new Map<string, number>(); // topic.id → effective display order
  for (const t of topics.values()) orderKey.set(t.id, t.number ?? 9999);
  if (campusId) {
    try {
      const tids = [...topics.keys()];
      if (tids.length) {
        const { data: ov, error: ovErr } = await admin.from("campus_chapter_overrides").select("chapter_id,local_number,local_order").eq("campus_id", campusId).in("chapter_id", tids);
        if (ovErr) throw ovErr;
        for (const r of (ov ?? []) as { chapter_id: string; local_number: number | null; local_order: number | null }[]) {
          const t = topics.get(r.chapter_id);
          if (!t) continue;
          if (r.local_number != null) t.number = r.local_number;
          if (r.local_order != null) orderKey.set(t.id, r.local_order);
          else if (r.local_number != null) orderKey.set(t.id, r.local_number);
        }
      }
    } catch { /* 0103 not applied — keep course-default numbers/order */ }
  }
  for (const c of ordered) c.topics.sort((a, b) => (orderKey.get(a.id) ?? 9999) - (orderKey.get(b.id) ?? 9999) || a.name.localeCompare(b.name));

  // 5) EXAM-UNIT grouping (Prompt 2, many-to-many): nest topics under their active exam units;
  //    a topic can appear under several (cumulative exams); topics in no unit stay loose in
  //    course.topics. Degrades to flat (no units) if 0102 isn't applied yet.
  try {
    const courseIds = ordered.map((c) => c.id);
    if (courseIds.length) {
      const { data: units, error: uErr } = await admin.from("exam_units").select("id,course_id,name,position").in("course_id", courseIds).eq("status", "active");
      if (uErr) throw uErr;
      const unitIds = (units ?? []).map((u: { id: string }) => u.id);
      const memByUnit = new Map<string, Set<string>>();
      if (unitIds.length) {
        const { data: mem } = await admin.from("exam_unit_chapters").select("exam_unit_id,chapter_id").in("exam_unit_id", unitIds);
        for (const m of (mem ?? []) as { exam_unit_id: string; chapter_id: string }[]) { const s = memByUnit.get(m.exam_unit_id) ?? new Set<string>(); s.add(m.chapter_id); memByUnit.set(m.exam_unit_id, s); }
      }
      const unitsByCourse = new Map<string, { id: string; name: string; position: number | null }[]>();
      for (const u of (units ?? []) as { id: string; course_id: string; name: string; position: number | null }[]) { const l = unitsByCourse.get(u.course_id) ?? []; l.push(u); unitsByCourse.set(u.course_id, l); }
      for (const c of ordered) {
        const cUnits = (unitsByCourse.get(c.id) ?? []).sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999) || a.name.localeCompare(b.name));
        const grouped = new Set<string>();
        for (const u of cUnits) {
          const members = memByUnit.get(u.id) ?? new Set<string>();
          const uTopics = c.topics.filter((t) => members.has(t.id)); // preserves the sorted order
          if (uTopics.length) { c.units.push({ id: u.id, name: u.name, topics: uTopics }); uTopics.forEach((t) => grouped.add(t.id)); }
        }
        c.topics = c.topics.filter((t) => !grouped.has(t.id)); // loose = in no unit
      }
    }
  } catch { /* exam_units not applied yet — leave every topic flat (today's behavior) */ }

  return ordered;
});

// ---- PRACTICE STAGE (server) — a set's questions, served to students -----------------------
//
// The practice questions ARE the set's authored CEQ cards (data.deckId membership, stageOrder
// order) — no duplicate store. Choices ship with `correct` + `feedback` so the client can grade
// locally; that is acceptable for FREE sets (the same answers are in the free video). PAID sets
// return `locked` unauthenticated-or-not for now: this fn deliberately carries NO auth
// middleware so signed-out students can practice free sets, and entitled paid practice rides
// the checkout pass later (mirror getSetPlayback's grant check then).
export interface PracticeChoice { id: string; text: string; correct: boolean; feedback: string | null }
export interface PracticeQuestion { id: string; prompt: string; shorthand: string | null; choices: PracticeChoice[] }
export type SetPracticeResult =
  | { status: "ok"; setName: string; questions: PracticeQuestion[] }
  | { status: "locked" }
  | { status: "empty" }
  | { status: "not_found" };

// CRAM CARDS (Lee, 2026-09-03: "Cram blast off vid > cram cards > practice").
// The memorize-this / cheat-code / deeper-idea cards Lee placed on the film
// draft and sent to film are real note frames in the set (provenance
// "blast-off"). Students get them in running order, after the video and
// before practice. Same gate as practice: live, unparked, free.
export interface CramCard { id: string; kind: "phrase" | "cheat" | "tip"; text: string; bullets: string[] }
export type SetCramCardsResult =
  | { status: "ok"; setName: string; cards: CramCard[] }
  | { status: "locked" }
  | { status: "empty" }
  | { status: "not_found" };

export const fetchSetCramCards = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ setId: z.string() }).parse(d))
  .handler(async ({ data }): Promise<SetCramCardsResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as { from: (t: string) => any };
    type RawCard = { stageOrder?: number; prompt?: string; draft?: boolean; bankArchived?: string; provenance?: string; blastKind?: string; callout?: { extraStems?: string[]; hidden?: boolean } };
    const owned = await loadDecksDeduped(admin);
    const o = owned.get(data.setId);
    const deck = o && o.deck.status === "live" && o.deck.parked !== true ? o.deck : undefined;
    if (!deck || !o) return { status: "not_found" };
    if (deck.access === "paid") return { status: "locked" };
    const KINDS = new Set(["phrase", "cheat", "tip"]);
    const cards: CramCard[] = o.nodes
      .map((n) => ({ nodeId: n.id ?? "", ...(n.data as RawCard) }))
      .filter((d) => d.provenance === "blast-off" && !!d.blastKind && KINDS.has(d.blastKind) && !d.draft && !d.bankArchived && !d.callout?.hidden)
      .sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0))
      .map((d) => ({ id: d.nodeId, kind: d.blastKind as CramCard["kind"], text: (d.prompt ?? "").trim(), bullets: (d.callout?.extraStems ?? []).map((b) => b.trim()).filter(Boolean) }))
      .filter((c) => c.text);
    return cards.length ? { status: "ok", setName: setName(deck.name), cards } : { status: "empty" };
  });

export const fetchSetPractice = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ setId: z.string() }).parse(d))
  .handler(async ({ data }): Promise<SetPracticeResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as { from: (t: string) => any };
    type RawChoice = { id?: string; text?: string; correct?: boolean; feedback?: string };
    type RawCard = { deckId?: string; stageOrder?: number; prompt?: string; shorthand?: string; noteOnly?: boolean; draft?: boolean; bankArchived?: string; choices?: RawChoice[] };
    const owned = await loadDecksDeduped(admin);
    const o = owned.get(data.setId);
    const deck = o && o.deck.status === "live" && o.deck.parked !== true ? o.deck : undefined;
    if (!deck || !o) return { status: "not_found" };
    if (deck.access === "paid") return { status: "locked" };
    // STABLE ids: the CEQ node id (never the position) — analytics key on it, so re-ordering or
    // inserting a question never corrupts history. Display numbers are derived client-side.
    // noteOnly = film chrome; draft/bankArchived = studio-only (master status law).
    const cards = o.nodes
      .filter((n) => { const d = n.data as RawCard | undefined; return !d?.noteOnly && !d?.draft && !d?.bankArchived; })
      .map((n) => ({ nodeId: n.id ?? "", ...(n.data as RawCard) }));
    const questions: PracticeQuestion[] = cards
      .sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0))
      .map((c, i) => ({
        id: c.nodeId || `${data.setId}:${c.stageOrder ?? i}`,
        prompt: (c.prompt ?? "").trim(),
        shorthand: c.shorthand?.trim() || null,
        choices: (c.choices ?? []).map((ch, j) => ({ id: ch.id ?? String(j), text: (ch.text ?? "").trim(), correct: !!ch.correct, feedback: ch.feedback?.trim() || null })),
      }))
      // A card with no prompt or fewer than 2 choices can't be practiced — skip, never crash.
      .filter((q) => q.prompt && q.choices.length >= 2);
    return questions.length ? { status: "ok", setName: setName(deck.name), questions } : { status: "empty" };
  });
