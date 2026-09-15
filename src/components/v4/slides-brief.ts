// V4 · STEP 2 — what the AI is asked for one group's teaching slides, and how its answer is read back.
//
// Lee, 2026-09-13: "I brainstorm by talking about how I teach each group (cheat codes, memorize-this,
// tricky questions, etc.). I don't pick slides from a menu. AI proposes the teaching slides for each
// group … PLACEHOLDERS: if I mention something that needs a slide kind that isn't built yet (e.g.
// journal entries, T-accounts), create a placeholder slide saying what it should be."
//
// Past edits come in as examples (Lee: "Use past edits and notes as examples when proposing for the
// next topic, if that's simple"): what the AI wrote, what he changed it to, and why.
//
// Pure: no React, no network.

export interface V4SlideProposal {
  kind: "cheat" | "phrase" | "tip" | "tricky" | "found" | "ask" | "rubric" | "types" | "teaser" | "blank";
  text?: string;
  bullets?: string[];
  big?: boolean;
  /** A placeholder: what has to be built. */
  needs?: string;
}

export interface SlidesBriefInput {
  topicName: string;
  setName: string;
  groupName: string;
  questions: { stem: string; correct: string[] }[];
  existing: { kind: string; words: string }[];
  talk: string;
  examples: { before: unknown; after: unknown; why: string | null }[];
}

const KINDS = ["cheat", "phrase", "tip", "tricky", "found", "ask", "rubric", "types", "teaser", "blank"] as const;
export const SLIDES_PROMPT_VERSION = "v4-slides@2026-09-13";

export function buildV4SlidesMessages(input: SlidesBriefInput): { system: string; user: string } {
  const system = [
    "You write the TEACHING slides for one group of practice exam questions in Lee's intro-accounting cram videos (vertical Reels).",
    "Lee has talked through how he teaches this group. Turn what he said into slides — his words wherever he has them, shorter wherever you can.",
    "",
    "SLIDE KINDS, and nothing else:",
    "· cheat (Cheat code) — the shortcut that gets the mark · phrase (Memorize this) · tip (Think like an accountant — the why, briefly) · tricky (Tricky question — the trap) · found (Common exam question) · ask (Ask yourself — a prompt that leads to the answer)",
    "· rubric — the A = L + E effect table · types — the Types of accounts list · teaser — the stack of callout labels",
    "· blank + `needs` — ANY slide the app can't build yet (a journal entry, a T-account, a diagram): write what it should be in `needs`, e.g. \"journal entry for prepaid rent\". Never skip something he asked for because it can't be built — placeholder it.",
    "",
    "RULES: teaching slides only — his questions are added separately, never restate them as slides. Cramming, not lecturing: only what earns marks. `big: true` for a one-line statement that should fill the screen. Usually 2-5 slides.",
    "",
    "Answer with JSON only: { \"slides\": [ { \"kind\": \"cheat\", \"text\": \"...\", \"bullets\": [\"...\"], \"big\": false }, { \"kind\": \"blank\", \"needs\": \"...\" } ] }",
  ].join("\n");
  const user = [
    `Topic: ${input.topicName} · Set: ${input.setName}`,
    `Group: ${input.groupName}`,
    "",
    "Its questions:",
    ...input.questions.map((q, i) => `${i + 1}. ${q.stem}${q.correct.length ? `  → ${q.correct.join(" / ")}` : ""}`),
    "",
    input.existing.length ? "Slides it already has (keep what's good, don't duplicate):" : "It has no teaching slides yet.",
    ...input.existing.map((s) => `· [${s.kind}] ${s.words}`),
    "",
    input.examples.length ? "How Lee has edited slides before (learn from these):" : "",
    ...input.examples.slice(0, 8).map((e) => `· AI: ${JSON.stringify(e.before)} → Lee: ${JSON.stringify(e.after)}${e.why ? ` — because: ${e.why}` : ""}`),
    "",
    "What Lee said about teaching this group:",
    input.talk.trim() || "(nothing — write what the formula says)",
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
  return { system, user };
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Read the answer back, clamped — unknown kinds dropped, a blank without `needs` dropped. */
export function parseV4Slides(raw: unknown): V4SlideProposal[] {
  const obj = (raw ?? {}) as { slides?: unknown };
  const list = Array.isArray(obj.slides) ? obj.slides : [];
  const out: V4SlideProposal[] = [];
  for (const s of list.slice(0, 12)) {
    const t = (s ?? {}) as Record<string, unknown>;
    if (typeof t.kind !== "string" || !(KINDS as readonly string[]).includes(t.kind)) continue;
    const kind = t.kind as V4SlideProposal["kind"];
    const needs = str(t.needs, 200);
    if (kind === "blank" && !needs) continue;
    const bullets = Array.isArray(t.bullets) ? t.bullets.map((b) => str(b, 200)).filter(Boolean).slice(0, 8) : [];
    out.push({ kind, ...(str(t.text, 400) ? { text: str(t.text, 400) } : {}), ...(bullets.length ? { bullets } : {}), ...(t.big === true ? { big: true } : {}), ...(needs ? { needs } : {}) });
  }
  return out;
}

/** Strip code fences and slice to the outermost JSON object. */
export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a < 0 || b <= a) return {};
  try { return JSON.parse(cleaned.slice(a, b + 1)); } catch { return {}; }
}
