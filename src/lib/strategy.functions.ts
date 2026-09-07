// STRATEGY SHORTS → THE /v3 LINE. Server side.
//
// Lee, 2026-09-06: strategy shorts "are going to be about riffing. We will make them using the
// same tool as blast off /v3/ pipeline." The pipeline is keyed by DECK ID, not by curriculum
// (blastoff.functions.ts resolves a set through loadDecksDeduped and nothing else), so a
// strategy short is simply a card deck with zero question nodes, filed under a "Strategy"
// topic. Talkthrough, Review, Film and Post all work on it unchanged; /learn and the student
// tree never see it (fetchStudentTree drops decks with no course and no questions).
//
// "Blast off" on the strategy board mints that deck once: its own canvas scene (one deck per
// scene, the per-set convention the dedupe prefers), a Strategy chapter with course_id NULL
// so it sorts after the exam topics, and a Review plan already laid out — one CHEAT CODE
// slide per talking point with its lines as bullets AND as teleprompter lines, the hook and
// riff cues on the intro's prompter. Lee opens /v3/strategy/<short> and films.
//
// Idempotent: a short that already has a living deck just gets its path back.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { frameSchema, type FrameRow } from "@/lib/blastoff-frame-schema";
import { newFrameId } from "@/components/blastoff/plan";
import { shortSlidesOf, shortRiffOf } from "@/lib/strategy";
import type { Idea } from "@/components/ideas/model";

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};
function rethrow(e: { code?: string; message: string }): never { throw new Error(e.message); }

/** Same rule as components/v3/use-bank.ts slugOf — spelled here so a server fn never imports
 *  a module that pulls React in. */
const slugOf = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";

export const STRATEGY_TOPIC_NAME = "Strategy";
/** After every exam chapter (they number 1–20ish), before the "More" bucket (9999). */
const STRATEGY_CHAPTER_NUMBER = 9000;

type IdeaRow = { id: string; title: string; body: string; context: Record<string, string> | null };

/** The Strategy chapter row — found or made. course_id NULL is the tell: no course, no students. */
async function ensureStrategyChapter(db: { from: (t: string) => any }): Promise<string> {
  const { data: found, error } = await db.from("chapters").select("id").eq("chapter_name", STRATEGY_TOPIC_NAME).is("course_id", null).limit(1);
  if (error) rethrow(error);
  if (found?.[0]?.id) return String(found[0].id);
  const { data: made, error: e2 } = await db.from("chapters")
    .insert({ chapter_name: STRATEGY_TOPIC_NAME, chapter_number: STRATEGY_CHAPTER_NUMBER, course_id: null })
    .select("id").single();
  if (e2) rethrow(e2);
  return String(made.id);
}

/** The Review plan for a short: the standard spine around one cheat-code slide per point. */
export function planFramesForShort(idea: Pick<Idea, "context" | "title"> & { body?: string }): FrameRow[] {
  let slides = shortSlidesOf(idea as Idea);
  // A short captured loose (Ctrl+I, no structured slides): its words become one slide, a
  // line per bullet, so Review opens with something to riff from rather than a bare spine.
  if (slides.length === 0 && idea.body?.trim()) {
    const lines = idea.body.split(/\n+/).map((l) => l.replace(/^[-*•\s]+/, "").trim()).filter(Boolean).slice(0, 6);
    if (lines.length) slides = [{ title: idea.title || "The point", lines }];
  }
  const riff = shortRiffOf(idea as Idea);
  const hook = idea.context?.hook?.trim();
  const introPrompter = [hook, ...riff].filter((s): s is string => !!s && s.trim().length > 0);
  const frames: FrameRow[] = [
    { id: newFrameId("open"), kind: "open" },
    { id: newFrameId("intro"), kind: "intro", ...(introPrompter.length ? { prompter: introPrompter } : {}) },
    ...slides.map((s) => ({
      id: newFrameId("cheat"), kind: "cheat" as const,
      title: s.title,
      bullets: s.lines,
      prompter: s.lines,
    })),
    { id: newFrameId("bio"), kind: "bio" },
    { id: newFrameId("outro"), kind: "outro" },
  ];
  // The shared schema is the contract with saveBlastPlan / loadBlastPlan — fail here, loudly,
  // rather than write a plan the Review step would silently regenerate over.
  return z.array(frameSchema).parse(frames);
}

const deckId = (): string => `deck-${Date.now().toString(36)}-s${Math.random().toString(36).slice(2, 6)}`;

export const blastOffStrategyShort = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<{ deckId: string; path: string; created: boolean }> => {
    const db = await admin();
    const { data: row, error } = await db.from("ideas").select("id,title,body,context").eq("id", data.id).single();
    if (error) rethrow(error);
    const idea = row as IdeaRow;
    const ctx: Record<string, string> = { ...(idea.context ?? {}) };
    if (ctx.strategy !== "1") throw new Error("not a strategy idea — nothing minted");
    const name = (idea.title || "Strategy short").trim().slice(0, 120);
    const path = (setName: string) => `/v3/${slugOf(STRATEGY_TOPIC_NAME)}/${slugOf(setName)}/blast-off`;

    // Already minted, and the deck is still there? Hand the path back.
    if (ctx.deckId) {
      const { loadDecksDeduped } = await import("./student.functions");
      const owned = await loadDecksDeduped(db as never);
      const o = owned.get(ctx.deckId);
      if (o) return { deckId: ctx.deckId, path: path(String((o.deck as { name?: string }).name ?? name)), created: false };
    }

    const chapterId = await ensureStrategyChapter(db);
    const now = new Date().toISOString();
    const id = deckId();
    const frames = planFramesForShort({ title: name, context: ctx, body: idea.body });
    const deck = {
      id, name, payloadType: "cards", filter: null, runMode: "sequence", lessonId: null, slots: [], showSkeletons: true,
      createdAt: now, updatedAt: now,
      status: "live", parked: false, access: "free",
      topicId: chapterId, courseId: null,
      // The plan rides on the deck, the way saveBlastPlan writes it. pass2 = the vertical template.
      blastOff: { frames, updatedAt: now, layout: "pass2" },
    };
    const { error: e3 } = await db.from("canvas_scenes").insert({
      name: `${STRATEGY_TOPIC_NAME} · ${name}`,
      chapter_id: chapterId,
      // One deck, no cards. `strategy` marks the scene's purpose for anyone reading the row.
      nodes_json: { nodes: [], edges: [], zones: [], decks: [deck], strategy: true, ideaId: idea.id },
      viewport_json: { x: 0, y: 0, zoom: 1 },
    });
    if (e3) rethrow(e3);

    ctx.deckId = id;
    ctx.deckPath = path(name);
    ctx.deckAt = now;
    const { error: e4 } = await db.from("ideas").update({ context: ctx, updated_at: now }).eq("id", idea.id);
    if (e4) rethrow(e4);
    return { deckId: id, path: ctx.deckPath, created: true };
  });
