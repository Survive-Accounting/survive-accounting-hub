// TRANSCRIPT IMPORT — notes Lee dictated somewhere else become booth segments.
//
// WHY. The booth captures live, but Lee thinks in the car, on a walk, in
// another app. The V3 handoff's answer (his idea): dictate anywhere, paste the
// text here later, and the app grabs the stamped moments. A TalkSegment is
// text + an optional focusedCeqId; audio is optional — so an import is
// mechanical, and Transcript Law holds: the words land verbatim.
//
// THE SPEAKING CONVENTION (docs/V3-PRODUCTION-HANDOFF.md). Say the stamp word
// and the import parses it:
//   "Phrase: …" · "Trigger word: …" · "Tip: …" / "Trick: …" · "Cheat code: …"
//   "Real world: …" · "Memo: …" · "Exhibit: …" · "Short: …" · "Nerd out: …"
//   "Reword this: …" · "Revise choices: …" · "Blast off: …" · "Review vibes: …"
// Anchor with "Question 3" before talking about Q3; "General" goes back to
// set-wide talk. Name the set with a "Set: …" line at the top of a block.
//
// A CUE ONLY COUNTS AT THE START OF A SENTENCE, or when a colon follows it.
// "in short, the debit side…" is speech; "Short: the debit side" is a stamp.
// Dictation apps punctuate, and that punctuation is what tells the two apart.
//
// A blank line ends a block, so a paragraph of un-stamped talk is its own
// segment (and its own delete). A stamp's text runs to the next cue or the
// next blank line, whichever comes first.
//
// Pure: no React, no store. The booth turns blocks into rows with
// buildImportRows and commits them through the usual local-first path.
import { makeSegment, makeTag, type StampKind, type TalkSegment, type TalkTag } from "./talkthrough";

export interface ImportBlock {
  /** Verbatim words, whitespace collapsed. Never empty. */
  text: string;
  stamp: StampKind | null;
  /** 0-based index into the set's CEQ list; null = general set talk. */
  ceqIndex: number | null;
  /** From a "Set: …" line above this block; null when the block was not named. */
  setName: string | null;
}

/** Stamp cue → stamp kind. Longer, more specific patterns first, so "cheat
 *  code" is never read as anything else and "tip or trick" is one cue. */
const STAMP_CUES: readonly [string, StampKind][] = [
  ["cheat\\s*codes?", "cheat_code"],
  ["memori[sz]e\\s*this", "memorize_this"],
  ["deeper\\s*ideas?", "deeper_idea"],
  ["visuals?", "visual"],
  ["trigger\\s*words?", "trigger_word"],
  ["real[\\s-]*world(?:\\s+examples?)?", "real_world"],
  ["tips?\\s*(?:\\/|or|and)\\s*tricks?", "tip_trick"],
  ["tips?", "tip_trick"],
  ["tricks?", "tip_trick"],
  ["nerd[\\s-]*outs?", "nerdout"],
  ["revise(?:\\s+the)?\\s+choices", "revise_choices"],
  ["reword(?:\\s+this)?", "reword"],
  ["review\\s+vibes?", "review_vibe"],
  ["blast[\\s-]*off", "blast_off"],
  ["phrases?", "phrase"],
  ["memos?", "memo"],
  ["exhibits?", "exhibit"],
  ["shorts?", "short"],
];

/** One regex, every cue. Group order: the stamps (in STAMP_CUES order), then
 *  the "Question N" number, then "number N", then the general-talk phrases. */
function cueRegex(): RegExp {
  const stamps = STAMP_CUES.map(([p]) => `(${p})`).join("|");
  const question = "(?:q(?:uestion)?\\s*#?\\s*(\\d{1,3}))";
  const number = "(?:number\\s+(\\d{1,3}))";
  const general = "(general(?:\\s+set)?(?:\\s+(?:talk|brainstorm))?|whole\\s+set|set\\s+as\\s+a\\s+whole|set[\\s-]*wide)";
  return new RegExp(`\\b(?:${stamps}|${question}|${number}|${general})\\b`, "gi");
}

/** THE SENTENCE-START RULE. A cue counts when nothing but punctuation and
 *  quotes stands between it and the previous sentence end (or the start), OR
 *  when a colon follows it. Anything else is Lee using the word in a sentence. */
function isCue(text: string, start: number, end: number): boolean {
  const before = text.slice(0, start).replace(/[\s"“”'‘’([]+$/, "");
  if (before === "" || /[.!?\n;:—–-]$/.test(before)) return true;
  return /^\s*[:—–]/.test(text.slice(end));
}

/** The words after a cue start after its punctuation: "Phrase: x", "Phrase, x",
 *  "Phrase. x", "Phrase — x" all mean x. */
const AFTER_CUE = /^\s*[:,.;\-—–]*\s*/;

const SET_HEADER = /^\s*set\s*[:\-–—]\s*(.+?)\s*$/i;

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

type Cue =
  | { kind: "stamp"; stamp: StampKind }
  | { kind: "anchor"; index: number | null };

/** Parse ONE run of text (no set headers, no blank lines) under the current
 *  anchor. Returns the blocks and the anchor in force at the end. */
function parseRun(text: string, anchor: number | null, ceqCount: number, setName: string | null): { blocks: ImportBlock[]; anchor: number | null } {
  const blocks: ImportBlock[] = [];
  const re = cueRegex();
  const nStamps = STAMP_CUES.length;
  const found: { cue: Cue; start: number; end: number }[] = [];
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (!isCue(text, start, end)) continue;
    let cue: Cue | null = null;
    for (let i = 0; i < nStamps && !cue; i++) if (m[i + 1] !== undefined) cue = { kind: "stamp", stamp: STAMP_CUES[i][1] };
    if (!cue) {
      const qn = m[nStamps + 1] ?? m[nStamps + 2];
      if (qn !== undefined) {
        const idx = parseInt(qn, 10) - 1;
        // A question the set does not have anchors nothing — the words are
        // kept as general talk rather than dropped or mis-anchored.
        cue = { kind: "anchor", index: idx >= 0 && idx < ceqCount ? idx : null };
      } else cue = { kind: "anchor", index: null };
    }
    found.push({ cue, start, end });
  }

  const push = (body: string, stamp: StampKind | null, at: number | null) => {
    const t = clean(body);
    if (t) blocks.push({ text: t, stamp, ceqIndex: at, setName });
  };

  let current: Cue | null = null;
  let pos = 0;
  const flush = (upTo: number) => {
    const body = text.slice(pos, upTo);
    if (!current) push(body, null, anchor);
    else if (current.kind === "stamp") push(body, current.stamp, anchor);
    else push(body, null, anchor);
  };
  for (const f of found) {
    // THE WORDS AFTER A STAMP ARE CONTENT. "Memo: whole set thing" is a memo
    // that says "whole set thing", not a memo with nothing in it followed by a
    // general-talk cue. Only an anchor may be followed directly by a cue
    // ("Question 2. Phrase: …" is the whole convention).
    if (current?.kind === "stamp" && !clean(text.slice(pos, f.start))) continue;
    flush(f.start);
    if (f.cue.kind === "anchor") anchor = f.cue.index;
    current = f.cue;
    const rest = text.slice(f.end);
    pos = f.end + (rest.match(AFTER_CUE)?.[0].length ?? 0);
  }
  flush(text.length);
  return { blocks, anchor };
}

/** THE PARSER. Text in, blocks out — each block one future segment, carrying
 *  its stamp (if said), its anchor (the last "Question N" above it) and the
 *  set named above it (if any). Never throws; garbage in is one general block. */
export function parseTranscriptImport(raw: string, ceqCount: number): ImportBlock[] {
  const out: ImportBlock[] = [];
  let setName: string | null = null;
  let anchor: number | null = null;
  let run: string[] = [];
  const endRun = () => {
    if (!run.length) return;
    const r = parseRun(run.join("\n"), anchor, ceqCount, setName);
    out.push(...r.blocks);
    anchor = r.anchor;
    run = [];
  };
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const header = line.match(SET_HEADER);
    if (header) { endRun(); setName = clean(header[1]) || null; anchor = null; continue; }
    if (!line.trim()) { endRun(); continue; }
    run.push(line);
  }
  endRun();
  return out;
}

/** Same-set test for a "Set: …" header against the session's set name — loose
 *  on purpose (Lee says the set's name, not its id, and not its quotes). */
export function setNameMatches(header: string | null, setName: string): boolean {
  if (!header) return true;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const a = norm(header), b = norm(setName);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

export interface ImportCeq { id: string; label: string }

/** BLOCKS → ROWS. Segments in the order they were written, stamped ones inside
 *  a closed context window [startedAt, endedAt) so contextOfSegment groups
 *  them exactly like a live stamp. Timestamps are synthetic and run BACKWARD
 *  from `now` in 2s steps — all in the past, so an import never outranks a
 *  later edit in the newest-wins merge, and still in written order. */
export function buildImportRows(
  blocks: readonly ImportBlock[],
  opts: { sessionId: string; startSeq: number; ceqs: readonly ImportCeq[]; now?: number },
): { segments: TalkSegment[]; tags: TalkTag[] } {
  const now = opts.now ?? Date.now();
  const segments: TalkSegment[] = [];
  const tags: TalkTag[] = [];
  const n = blocks.length;
  blocks.forEach((b, i) => {
    const t0 = new Date(now - (n - i) * 2000);
    const t1 = new Date(t0.getTime() + 1500);
    const ceq = b.ceqIndex != null ? opts.ceqs[b.ceqIndex] : undefined;
    const focus = { ceqId: ceq?.id ?? null, label: ceq && b.ceqIndex != null ? `Q${b.ceqIndex + 1} · ${ceq.label}` : null };
    const seg = makeSegment(opts.sessionId, opts.startSeq + i, focus, t0);
    // Typed, not heard: there is no audio and nothing for Whisper to upgrade.
    segments.push({ ...seg, text: b.text, source: "live", whisperPending: false, audioPath: null, endedAt: t1.toISOString() });
    if (b.stamp) tags.push({ ...makeTag(opts.sessionId, b.stamp, focus, t0), endedAt: t1.toISOString() });
  });
  return { segments, tags };
}
