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
// So: the candidates for a slide are his own segments — the ones captured
// while that CEQ was focused, or inside a stamp context of the slide's kind.
// No model is needed to FIND them. The model only proofreads (buildTidy…),
// and may add exactly one line of its own, marked as such.
import {
  canonicalStamp, contextsOfSegment, isContextTag,
  type TTDoc, type TalkSegment, type TalkTag,
} from "@/components/canvas/talkthrough";
import type { BlastFrame, BlastFrameKind } from "./plan";

export interface PrompterCandidate {
  id: string;
  text: string;
  /** Where it came from: the CEQ he was looking at, a stamp context of this
   *  slide's kind, or the bank item the slide was picked from. */
  source: "ceq" | "stamp" | "bank";
  at: string;
}

/** Which stamp contexts feed which detour slide. Old stamp names fold in. */
export const STAMPS_FOR_KIND: Partial<Record<BlastFrameKind, readonly string[]>> = {
  phrase: ["memorize_this", "phrase", "memo", "trigger_word"],
  cheat: ["cheat_code", "tip_trick"],
  tip: ["deeper_idea", "real_world", "nerdout"],
  exhibit: ["visual", "exhibit"],
};

/** A stamp / board-idea kind → the slide kind it becomes on the film draft. */
export function frameKindForStamp(kind: string): BlastFrameKind {
  const k = canonicalStamp(kind) ?? kind;
  for (const [frameKind, stamps] of Object.entries(STAMPS_FOR_KIND)) {
    if (stamps.includes(k)) return frameKind as BlastFrameKind;
  }
  return "tip";
}

/** Lee's own words for this slide, in the order he said them, de-duplicated. */
export function prompterCandidates(frame: BlastFrame, doc: TTDoc, setId: string): PrompterCandidate[] {
  const sessionIds = new Set(doc.sessions.filter((s) => s.setId === setId && !s.archivedAt).map((s) => s.id));
  const segs: TalkSegment[] = doc.segments.filter((s) => sessionIds.has(s.sessionId) && !s.archivedAt && s.text.trim());
  const tags: TalkTag[] = doc.tags.filter((t) => sessionIds.has(t.sessionId) && !t.archivedAt);
  const out: PrompterCandidate[] = [];
  const seen = new Set<string>();
  const push = (id: string, text: string, source: PrompterCandidate["source"], at: string) => {
    const clean = text.trim();
    const key = clean.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ id, text: clean, source, at });
  };

  if (frame.kind === "ceq" && frame.ceqId) {
    for (const s of segs) if (s.focusedCeqId === frame.ceqId) push(s.id, s.text, "ceq", s.startedAt);
  }

  const kinds = STAMPS_FOR_KIND[frame.kind];
  if (kinds) {
    const ctx = tags.filter((t) => isContextTag(t) && kinds.includes(canonicalStamp(t.tag) ?? ""));
    for (const s of segs) {
      const mine = ctx.filter((t) => t.sessionId === s.sessionId);
      if (mine.length && contextsOfSegment(s, mine).length) push(s.id, s.text, "stamp", s.startedAt);
    }
  }

  if (frame.bankItemId) {
    const b = doc.boardItems.find((x) => x.id === frame.bankItemId);
    if (b) {
      const body = String((b.payload as { body?: unknown }).body ?? "");
      if (b.quote) push(`${b.id}:quote`, b.quote, "bank", b.createdAt);
      if (body) push(`${b.id}:body`, body, "bank", b.createdAt);
    }
  }

  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export interface TidyResult {
  /** Lee's candidates, proofread and shortened — same ids, his words. */
  lines: { id: string; text: string }[];
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
    "You proofread a teacher's own spoken words into teleprompter lines for a short vertical video. The teacher is Lee; the words are his, captured live while he looked at the slide described below.",
    "LEE'S LAW: keep his meaning, his phrasing and his voice. Fix grammar and dropped words, cut filler and false starts, make each line shorter and more sayable (ideally under 20 words). NEVER add facts, examples or claims he did not say. NEVER merge two candidates into one.",
    "Return one proofread line per candidate, with the candidate's id. If a candidate is not usable on a prompter (a question to himself, an aside to the camera crew, noise), return it with an empty text.",
    "Then, ONE suggestion at most: a single line for the one useful thing you believe is missing for THIS slide, phrased in his voice. If nothing is clearly missing, null.",
    "Return ONLY JSON: {\"lines\": [{\"id\": str, \"text\": str}], \"suggestion\": str | null}",
  ].join("\n");
  const user = [
    `SLIDE: ${input.slideLabel}`,
    input.slideText ? `WHAT THE SLIDE SAYS:\n${input.slideText.slice(0, 2000)}` : "",
    input.kept.length ? `LINES HE ALREADY KEPT (do not repeat these):\n${input.kept.map((k) => `- ${k}`).join("\n")}` : "",
    `HIS WORDS (candidates):\n${input.candidates.map((c) => `[${c.id}] ${c.text}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  return { system, user };
}

/** Lenient parse — a model's JSON is never trusted to be tidy. */
export function parseTidy(raw: string, candidates: readonly PrompterCandidate[]): TidyResult {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("the proofread came back without JSON");
  const j = JSON.parse(m[0]) as { lines?: unknown; suggestion?: unknown };
  const ids = new Set(candidates.map((c) => c.id));
  const lines = (Array.isArray(j.lines) ? j.lines : [])
    .filter((l): l is { id: string; text: string } => !!l && typeof (l as { id?: unknown }).id === "string" && typeof (l as { text?: unknown }).text === "string")
    .filter((l) => ids.has(l.id) && l.text.trim())
    .map((l) => ({ id: l.id, text: l.text.trim() }));
  const suggestion = typeof j.suggestion === "string" && j.suggestion.trim() ? j.suggestion.trim() : null;
  return { lines, suggestion };
}
