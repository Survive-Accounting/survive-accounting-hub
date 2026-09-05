// THE TELEPROMPTER COLUMN's brain — pure, no React, no network.
//
// Lee (2026-09-03): "the goal would be to have the suggested phrases appear
// next to the CEQ I was discussing, since it has segmented my transcript to
// align with whatever CEQ I'm discussing … THESE SUGGESTED PHRASES ARE ME.
// It's just taking my transcript and pulling out anything that's useful and
// proofreading it, making it more concise if possible. Human suggestions are
// the main thing; maybe have ONE AI suggestion for the best thing it feels is
// missing."
//
// Same evening, second pass: "Show me the stamps I used for that slide … it
// organizes them into phrases. It lets me pick any to form that into a slide
// … 2 sentences max on a phrase, preferably one … these are CRAM videos."
//
// Third pass: "An option above the teleprompter to view all stamps … click
// each example and let it navigate to the slide it was from … let's just let
// the stamps be proofread by default. Save the raw text in the toggle still."
//
// So: the candidates are his own segments — captured while a CEQ was focused
// and/or inside a stamp context — each tagged with the stamp he was holding
// and the card he was looking at. No model is needed to FIND them. The model
// only proofreads them into short titled phrases (buildTidy…), which go on
// the prompter or become a slide, and may add exactly one line of its own.
import {
  canonicalStamp, contextsOfSegment, isContextTag, stampLabel,
  type TTDoc, type TalkSegment, type TalkTag,
} from "@/components/canvas/talkthrough";
import type { BlastFrame, BlastFrameKind } from "./plan";

export interface PrompterCandidate {
  id: string;
  text: string;
  /** Where it came from: the CEQ he was looking at, a stamp context, or the
   *  bank item the slide was picked from. */
  source: "ceq" | "stamp" | "bank";
  /** The stamp he was holding (canonical kind), or null for plain card talk. */
  stamp: string | null;
  /** The card he was looking at when he said it, when known. */
  ceqId: string | null;
  ceqLabel: string | null;
  at: string;
}

/** One chip in the prompter: a stamp he used, with its words. */
export interface PrompterGroup {
  key: string;
  label: string;
  /** Canonical stamp kind, or "card" for words said on the card with no stamp. */
  stamp: string | null;
  candidates: PrompterCandidate[];
}

/** Which stamp contexts feed which detour slide. Old stamp names fold in. */
export const STAMPS_FOR_KIND: Partial<Record<BlastFrameKind, readonly string[]>> = {
  phrase: ["memorize_this", "phrase", "memo", "trigger_word"],
  cheat: ["cheat_code", "tip_trick"],
  tip: ["deeper_idea", "real_world", "nerdout"],
  exhibit: ["visual", "exhibit"],
  // An illustration idea rides on a blank slide (the results route hands it the banked brief).
  blank: ["illustration"],
};

/** A stamp / board-idea kind → the slide kind it becomes on the film draft. */
export function frameKindForStamp(kind: string | null | undefined): BlastFrameKind {
  const k = canonicalStamp(kind ?? "") ?? kind ?? "";
  for (const [frameKind, stamps] of Object.entries(STAMPS_FOR_KIND)) {
    if (stamps.includes(k)) return frameKind as BlastFrameKind;
  }
  return "phrase";
}

/** The three slide kinds a phrase can become, in the order Lee names them. */
export const PHRASE_SLIDE_KINDS: readonly { kind: BlastFrameKind; label: string }[] = [
  { kind: "phrase", label: "Memorize this" },
  { kind: "cheat", label: "Cheat code" },
  { kind: "tip", label: "Deeper idea" },
];

/** The set's live talk: its sessions' segments and stamp contexts. */
function setTalk(doc: TTDoc, setId: string): { segs: TalkSegment[]; stampOf: (s: TalkSegment) => string | null } {
  const sessionIds = new Set(doc.sessions.filter((s) => s.setId === setId && !s.archivedAt).map((s) => s.id));
  const segs = doc.segments.filter((s) => sessionIds.has(s.sessionId) && !s.archivedAt && s.text.trim());
  const tags: TalkTag[] = doc.tags.filter((t) => sessionIds.has(t.sessionId) && !t.archivedAt && isContextTag(t));
  // The stamp a segment was captured under: the newest open context in its
  // own session (contextsOfSegment is newest-first).
  const stampOf = (s: TalkSegment): string | null => {
    const mine = tags.filter((t) => t.sessionId === s.sessionId);
    const ctx = mine.length ? contextsOfSegment(s, mine) : [];
    return ctx.length ? canonicalStamp(ctx[0].tag) : null;
  };
  return { segs, stampOf };
}

const collector = () => {
  const out: PrompterCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: Omit<PrompterCandidate, "text"> & { text: string }) => {
    const clean = c.text.trim();
    const key = clean.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ ...c, text: clean });
  };
  return { out, push };
};

const fromSeg = (s: TalkSegment, source: PrompterCandidate["source"], stamp: string | null): PrompterCandidate =>
  ({ id: s.id, text: s.text, source, stamp, ceqId: s.focusedCeqId ?? null, ceqLabel: s.focusedCeqLabel ?? null, at: s.startedAt });

/** Lee's own words for THIS slide, in the order he said them, de-duplicated. */
export function prompterCandidates(frame: BlastFrame, doc: TTDoc, setId: string): PrompterCandidate[] {
  const { segs, stampOf } = setTalk(doc, setId);
  const { out, push } = collector();

  if (frame.kind === "ceq" && frame.ceqId) {
    for (const s of segs) if (s.focusedCeqId === frame.ceqId) push(fromSeg(s, "ceq", stampOf(s)));
  }

  const kinds = STAMPS_FOR_KIND[frame.kind];
  if (kinds) {
    for (const s of segs) {
      const st = stampOf(s);
      if (st && kinds.includes(st)) push(fromSeg(s, "stamp", st));
    }
  }

  if (frame.bankItemId) {
    const b = doc.boardItems.find((x) => x.id === frame.bankItemId);
    if (b) {
      const p = b.payload as { body?: unknown; kind?: unknown };
      const st = typeof p.kind === "string" ? canonicalStamp(p.kind) : null;
      const body = String(p.body ?? "");
      if (b.quote) push({ id: `${b.id}:quote`, text: b.quote, source: "bank", stamp: st, ceqId: b.ceqIds[0] ?? null, ceqLabel: null, at: b.createdAt });
      if (body) push({ id: `${b.id}:body`, text: body, source: "bank", stamp: st, ceqId: b.ceqIds[0] ?? null, ceqLabel: null, at: b.createdAt });
    }
  }

  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** EVERY STAMP that came through on this set, whatever slide it was near —
 *  the "all stamps" view. Plain card talk is left out; that is per-slide. */
export function setStampCandidates(doc: TTDoc, setId: string): PrompterCandidate[] {
  const { segs, stampOf } = setTalk(doc, setId);
  const { out, push } = collector();
  for (const s of segs) {
    const st = stampOf(s);
    if (st) push(fromSeg(s, "stamp", st));
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** The stamps, each with its words — stamps first (in the order he first
 *  used them), plain card talk last. */
export function prompterGroups(candidates: readonly PrompterCandidate[]): PrompterGroup[] {
  const groups = new Map<string, PrompterGroup>();
  for (const c of candidates) {
    const key = c.stamp ?? "card";
    let g = groups.get(key);
    if (!g) {
      g = { key, label: c.stamp ? stampLabel(c.stamp) : "Said on this card", stamp: c.stamp, candidates: [] };
      groups.set(key, g);
    }
    g.candidates.push(c);
  }
  const list = [...groups.values()];
  const card = list.filter((g) => g.stamp === null);
  return [...list.filter((g) => g.stamp !== null), ...card];
}

export interface TidyPhrase {
  id: string;
  /** 2–5 words: the heading the slide would carry ("The Paycheck Test"). */
  title: string;
  /** The phrase itself — his voice, one sentence, two at most. */
  text: string;
  /** The stamp the words came from — decides the slide kind it would become. */
  stamp: string | null;
  /** Candidate ids it was made from. */
  from: string[];
  /** The card he was looking at, from the first source candidate. */
  ceqId: string | null;
  ceqLabel: string | null;
}

export interface TidyResult {
  phrases: TidyPhrase[];
  /** The ONE thing the model thinks is missing, or null. Marked AI in the UI. */
  suggestion: string | null;
}

/** The proofreading call. LEE'S LAW applies: his words, tightened, never
 *  invented — and exactly one line the model may add, kept apart. */
export function buildTidyMessages(input: {
  scope: string;
  slideText?: string;
  candidates: readonly PrompterCandidate[];
  kept: readonly string[];
}): { system: string; user: string } {
  const system = [
    "You proofread a teacher's own spoken words into PHRASES for a short vertical CRAM video and its teleprompter. The teacher is Lee; the words are his, captured live while he looked at the card named on each line, under the stamp named on each line.",
    "LEE'S LAW: keep his meaning, his phrasing and his voice. Fix grammar and dropped words, cut filler and false starts. Keep the connective words that carry the logic ('if so', 'then', 'because'). NEVER add facts, examples or claims he did not say.",
    "PHRASES, NOT PARAGRAPHS. This is a cram video: each phrase is ONE sentence, two at most, bullet-point concise, sayable in a breath. A long candidate becomes two or three separate phrases; a candidate with nothing usable (an aside, noise, a question to himself) produces none. Keep each phrase's stamp; list the candidate ids it came from in \"from\".",
    "Give every phrase a TITLE: 2–5 words, the heading a slide would carry (e.g. 'The Paycheck Test', 'Internal users'). Use his own name for it when he gave one; otherwise the plainest name for what the phrase is about. Never a full sentence.",
    "Then, ONE suggestion at most: a single phrase for the one useful thing you believe is missing, in his voice. If nothing is clearly missing, null.",
    "Return ONLY JSON: {\"phrases\": [{\"title\": str, \"text\": str, \"stamp\": str | null, \"from\": [str]}], \"suggestion\": str | null}",
  ].join("\n");
  const user = [
    `SCOPE: ${input.scope}`,
    input.slideText ? `WHAT THE SLIDE SAYS:\n${input.slideText.slice(0, 2000)}` : "",
    input.kept.length ? `LINES HE ALREADY KEPT (do not repeat these):\n${input.kept.map((k) => `- ${k}`).join("\n")}` : "",
    `HIS WORDS (candidates):\n${input.candidates.map((c) => `[${c.id}] (stamp: ${c.stamp ?? "none"} · card: ${c.ceqLabel ?? "—"}) ${c.text}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  return { system, user };
}

/** Lenient parse — a model's JSON is never trusted to be tidy. */
export function parseTidy(raw: string, candidates: readonly PrompterCandidate[]): TidyResult {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("the proofread came back without JSON");
  const j = JSON.parse(m[0]) as { phrases?: unknown; suggestion?: unknown };
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const phrases: TidyPhrase[] = [];
  for (const p of Array.isArray(j.phrases) ? j.phrases : []) {
    const o = p as { title?: unknown; text?: unknown; stamp?: unknown; from?: unknown };
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    const from = (Array.isArray(o.from) ? o.from : []).filter((x): x is string => typeof x === "string" && byId.has(x));
    const first = from.length ? byId.get(from[0])! : null;
    const stamp = typeof o.stamp === "string" && o.stamp !== "none" ? canonicalStamp(o.stamp) ?? o.stamp : first?.stamp ?? null;
    const title = typeof o.title === "string" && o.title.trim() ? o.title.trim().replace(/[.:]+$/, "") : "";
    phrases.push({ id: `ph-${phrases.length + 1}`, title, text, stamp, from, ceqId: first?.ceqId ?? null, ceqLabel: first?.ceqLabel ?? null });
  }
  const suggestion = typeof j.suggestion === "string" && j.suggestion.trim() ? j.suggestion.trim() : null;
  return { phrases, suggestion };
}

// ---- proofread by default, remembered -------------------------------------
// One micro call per slide (or per set, for the all-stamps view) is cents;
// re-running it on every visit is not. The result is keyed by the words it
// was made from, so new talk gets a fresh proofread and old talk keeps its.

const TIDY_KEY = "sa-prompter-tidy-v2";

/** Cheap stable hash of the candidate ids + texts (FNV-1a, 32-bit). */
export function tidyCacheKey(scope: string, candidates: readonly PrompterCandidate[]): string {
  let h = 0x811c9dc5;
  const s = candidates.map((c) => `${c.id}${c.text}`).join("");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${scope}:${h.toString(16)}`;
}

type TidyStore = Record<string, TidyResult>;
const readStore = (): TidyStore => { try { return (JSON.parse(localStorage.getItem(TIDY_KEY) ?? "{}") as TidyStore) ?? {}; } catch { return {}; } };

export function readTidy(key: string): TidyResult | null {
  const r = readStore()[key];
  return r && Array.isArray(r.phrases) ? r : null;
}

export function writeTidy(key: string, res: TidyResult): void {
  try {
    const store = readStore();
    store[key] = res;
    // Keep the store small: the newest 60 entries.
    const keys = Object.keys(store);
    if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete store[k];
    localStorage.setItem(TIDY_KEY, JSON.stringify(store));
  } catch { /* storage full or unavailable — the proofread still shows this visit */ }
}
