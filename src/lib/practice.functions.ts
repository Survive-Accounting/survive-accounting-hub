// CEQ PRACTICE (server) — cram-mode analytics + the "Ask me about this one" capture + the
// admin question-level view (the filming priority queue).
//
// practice_attempts keys on STABLE ids (deck id + CEQ node id); display numbers like 3.2.14 are
// derived at read time from the live tree order, so re-ordering never corrupts history.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { loadDecksDeduped, liveDecks } from "@/lib/student.functions";
import { ADMIN_EMAILS } from "@/lib/admin-emails";

type DB = { from: (t: string) => any; auth: { getUser: (t: string) => Promise<{ data: { user: { email?: string | null } | null } }> } };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};
async function isAdmin(db: DB, token: string): Promise<boolean> {
  try { const { data } = await db.auth.getUser(token); const e = (data?.user?.email ?? "").toLowerCase(); return !!e && ADMIN_EMAILS.includes(e); } catch { return false; }
}

// ---- attempts ------------------------------------------------------------------------------------
const AttemptEvent = z.object({
  setId: z.string().min(1),
  ceqId: z.string().min(1),
  event: z.enum(["answer", "skip", "abandon"]).default("answer"),
  choiceId: z.string().nullable().optional(),
  correct: z.boolean().nullable().optional(),
  ms: z.number().int().min(0).max(3_600_000).nullable().optional(),
  attemptNumber: z.number().int().min(1).max(50).default(1),
});
export type AttemptEvent = z.infer<typeof AttemptEvent>;

/** Batched, fire-and-forget from the client. No auth middleware: Exam 1 practice is ungated.
 *  userId is analytics-only (not trusted for anything) so it rides in from the client session. */
export const logPracticeEvents = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    sessionId: z.string().min(8).max(64),
    userId: z.string().uuid().nullable().optional(),
    campus: z.string().max(160).nullable().optional(),
    surface: z.enum(["home", "campus", "greek", "learn"]).nullable().optional(),
    isTest: z.boolean().optional(),
    events: z.array(AttemptEvent).min(1).max(200),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; written: number }> => {
    const db = await admin();
    const rows = data.events.map((e) => ({
      set_id: e.setId, ceq_id: e.ceqId, event: e.event, choice_id: e.choiceId ?? null, correct: e.correct ?? null, ms: e.ms ?? null,
      attempt_number: e.attemptNumber, session_id: data.sessionId, user_id: data.userId ?? null, campus: data.campus ?? null,
      surface: data.surface ?? null, is_test: !!data.isTest,
    }));
    const { error } = await db.from("practice_attempts").insert(rows);
    if (error) { console.warn("practice_attempts insert failed", error.message); return { ok: false, written: 0 }; }
    return { ok: true, written: rows.length };
  });

// ---- "Ask me about this one" ----------------------------------------------------------------------
/** Routes through the unified intake as kind=question (a PRIORITY kind → founder alert). The
 *  reference (e.g. 3.2.14) rides in `topic`, the shorthand in `chapter`, the stable ids in
 *  `source_path` as ceq:<setId>:<ceqId> so the admin view can group asks per question. */
export const askAboutQuestion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    email: z.string().trim().email(),
    name: z.string().trim().max(120).optional().nullable(),
    message: z.string().trim().min(1).max(2000),
    reference: z.string().trim().max(32),      // "3.2.14"
    shorthand: z.string().trim().max(160).optional().nullable(),
    prompt: z.string().trim().max(600).optional().nullable(),
    setId: z.string().min(1),
    ceqId: z.string().min(1),
    campusName: z.string().max(160).optional().nullable(),
    campusSlug: z.string().max(120).optional().nullable(),
    isTest: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { runIntake } = await import("@/lib/comms/intake.server");
    const note = `${data.message}${data.prompt ? `\n\nQ ${data.reference}: ${data.prompt}` : ""}`;
    return runIntake({
      kind: "question", email: data.email, name: data.name ?? null,
      campusName: data.campusName ?? null, campusSlug: data.campusSlug ?? null,
      topic: data.reference, chapter: data.shorthand ?? null, note,
      sourcePath: `ceq:${data.setId}:${data.ceqId}`, isTest: !!data.isTest,
    });
  });

// ---- admin: per-question analytics ----------------------------------------------------------------
export interface QuestionStat {
  setId: string; ceqId: string; reference: string; topic: string; setName: string; shorthand: string | null; prompt: string;
  attempts: number; missed: number; missedPct: number | null; medianMs: number | null; skips: number; abandons: number; asks: number;
}
export const fetchPracticeAnalytics = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10), includeTest: z.boolean().optional(), days: z.number().int().min(1).max(365).optional() }).parse(d))
  .handler(async ({ data }): Promise<{ questions: QuestionStat[]; totals: { attempts: number; sessions: number; asks: number } } | null> => {
    const db = await admin();
    if (!(await isAdmin(db, data.accessToken))) return null;
    // 1) The live question catalogue with derived reference numbers (topic.set.q).
    const owned = await loadDecksDeduped(db);
    const live = liveDecks(owned);
    const topicIds = [...new Set(live.map((o) => o.deck.topicId).filter((x): x is string => !!x))];
    const { data: chs } = await db.from("chapters").select("id,chapter_name,chapter_number").in("id", topicIds);
    type Ch = { id: string; chapter_name: string; chapter_number: number | null };
    const chById = new Map<string, Ch>(((chs ?? []) as Ch[]).map((c) => [c.id, c]));
    const byTopic = new Map<string, typeof live>();
    for (const o of live) { if (!o.deck.topicId) continue; const l = byTopic.get(o.deck.topicId) ?? []; l.push(o); byTopic.set(o.deck.topicId, l); }
    const catalogue = new Map<string, Omit<QuestionStat, "attempts" | "missed" | "missedPct" | "medianMs" | "skips" | "abandons" | "asks">>();
    for (const [tid, sets] of byTopic) {
      const ch = chById.get(tid);
      sets.sort((a, b) => (a.deck.sortOrder ?? 1e9) - (b.deck.sortOrder ?? 1e9) || (a.deck.name ?? "").localeCompare(b.deck.name ?? ""));
      sets.forEach((o, si) => {
        const cards = o.nodes.filter((n) => !(n.data as { noteOnly?: boolean } | undefined)?.noteOnly).sort((a, b) => ((a.data as { stageOrder?: number })?.stageOrder ?? 0) - ((b.data as { stageOrder?: number })?.stageOrder ?? 0));
        cards.forEach((n, qi) => {
          const d = n.data as { prompt?: string; shorthand?: string };
          catalogue.set(n.id ?? "", { setId: o.deck.id, ceqId: n.id ?? "", reference: `${ch?.chapter_number ?? "?"}.${si + 1}.${qi + 1}`, topic: ch?.chapter_name ?? "Topic", setName: (o.deck.name ?? "Set").replace(/^"|"$/g, ""), shorthand: d.shorthand?.trim() || null, prompt: (d.prompt ?? "").trim() });
        });
      });
    }
    // 2) Attempts.
    const since = new Date(Date.now() - (data.days ?? 90) * 864e5).toISOString();
    let q = db.from("practice_attempts").select("ceq_id,event,correct,ms,session_id").gte("created_at", since);
    if (!data.includeTest) q = q.eq("is_test", false);
    const { data: rows } = await q;
    const agg = new Map<string, { attempts: number; missed: number; ms: number[]; skips: number; abandons: number }>();
    const sessions = new Set<string>();
    for (const r of (rows ?? []) as { ceq_id: string; event: string; correct: boolean | null; ms: number | null; session_id: string }[]) {
      sessions.add(r.session_id);
      const a = agg.get(r.ceq_id) ?? { attempts: 0, missed: 0, ms: [], skips: 0, abandons: 0 };
      if (r.event === "answer") { a.attempts++; if (r.correct === false) a.missed++; if (r.ms != null) a.ms.push(r.ms); }
      else if (r.event === "skip") a.skips++; else a.abandons++;
      agg.set(r.ceq_id, a);
    }
    // 3) Asks (kind=question, keyed by source_path ceq:<set>:<ceq>).
    let aq = db.from("campus_waitlist").select("source_path").eq("kind", "question").like("source_path", "ceq:%");
    if (!data.includeTest) aq = aq.eq("is_test", false);
    const { data: asks } = await aq;
    const askBy = new Map<string, number>();
    for (const a of (asks ?? []) as { source_path: string }[]) { const id = a.source_path.split(":")[2]; if (id) askBy.set(id, (askBy.get(id) ?? 0) + 1); }
    const median = (xs: number[]) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const questions: QuestionStat[] = [...catalogue.values()].map((c) => {
      const a = agg.get(c.ceqId);
      return { ...c, attempts: a?.attempts ?? 0, missed: a?.missed ?? 0, missedPct: a?.attempts ? Math.round((a.missed / a.attempts) * 100) : null, medianMs: median(a?.ms ?? []), skips: a?.skips ?? 0, abandons: a?.abandons ?? 0, asks: askBy.get(c.ceqId) ?? 0 };
    });
    const totals = { attempts: questions.reduce((n, x) => n + x.attempts, 0), sessions: sessions.size, asks: questions.reduce((n, x) => n + x.asks, 0) };
    return { questions, totals };
  });
