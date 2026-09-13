// V4 · STEP 1 — what the AI is asked for a topic's practice exam questions, and how its answer is read.
//
// Lee, 2026-09-13: "I brainstorm by talking through the practice exam questions for the topic. AI proposes
// lots of practice exam questions, grouped (e.g. by account type)." Two stages, so no single call has to
// write forty full questions: first the GROUPS (names, what each covers, how many questions), then each
// group's QUESTIONS in their own call. Formats come from the registry (formats.ts), so the AI may write
// "select all that apply" as well as multiple choice, and every question is checked by the same rules
// the editor uses — an incomplete one is dropped, never saved.
//
// Pure: no React, no network.
import { FORMATS, QUESTION_FORMATS, cardProblems, type Choice, type QuestionFormat } from "./formats";

export const QUESTIONS_PROMPT_VERSION = "v4-questions@2026-09-13";

export interface ProposedGroup { name: string; covers: string; count: number }
export interface ProposedQuestion { format: QuestionFormat; stem: string; choices: Choice[] }

interface Common { topicName: string; setName: string; talk: string; existingGroups: string[]; existingStems: string[]; examples: { before: unknown; after: unknown; why: string | null }[] }

const house = [
  "Lee teaches intro accounting as fast cram videos. Questions sound like the exam: short, concrete, one idea each, with tricky distractors a student who half-knows it would pick.",
  "Use his words and examples wherever he gave them. Never invent facts he contradicted.",
].join("\n");

const examplesBlock = (examples: Common["examples"]): string[] =>
  examples.length ? ["", "How Lee has edited AI questions before (write the way he ends up):", ...examples.slice(0, 8).map((e) => `· AI: ${JSON.stringify(e.before)} → Lee: ${JSON.stringify(e.after)}${e.why ? ` — because: ${e.why}` : ""}`)] : [];

export function buildGroupsMessages(input: Common): { system: string; user: string } {
  const system = [
    house,
    "",
    "Propose the GROUPS for this topic's practice exam questions — how a student's exam would cluster them (for example by account type). 2-8 groups, each with a short name, one line on what it covers, and how many questions it deserves (3-10).",
    "Keep any existing group that still fits, with its exact name.",
    "",
    "Answer with JSON only: { \"groups\": [ { \"name\": \"Assets\", \"covers\": \"...\", \"count\": 6 } ] }",
  ].join("\n");
  const user = [
    `Topic: ${input.topicName} · Set: ${input.setName}`,
    input.existingGroups.length ? `Existing groups: ${input.existingGroups.join(" · ")}` : "No groups yet.",
    input.existingStems.length ? `It already has ${input.existingStems.length} questions, e.g.: ${input.existingStems.slice(0, 12).map((s) => `"${s}"`).join("; ")}` : "No questions yet.",
    "",
    "What Lee said, talking through the practice exam questions:",
    input.talk.trim() || "(nothing — propose what the exam would ask)",
  ].join("\n");
  return { system, user };
}

export function buildQuestionsMessages(input: Common & { group: ProposedGroup; alreadyInGroup: string[] }): { system: string; user: string } {
  const system = [
    house,
    "",
    `Write ${input.group.count} practice exam questions for ONE group. Formats you may use:`,
    ...QUESTION_FORMATS.map((f) => `· ${FORMATS[f].aiLine}`),
    "Mostly mc; use select_all where a list of look-alikes is the real test (e.g. pick the current assets). Every choice gets a one-line `feedback` saying why it's right or wrong.",
    "Don't repeat a question the group already has.",
    ...examplesBlock(input.examples),
    "",
    "Answer with JSON only: { \"questions\": [ { \"format\": \"mc\", \"stem\": \"...\", \"choices\": [ { \"text\": \"...\", \"correct\": true, \"feedback\": \"...\" } ] } ] }",
  ].join("\n");
  const user = [
    `Topic: ${input.topicName} · Set: ${input.setName}`,
    `Group: ${input.group.name} — ${input.group.covers}`,
    input.alreadyInGroup.length ? `Already in this group: ${input.alreadyInGroup.map((s) => `"${s}"`).join("; ")}` : "",
    "",
    "What Lee said, talking through the practice exam questions:",
    input.talk.trim() || "(nothing — write what the exam would ask)",
  ].filter(Boolean).join("\n");
  return { system, user };
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseGroups(raw: unknown): ProposedGroup[] {
  const list = Array.isArray((raw as { groups?: unknown })?.groups) ? (raw as { groups: unknown[] }).groups : [];
  const seen = new Set<string>();
  const out: ProposedGroup[] = [];
  for (const g of list.slice(0, 8)) {
    const o = (g ?? {}) as Record<string, unknown>;
    const name = str(o.name, 80);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const count = Math.max(1, Math.min(10, Math.round(Number(o.count) || 5)));
    out.push({ name, covers: str(o.covers, 200), count });
  }
  return out;
}

/** Questions read back — anything the editor would call incomplete is dropped, as are repeats. */
export function parseQuestions(raw: unknown, already: readonly string[] = []): ProposedQuestion[] {
  const list = Array.isArray((raw as { questions?: unknown })?.questions) ? (raw as { questions: unknown[] }).questions : [];
  const seen = new Set(already.map((s) => s.trim().toLowerCase()));
  const out: ProposedQuestion[] = [];
  for (const q of list.slice(0, 12)) {
    const o = (q ?? {}) as Record<string, unknown>;
    const format = (QUESTION_FORMATS as readonly string[]).includes(String(o.format)) ? (o.format as QuestionFormat) : "mc";
    const stem = str(o.stem, 1000);
    const choices: Choice[] = (Array.isArray(o.choices) ? o.choices : []).slice(0, 8).map((c) => {
      const x = (c ?? {}) as Record<string, unknown>;
      return { text: str(x.text, 400), correct: x.correct === true, ...(str(x.feedback, 600) ? { feedback: str(x.feedback, 600) } : {}) };
    }).filter((c) => c.text);
    if (!stem || seen.has(stem.toLowerCase())) continue;
    if (cardProblems({ format, stem, choices }).length) continue;
    seen.add(stem.toLowerCase());
    out.push({ format, stem, choices });
  }
  return out;
}
