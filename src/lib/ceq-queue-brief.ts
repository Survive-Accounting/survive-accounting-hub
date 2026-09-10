// THE CEQ QUEUE's pure half — what the model is asked, and how its answer is defended.
//
// Lee, 2026-09-10: "I can talk them out better than write them out. We want tricky ones, good
// teaching examples, etc... it takes my brainstorms and gives me at least the starting points (not
// always the finished products, unless we're confident it can get it right. When it's wrong, we
// just lose time anyway)."
//
// So the brief asks for CANDIDATES with a confidence and a reason each, in the bank's own
// conventions — and the parser throws away anything that could not be a card. A candidate that
// survives is still a draft: Lee keeps it or he doesn't. Nothing here touches the network.

/** What a card looks like in the bank, and therefore what the model must return. */
export interface CandidateChoice { text: string; correct: boolean; feedback: string }
export interface CandidateCard {
  stem: string;
  choices: CandidateChoice[];
  /** The bank's callout vocabulary: plain question, the tricky one, the teaching example. */
  kind: "question" | "tricky" | "example";
  /** 0..1 — how sure the model is this would survive Lee's review. Shown on the card. */
  confidence: number;
  /** One line: why this question, in the model's words. Shown on the card. */
  why: string;
}
export interface CandidateSet {
  name?: string;
  blurb?: string;
  cards: CandidateCard[];
  /** Candidates the parser refused — counted, so a thin result explains itself. */
  dropped: number;
}

export interface BriefSource {
  /** The video's name and blurb, when the map has them. */
  name: string;
  blurb: string;
  /** What Lee said in the Booth for THIS deck, in order. */
  segments: readonly { text: string; at?: string }[];
  /** The parent cram set's live cards — the style guide. */
  parentCards: readonly { stem: string; choices: readonly { text: string; correct: boolean }[] }[];
  /** What he kept and dropped last time for this parent — the few-shot memory. */
  feedback: readonly { stem: string; action: "kept" | "edited" | "dropped" }[];
  /** How many to ask for. */
  want: number;
}

export const CEQ_QUEUE_SYSTEM = [
  "You write practice questions for Lee, who teaches intro financial accounting to college students through short videos. Each question is one CEQ (a 'common exam question'): a stem and 3–5 answer choices, exactly one correct, in the register of a real exam — plain, precise, no jokes, no emoji, no 'which of the following is NOT'.",
  "THE BANK'S CONVENTIONS, which you must use: (1) \"None of these\" is a real answer, used when the trap is that the account is not on the list at all — Dividends is contra-equity, Accumulated Depreciation is contra-asset, Income Summary is none of these. (2) The WHAT IF INSTEAD twin: a second stem that changes ONE word or number in the first and flips the answer — 'remains' vs 'used', 'unexpired' vs 'expired', cash vs on credit. (3) A distractor that is the right account on the wrong side, or the right amount in the wrong period. (4) Feedback on the CORRECT choice is one plain sentence saying why; feedback on a wrong choice, when you give it, names the misconception.",
  "KINDS: 'question' is a straight exam question. 'tricky' is one built around a trap the bank uses. 'example' is a worked teaching example with real numbers, dates and account names — what a student would see in a lecture, not an exam. A teaching video wants more 'example' and 'tricky' than 'question'.",
  "WHAT LEE SAID outranks everything. If he named a scenario, a number, a misconception, or a phrase he uses — use it verbatim. Match the parent set's stems in shape and difficulty; go one level deeper, not sideways. If he kept a kind of question last time, make more of that; if he dropped a kind, don't.",
  "CONFIDENCE is honest: 0.9 means you would bet this survives his review unchanged; 0.4 means it is a starting point he will rewrite. Give a real spread. WHY is one line in plain words.",
  "Return ONLY a JSON object: {\"name\": str|null, \"blurb\": str|null, \"cards\": [{\"stem\": str, \"choices\": [{\"text\": str, \"correct\": bool, \"feedback\": str}], \"kind\": \"question\"|\"tricky\"|\"example\", \"confidence\": number, \"why\": str}]}. name/blurb only when he has none. No prose outside the JSON.",
].join("\n");

const cap = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/** The user message: everything the model gets to read, in the order it matters. */
export function buildCeqQueueMessages(src: BriefSource): { system: string; user: string } {
  const talk = src.segments.map((s) => s.text.trim()).filter(Boolean);
  const parent = src.parentCards.slice(0, 12).map((c) => `- ${cap(c.stem, 200)} → ${c.choices.find((x) => x.correct)?.text ?? "?"}`);
  const kept = src.feedback.filter((f) => f.action !== "dropped").slice(0, 8).map((f) => `- ${cap(f.stem, 160)}`);
  const dropped = src.feedback.filter((f) => f.action === "dropped").slice(0, 8).map((f) => `- ${cap(f.stem, 160)}`);
  const user = [
    `THE VIDEO: ${src.name || "(unnamed)"}${src.blurb ? ` — ${src.blurb}` : ""}`,
    talk.length ? `WHAT LEE SAID ABOUT IT (spoken, in order, may be rough):\n${cap(talk.join("\n"), 9000)}` : "WHAT LEE SAID ABOUT IT: nothing recorded — write from the parent set alone, and say so in every WHY.",
    parent.length ? `THE PARENT SET'S CARDS (the style guide — go one level deeper):\n${parent.join("\n")}` : "THE PARENT SET'S CARDS: none.",
    kept.length ? `HE KEPT THESE LAST TIME (make more like them):\n${kept.join("\n")}` : "",
    dropped.length ? `HE DROPPED THESE LAST TIME (not these):\n${dropped.join("\n")}` : "",
    `Write ${src.want} candidates.`,
  ].filter(Boolean).join("\n\n");
  return { system: CEQ_QUEUE_SYSTEM, user };
}

const KINDS = new Set(["question", "tricky", "example"]);
const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
const clean = (s: unknown, n: number): string => (typeof s === "string" ? s.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim().slice(0, n) : "");

/** One candidate, defended. null when it could not be a card: no stem, fewer than 3 or more than
 *  6 choices, not exactly one correct, or a duplicate choice. Everything else is normalised
 *  rather than refused — a stray emoji or a 1.4 confidence is not a reason to lose a question. */
export function normalizeCandidate(raw: unknown): CandidateCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const stem = clean(r.stem, 400);
  if (!stem) return null;
  const rawChoices = Array.isArray(r.choices) ? r.choices : [];
  const seen = new Set<string>();
  const choices: CandidateChoice[] = [];
  for (const c of rawChoices) {
    if (!c || typeof c !== "object") continue;
    const cc = c as Record<string, unknown>;
    const text = clean(cc.text, 200);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    choices.push({ text, correct: cc.correct === true, feedback: clean(cc.feedback, 300) });
  }
  if (choices.length < 3 || choices.length > 6) return null;
  if (choices.filter((c) => c.correct).length !== 1) return null;
  const kind = typeof r.kind === "string" && KINDS.has(r.kind) ? (r.kind as CandidateCard["kind"]) : "question";
  const conf = typeof r.confidence === "number" && Number.isFinite(r.confidence) ? Math.max(0, Math.min(1, r.confidence)) : 0.5;
  return { stem, choices, kind, confidence: Math.round(conf * 100) / 100, why: clean(r.why, 240) };
}

/** The model's whole answer, defended. Never throws on a bad answer — an empty `cards` with a
 *  `dropped` count is the honest result, and the job records it rather than failing. */
export function parseCandidateSet(text: string): CandidateSet {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { cards: [], dropped: 0 };
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(m[0]) as Record<string, unknown>; } catch { return { cards: [], dropped: 0 }; }
  const raw = Array.isArray(obj.cards) ? obj.cards : [];
  const cards: CandidateCard[] = [];
  let dropped = 0;
  const stems = new Set<string>();
  for (const c of raw) {
    const n = normalizeCandidate(c);
    if (!n || stems.has(n.stem.toLowerCase())) { dropped += 1; continue; }
    stems.add(n.stem.toLowerCase());
    cards.push(n);
  }
  const name = clean(obj.name, 120);
  const blurb = clean(obj.blurb, 400);
  return { ...(name ? { name } : {}), ...(blurb ? { blurb } : {}), cards, dropped };
}

/** What a kept candidate becomes on the deck — the bank's own card shape, marked draft and
 *  stamped with where it came from, so the Editor tints it and /learn never serves it. */
export function candidateToCardData(c: CandidateCard, deckId: string, stageOrder: number, jobId: string): Record<string, unknown> {
  return {
    deckId,
    prompt: c.stem,
    choices: c.choices.map((x) => ({ text: x.text, correct: x.correct, ...(x.feedback ? { feedback: x.feedback } : {}) })),
    stageOrder,
    draft: true,
    provenance: "ceq-queue",
    jobId,
    queueKind: c.kind,
    queueConfidence: c.confidence,
    queueWhy: c.why,
  };
}

/** The ledger label and how many to ask for. A teaching video wants more than a cram set has
 *  room for, because most of these are starting points he will cut. */
export const CEQ_QUEUE_LABEL = "ceq-queue";
export const CEQ_QUEUE_WANT = 8;
