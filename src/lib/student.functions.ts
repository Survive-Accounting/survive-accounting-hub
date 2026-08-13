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

export interface StudentSet {
  id: string; // DeckDef.id
  name: string;
  access: "free" | "paid";
  orientation: "landscape" | "portrait"; // 16:9 lesson vs 9:16 lookback — player switches aspect
  playbackId: string | null; // null = live set with no published video yet ("coming soon")
  ceqCount: number; // # of CEQ question cards in the set (the "N questions" line on the outline row)
  runtimeSec: number | null; // set runtime in seconds when known — null today (no duration source wired yet)
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

type RawDeck = { id: string; name?: string; payloadType?: string; status?: string; access?: string; lessonId?: string | null; topicId?: string | null; courseId?: string | null; parked?: boolean };

export const fetchStudentTree = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data: input }): Promise<StudentCourse[]> => {
  const campusId = input?.campusId;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as { from: (t: string) => any };

  // 1) Every scene → LIVE card-decks only (the server-side visibility gate).
  const { data: scenes, error: sErr } = await admin.from("canvas_scenes").select("nodes_json");
  if (sErr) throw new Error(sErr.message);
  const live: RawDeck[] = [];
  // CEQ count per deck: a set's question count = nodes of type "ceq" whose data.deckId is the deck
  // (the same membership the Studio uses). Powers the "N questions" line on each outline set row.
  const ceqCountByDeck = new Map<string, number>();
  // FIRST STEM per deck (lowest stageOrder) — the outline teaser, with its blur ranges for paid redaction.
  const firstCeqByDeck = new Map<string, { order: number; prompt: string; blur: { s: number; e: number }[] }>();
  type RawCeqData = { deckId?: string; stageOrder?: number; prompt?: string; blurRanges?: { s: number; e: number }[] };
  for (const s of (scenes ?? []) as { nodes_json?: { decks?: RawDeck[]; nodes?: { type?: string; data?: RawCeqData }[] } }[]) {
    // PARKED sets are authoring-only — never served, regardless of status (same law as parked topics).
    for (const d of s.nodes_json?.decks ?? []) if (d.status === "live" && d.payloadType === "cards" && d.parked !== true) live.push(d);
    for (const n of s.nodes_json?.nodes ?? []) {
      if (n?.type !== "ceq") continue;
      const did = n.data?.deckId;
      if (!did) continue;
      ceqCountByDeck.set(did, (ceqCountByDeck.get(did) ?? 0) + 1);
      const order = n.data?.stageOrder ?? 0;
      const cur = firstCeqByDeck.get(did);
      if (!cur || order < cur.order) firstCeqByDeck.set(did, { order, prompt: (n.data?.prompt ?? "").trim(), blur: Array.isArray(n.data?.blurRanges) ? n.data!.blurRanges! : [] });
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

  // 2) Published playback ids by lessonId (newest ready). A missing lesson_videos table just
  //    means "no videos yet" — degrade to null, never crash the shell.
  const lessonIds = [...new Set(live.map((d) => d.lessonId).filter((x): x is string => !!x))];
  const pb = new Map<string, string>();
  if (lessonIds.length) {
    const { data: vids } = await admin.from("lesson_videos").select("lesson_id,playback_id,version,stage").in("lesson_id", lessonIds).eq("stage", "ready").order("version", { ascending: false });
    for (const v of (vids ?? []) as { lesson_id: string; playback_id: string | null }[]) if (v.playback_id && !pb.has(v.lesson_id)) pb.set(v.lesson_id, v.playback_id);
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
  const ensureCourse = (id: string, name: string, family: string | null): StudentCourse => { let c = courses.get(id); if (!c) { c = { id, name, family, units: [], topics: [] }; courses.set(id, c); } return c; };
  const ensureTopic = (course: StudentCourse, t: { id: string; name: string | null; short: string | null; number: number | null }): StudentTopic => {
    let top = topics.get(t.id); if (!top) { top = { id: t.id, name: t.name ?? "Topic", shortLabel: t.short, number: t.number, sets: [] }; topics.set(t.id, top); course.topics.push(top); } return top;
  };
  for (const d of live) {
    const ch = d.topicId ? chById.get(d.topicId) : undefined;
    const courseId = ch?.courseId ?? d.courseId ?? null;
    if (!courseId) continue;
    const co = coById.get(courseId);
    const course = ensureCourse(courseId, co?.name ?? "Course", co?.family ?? null);
    const topic = ch ? ensureTopic(course, ch) : ensureTopic(course, { id: `__more_${courseId}`, name: "More", short: null, number: 9999 });
    // WITHHOLD the playback id for PAID sets (#Prompt 4) — the tree never carries a locked
    // video's id. The client fetches it via getSetPlayback, which re-checks the entitlement.
    const paid = d.access === "paid";
    topic.sets.push({ id: d.id, name: setName(d.name), access: paid ? "paid" : "free", orientation: "landscape", playbackId: paid ? null : ((d.lessonId && pb.get(d.lessonId)) || null), ceqCount: ceqCountByDeck.get(d.id) ?? 0, runtimeSec: null, firstStem: stemFor(d.id, paid) });
  }

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
