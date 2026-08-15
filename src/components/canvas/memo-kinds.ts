// MEMO KINDS (P4) — the memo taxonomy, named once, well. The internal name
// stays `memo` everywhere in code/DB (no risky renames); this module adds the
// `kind` layer on top of the legacy free-text `category`:
//
//   CALLOUT kinds (renderable as P1 callout cards):
//     cheat-code · memorize-this · deeper-idea · recap · distractor
//   SUPPORT kinds (chain/reference material):
//     steps · exam-trap · other-tip · element
//
// UNFILED stays a valid state forever: kind is OPTIONAL, absent = unfiled.
// `category` is never deleted — it remains readable so old scenes and any
// unmigrated surface keep working. Migration is planned here (pure, testable)
// and only EXECUTED after Lee approves the dry-run table.
import type { CalloutKind } from "./types";

export const CALLOUT_MEMO_KINDS = ["cheat-code", "memorize-this", "deeper-idea", "recap", "distractor"] as const;
export const SUPPORT_MEMO_KINDS = ["steps", "exam-trap", "other-tip", "element"] as const;
export type PlaybookKind = (typeof CALLOUT_MEMO_KINDS)[number] | (typeof SUPPORT_MEMO_KINDS)[number];

export const MEMO_KIND_META: Record<PlaybookKind, { label: string; group: "CALLOUT" | "SUPPORT"; glyph: string }> = {
  "cheat-code": { label: "Cheat code", group: "CALLOUT", glyph: "💡" },
  "memorize-this": { label: "Memorize this", group: "CALLOUT", glyph: "🧠" },
  "deeper-idea": { label: "Deeper idea", group: "CALLOUT", glyph: "🌊" },
  recap: { label: "Recap", group: "CALLOUT", glyph: "🔁" },
  distractor: { label: "Distractor", group: "CALLOUT", glyph: "🎭" },
  steps: { label: "Steps", group: "SUPPORT", glyph: "🔢" },
  "exam-trap": { label: "Exam trap", group: "SUPPORT", glyph: "⚠️" },
  "other-tip": { label: "Other tip", group: "SUPPORT", glyph: "💬" },
  element: { label: "Element", group: "SUPPORT", glyph: "🧩" },
};

/** Display order for kind-grouped panels: callout kinds first, then support,
 *  in the taxonomy order above; UNFILED renders as its own trailing group. */
export const MEMO_KIND_ORDER: PlaybookKind[] = [...CALLOUT_MEMO_KINDS, ...SUPPORT_MEMO_KINDS];

/** A callout-kind memo maps 1:1 onto the P1 callout banner; support kinds don't. */
export const calloutKindOf = (k: PlaybookKind | undefined): CalloutKind | null =>
  k && (CALLOUT_MEMO_KINDS as readonly string[]).includes(k) ? (k as CalloutKind) : null;

/** LEGACY CATEGORY → KIND. Name-preserving on purpose — the only category that
 *  crosses into callout-land is CHEAT CODES (Lee's cheat codes ARE callouts).
 *  Unknown/empty stays UNFILED (null): the migration never invents a kind. */
export function kindFromCategory(category?: string): PlaybookKind | null {
  switch ((category ?? "").toUpperCase().trim()) {
    case "CHEAT CODES": return "cheat-code";
    case "STEPS": return "steps";
    case "EXAM TRAPS": return "exam-trap";
    case "ON THE EXAM": return "exam-trap";
    case "OTHER TIPS": return "other-tip";
    case "ELEMENT": return "element";
    default: return null;
  }
}

export interface MigrationRow {
  id: string;
  label: string;
  category: string;
  /** playbookKind already on the node (a previous partial run / hand-set), or "·". */
  from: string;
  /** kind after migration, or "· (unfiled)". */
  to: string;
  changed: boolean;
}

/** DRY-RUN PLANNER — pure. A node with a kind already set is left alone
 *  (migration is additive + idempotent, never destructive). */
export function planKindMigration(memos: { id: string; label?: string; category?: string; playbookKind?: string }[]): MigrationRow[] {
  return memos.map((m) => {
    const target = m.playbookKind ?? kindFromCategory(m.category) ?? null;
    return {
      id: m.id,
      label: (m.label ?? "").slice(0, 48),
      category: (m.category ?? "").toUpperCase().trim() || "UNFILED",
      from: m.playbookKind ?? "·",
      to: target ?? "· (unfiled)",
      changed: !m.playbookKind && target != null,
    };
  });
}
