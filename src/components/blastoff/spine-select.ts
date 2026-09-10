// THE SPINE'S SELECTION (2026-09-09, Lee's notes: multi-select, range select, group drag,
// copy / cut / paste). One slide was the whole story until now — `selId`, a
// string — and the stage, the editor, Shorten and the insert point all hang off it. So the
// pick is a LIST with the focused slide LAST: `ids[ids.length - 1]` is what the old selId was,
// and every surface that read selId keeps reading exactly that. Nothing else changes for them.
//
// Pure: no React, no DOM. `order` is the spine's own row order (the running order without the
// skipped folder), which is what a range is measured along. Module-scope callables are
// `function` declarations — this file sits next to plan.ts, which the canvas render path
// imports, and the TDZ ratchet (canvas/tdz-graph.test.ts) is a ratchet.
import type { BlastFrame } from "./plan";

export interface Selection {
  /** The picked ids, focused slide last. Not necessarily in spine order — pickOrdered sorts. */
  ids: string[];
  /** Where a shift-click range starts from: the last plain click (or ctrl-click). */
  anchor: string | null;
}

export const EMPTY_SELECTION: Selection = { ids: [], anchor: null };

/** One click on a row, with its modifiers.
 *  · plain — just this one; it becomes the anchor.
 *  · ctrl / cmd — toggle it; the anchor stays (or becomes this one when there was none).
 *  · shift — every row between the anchor and this one, walked FROM the anchor TOWARDS the
 *    click so the clicked row is the focused one. No anchor (or an anchor no longer in the
 *    spine) makes shift-click a plain click, which is what every file manager does. */
export function clickSelect(sel: Selection, order: readonly string[], id: string, mods: { shift: boolean; ctrl: boolean }): Selection {
  if (mods.shift) {
    const a = sel.anchor ? order.indexOf(sel.anchor) : -1;
    const b = order.indexOf(id);
    if (a < 0 || b < 0) return { ids: [id], anchor: id };
    const ids = a <= b ? order.slice(a, b + 1) : order.slice(b, a + 1).reverse();
    return { ids, anchor: sel.anchor };
  }
  if (mods.ctrl) {
    if (sel.ids.includes(id)) {
      const ids = sel.ids.filter((x) => x !== id);
      return { ids, anchor: ids.length ? sel.anchor ?? ids[ids.length - 1] : null };
    }
    return { ids: [...sel.ids, id], anchor: sel.anchor ?? id };
  }
  return { ids: [id], anchor: id };
}

/** The picked ids in SPINE order — what a copy, a cut or a bundle drag walks. Ids that have left
 *  the spine (a slide skipped since it was picked) are dropped. */
export function pickOrdered(sel: Selection, order: readonly string[]): string[] {
  const want = new Set(sel.ids);
  return order.filter((id) => want.has(id));
}

/** The pick with only the focused slide left — Escape on a multi-pick. */
export function focusOnly(sel: Selection): Selection {
  const last = sel.ids[sel.ids.length - 1];
  return last ? { ids: [last], anchor: last } : EMPTY_SELECTION;
}

// ── THE CLIPBOARD ──────────────────────────────────────────────────────────────────────────────
// In memory, for this tab, plan frames only. Ctrl+C / Ctrl+X put frames here; Ctrl+V asks
// plan.ts for fresh copies of them (pasteAfter). Nothing here touches the canvas: a cut set card
// is a SKIPPED frame (dropFrame), never a deleted node, and a pasted set card is a second slide
// pointing at the same card — the same thing ⧉ Duplicate has always made.

let clip: BlastFrame[] = [];

export function setClip(frames: readonly BlastFrame[]): void {
  clip = [...frames];
}

export function getClip(): BlastFrame[] {
  return [...clip];
}
