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
  type BoardItem, type BoardKind, type MomentTag, type TalkSegment, type TalkTag,
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
  const KEY: Record<BoardKind, string> = {
    ceq_order: "ceqOrder", outline: "outline", exhibit: "exhibit", bank: "bankChanges",
    vibe: "vibeBeats", short: "shorts", phrase: "phrases", accuracy: "accuracyFlags",
  };
  const single = ["vibe", "short", "phrase", "accuracy", "bank"].includes(kind);
  const system = base.system + `\n\nREGENERATE MODE: output ONLY the "${KEY[kind]}" key of the JSON object${single ? " (an array with EXACTLY ONE improved item)" : ""}. Same rules, same quoting law.`;
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
