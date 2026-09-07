// THE ILLUSTRATION BANK — the pure parts of /admin/illustrations, on their own so the server
// fn (illustrate.functions.ts) and the page can share them and a test can drive them without
// Recraft, Supabase or a session. No React, no network, no zod: only the registry's own
// predicates (components/blastoff/illustration.ts) applied across every set at once.
//
// WHY (2026-09-06 /v3 audit, "real project #2"): "`isStaleIllustration()` already flags any
// picture made with an older house-style version than the current registry, but the only way to
// find one today is opening each slide's Illustrator panel individually. A cross-set list of
// every stale illustration with a one-click 'switch to current style + queue regenerate' would
// matter every time the style registry gets revised again" — and it just was: the house style
// moved from watercolor v4 to riso (commit 02de8431), so tonight EVERY existing exam-set picture
// is off-style. The bank is where Lee regenerates them in one pass from the same subjects.
import {
  ILLUSTRATION_STYLES, defaultStyleIdFor, illustrationStyle, isOffStyleIllustration, isStaleIllustration,
  type FrameIllustration, type IllustrationTopicKind,
} from "@/components/blastoff/illustration";

/** off-style = pinned to a preset that isn't the default for its kind (wins over stale, since
 *  the fix is the same and the label should say the bigger reason); stale = made with an older
 *  version of its OWN preset; current = neither. */
export type BankStatus = "current" | "stale" | "off-style";
export const BANK_STATUSES: readonly BankStatus[] = ["off-style", "stale", "current"];

/** One picture, anywhere in the bank. `key` is what the page selects and reports on. */
export interface BankRow {
  key: string;
  setId: string;
  setName: string;
  topicId: string;
  topicName: string;
  topicKind: IllustrationTopicKind;
  frameId: string;
  frameKind: string;
  /** Straight to this slide on Review (2026-09-06, Lee: "link straight to slide in review") —
   *  /v3/<topic>/<set>/blast-off/results?frame=<id>, slugs from the raw deck and chapter names. */
  reviewPath: string;
  title: string;
  prompt: string;
  teachingIntent: string | null;
  stylePreset: string | null;
  styleVersion: number | null;
  seed: number | null;
  assetUrl: string;
  generatedAt: string | null;
  status: BankStatus;
}

export interface BankTotals { "off-style": number; stale: number; current: number; all: number }

export interface BankStyleDefault { id: string; version: number; label: string }

export const bankKey = (setId: string, frameId: string): string => `${setId}/${frameId}`;

/** The registry's own verdict, one word. Off-style wins over stale for the label. */
export function classifyIllustration(i: FrameIllustration | null | undefined, kind: IllustrationTopicKind): BankStatus {
  if (isOffStyleIllustration(i, kind)) return "off-style";
  if (isStaleIllustration(i)) return "stale";
  return "current";
}

/** The row's title: the brief's summary title when the AI wrote one, else the subject, cut. */
export function illustrationTitle(i: Pick<FrameIllustration, "prompt" | "summary">, max = 60): string {
  const t = i.summary?.title?.trim();
  if (t) return t;
  const p = (i.prompt ?? "").trim();
  return p.length > max ? p.slice(0, max - 1).trimEnd() + "…" : p;
}

export function tallyStatuses(rows: readonly { status: BankStatus }[]): BankTotals {
  const t: BankTotals = { "off-style": 0, stale: 0, current: 0, all: rows.length };
  for (const r of rows) t[r.status] += 1;
  return t;
}

/** The current default per kind, as the registry has it right now. */
export function bankStyleDefaults(): { exam: BankStyleDefault; strategy: BankStyleDefault } {
  const pick = (kind: IllustrationTopicKind): BankStyleDefault => {
    const s = illustrationStyle(defaultStyleIdFor(kind));
    return { id: s.id, version: s.version, label: s.label };
  };
  return { exam: pick(undefined), strategy: pick("strategy") };
}

/** Which preset a regeneration lands in: an explicit override when it names a real preset,
 *  else the default for the set's kind. An unknown override is refused rather than silently
 *  mapped to the house default — Lee asked for a style by name and should get that or an error. */
export function targetStyleIdFor(kind: IllustrationTopicKind, override?: string | null): string {
  if (override) {
    if (!ILLUSTRATION_STYLES[override]) throw new Error(`Unknown style preset "${override}"`);
    return override;
  }
  return defaultStyleIdFor(kind);
}

/** The page's opening filter: the biggest problem first. */
export function defaultBankFilter(t: BankTotals): BankStatus | "all" {
  if (t["off-style"] > 0) return "off-style";
  if (t.stale > 0) return "stale";
  return "all";
}

/** What one picture is likely to cost, before Lee commits. The library's own median when it
 *  has one (real spend, from Recraft's credit reply); otherwise a stated guess. */
export const COST_GUESS_USD = 0.04;
export interface CostEstimate { perPicture: number; total: number; guess: boolean; basis: string }
export function estimateCost(medianCostUsd: number | null | undefined, count: number): CostEstimate {
  const real = typeof medianCostUsd === "number" && Number.isFinite(medianCostUsd) && medianCostUsd > 0;
  const perPicture = real ? medianCostUsd : COST_GUESS_USD;
  const n = Math.max(0, Math.floor(count));
  return {
    perPicture, total: perPicture * n, guess: !real,
    basis: real ? `the library's median so far, $${perPicture.toFixed(3)} a picture` : `a guess — $${COST_GUESS_USD.toFixed(2)} a picture, no cost on record yet`,
  };
}

/** The median of the costs on record; null when there are none. */
export function medianOf(values: readonly number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x >= 0).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export const usd = (n: number): string => `$${n.toFixed(2)}`;

/** The slide kinds that take a picture, as Lee names them on Review. */
export const FRAME_KIND_LABEL: Record<string, string> = { phrase: "Memorize This", cheat: "Cheat Code", tip: "Deeper Idea", blank: "Blank slide" };
export const frameKindLabel = (kind: string): string => FRAME_KIND_LABEL[kind] ?? kind;
