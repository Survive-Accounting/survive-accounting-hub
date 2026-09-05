// TALKTHROUGH PASS — pure assembly + parsing for "Draft the starting points".
//
// This module owns BOTH directions of the AI pass and is fully testable
// without a network: building the generation messages (verbatim transcript +
// segment anchors + the set's CEQs in order + the reference docs), and parsing
// the model's strict-JSON reply into BoardItems + proposed tags.
//
// LAWS ENCODED HERE:
//   · The transcript goes in VERBATIM, with [S<n>] anchors — the model must
//     quote, and every output item carries the quote that motivated it.
//   · The board is a STAGING AREA. Outputs are starting points in Lee's
//     cadence, never edits to the CEQ bank (the prompt says so explicitly).
//   · Outlines are grouped BEATS, never question-by-question.
//   · A failed or weird reply parses to [] — a bad pass can never corrupt
//     anything; the caller just shows the error and offers retry.
import {
  BOARD_KINDS, MOMENT_TAGS, newTTId, stampLabel,
  type BoardItem, type BoardKind, type GenTaskType, type MomentTag, type TalkSegment, type TalkTag,
} from "./talkthrough";

// ------------------------------------------------------------------ context

/** One CEQ as the pass sees it — extracted from the set file client-side. */
export interface PassCeq {
  id: string;
  /** "Q7 · Unearned → earned" style label (shorthand or title). */
  label: string;
  stem: string;
  choices: { text: string; correct: boolean; feedback?: string }[];
  /** Note/intro/outro frames ride along so the teaching order is complete. */
  noteOnly?: boolean;
}

export interface PassContext {
  setName: string;
  ceqs: PassCeq[];
  segments: Pick<TalkSegment, "id" | "seq" | "text" | "focusedCeqId" | "focusedCeqLabel" | "source" | "whisperPending">[];
  /** Moment tags AND quick-action notes (REWORD/NEWCEQ/CUT/EXHIBIT_SPEC/TEACH
   *  carry Lee's typed note — his own words outrank inference). */
  tags: Pick<TalkTag, "tag" | "at" | "focusedCeqLabel" | "source" | "note">[];
  /** Reference docs, injected by the server (shipped in the bundle via ?raw). */
  docs: { method: string; bible: string; blastOff: string };
}

const DOC_CAP = 28_000; // chars per doc — plenty for the three refs, bounded for the context window
const cap = (s: string): string => (s.length > DOC_CAP ? s.slice(0, DOC_CAP) + "\n…[trimmed]" : s);

/** The verbatim transcript block. [S<n>] anchors are the traceability handles;
 *  focus changes are announced inline so the model reads the room. */
export function transcriptBlock(ctx: PassContext): string {
  const out: string[] = [];
  let lastFocus: string | null | undefined;
  for (const s of ctx.segments) {
    if (!s.text.trim()) continue;
    if (s.focusedCeqId !== lastFocus) {
      out.push(`\n— focus: ${s.focusedCeqLabel ?? "general set talk"} —`);
      lastFocus = s.focusedCeqId;
    }
    const pending = s.whisperPending && s.source === "live" ? " (live text — Whisper pending)" : "";
    out.push(`[S${s.seq}]${pending} ${s.text.trim()}`);
  }
  return out.join("\n");
}

export function ceqBlock(ctx: PassContext): string {
  return ctx.ceqs.map((c, i) => {
    if (c.noteOnly) return `${i + 1}. [${c.id}] (note frame) ${c.label}: ${c.stem.slice(0, 200)}`;
    const choices = c.choices.map((ch) => `${ch.correct ? "✔" : "·"} ${ch.text}${ch.feedback ? ` — fb: ${ch.feedback}` : ""}`).join(" | ");
    return `${i + 1}. [${c.id}] ${c.label}\n   STEM: ${c.stem}\n   CHOICES: ${choices}`;
  }).join("\n");
}

export function tagBlock(ctx: PassContext): string {
  if (!ctx.tags.length) return "(none tapped)";
  return ctx.tags.map((t) => {
    const label = stampLabel(t.tag);
    const note = t.note ? ` — LEE'S NOTE: "${t.note}"` : "";
    return `${label} @ ${t.at}${t.focusedCeqLabel ? ` (on ${t.focusedCeqLabel})` : ""}${note}`;
  }).join("\n");
}

const OUTPUT_SPEC = `Return ONE JSON object, nothing else, with EXACTLY these keys (every item's "quote" is a VERBATIM excerpt from the transcript — copy, never paraphrase; every "ceqIds" entry is an id from the CEQ list):
{
 "ceqOrder": {"title": str, "quote": str, "ceqIds": [str], "proposed": [{"ceqId": str, "label": str, "why": str}], "wordingFlags": [{"ceqId": str, "flag": str, "quote": str}]},
 "outline": {"title": str, "quote": str, "beats": [{"title": str, "coversCeqIds": [str], "exhibitMoment": str, "notes": str}]},
 "exhibit": {"title": str, "summary": str, "prompt": str, "quote": str, "ceqIds": [str]},
 "vibeBeats": [{"title": str, "why": str, "talkPrompt": str, "quote": str, "ceqIds": [str]}],
 "shorts": [{"title": str, "format": "short"|"nerdout", "pitch": str, "quote": str, "ceqIds": [str]}],
 "phrases": [{"phrase": str, "meaning": str, "quote": str}],
 "accuracyFlags": [{"claim": str, "why": str, "quote": str, "ceqIds": [str]}],
 "bankChanges": [{"action": "add"|"reword"|"cut", "ceqId": str|null, "title": str, "proposal": str, "quote": str}],
 "proposedTags": [{"tag": "SHORT"|"NERDOUT"|"EXHIBIT"|"PHRASE"|"TALK"|"KEY", "quote": str, "seq": int}]
}`;

const PASS_RULES = `RULES:
- You are drafting STARTING POINTS for Lee, the teacher of record. Nothing you output edits anything; Lee's hands make real changes. Write in Lee's cadence (the METHOD doc) — his phrases verbatim over paraphrase, room left for him to riff.
- CEQ ORDER: propose a teaching resequence ONLY where the transcript motivates it ("question order is teaching order"); tie every move and every wording flag to its quote.
- BLAST OFF OUTLINE: grouped beats, NEVER question-by-question. Each beat names which CEQs it covers and where the exhibit moment lands. Follow the Blast Off structure in the production doc.
- EXHIBIT: one draft Claude Code prompt in the conveyor format the Bible describes (ONE exhibit, layout, interactions + reveal, importance cues, config-not-code, film-safe ship rules). Ground it in what Lee actually said he wanted to SHOW.
- VIBE BEATS: the deeper pass — gray areas, why-questions, and TALK-moment candidates with suggested prompt copy for where a student should talk back.
- SHORTS / NERD OUTS: only moments that EARN it, each quoting the verbatim moment and naming its format.
- PHRASES: reusable Lee-isms detected in the transcript that are not already in the phrase bank.
- ACCURACY FLAGS: anything Lee said that needs verification before it reaches students. Err toward flagging.
- BANK CHANGES: proposed adds/rewords/cuts to the question bank. Anchor each to the verbatim moment AND any REWORD/NEWCEQ/CUT quick-action note; ALSO propose changes the talk implies but Lee did not tag. "reword"/"cut" carry the ceqId; "add" leaves it null. Proposals are concrete (the new wording, or why the question does not earn its slot). Nothing auto-applies — Lee is the teacher of record.
- PROPOSED TAGS: spoken cues like "this would be a good short" that Lee did NOT tap; seq = the [S<n>] anchor.
- Empty arrays are fine. Never invent transcript content. Never output salary data or rankings.`;

/** Build the one-shot messages for a full pass. */
export function buildPassMessages(ctx: PassContext): { system: string; user: string } {
  const system = [
    "You turn a teacher's verbatim talkthrough of a question set into structured production starting points.",
    "\n=== THE SURVIVE METHOD (voice + pedagogy) ===\n", cap(ctx.docs.method),
    "\n=== BLAST OFF PRODUCTION STRUCTURE ===\n", cap(ctx.docs.blastOff),
    "\n=== EXHIBIT PRODUCTION BIBLE (conveyor prompt format + interaction vocabulary) ===\n", cap(ctx.docs.bible),
    "\n", PASS_RULES, "\n", OUTPUT_SPEC,
  ].join("");
  const user = [
    `SET: ${ctx.setName}`,
    `\n=== CEQs IN CURRENT TEACHING ORDER ===\n${ceqBlock(ctx)}`,
    `\n=== MOMENT TAGS LEE TAPPED ===\n${tagBlock(ctx)}`,
    `\n=== VERBATIM TRANSCRIPT ===\n${transcriptBlock(ctx)}`,
  ].join("\n");
  return { system, user };
}

/** Item-level regenerate: same context, one kind, Lee's notes carried in. */
export function buildRegenMessages(
  ctx: PassContext, kind: BoardKind, previous: Record<string, unknown>, comment: string,
): { system: string; user: string } {
  const base = buildPassMessages(ctx);
  const KEY: Partial<Record<BoardKind, string>> = {
    ceq_order: "ceqOrder", outline: "outline", exhibit: "exhibit", bank: "bankChanges",
    vibe: "vibeBeats", short: "shorts", phrase: "phrases", accuracy: "accuracyFlags",
    script: "script", idea: "ideas", vibe_plan: "vibePlan", ceq_edit: "ceqEdits",
  };
  const single = ["vibe", "short", "phrase", "accuracy", "bank"].includes(kind);
  const system = base.system + `\n\nREGENERATE MODE: output ONLY the "${KEY[kind] ?? kind}" key of the JSON object${single ? " (an array with EXACTLY ONE improved item)" : ""}. Same rules, same quoting law.`;
  const user = base.user + [
    `\n\n=== THE ITEM BEING REGENERATED (previous draft) ===\n${JSON.stringify(previous, null, 1)}`,
    `\n=== LEE'S NOTES ON IT (these outrank the previous draft) ===\n${comment.trim() || "(no note — just take another, better swing)"}`,
  ].join("\n");
  return { system, user };
}

// ------------------------------------------------------------------ parsing

/** Strip fences, slice to the outermost JSON object (models love to wrap). */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a === -1 || b <= a) return null;
  try { return JSON.parse(cleaned.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const ids = (v: unknown, known: Set<string>): string[] => arr(v).map(str).filter((x) => known.has(x));

export interface ParsedPass {
  items: BoardItem[];
  proposedTags: { tag: MomentTag; quote: string; seq: number }[];
}

/** Model JSON → board items. Unknown shapes degrade to nothing, never throw.
 *  `now` is injectable so tests are deterministic. */
export function parsePass(
  raw: Record<string, unknown>, sessionId: string, runId: string, knownCeqIds: string[], now = new Date(),
): ParsedPass {
  const known = new Set(knownCeqIds);
  const items: BoardItem[] = [];
  const iso = now.toISOString();
  let n = 0;
  const mk = (kind: BoardKind, title: string, payload: Record<string, unknown>, quote: string, ceqIds: string[]): BoardItem => ({
    id: `${newTTId("ttb", now)}-${n++}`,
    sessionId, runId, kind, title: title || "(untitled)", payload, quote, ceqIds,
    status: "suggested", comment: "", createdAt: iso, updatedAt: iso, syncedAt: null,
  });

  const order = rec(raw.ceqOrder);
  if (arr(order.proposed).length || arr(order.wordingFlags).length) {
    const proposed = arr(order.proposed).map(rec).map((p) => ({ ceqId: str(p.ceqId), label: str(p.label), why: str(p.why) }));
    const wordingFlags = arr(order.wordingFlags).map(rec).map((f) => ({ ceqId: str(f.ceqId), flag: str(f.flag), quote: str(f.quote) }));
    // The item belongs on every question it MOVES or FLAGS, not just the ones
    // the model remembered to list — the per-CEQ view depends on this union.
    const touched = [...new Set([
      ...ids(order.ceqIds, known),
      ...proposed.map((p) => p.ceqId).filter((x) => known.has(x)),
      ...wordingFlags.map((f) => f.ceqId).filter((x) => known.has(x)),
    ])];
    items.push(mk("ceq_order", str(order.title) || "CEQ order", { proposed, wordingFlags }, str(order.quote), touched));
  }

  const outline = rec(raw.outline);
  if (arr(outline.beats).length) {
    items.push(mk("outline", str(outline.title) || "Blast Off outline", {
      beats: arr(outline.beats).map(rec).map((b) => ({
        title: str(b.title), coversCeqIds: ids(b.coversCeqIds, known),
        exhibitMoment: str(b.exhibitMoment), notes: str(b.notes),
      })),
    }, str(outline.quote), arr(outline.beats).map(rec).flatMap((b) => ids(b.coversCeqIds, known))));
  }

  const ex = rec(raw.exhibit);
  if (str(ex.prompt)) {
    items.push(mk("exhibit", str(ex.title) || "Exhibit draft", { summary: str(ex.summary), prompt: str(ex.prompt) }, str(ex.quote), ids(ex.ceqIds, known)));
  }

  for (const v of arr(raw.vibeBeats).map(rec)) {
    if (!str(v.title) && !str(v.why)) continue;
    items.push(mk("vibe", str(v.title), { why: str(v.why), talkPrompt: str(v.talkPrompt) }, str(v.quote), ids(v.ceqIds, known)));
  }
  for (const s of arr(raw.shorts).map(rec)) {
    if (!str(s.title) && !str(s.pitch)) continue;
    const format = str(s.format) === "nerdout" ? "nerdout" : "short";
    items.push(mk("short", str(s.title), { format, pitch: str(s.pitch) }, str(s.quote), ids(s.ceqIds, known)));
  }
  for (const p of arr(raw.phrases).map(rec)) {
    if (!str(p.phrase)) continue;
    items.push(mk("phrase", str(p.phrase), { meaning: str(p.meaning) }, str(p.quote), []));
  }
  for (const a of arr(raw.accuracyFlags).map(rec)) {
    if (!str(a.claim)) continue;
    items.push(mk("accuracy", str(a.claim), { why: str(a.why) }, str(a.quote), ids(a.ceqIds, known)));
  }
  for (const b of arr(raw.bankChanges).map(rec)) {
    const action = ["add", "reword", "cut"].includes(str(b.action)) ? str(b.action) : "reword";
    if (!str(b.title) && !str(b.proposal)) continue;
    const cid = str(b.ceqId);
    items.push(mk("bank", str(b.title) || action + " proposal", { action, proposal: str(b.proposal) }, str(b.quote), cid && known.has(cid) ? [cid] : []));
  }

  const proposedTags = arr(raw.proposedTags).map(rec)
    .map((t) => ({ tag: str(t.tag) as MomentTag, quote: str(t.quote), seq: typeof t.seq === "number" ? t.seq : -1 }))
    .filter((t) => (MOMENT_TAGS as readonly string[]).includes(t.tag) && t.quote);

  return { items, proposedTags };
}

/** Sanity check the module stays honest about kinds. */
export const ALL_BOARD_KINDS: readonly BoardKind[] = BOARD_KINDS;

// ─────────────────────────────── B2: micro edits (background CEQ drafts)

/** What an EDIT-stamp context knows when it closes: the CEQ as it stands and
 *  what Lee SAID should change (his verbatim words are the instruction). */
export interface MicroEditContext {
  stamp: "reword" | "revise_choices" | "edit_other";
  ceq: PassCeq;
  instruction: string;
  /** B7 style notes for this kind, one line each (may be empty). */
  styleNotes: string[];
}

const MICRO_SPEC = `Return ONE JSON object, nothing else:
{"proposedStem": str|null, "proposedChoices": [{"text": str, "correct": bool, "feedback": str|null}]|null, "note": str}
- proposedStem: the rewritten stem, or null if the stem should not change.
- proposedChoices: the FULL revised choice list (exactly one correct), or null if choices should not change.
- note: one line on what you changed and why, in plain words.`;

export function buildMicroEditMessages(ctx: MicroEditContext): { system: string; user: string } {
  const focus = ctx.stamp === "reword" ? "Rewrite the STEM as instructed. Only touch choices if the instruction demands it."
    : ctx.stamp === "revise_choices" ? "Revise the CHOICES as instructed (keep exactly one correct; keep feedback lines unless told otherwise). Only touch the stem if the instruction demands it."
    : "Apply the instruction to whichever parts it names.";
  const system = [
    "You draft edits to one multiple-choice accounting question for Lee, the teacher of record. His spoken instruction is the spec — follow his wording preferences verbatim where he gives them. Never invent facts; keep intro-course level; no salary data.",
    focus,
    ctx.styleNotes.length ? `STYLE NOTES (Lee's standing preferences — obey):\n${ctx.styleNotes.map((n) => `- ${n}`).join("\n")}` : "",
    MICRO_SPEC,
  ].filter(Boolean).join("\n\n");
  const user = [
    `THE QUESTION AS IT STANDS:\nSTEM: ${ctx.ceq.stem}`,
    `CHOICES:\n${ctx.ceq.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c.correct ? "✔ " : ""}${c.text}${c.feedback ? ` — fb: ${c.feedback}` : ""}`).join("\n")}`,
    `\nLEE'S SPOKEN INSTRUCTION (verbatim):\n"${ctx.instruction}"`,
  ].join("\n");
  return { system, user };
}

export interface MicroEditProposal {
  proposedStem: string | null;
  proposedChoices: { text: string; correct: boolean; feedback: string | null }[] | null;
  note: string;
}

/** Parse the micro reply. Garbage → null (the item shows a retryable error). */
export function parseMicroEdit(text: string): MicroEditProposal | null {
  const raw = extractJsonObject(text);
  if (!raw) return null;
  const stem = typeof raw.proposedStem === "string" && raw.proposedStem.trim() ? raw.proposedStem.trim() : null;
  let choices: MicroEditProposal["proposedChoices"] = null;
  if (Array.isArray(raw.proposedChoices)) {
    const list = raw.proposedChoices
      .map((c) => (c && typeof c === "object" ? c as Record<string, unknown> : null))
      .filter((c): c is Record<string, unknown> => !!c)
      .map((c) => ({ text: String(c.text ?? "").trim(), correct: !!c.correct, feedback: typeof c.feedback === "string" && c.feedback.trim() ? c.feedback.trim() : null }))
      .filter((c) => c.text);
    if (list.length >= 2 && list.filter((c) => c.correct).length === 1) choices = list;
  }
  if (!stem && !choices) return null;
  return { proposedStem: stem, proposedChoices: choices, note: typeof raw.note === "string" ? raw.note : "" };
}

// ───────────────────────────── B3: the End Session → Review synthesis

export interface ReviewContext extends PassContext {
  /** Stamp contexts + stars, canonicalized, with their spoken windows. */
  stamps: { kind: string; ceqLabel: string | null; starred: boolean; spoken: string }[];
  /** Pre-flight exclusions: canonical stamp kinds Lee unchecked. */
  excludedKinds: string[];
  /** B7 style notes for the script kind. */
  styleNotes: string[];
  /** Whether Review Vibe was stamped (drives the vibe plan section). */
  wantVibePlan: boolean;
}

const REVIEW_SPEC = `Return ONE JSON object, nothing else (every "quote" is a VERBATIM transcript excerpt — copy, never paraphrase; ceq ids come from the CEQ list):
{
 "script": {"title": str, "beats": [{"title": str, "coversCeqIds": [str], "voice": [str], "emphasize": str, "notes": str}], "triggerWords": [str], "compareContrasts": [str]},
 "ceqEdits": [{"ceqId": str, "proposedStem": str|null, "proposedChoices": [{"text": str, "correct": bool, "feedback": str|null}]|null, "why": str, "quote": str}],
 "ideas": [{"kind": "cheat_code"|"memorize_this"|"deeper_idea"|"visual"|"phrase"|"short"|"nerdout"|"exhibit"|"trigger_word", "origin": "lee"|"ai", "title": str, "body": str, "quote": str, "ceqIds": [str], "visualKind": str|null}],
 "vibePlan": {"title": str, "beats": [{"title": str, "why": str, "talkPrompt": str, "quote": str}]}|null,
 "proposedStamps": [{"kind": str, "quote": str, "seq": int}]
}`;

const REVIEW_RULES = `LEE'S LAW (2026-09-03, in his words — this outranks everything below):
- "I'm the teacher. It's the support assistant." You PROOFREAD; you do not invent. When Lee stamps something, his words ARE the content: clean the grammar, keep his phrasing, his examples, his tone. "I don't want it to take the idea and make it its own." Never reword a point he already made well.
- A stamped item is ONE item, origin "lee". You may add ideas he did not say — but each is origin "ai", kept short, and there are never more "ai" items than "lee" items. They sit in their own fold; his sit on top.
- No inventing numbers, claims, jokes, or tone words. If he did not say it and it is not in a CEQ, it is not in the output — except as a clearly marked "ai" suggestion.
- THREE STANDARD CARD KINDS, and Lee wants consistency: cheat_code (a rule to carry into the exam), memorize_this (the thing to remember, said the way he says it), deeper_idea (the seed of a Nerd Out). When his stamp is vague (a tip, a phrase), SUGGEST which of the three it should be by choosing the kind — do not create extra ones. tip_trick / real_world / memo are retired: map them to one of the three.
- VISUAL: a stamped visual is a card or tool a student could use — a compare/contrast, a progressive reveal (Enter reveals the next line, Shift+Enter back), an interactive, or a static. Carry his visualKind if he gave one; otherwise suggest one. A visual may reference another visual he named.
- THE SCRIPT is TALKING POINTS, not prose: "just give me the best talking points out of what I said, the phrases." Concise. "voice" lines are Lee's own sentences QUOTED VERBATIM wherever they exist; connective tissue only where he left a gap, and short.

RULES:
- Nothing auto-applies; his hands make real changes.
- THE SCRIPT: GROUPED BEATS (never question-by-question). Name what to EMPHASIZE, the trigger words, the compare/contrasts and patterns he called out.
- CEQ EDITS: propose an edit ONLY where the talk motivates one (beyond the stamp-drafted edits listed as already pending). A "revise choices" or "reword" stamp means: clean up what he said, keep his intent. proposedChoices is the FULL list with exactly one correct.
- NEW CEQ: when he says a thing sounds like a question (a true/false, a "which of these"), propose it as a ceqEdit-style item quoting him, origin "lee".
- IDEAS: one item per idea; each quotes the verbatim moment that earned it.
- VIBE PLAN only when asked for; deeper-pass beats with talk-back prompts.
- PROPOSED STAMPS: moments Lee's words clearly imply but he didn't press; seq = the [S<n>] anchor.
- Respect the exclusions: produce NOTHING of an excluded kind.
- Empty arrays are fine. Never invent transcript content.`;

/** Transcript with context annotations — the contexts ARE the outline. */
export function reviewTranscriptBlock(ctx: ReviewContext): string {
  return transcriptBlock(ctx);
}

/** Item-level regenerate on the v2 board: same full context, one key, Lee's
 *  notes and the item's comment thread outranking the previous draft. */
export function buildReviewRegenMessages(
  ctx: ReviewContext, kind: "script" | "ceq_edit" | "idea" | "vibe_plan",
  previous: Record<string, unknown>, comments: string[],
): { system: string; user: string } {
  const base = buildReviewMessages(ctx);
  const KEY: Record<string, string> = { script: "script", ceq_edit: "ceqEdits", idea: "ideas", vibe_plan: "vibePlan" };
  const single = kind === "idea" || kind === "ceq_edit";
  const system = `${base.system}\n\nREGENERATE MODE: output ONLY the "${KEY[kind]}" key of the JSON object${single ? " (an array with EXACTLY ONE improved item)" : ""}. Same rules, same quoting law.`;
  const notes = comments.filter(Boolean).map((c) => `- ${c}`).join("\n") || "(no note — take another, better swing)";
  const user = [
    base.user,
    `\n=== THE ITEM BEING REGENERATED (previous draft) ===\n${JSON.stringify(previous, null, 1).slice(0, 8000)}`,
    `\n=== LEE'S NOTES ON IT (these outrank the previous draft) ===\n${notes}`,
  ].join("\n");
  return { system, user };
}

export function buildReviewMessages(ctx: ReviewContext): { system: string; user: string } {
  const system = [
    "You turn a teacher's verbatim talkthrough of a question set into a filming-ready review board.",
    "\n=== THE SURVIVE METHOD (voice + pedagogy) ===\n", cap(ctx.docs.method),
    "\n=== BLAST OFF PRODUCTION STRUCTURE ===\n", cap(ctx.docs.blastOff),
    "\n=== EXHIBIT PRODUCTION BIBLE ===\n", cap(ctx.docs.bible),
    ctx.styleNotes.length ? `\n=== LEE'S STANDING STYLE NOTES (obey) ===\n${ctx.styleNotes.map((n) => `- ${n}`).join("\n")}` : "",
    "\n", REVIEW_RULES, "\n", REVIEW_SPEC,
  ].join("");
  const stampBlock = ctx.stamps.length
    ? ctx.stamps.map((s) => `${s.starred ? "★ " : ""}${s.kind}${s.ceqLabel ? ` (on ${s.ceqLabel})` : ""}${s.spoken ? ` — said: "${s.spoken.slice(0, 400)}"` : ""}`).join("\n")
    : "(none pressed)";
  const user = [
    `SET: ${ctx.setName}`,
    `\n=== CEQs IN TEACHING ORDER ===\n${ceqBlock(ctx)}`,
    `\n=== STAMPS LEE PRESSED (with what he said inside each) ===\n${stampBlock}`,
    ctx.excludedKinds.length ? `\n=== EXCLUDED KINDS (produce nothing of these) ===\n${ctx.excludedKinds.join(" · ")}` : "",
    `\n=== VIBE PLAN WANTED: ${ctx.wantVibePlan ? "YES" : "no"} ===`,
    `\n=== VERBATIM TRANSCRIPT ===\n${reviewTranscriptBlock(ctx)}`,
  ].filter(Boolean).join("\n");
  return { system, user };
}

const IDEA_KINDS = ["short", "nerdout", "exhibit", "memo", "phrase", "trigger_word", "tip_trick", "cheat_code", "real_world", "memorize_this", "deeper_idea", "visual", "illustration"] as const;
/** Retired kinds fold into the three standard ones at parse time. */
const KIND_FOLD: Record<string, string> = { tip_trick: "cheat_code", real_world: "deeper_idea", memo: "memorize_this" };

/** Model JSON → v2 board items. Same laws as parsePass: degrade, never throw. */
export function parseReview(
  raw: Record<string, unknown>, sessionId: string, runId: string, knownCeqIds: string[], now = new Date(),
): ParsedPass {
  const known = new Set(knownCeqIds);
  const items: BoardItem[] = [];
  const iso = now.toISOString();
  let n = 0;
  const mk = (kind: BoardKind, title: string, payload: Record<string, unknown>, quote: string, ceqIds: string[]): BoardItem => ({
    id: `${newTTId("ttb", now)}-${n++}`,
    sessionId, runId, kind, title: title || "(untitled)", payload, quote, ceqIds,
    status: "suggested", comment: "", createdAt: iso, updatedAt: iso, syncedAt: null,
  });
  const str2 = (v: unknown): string => (typeof v === "string" ? v : "");
  const arr2 = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const rec2 = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

  const script = rec2(raw.script);
  if (arr2(script.beats).length) {
    const beats = arr2(script.beats).map(rec2).map((b) => ({
      title: str2(b.title),
      coversCeqIds: arr2(b.coversCeqIds).map(str2).filter((x) => known.has(x)),
      voice: arr2(b.voice).map(str2).filter(Boolean),
      emphasize: str2(b.emphasize),
      notes: str2(b.notes),
    }));
    items.push(mk("script", str2(script.title) || "The Script", {
      beats,
      triggerWords: arr2(script.triggerWords).map(str2).filter(Boolean),
      compareContrasts: arr2(script.compareContrasts).map(str2).filter(Boolean),
    }, beats[0]?.voice[0] ?? "", beats.flatMap((b) => b.coversCeqIds)));
  }

  for (const e of arr2(raw.ceqEdits).map(rec2)) {
    const cid = str2(e.ceqId);
    if (!known.has(cid)) continue;
    const proposal = parseMicroEdit(JSON.stringify({ proposedStem: e.proposedStem, proposedChoices: e.proposedChoices, note: e.why }));
    if (!proposal) continue;
    items.push(mk("ceq_edit", `Edit · ${cid.slice(0, 10)}`, { stamp: "synthesis", ceqId: cid, state: "ready", proposed: proposal, instruction: str2(e.why) }, str2(e.quote), [cid]));
  }

  for (const i of arr2(raw.ideas).map(rec2)) {
    const rawKind = (IDEA_KINDS as readonly string[]).includes(str2(i.kind)) ? str2(i.kind) : null;
    if (!rawKind || (!str2(i.title) && !str2(i.body))) continue;
    const kind = KIND_FOLD[rawKind] ?? rawKind;
    // origin: "lee" = cleaned from a stamp; "ai" = the model's own suggestion.
    // Anything with a quote is Lee's unless the model says otherwise.
    const origin = str2(i.origin) === "ai" ? "ai" : "lee";
    const visualKind = str2(i.visualKind);
    items.push(mk("idea", str2(i.title) || kind, { kind, body: str2(i.body), origin, ...(visualKind ? { visualKind } : {}) }, str2(i.quote), arr2(i.ceqIds).map(str2).filter((x) => known.has(x))));
  }

  const vibe = rec2(raw.vibePlan);
  if (arr2(vibe.beats).length) {
    items.push(mk("vibe_plan", str2(vibe.title) || "Vibe plan", {
      beats: arr2(vibe.beats).map(rec2).map((b) => ({ title: str2(b.title), why: str2(b.why), talkPrompt: str2(b.talkPrompt), quote: str2(b.quote) })),
    }, str2(arr2(vibe.beats).map(rec2)[0]?.quote), []));
  }

  const proposedTags = arr2(raw.proposedStamps).map(rec2)
    .map((t) => ({ tag: str2(t.kind) as MomentTag, quote: str2(t.quote), seq: typeof t.seq === "number" ? t.seq : -1 }))
    .filter((t) => t.quote && !!t.tag);

  return { items, proposedTags };
}

// ─────────────────────── B8: THE GENERATION QUEUE (incremental results)
//
// Lee, 2026-09-04: the End-Session pass used to be ONE blocking request that
// returned the whole board at once — nothing on Results until every token had
// landed, and no way to tell a slow pass from a dead one. So generation is a
// QUEUE now: tasks in priority order (the script, then the CEQ edits, then the
// ideas), each one generated on its own and written to the store the moment it
// parses, so Review fills in while he watches.
//
// This half is PURE: it builds the task list and each task's messages. The
// runner (client-side, store-writing) lives in talkthrough-review.ts — this
// module is imported by the SERVER function and must never touch the store.
//
// TARGETS. A task knows what it is about, and the targets are the ones the
// session already has, so the total is known BEFORE the first call:
//   script → the whole session (one task, the synthesis lane)
//   edit   → one CEQ, via an EDIT stamp Lee pressed on it (micro lane)
//   idea   → one stamp's spoken window (micro lane)
// Every idea/edit task is ONE stamp = ONE item, which is Lee's Law in the
// shape of a queue: his words, proofread, never re-imagined.

/** The phases live with the model (talkthrough.ts) so the Booth and the dock
 *  can read progress without importing the prompt builders. */
export type { GenTaskType };

/** A stamp as the queue builder sees it (canonical kind + its spoken window). */
export interface GenStamp {
  id: string;
  /** Canonical stamp kind — canonicalStamp() has already run. */
  kind: string;
  starred: boolean;
  ceqId: string | null;
  ceqLabel: string | null;
  /** Everything Lee said inside this stamp's context window. */
  spoken: string;
  /** The stamp's typed follow-up (a visual's kind, for instance). */
  note?: string | null;
}

export interface GenTask {
  /** Stable within a run — the progress line and the error report name it. */
  id: string;
  type: GenTaskType;
  /** Human label for the progress line: "the script", "reword · Q3 …". */
  label: string;
  /** The stamp this task came from (null for the script task). */
  stampId: string | null;
  /** Canonical stamp kind (null for the script task). */
  stampKind: string | null;
  ceqId: string | null;
  ceqLabel: string | null;
  /** Lee's words for this target (empty for the script task — it reads the
   *  whole transcript server-side). */
  spoken: string;
  note?: string | null;
}

/** Stamps that mean "change this question" — they draft a CEQ edit. */
export const EDIT_TASK_KINDS: readonly string[] = ["reword", "revise_choices", "edit_other"];
/** Stamps that mean "bank this idea". blast_off / review_vibe are markers for
 *  the script and the vibe plan, not cards, so they never mint an idea task. */
export const IDEA_TASK_KINDS: readonly string[] = IDEA_KINDS;

/** The key an already-drafted CEQ edit occupies — the booth fires a micro
 *  draft the moment an edit context closes, and the queue must not double it. */
export const editTaskKey = (ceqId: string, stampKind: string): string => `${ceqId}|${stampKind}`;

/** THE QUEUE, in priority order: the script, every CEQ edit, every idea.
 *  Pure and total — the count it returns is the count the progress line shows. */
export function buildGenerationQueue(input: {
  stamps: GenStamp[];
  /** Pre-flight exclusions (canonical stamp kinds Lee unchecked). */
  excludedKinds: string[];
  /** `editTaskKey()` values already on the board from the booth's live drafts. */
  alreadyDrafted?: string[];
}): GenTask[] {
  const excluded = new Set(input.excludedKinds);
  const drafted = new Set(input.alreadyDrafted ?? []);
  const tasks: GenTask[] = [];

  // (a) THE SCRIPT — always, even with no stamps at all (the pre-flight says
  // so in as many words: "The script is always generated").
  tasks.push({ id: "t-script", type: "script", label: "the script", stampId: null, stampKind: null, ceqId: null, ceqLabel: null, spoken: "" });

  // A stamp with nothing said inside it has nothing to proofread, and a star
  // is a bookmark, not a context. Neither may be turned into content — that
  // would be inventing, which is the one thing the pass may never do.
  const usable = input.stamps.filter((s) => !s.starred && !excluded.has(s.kind) && s.spoken.trim());

  // (b) CEQ EDITS — one per edit stamp that still needs a draft.
  let n = 0;
  for (const s of usable) {
    if (!EDIT_TASK_KINDS.includes(s.kind) || !s.ceqId) continue;
    if (drafted.has(editTaskKey(s.ceqId, s.kind))) continue;
    tasks.push({
      id: `t-edit-${n++}`, type: "edit", label: `${s.kind.replace(/_/g, " ")} · ${s.ceqLabel ?? "a question"}`,
      stampId: s.id, stampKind: s.kind, ceqId: s.ceqId, ceqLabel: s.ceqLabel ?? null, spoken: s.spoken, note: s.note ?? null,
    });
  }

  // (c) IDEAS — one per bankable stamp.
  let m = 0;
  for (const s of usable) {
    if (!IDEA_TASK_KINDS.includes(s.kind)) continue;
    tasks.push({
      id: `t-idea-${m++}`, type: "idea", label: `${s.kind.replace(/_/g, " ")}${s.ceqLabel ? ` · ${s.ceqLabel}` : ""}`,
      stampId: s.id, stampKind: s.kind, ceqId: s.ceqId ?? null, ceqLabel: s.ceqLabel ?? null, spoken: s.spoken, note: s.note ?? null,
    });
  }

  return tasks;
}

/** How many tasks of each type a queue holds — the "3/8" in the progress line. */
export function queueCounts(tasks: GenTask[]): Record<GenTaskType, number> {
  return {
    script: tasks.filter((t) => t.type === "script").length,
    edit: tasks.filter((t) => t.type === "edit").length,
    idea: tasks.filter((t) => t.type === "idea").length,
  };
}

/** The synthesis keys the SCRIPT task asks for. The rest of the board is minted
 *  by the per-stamp micro tasks, so this call stays small and lands fast. */
export const scriptTaskKeys = (wantVibePlan: boolean): string[] =>
  ["script", ...(wantVibePlan ? ["vibePlan"] : []), "proposedStamps"];

/** Same context, same laws, but only some keys of the output object. Used by
 *  the script task so the first card reaches the board in one short call. */
export function buildReviewOnlyMessages(ctx: ReviewContext, keys: string[]): { system: string; user: string } {
  const base = buildReviewMessages(ctx);
  const list = keys.length ? keys : ["script"];
  const system = `${base.system}\n\nPARTIAL OUTPUT MODE: output ONE JSON object with ONLY these keys — ${list.map((k) => `"${k}"`).join(", ")}. Omit every other key entirely. Same rules, same quoting law.`;
  return { system, user: base.user };
}

// ---------------------------------------------------- the per-stamp idea task

/** One stamp, its words, and the question it was pressed on. */
export interface IdeaDraftContext {
  /** Canonical stamp kind — it is the card kind unless it is a vague one. */
  stampKind: string;
  setName: string;
  ceqLabel: string | null;
  ceqStem: string | null;
  /** Lee's verbatim words inside the stamp's window. THE content. */
  spoken: string;
  /** A visual stamp's follow-up ("progressive reveal"), if he tapped one. */
  note?: string | null;
  /** B7 style notes for this kind. */
  styleNotes: string[];
}

const IDEA_SPEC = `Return ONE JSON object, nothing else:
{"kind": "cheat_code"|"memorize_this"|"deeper_idea"|"visual"|"phrase"|"trigger_word"|"short"|"nerdout"|"exhibit", "title": str, "body": str, "visualKind": str|null}
- kind: the stamp's kind, unless his words clearly belong to one of the other standard kinds (cheat_code / memorize_this / deeper_idea) — then say which.
- title: a short heading in HIS words (under 60 characters).
- body: his point, proofread. Two or three short lines at most.
- visualKind: only for a visual — "progressive reveal" | "interactive" | "compare / contrast" | "static", or null.`;

const IDEA_RULES = `LEE'S LAW (his words, and it outranks everything else):
- "I'm the teacher. It's the support assistant." You PROOFREAD; you do not invent. These ARE his words: clean the grammar, keep his phrasing, his examples, his tone. Never reword a point he already made well. Never take his idea and make it your own.
- ONE card out of one stamp. No extras, no alternatives, no commentary.
- No invented numbers, claims, jokes or tone words. If he did not say it and it is not in the question, it is not in the card.
- THE THREE STANDARD KINDS: cheat_code (a rule to carry into the exam), memorize_this (the thing to remember, said his way), deeper_idea (the seed of a Nerd Out). Plus visual, phrase, trigger_word, and the video kinds (short / nerdout / exhibit). Do not invent a kind outside that list.
- Intro-accounting level. No salary data, no rankings.
- If his words do not add up to a card, return a title and body that are his words as they stand — an honest thin card beats an invented fat one.`;

export function buildIdeaMessages(ctx: IdeaDraftContext): { system: string; user: string } {
  const system = [
    `You draft ONE bankable card for Lee, the teacher of record, out of a moment he stamped "${ctx.stampKind.replace(/_/g, " ")}" while talking through his question set.`,
    ctx.styleNotes.length ? `STYLE NOTES (Lee's standing preferences — obey):\n${ctx.styleNotes.map((n) => `- ${n}`).join("\n")}` : "",
    IDEA_RULES,
    IDEA_SPEC,
  ].filter(Boolean).join("\n\n");
  const user = [
    `SET: ${ctx.setName}`,
    ctx.ceqLabel ? `THE QUESTION HE WAS LOOKING AT: ${ctx.ceqLabel}` : "HE WAS TALKING ABOUT THE SET AS A WHOLE.",
    ctx.ceqStem ? `ITS STEM: ${ctx.ceqStem}` : "",
    ctx.note ? `HIS FOLLOW-UP TAP: ${ctx.note}` : "",
    `\nWHAT HE SAID (verbatim — this is the content):\n"${ctx.spoken}"`,
  ].filter(Boolean).join("\n");
  return { system, user };
}

export interface IdeaDraft {
  kind: string;
  title: string;
  body: string;
  visualKind: string | null;
}

/** Parse the micro reply into one idea. Garbage → null, and the caller halts
 *  the queue loudly rather than banking a card nobody can trace. */
export function parseIdeaDraft(text: string, stampKind: string): IdeaDraft | null {
  const raw = extractJsonObject(text);
  if (!raw) return null;
  const asked = str(raw.kind);
  const folded = KIND_FOLD[asked] ?? asked;
  const kind = (IDEA_KINDS as readonly string[]).includes(folded)
    ? folded
    : (KIND_FOLD[stampKind] ?? stampKind);
  const title = str(raw.title).trim();
  const body = str(raw.body).trim();
  if (!title && !body) return null;
  const visualKind = str(raw.visualKind).trim();
  return { kind, title: title || body.slice(0, 60), body, visualKind: visualKind || null };
}
