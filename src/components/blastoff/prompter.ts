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
// And the second pass, the same evening: "Show me the stamps I used for that
// slide, I'll click and see what all I have. I'll use proofread tool … it
// organizes them into phrases. It lets me pick any to form that into a slide
// … 2 sentences max on a phrase, preferably one … these are CRAM videos."
//
// So: the candidates for a slide are his own segments — the ones captured
// while that CEQ was focused, or inside a stamp context of the slide's kind —
// GROUPED BY THE STAMP he was holding. No model is needed to FIND them. The
// model only proofreads them into short phrases (buildTidy…), each one
// keepable on the prompter or turnable into a slide, and may add exactly one
// line of its own, marked as such.
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
  at: string;
}

/** One chip in the prompter: a stamp he used near this slide, with its words. */
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

/** Lee's own words for this slide, in the order he said them, de-duplicated,
 *  each tagged with the stamp he was holding. */
export function prompterCandidates(frame: BlastFrame, doc: TTDoc, setId: string): PrompterCandidate[] {
  const sessionIds = new Set(doc.sessions.filter((s) => s.setId === setId && !s.archivedAt).map((s) => s.id));
  const segs: TalkSegment[] = doc.segments.filter((s) => sessionIds.has(s.sessionId) && !s.archivedAt && s.text.trim());
  const tags: TalkTag[] = doc.tags.filter((t) => sessionIds.has(t.sessionId) && !t.archivedAt && isContextTag(t));
  const out: PrompterCandidate[] = [];
  const seen = new Set<string>();
  const push = (id: string, text: string, source: PrompterCandidate["source"], stamp: string | null, at: string) => {
    const clean = text.trim();
    const key = clean.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ id, text: clean, source, stamp, at });
  };
  // The stamp a segment was captured under: the newest open context in its
  // own session (contextsOfSegment is newest-first).
  const stampOf = (s: TalkSegment): string | null => {
    const mine = tags.filter((t) => t.sessionId === s.sessionId);
    const ctx = mine.length ? contextsOfSegment(s, mine) : [];
    return ctx.length ? canonicalStamp(ctx[0].tag) : null;
  };

  if (frame.kind === "ceq" && frame.ceqId) {
    for (const s of segs) if (s.focusedCeqId === frame.ceqId) push(s.id, s.text, "ceq", stampOf(s), s.startedAt);
  }

  const kinds = STAMPS_FOR_KIND[frame.kind];
  if (kinds) {
    for (const s of segs) {
      const st = stampOf(s);
      if (st && kinds.includes(st)) push(s.id, s.text, "stamp", st, s.startedAt);
    }
  }

  if (frame.bankItemId) {
    const b = doc.boardItems.find((x) => x.id === frame.bankItemId);
    if (b) {
      const p = b.payload as { body?: unknown; kind?: unknown };
      const st = typeof p.kind === "string" ? canonicalStamp(p.kind) : null;
      const body = String(p.body ?? "");
      if (b.quote) push(`${b.id}:quote`, b.quote, "bank", st, b.createdAt);
      if (body) push(`${b.id}:body`, body, "bank", st, b.createdAt);
    }
  }

  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** The stamps he used near this slide, each with its words — stamps first
 *  (in the order he first used them), plain card talk last. */
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
  text: string;
  /** The stamp the words came from — decides the slide kind it would become. */
  stamp: string | null;
  /** Candidate ids it was made from. */
  from: string[];
}

export interface TidyResult {
  /** Lee's words as short phrases — his voice, one sentence, two at most. */
  phrases: TidyPhrase[];
  /** The ONE thing the model thinks is missing, or null. Marked AI in the UI. */
  suggestion: string | null;
}

/** The proofreading call. LEE'S LAW applies: his words, tightened, never
 *  invented — and exactly one line the model may add, kept apart. */
export function buildTidyMessages(input: {
  slideLabel: string;
  slideText: string;
  candidates: readonly PrompterCandidate[];
  kept: readonly string[];
}): { system: string; user: string } {
  const system = [
    "You proofread a teacher's own spoken words into PHRASES for a short vertical CRAM video and its teleprompter. The teacher is Lee; the words are his, captured live while he looked at the slide described below, under the stamp named on each line.",
    "LEE'S LAW: keep his meaning, his phrasing and his voice. Fix grammar and dropped words, cut filler and false starts. NEVER add facts, examples or claims he did not say.",
    "PHRASES, NOT PARAGRAPHS. This is a cram video: each phrase is ONE sentence, two at most, bullet-point concise, sayable in a breath. A long candidate becomes two or three separate phrases; a candidate with nothing usable (an aside, noise, a question to himself) produces none. Keep each phrase's stamp; use the candidate ids it came from in \"from\".",
    "Then, ONE suggestion at most: a single phrase for the one useful thing you believe is missing for THIS slide, in his voice. If nothing is clearly missing, null.",
    "Return ONLY JSON: {\"phrases\": [{\"text\": str, \"stamp\": str | null, \"from\": [str]}], \"suggestion\": str | null}",
  ].join("\n");
  const user = [
    `SLIDE: ${input.slideLabel}`,
    input.slideText ? `WHAT THE SLIDE SAYS:\n${input.slideText.slice(0, 2000)}` : "",
    input.kept.length ? `LINES HE ALREADY KEPT (do not repeat these):\n${input.kept.map((k) => `- ${k}`).join("\n")}` : "",
    `HIS WORDS (candidates):\n${input.candidates.map((c) => `[${c.id}] (stamp: ${c.stamp ?? "none"}) ${c.text}`).join("\n")}`,
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
    const o = p as { text?: unknown; stamp?: unknown; from?: unknown };
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    const from = (Array.isArray(o.from) ? o.from : []).filter((x): x is string => typeof x === "string" && byId.has(x));
    const stamp = typeof o.stamp === "string" && o.stamp !== "none" ? canonicalStamp(o.stamp) ?? o.stamp : from.length ? byId.get(from[0])!.stamp : null;
    phrases.push({ id: `ph-${phrases.length + 1}`, text, stamp, from });
  }
  const suggestion = typeof j.suggestion === "string" && j.suggestion.trim() ? j.suggestion.trim() : null;
  return { phrases, suggestion };
}
