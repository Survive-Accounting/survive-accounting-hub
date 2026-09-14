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

// ─────────────────────────────────────────────────────── steps 2–5: shared learning doors ──

const stepSchema = z.enum(["questions", "slides", "chain", "split"]);

/** Record one change in any step (the pages that edit through the plan call this after saving). */
export const v4LogEdit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(200), step: stepSchema, target: z.string().min(1).max(200), action: z.string().min(1).max(40),
    before: z.any().optional(), after: z.any().optional(), why: z.string().max(2000).nullable().optional(), who: z.string().max(40).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; editId: string | null; error?: string }> => {
    const d = await db();
    const proposal = await openProposalId(d, data.setId, data.step);
    if (proposal.error) return { ok: false, editId: null, error: proposal.error };
    const ins = await d.from("teach_edits").insert({ proposal_id: proposal.id, set_id: data.setId, step: data.step, target: data.target, action: data.action, before: data.before ?? null, after: data.after ?? null, why: data.why?.trim() || null, created_by: data.who ?? null }).select("id").single();
    return ins.error ? { ok: false, editId: null, error: learningError(ins.error) } : { ok: true, editId: ins.data.id as string };
  });

/** The open proposal for a step, created from `snapshot` if there isn't one (the migrated starting
 *  point of Slides / Chain / Split, recorded the first time the step is opened). */
export const v4EnsureProposal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200), step: stepSchema, source: z.enum(["ai", "migrated", "manual"]), snapshot: z.any(), input: z.any().optional() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; id: string | null; error?: string }> => {
    const d = await db();
    const open = await openProposalId(d, data.setId, data.step);
    if (open.error) return { ok: false, id: null, error: open.error };
    if (open.id) return { ok: true, id: open.id };
    const last = await d.from("teach_proposals").select("version").eq("set_id", data.setId).eq("step", data.step).order("version", { ascending: false }).limit(1);
    if (last.error) return { ok: false, id: null, error: learningError(last.error) };
    const version = ((last.data?.[0]?.version as number | undefined) ?? 0) + 1;
    const ins = await d.from("teach_proposals").insert({ set_id: data.setId, step: data.step, version, source: data.source, status: "open", ai_original: data.snapshot ?? {}, input: data.input ?? null }).select("id").single();
    return ins.error ? { ok: false, id: null, error: learningError(ins.error) } : { ok: true, id: ins.data.id as string };
  });

const NEXT_STEP: Record<string, string> = { questions: "slides", slides: "chain", chain: "split", split: "film" };

/** Mark Slides / Chain / Split final: the topic moves on, and the open proposal records his version. */
export const v4MarkFinal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200), step: z.enum(["slides", "chain", "split"]), snapshot: z.any() }).parse(d))
  .handler(async ({ data }) => {
    const d = await db();
    const { stateView } = await import("@/components/v4/v4-topic");
    const { sceneId, j, deck } = await openScene(d, data.setId);
    const state = deck.v4 as import("@/components/v4/v4-topic").V4State | undefined;
    if (!state) throw new Error("This set isn't a v4 topic yet.");
    const now = new Date().toISOString();
    state.final = { ...(state.final ?? {}), [data.step]: now };
    const order = ["questions", "slides", "chain", "split", "film"];
    if (order.indexOf(state.step) <= order.indexOf(data.step)) state.step = NEXT_STEP[data.step] as typeof state.step;
    await saveScene(d, sceneId, j);
    const open = await openProposalId(d, data.setId, data.step);
    let logWarning = open.error;
    if (open.id) {
      const up = await d.from("teach_proposals").update({ status: "final", final: data.snapshot ?? {}, finalized_at: now }).eq("id", open.id);
      if (up.error) logWarning = learningError(up.error);
    }
    return { ok: true as const, state: stateView(state), logWarning };
  });

// ─────────────────────────────────────────────────────────────────── step 2: AI slides ──

/** PROPOSE ONE GROUP'S TEACHING SLIDES from what Lee said — recorded as a proposal before he sees it. */
export const proposeV4Slides = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200), topicName: z.string().max(200), groupId: z.string().min(1).max(40), talk: z.string().max(12000) }).parse(d))
  .handler(async ({ data }) => {
    const d = await db();
    const { buildV4SlidesMessages, parseV4Slides, extractJsonObject, SLIDES_PROMPT_VERSION } = await import("@/components/v4/slides-brief");
    const { j, deck } = await openScene(d, data.setId);
    const state = deck.v4 as import("@/components/v4/v4-topic").V4State | undefined;
    if (!state) throw new Error("This set isn't a v4 topic yet.");
    const group = state.groups.find((g) => g.id === data.groupId);
    if (!group) throw new Error("That group isn't in this topic any more.");
    const cards = (await Promise.all(cardNodes(j, data.setId).map(toCard))).filter((c) => c.group === group.id && !c.rejected && !c.noteOnly);
    const frames = (Array.isArray(deck.blastOff?.frames) ? deck.blastOff!.frames! : []) as import("@/components/blastoff/plan").BlastFrame[];
    const existing = frames.filter((f) => f.v4Group === group.id && f.kind !== "ceq" && !f.v4Bound).map((f) => ({ kind: f.kind, words: [f.title, f.text, ...(f.bullets ?? [])].filter(Boolean).join(" · ") || f.needs || "" }));
    // Past slide edits as examples — the simple version of "learn how I teach".
    const ex = await d.from("teach_edits").select("before,after,why").eq("step", "slides").eq("action", "edit").order("created_at", { ascending: false }).limit(8);
    const examples = ex.error ? [] : (ex.data ?? []).map((r: { before: unknown; after: unknown; why: string | null }) => ({ before: r.before, after: r.after, why: r.why }));
    const input = { topicName: data.topicName, setName: deck.name ?? "", groupName: group.name, questions: cards.map((c) => ({ stem: c.stem, correct: c.choices.filter((x) => x.correct).map((x) => x.text) })), existing, talk: data.talk, examples };
    const { system, user } = buildV4SlidesMessages(input);
    const { runAiTask } = await import("@/lib/ai.server");
    const r = await runAiTask("synthesis", { system, user });
    const slides = parseV4Slides(extractJsonObject(r.text));
    const last = await d.from("teach_proposals").select("version").eq("set_id", data.setId).eq("step", "slides").order("version", { ascending: false }).limit(1);
    let proposalId: string | null = null;
    let logWarning: string | null = null;
    if (last.error) logWarning = learningError(last.error);
    else {
      const version = ((last.data?.[0]?.version as number | undefined) ?? 0) + 1;
      const ins = await d.from("teach_proposals").insert({ set_id: data.setId, step: "slides", version, source: "ai", status: "superseded", ai_original: { groupId: group.id, slides }, input: { groupName: group.name, talk: data.talk, questions: input.questions.length, existing: existing.length }, model: r.usage.model, prompt_version: SLIDES_PROMPT_VERSION }).select("id").single();
      if (ins.error) logWarning = learningError(ins.error); else proposalId = ins.data.id as string;
    }
    return { ok: true as const, slides, proposalId, logWarning };
  });

// ────────────────────────────────────────────────────────────────────────── step 4: split ──

const cutSchema = z.object({ after: z.string().min(1).max(80), intro: z.enum(["bio", "title", "none"]), name: z.string().max(80).optional() });
const splitsSchema = z.object({ startIntro: z.enum(["bio", "title", "none"]), startName: z.string().max(80).optional(), cuts: z.array(cutSchema).max(60) });

/** APPLY THE CUTS: the plan's bound intro/outro slides are rebuilt from the cuts (applySplits), the
 *  cuts are kept on the topic, and the change is recorded. */
export const v4ApplySplits = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200), splits: splitsSchema, action: z.string().max(40), who: z.string().max(40).nullable().optional() }).parse(d))
  .handler(async ({ data }) => {
    const d = await db();
    const { applySplits } = await import("@/components/v4/v4-chain");
    const { frameSchema } = await import("@/lib/blastoff-frame-schema");
    const { sceneId, j, deck } = await openScene(d, data.setId);
    const state = deck.v4 as import("@/components/v4/v4-topic").V4State | undefined;
    if (!state) throw new Error("This set isn't a v4 topic yet.");
    const before = (Array.isArray(deck.blastOff?.frames) ? deck.blastOff!.frames! : []) as import("@/components/blastoff/plan").BlastFrame[];
    const prevSplits = state.split ?? null;
    const { frames, splits } = applySplits(before, data.splits, deck.name ?? "");
    const checked = z.array(frameSchema).max(2000).parse(frames);
    const now = new Date().toISOString();
    deck.blastOff = { ...(deck.blastOff ?? {}), frames: checked, updatedAt: now };
    state.split = splits;
    await saveScene(d, sceneId, j);
    const proposal = await openProposalId(d, data.setId, "split");
    let logWarning = proposal.error;
    if (!proposal.error) {
      const ins = await d.from("teach_edits").insert({ proposal_id: proposal.id, set_id: data.setId, step: "split", target: "cuts", action: data.action, before: prevSplits, after: splits, created_by: data.who ?? null });
      if (ins.error) logWarning = learningError(ins.error);
    }
    return { ok: true as const, splits, frames: checked, before: z.array(frameSchema).max(2000).parse(before), logWarning };
  });

/** The topic's cuts (step 4), for the Split page. */
export const loadV4Splits = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const d = await db();
    const { NO_SPLITS } = await import("@/components/v4/v4-chain");
    const { deck } = await openScene(d, data.setId);
    const state = deck.v4 as import("@/components/v4/v4-topic").V4State | undefined;
    const s = state?.split ?? NO_SPLITS;
    return { startIntro: s.startIntro, ...(s.startName ? { startName: s.startName } : {}), cuts: s.cuts.map((c) => ({ after: c.after, intro: c.intro, ...(c.name ? { name: c.name } : {}) })) };
  });

// ─────────────────────────────────────────────────────────────────────────── /v4/todo ──

/** EVERY PLACEHOLDER across the v4 topics — questions and slides — with the split it's in. */
export const listV4Todo = createServerFn({ method: "GET" }).handler(async () => {
  const d = await db();
  const { loadDecksDeduped } = await import("./student.functions");
  const { splitRows } = await import("@/components/v4/v4-chain");
  const owned = await loadDecksDeduped(d as never);
  const out: { setId: string; setName: string; items: { kind: "question" | "slide"; id: string; label: string; note: string; split: number | null }[] }[] = [];
  for (const [setId, o] of owned) {
    if (!(o.deck as { v4?: unknown }).v4) continue;
    const cards = await Promise.all((o.nodes as Node[]).map(toCard));
    const byId = new Map(cards.map((c) => [c.id, c]));
    const frames = ((o.deck as Deck).blastOff?.frames ?? []) as import("@/components/blastoff/plan").BlastFrame[];
    const rows = splitRows(frames, (id) => { const c = byId.get(id); return c?.placeholder && !c.rejected ? { note: c.placeholder.note, stem: c.stem } : null; });
    const splitOf = new Map<string, number>();
    for (const r of rows) for (const f of r.frames) splitOf.set(f.kind === "ceq" && f.ceqId ? `card:${f.ceqId}` : f.id, r.index);
    const items: { kind: "question" | "slide"; id: string; label: string; note: string; split: number | null }[] = [];
    for (const c of cards) if (c.placeholder && !c.rejected && !c.noteOnly) items.push({ kind: "question", id: c.id, label: c.stem || "(a question)", note: c.placeholder.note, split: splitOf.get(`card:${c.id}`) ?? null });
    for (const f of frames) if (f.needs && !f.skipped) items.push({ kind: "slide", id: f.id, label: f.kind, note: f.needs, split: splitOf.get(f.id) ?? null });
    if (items.length) out.push({ setId, setName: String((o.deck as Deck).name ?? setId), items });
  }
  return out;
});

// ────────────────────────────────────────────────────────────────────────── step 3: chain ──

/** ARRANGE THE CHAIN group by group (v4-chain.ts arrangeChain), keeping any cuts already made. The
 *  arrangement is recorded as the step's proposal the first time, and as an edit after that. */
export const v4ArrangeChain = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200), who: z.string().max(40).nullable().optional() }).parse(d))
  .handler(async ({ data }) => {
    const d = await db();
    const { arrangeChain, applySplits, NO_SPLITS } = await import("@/components/v4/v4-chain");
    const { frameSchema } = await import("@/lib/blastoff-frame-schema");
    const { sceneId, j, deck } = await openScene(d, data.setId);
    const state = deck.v4 as import("@/components/v4/v4-topic").V4State | undefined;
    if (!state) throw new Error("This set isn't a v4 topic yet.");
    const cards = await Promise.all(cardNodes(j, data.setId).map(toCard));
    const groupOf = new Map(cards.map((c) => [c.id, c.group]));
    const before = (Array.isArray(deck.blastOff?.frames) ? deck.blastOff!.frames! : []) as import("@/components/blastoff/plan").BlastFrame[];
    const arranged = arrangeChain(before, state.groups.map((g) => g.id), (id) => groupOf.get(id) ?? null);
    const withSplits = state.split && state.split.cuts.length ? applySplits(arranged, state.split, deck.name ?? "").frames : arranged;
    const checked = z.array(frameSchema).max(2000).parse(withSplits);
    deck.blastOff = { ...(deck.blastOff ?? {}), frames: checked, updatedAt: new Date().toISOString() };
    await saveScene(d, sceneId, j);
    const ids = (fs: { id: string; kind: string }[]) => fs.map((f) => `${f.kind}:${f.id}`);
    const open = await openProposalId(d, data.setId, "chain");
    let logWarning = open.error;
    if (!open.error) {
      if (!open.id) {
        const last = await d.from("teach_proposals").select("version").eq("set_id", data.setId).eq("step", "chain").order("version", { ascending: false }).limit(1);
        const version = ((last.data?.[0]?.version as number | undefined) ?? 0) + 1;
        const ins = await d.from("teach_proposals").insert({ set_id: data.setId, step: "chain", version, source: "ai", status: "open", ai_original: { order: ids(checked) }, input: { rule: "group by group: teaching slides, then questions", before: ids(before) }, prompt_version: "v4-chain-rule@2026-09-13" });
        if (ins.error) logWarning = learningError(ins.error);
      } else {
        const ins = await d.from("teach_edits").insert({ proposal_id: open.id, set_id: data.setId, step: "chain", target: "chain", action: "arrange", before: ids(before), after: ids(checked), created_by: data.who ?? null });
        if (ins.error) logWarning = learningError(ins.error);
      }
    }
    void NO_SPLITS;
    return { ok: true as const, slides: checked.length, logWarning };
  });

// ───────────────────────────────────────────────────────────── step 1: AI questions (phase 3) ──

async function questionExamples(d: DB): Promise<{ before: unknown; after: unknown; why: string | null }[]> {
  const ex = await d.from("teach_edits").select("before,after,why").eq("step", "questions").eq("action", "edit").order("created_at", { ascending: false }).limit(8);
  return ex.error ? [] : (ex.data ?? []).map((r: { before: unknown; after: unknown; why: string | null }) => ({ before: r.before, after: r.after, why: r.why }));
}

/** STAGE 1 — THE GROUPS. From what Lee said: the groups (existing ones kept by name), saved on the topic,
 *  and a new questions proposal opened for this run (the previous open one is superseded). */
export const proposeV4QuestionGroups = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200), topicName: z.string().max(200), talk: z.string().max(20000) }).parse(d))
  .handler(async ({ data }) => {
    const d = await db();
    const { buildGroupsMessages, parseGroups, QUESTIONS_PROMPT_VERSION } = await import("@/components/v4/questions-brief");
    const { extractJsonObject } = await import("@/components/v4/slides-brief");
    const { nextGroupId, stateView } = await import("@/components/v4/v4-topic");
    const { sceneId, j, deck } = await openScene(d, data.setId);
    const state = deck.v4 as import("@/components/v4/v4-topic").V4State | undefined;
    if (!state) throw new Error("This set isn't a v4 topic yet.");
    const cards = (await Promise.all(cardNodes(j, data.setId).map(toCard))).filter((c) => !c.rejected && !c.noteOnly);
    const { system, user } = buildGroupsMessages({ topicName: data.topicName, setName: deck.name ?? "", talk: data.talk, existingGroups: state.groups.map((g) => g.name), existingStems: cards.map((c) => c.stem), examples: [] });
    const { runAiTask } = await import("@/lib/ai.server");
    const r = await runAiTask("synthesis", { system, user });
    const proposed = parseGroups(extractJsonObject(r.text));
    if (!proposed.length) return { ok: false as const, error: "It didn't propose any groups — say a bit more about what the exam asks." };

    const groups = [...state.groups];
    const out: { id: string; name: string; covers: string; count: number }[] = [];
    for (const p of proposed) {
      let g = groups.find((x) => x.name.trim().toLowerCase() === p.name.toLowerCase());
      if (!g) { g = { id: nextGroupId(groups), name: p.name }; groups.push(g); }
      out.push({ id: g.id, name: g.name, covers: p.covers, count: p.count });
    }
    state.groups = groups;
    await saveScene(d, sceneId, j);

    let proposalId: string | null = null;
    let logWarning: string | null = null;
    const last = await d.from("teach_proposals").select("version").eq("set_id", data.setId).eq("step", "questions").order("version", { ascending: false }).limit(1);
    if (last.error) logWarning = learningError(last.error);
    else {
      await d.from("teach_proposals").update({ status: "superseded" }).eq("set_id", data.setId).eq("step", "questions").eq("status", "open");
      const version = ((last.data?.[0]?.version as number | undefined) ?? 0) + 1;
      const ins = await d.from("teach_proposals").insert({ set_id: data.setId, step: "questions", version, source: "ai", status: "open", ai_original: { groups: out, questions: [] }, input: { talk: data.talk }, model: r.usage.model, prompt_version: QUESTIONS_PROMPT_VERSION }).select("id").single();
      if (ins.error) logWarning = learningError(ins.error); else proposalId = ins.data.id as string;
    }
    return { ok: true as const, groups: out, proposalId, logWarning, state: stateView(state) };
  });

/** STAGE 2 — ONE GROUP'S QUESTIONS, written into the set as drafts in that group (never in front of a
 *  student until "Questions final"), and added to the run's proposal as the AI's original. */
export const proposeV4GroupQuestions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(200), topicName: z.string().max(200), talk: z.string().max(20000), proposalId: z.string().uuid().nullable(),
    group: z.object({ id: z.string().min(1).max(40), name: z.string().max(120), covers: z.string().max(300), count: z.number().int().min(1).max(10) }),
  }).parse(d))
  .handler(async ({ data }) => {
    const d = await db();
    const { buildQuestionsMessages, parseQuestions } = await import("@/components/v4/questions-brief");
    const { extractJsonObject } = await import("@/components/v4/slides-brief");
    const { j } = await openScene(d, data.setId);
    const existing = (await Promise.all(cardNodes(j, data.setId).map(toCard))).filter((c) => !c.rejected && !c.noteOnly);
    const inGroup = existing.filter((c) => c.group === data.group.id).map((c) => c.stem);
    const examples = await questionExamples(d);
    const { system, user } = buildQuestionsMessages({ topicName: data.topicName, setName: "", talk: data.talk, existingGroups: [], existingStems: [], examples, group: { name: data.group.name, covers: data.group.covers, count: data.group.count }, alreadyInGroup: inGroup });
    const { runAiTask } = await import("@/lib/ai.server");
    const r = await runAiTask("synthesis", { system, user });
    const questions = parseQuestions(extractJsonObject(r.text), existing.map((c) => c.stem));

    // Written fresh: another group's call may have saved while this one was thinking.
    const { sceneId, j: j2 } = await openScene(d, data.setId);
    const nodes = cardNodes(j2, data.setId);
    let order = nodes.reduce((m, n) => Math.max(m, typeof n.data?.stageOrder === "number" ? n.data.stageOrder : 0), 0);
    for (const q of questions) {
      order += 1;
      const id = `ceq-v4-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      (j2.nodes ??= []).push({
        id, type: "ceq", position: { x: 520, y: 210 + order * 40 },
        data: { deckId: data.setId, prompt: q.stem, choices: q.choices.map((c, i) => ({ id: `c${i}`, text: c.text, correct: c.correct, ...(c.feedback ? { feedback: c.feedback } : {}) })), stageOrder: order, draft: true, provenance: "v4-ai", v4Group: data.group.id, ...(q.format !== "mc" ? { format: q.format } : {}) },
      });
    }
    if (questions.length) await saveScene(d, sceneId, j2);

    let logWarning: string | null = null;
    if (data.proposalId && questions.length) {
      const cur = await d.from("teach_proposals").select("ai_original").eq("id", data.proposalId).single();
      if (cur.error) logWarning = learningError(cur.error);
      else {
        const orig = (cur.data?.ai_original ?? {}) as { groups?: unknown[]; questions?: unknown[] };
        const up = await d.from("teach_proposals").update({ ai_original: { ...orig, questions: [...(orig.questions ?? []), ...questions.map((q) => ({ group: data.group.id, ...q }))] } }).eq("id", data.proposalId);
        if (up.error) logWarning = learningError(up.error);
      }
    }
    const cards = await Promise.all(cardNodes(j2, data.setId).map(toCard));
    return { ok: true as const, added: questions.length, cards, logWarning };
  });
