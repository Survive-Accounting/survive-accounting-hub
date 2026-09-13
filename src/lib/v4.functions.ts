// V4 — server side. One topic (a set) through five steps; this file carries steps 1's writes and the
// learning record (migration/supabase-migrations/20260913_1500_v4_learning.sql). The rules are pure in
// components/v4/*.
//
// Every write is the same read-modify-write the rest of the bank uses (the deck and its cards live in
// canvas_scenes.nodes_json), and every change Lee makes to a question also lands in teach_edits with
// before / after — so the AI's version and his can be compared later. If the learning tables are
// missing, the card still saves and the answer says, by name, what didn't record.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "./pg-errors";

export const MISSING_V4_LEARNING_HINT = "run migration/supabase-migrations/20260913_1500_v4_learning.sql";

type DB = { from: (t: string) => any };
async function db(): Promise<DB> {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}
const learningError = (e: { code?: string; message: string }): string => (isMissingSchema(e, /teach_proposals|teach_edits/i) ? MISSING_V4_LEARNING_HINT : e.message);

type Node = { id: string; type?: string; position?: { x: number; y: number }; data?: Record<string, unknown> };
type Deck = Record<string, unknown> & { id: string; name?: string; blastOff?: { frames?: unknown[]; updatedAt?: string; layout?: unknown }; v4?: unknown };
type SceneJson = { nodes?: Node[]; decks?: Deck[] };

/** The set's owning scene, read fresh for a write. */
async function openScene(d: DB, setId: string): Promise<{ sceneId: string; j: SceneJson; deck: Deck }> {
  const { loadDecksDeduped } = await import("./student.functions");
  const owned = await loadDecksDeduped(d as never);
  const o = owned.get(setId);
  if (!o) throw new Error("That set isn't in the bank.");
  const { data: row, error } = await d.from("canvas_scenes").select("id,nodes_json").eq("id", o.sceneId).single();
  if (error) throw new Error(error.message);
  const j = row.nodes_json as SceneJson;
  const deck = (j.decks ?? []).find((x) => x.id === setId);
  if (!deck) throw new Error("The set vanished from its scene — nothing written.");
  return { sceneId: o.sceneId, j, deck };
}
async function saveScene(d: DB, sceneId: string, j: SceneJson): Promise<void> {
  const up = await d.from("canvas_scenes").update({ nodes_json: j }).eq("id", sceneId);
  if (up.error) throw new Error(up.error.message);
}

const cardNodes = (j: SceneJson, setId: string): Node[] => (j.nodes ?? []).filter((n) => n.type === "ceq" && n.data?.deckId === setId);

async function toCard(n: Node) {
  const { QUESTION_FORMATS } = await import("@/components/v4/formats");
  const d = n.data ?? {};
  const choices = Array.isArray(d.choices) ? (d.choices as { text?: unknown; correct?: unknown; feedback?: unknown }[]).map((c) => ({ text: typeof c.text === "string" ? c.text : "", correct: c.correct === true, feedback: typeof c.feedback === "string" ? c.feedback : null })) : [];
  const ph = d.placeholder as { kind?: unknown; note?: unknown } | undefined;
  return {
    id: n.id,
    stem: typeof d.prompt === "string" ? d.prompt : "",
    choices,
    format: (QUESTION_FORMATS as readonly string[]).includes(String(d.format)) ? (d.format as "mc" | "select_all") : "mc" as const,
    group: typeof d.v4Group === "string" ? d.v4Group : null,
    placeholder: ph && (ph.kind === "format" || ph.kind === "polish") ? { kind: ph.kind, note: typeof ph.note === "string" ? ph.note : "" } as const : null,
    draft: d.draft === true,
    rejected: !!d.bankArchived,
    noteOnly: d.noteOnly === true,
    order: typeof d.stageOrder === "number" ? d.stageOrder : 0,
  };
}
export type V4CardRow = Awaited<ReturnType<typeof toCard>>;

async function openProposalId(d: DB, setId: string, step: string): Promise<{ id: string | null; error: string | null }> {
  const r = await d.from("teach_proposals").select("id").eq("set_id", setId).eq("step", step).eq("status", "open").order("version", { ascending: false }).limit(1);
  if (r.error) return { id: null, error: learningError(r.error) };
  return { id: (r.data?.[0]?.id as string | undefined) ?? null, error: null };
}

// ───────────────────────────────────────────────────────────────────────────── reading ──

export const loadV4Topic = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const d = await db();
    const { j, deck } = await openScene(d, data.setId);
    const cards = await Promise.all(cardNodes(j, data.setId).map(toCard));
    const proposal = await openProposalId(d, data.setId, "questions");
    return {
      setId: data.setId,
      name: deck.name ?? "",
      state: deck.v4 ? (await import("@/components/v4/v4-topic")).stateView(deck.v4 as import("@/components/v4/v4-topic").V4State) : null,
      planFrames: Array.isArray(deck.blastOff?.frames) ? deck.blastOff!.frames!.length : 0,
      cards,
      learningError: proposal.error,
    };
  });

/** Which sets are already v4 topics, and on which step — for the /v4 list. */
export const listV4Topics = createServerFn({ method: "GET" }).handler(async (): Promise<{ setId: string; step: string }[]> => {
  const d = await db();
  const { loadDecksDeduped } = await import("./student.functions");
  const owned = await loadDecksDeduped(d as never);
  const out: { setId: string; step: string }[] = [];
  for (const [setId, o] of owned) {
    const v4 = (o.deck as { v4?: { step?: unknown } }).v4;
    if (v4 && typeof v4.step === "string") out.push({ setId, step: v4.step });
  }
  return out;
});

// ───────────────────────────────────────────────────────────── taking a set over (start) ──

/** START A TOPIC IN V4. Dry run: what would happen. For real: the plan is backed up on the deck, cuts
 *  and auto-inserted bookends are stripped (stripForV4), the starting groups come from the splits,
 *  and the set's questions become step 1's first proposal ("as if the AI had proposed them"). */
export const startV4Topic = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200), dryRun: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const d = await db();
    const { stripForV4, groupsFromSplits, snapshotQuestions } = await import("@/components/v4/v4-topic");
    const { sceneId, j, deck } = await openScene(d, data.setId);
    if (deck.v4) throw new Error("This set is already a v4 topic.");
    const frames = (Array.isArray(deck.blastOff?.frames) ? deck.blastOff!.frames! : []) as import("@/components/blastoff/plan").BlastFrame[];
    const nodes = cardNodes(j, data.setId);
    const questions = nodes.filter((n) => n.data?.noteOnly !== true && !n.data?.bankArchived);
    const stripped = stripForV4(frames);
    const { groups, groupOf } = groupsFromSplits(frames, questions.map((n) => n.id));
    const preview = {
      questions: questions.length,
      groups: groups.map((g) => ({ name: g.name, questions: [...groupOf.values()].filter((x) => x === g.id).length })),
      ungrouped: questions.filter((n) => !groupOf.has(n.id)).length,
      slidesBefore: frames.length,
      slidesAfter: stripped.length,
      cuts: frames.filter((f) => f.cutAfter).length,
    };
    if (data.dryRun) return { ok: true as const, preview, started: false };

    // The learning record must be there before anything changes — a topic started without it would
    // lose its first proposal, which is the one that matters most.
    const probe = await d.from("teach_proposals").select("id").limit(1);
    if (probe.error) throw new Error(`Can't start yet — ${learningError(probe.error)}`);

    const now = new Date().toISOString();
    for (const n of questions) { const g = groupOf.get(n.id); n.data = { ...(n.data ?? {}), ...(g ? { v4Group: g } : {}) }; }
    deck.v4 = { version: 1, step: "questions", groups, startedAt: now, final: {}, backup: { frames, at: now } };
    deck.blastOff = { ...(deck.blastOff ?? {}), frames: stripped, updatedAt: now };
    await saveScene(d, sceneId, j);

    const cards = await Promise.all(cardNodes(j, data.setId).map(toCard));
    const ins = await d.from("teach_proposals").insert({ set_id: data.setId, step: "questions", version: 1, source: "migrated", status: "open", ai_original: snapshotQuestions({ groups }, cards), input: { from: "existing set", slidesBefore: frames.length } });
    if (ins.error) throw new Error(`Started, but the first proposal didn't record — ${learningError(ins.error)}`);
    return { ok: true as const, preview, started: true };
  });

// ──────────────────────────────────────────────────────────────── step 1: the questions ──

const choiceSchema = z.object({ text: z.string().max(2000), correct: z.boolean(), feedback: z.string().max(4000).nullable().optional() });
const placeholderSchema = z.object({ kind: z.enum(["format", "polish"]), note: z.string().max(1000) });
const groupSchema = z.object({ id: z.string().min(1).max(40), name: z.string().min(1).max(120) });
const opSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("edit"), cardId: z.string().min(1).max(200), stem: z.string().max(8000), choices: z.array(choiceSchema).max(12), format: z.enum(["mc", "select_all"]) }),
  z.object({ type: z.literal("group"), cardId: z.string().min(1).max(200), groupId: z.string().max(40).nullable() }),
  z.object({ type: z.literal("reject"), cardId: z.string().min(1).max(200) }),
  z.object({ type: z.literal("restore"), cardId: z.string().min(1).max(200) }),
  z.object({ type: z.literal("placeholder"), cardId: z.string().min(1).max(200), placeholder: placeholderSchema.nullable() }),
  z.object({ type: z.literal("add"), groupId: z.string().max(40).nullable(), stem: z.string().max(8000), choices: z.array(choiceSchema).max(12), format: z.enum(["mc", "select_all"]), placeholder: placeholderSchema.nullable().optional() }),
  z.object({ type: z.literal("groups"), groups: z.array(groupSchema).max(60) }),
]);

export type V4QuestionsOp = z.infer<typeof opSchema>;

/** ONE CHANGE TO STEP 1 — saved on the card or the topic, and recorded as an edit. */
export const v4QuestionsChange = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200), op: opSchema, why: z.string().max(2000).nullable().optional(), who: z.string().max(40).nullable().optional() }).parse(d))
  .handler(async ({ data }) => {
    const d = await db();
    const { sceneId, j, deck } = await openScene(d, data.setId);
    const state = deck.v4 as import("@/components/v4/v4-topic").V4State | undefined;
    if (!state) throw new Error("This set isn't a v4 topic yet.");
    const op = data.op;
    const now = new Date().toISOString();
    let target = "topic";
    let before: unknown = null;
    let after: unknown = null;

    const find = (id: string): Node => {
      const n = cardNodes(j, data.setId).find((x) => x.id === id);
      if (!n) throw new Error("That question isn't in this set any more — reload.");
      n.data ??= {};
      return n;
    };

    if (op.type === "groups") {
      before = state.groups;
      const keep = new Set(op.groups.map((g) => g.id));
      for (const n of cardNodes(j, data.setId)) if (typeof n.data?.v4Group === "string" && !keep.has(n.data.v4Group)) delete n.data.v4Group;
      state.groups = op.groups;
      after = op.groups;
    } else if (op.type === "add") {
      const nodes = cardNodes(j, data.setId);
      const order = nodes.reduce((m, n) => Math.max(m, typeof n.data?.stageOrder === "number" ? n.data.stageOrder : 0), 0) + 1;
      const id = `ceq-v4-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const node: Node = {
        id, type: "ceq", position: { x: 520, y: 210 + order * 40 },
        data: {
          deckId: data.setId, prompt: op.stem, choices: op.choices.map((c, i) => ({ id: `c${i}`, text: c.text, correct: c.correct, ...(c.feedback ? { feedback: c.feedback } : {}) })),
          stageOrder: order, draft: true, provenance: "v4",
          ...(op.format !== "mc" ? { format: op.format } : {}), ...(op.groupId ? { v4Group: op.groupId } : {}), ...(op.placeholder ? { placeholder: op.placeholder } : {}),
        },
      };
      (j.nodes ??= []).push(node);
      target = id;
      after = { stem: op.stem, choices: op.choices, format: op.format, group: op.groupId, placeholder: op.placeholder ?? null };
    } else {
      const n = find(op.cardId);
      target = n.id;
      const dd = n.data!;
      if (op.type === "edit") {
        before = { stem: dd.prompt ?? "", choices: dd.choices ?? [], format: dd.format ?? "mc" };
        const hist = Array.isArray(dd.editHistory) ? (dd.editHistory as unknown[]) : [];
        dd.editHistory = [...hist, { at: now, prompt: dd.prompt ?? "", choices: dd.choices ?? [] }].slice(-10);
        dd.prompt = op.stem;
        dd.choices = op.choices.map((c, i) => ({ id: `c${i}`, text: c.text, correct: c.correct, ...(c.feedback ? { feedback: c.feedback } : {}) }));
        if (op.format === "mc") delete dd.format; else dd.format = op.format;
        dd.editedVia = "v4"; dd.editedAt = now;
        after = { stem: op.stem, choices: op.choices, format: op.format };
      } else if (op.type === "group") {
        before = dd.v4Group ?? null;
        if (op.groupId) dd.v4Group = op.groupId; else delete dd.v4Group;
        after = op.groupId;
      } else if (op.type === "reject") {
        before = { rejected: !!dd.bankArchived };
        dd.bankArchived = now;
        after = { rejected: true };
      } else if (op.type === "restore") {
        before = { rejected: !!dd.bankArchived };
        delete dd.bankArchived;
        after = { rejected: false };
      } else if (op.type === "placeholder") {
        before = dd.placeholder ?? null;
        if (op.placeholder) {
          // Never in front of a student while it's a placeholder.
          dd.placeholder = op.placeholder;
          dd.draft = true;
        } else {
          delete dd.placeholder;
          // Resolved: live again once step 1 is final (before that, "Questions final" makes it live).
          if (state.final?.questions) dd.draft = false;
        }
        after = op.placeholder;
      }
    }
    await saveScene(d, sceneId, j);

    const proposal = await openProposalId(d, data.setId, "questions");
    let editId: string | null = null;
    let logWarning: string | null = proposal.error;
    if (!proposal.error) {
      const ins = await d.from("teach_edits").insert({ proposal_id: proposal.id, set_id: data.setId, step: "questions", target, action: op.type, before, after, why: data.why?.trim() || null, created_by: data.who ?? null }).select("id").single();
      if (ins.error) logWarning = learningError(ins.error); else editId = ins.data.id as string;
    }
    const cards = await Promise.all(cardNodes(j, data.setId).map(toCard));
    return { ok: true as const, state: (await import("@/components/v4/v4-topic")).stateView(state), cards, editId, logWarning };
  });

/** A WHY, after the fact — attached to the edit it explains. */
export const v4EditWhy = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ editId: z.string().uuid(), why: z.string().max(2000) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const d = await db();
    const r = await d.from("teach_edits").update({ why: data.why.trim() || null }).eq("id", data.editId);
    return r.error ? { ok: false, error: learningError(r.error) } : { ok: true };
  });

/** QUESTIONS FINAL. Every real, complete question goes live; placeholders stay drafts (and don't
 *  block); the proposal records Lee's final version; the topic moves to Slides. */
export const finalizeV4Questions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const d = await db();
    const { cardProblems } = await import("@/components/v4/formats");
    const { questionsSummary, snapshotQuestions } = await import("@/components/v4/v4-topic");
    const { sceneId, j, deck } = await openScene(d, data.setId);
    const state = deck.v4 as import("@/components/v4/v4-topic").V4State | undefined;
    if (!state) throw new Error("This set isn't a v4 topic yet.");
    const cards = await Promise.all(cardNodes(j, data.setId).map(toCard));
    const summary = questionsSummary(cards, cardProblems, state.groups.length);
    if (summary.problems.length) return { ok: false as const, summary };

    const now = new Date().toISOString();
    for (const n of cardNodes(j, data.setId)) {
      const dd = n.data ??= {};
      if (dd.noteOnly === true || dd.bankArchived || dd.placeholder) continue;
      if (dd.draft) dd.draft = false;
    }
    state.final = { ...(state.final ?? {}), questions: now };
    state.step = "slides";
    await saveScene(d, sceneId, j);

    const finalCards = await Promise.all(cardNodes(j, data.setId).map(toCard));
    const proposal = await openProposalId(d, data.setId, "questions");
    let logWarning = proposal.error;
    if (proposal.id) {
      const up = await d.from("teach_proposals").update({ status: "final", final: snapshotQuestions(state, finalCards), finalized_at: now }).eq("id", proposal.id);
      if (up.error) logWarning = learningError(up.error);
    }
    return { ok: true as const, summary, state: (await import("@/components/v4/v4-topic")).stateView(state), logWarning };
  });
