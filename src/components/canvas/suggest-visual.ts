// SUGGEST VISUAL (pure core) — the prompt builder + response validator behind the
// "✨ Suggest visual" button. Given a frame's teaching context (its beat, title,
// script and the cards on it), an LLM recommends ONE World background + ONE layout
// template. This file has NO network and NO React: it builds the messages and
// parses/clamps the model's JSON into a safe, typed suggestion — everything the
// server function needs, and everything worth unit-testing.
//
// Design constraints baked into the prompt mirror the World rules: cards dominate,
// generated scenery is atmosphere (never a hero), muted intensity 0.25–0.35.
import { FRAME_TEMPLATES, type FrameTemplateId } from "./frame-templates";
import { clampWorldIntensity, WORLD_IDS, WORLDS, type WorldId } from "./worlds";

/** What the client hands the server about the frame to be dressed. */
export interface FrameContext {
  title?: string;
  /** Beat column: hook · teach · model_practice · cram. */
  beat: string;
  /** Script lines (may be empty). */
  entry?: string;
  beats?: string;
  exit?: string;
  /** Kinds of the cards already on the frame (je, list, heading, …). */
  cardKinds: string[];
}

/** The validated recommendation. Any field the model got wrong comes back null. */
export interface VisualSuggestion {
  world: WorldId | null;
  worldIntensity: number | null;
  template: FrameTemplateId | null;
  rationale: string;
}

const TEMPLATE_IDS = FRAME_TEMPLATES.map((t) => t.id) as FrameTemplateId[];

/** The system + user messages for the chat completion. Deterministic. */
export function buildSuggestMessages(ctx: FrameContext): { system: string; user: string } {
  const worldMenu = WORLDS.map((w) => `- ${w.id}: ${w.blurb}`).join("\n");
  const templateMenu = FRAME_TEMPLATES.map((t) => `- ${t.id}: ${t.blurb}`).join("\n");
  const system = [
    "You are a video art director for a calm, focused accounting lesson.",
    "Given ONE frame (one shot), recommend ONE background World and ONE layout template.",
    "Hard rules: the teaching cards must dominate; the World is faint ATMOSPHERE, never a hero;",
    "keep intensity muted (0.25–0.35). Prefer a template that fits what the frame is doing.",
    "",
    "Available worlds (id: description):",
    worldMenu,
    "",
    "Available templates (id: description):",
    templateMenu,
    "",
    'Respond with ONLY a JSON object, no prose: {"world": <id or null>, "template": <id or null>, "intensity": <0.25-0.35>, "rationale": "<= 160 chars"}.',
    "Use null for a field you would leave unchanged. `world` must be one of the world ids; `template` one of the template ids.",
  ].join("\n");

  const scriptBits = [
    ctx.entry?.trim() && `Entry: ${ctx.entry.trim()}`,
    ctx.beats?.trim() && `Beats: ${ctx.beats.trim()}`,
    ctx.exit?.trim() && `Exit: ${ctx.exit.trim()}`,
  ].filter(Boolean).join("\n");
  const user = [
    `Beat: ${ctx.beat}`,
    ctx.title?.trim() ? `Title: ${ctx.title.trim()}` : "Title: (untitled)",
    ctx.cardKinds.length ? `Cards on the frame: ${ctx.cardKinds.join(", ")}` : "Cards on the frame: none yet",
    scriptBits ? `Script:\n${scriptBits}` : "Script: (none yet)",
  ].join("\n");

  return { system, user };
}

/** Coerce arbitrary model output (already JSON-parsed) into a safe suggestion.
 *  Unknown ids → null; intensity clamped into the muted band (or null). Never
 *  throws — a malformed field just becomes null. */
export function parseVisualSuggestion(raw: unknown): VisualSuggestion {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const worldRaw = typeof o.world === "string" ? o.world : null;
  const templateRaw = typeof o.template === "string" ? o.template : null;
  const world = worldRaw && (WORLD_IDS as string[]).includes(worldRaw) ? (worldRaw as WorldId) : null;
  const template = templateRaw && (TEMPLATE_IDS as string[]).includes(templateRaw) ? (templateRaw as FrameTemplateId) : null;
  const intensity = typeof o.intensity === "number" && Number.isFinite(o.intensity) ? clampWorldIntensity(o.intensity) : null;
  const rationale = typeof o.rationale === "string" ? o.rationale.slice(0, 240).trim() : "";
  return { world, worldIntensity: world ? intensity : null, template, rationale };
}
