// Keymap registry — every canvas hotkey lives HERE, with a description and a
// group. One listener consults the registry; the "?" overlay renders straight
// from it, so the cheat sheet can never drift from the real bindings (and it's
// the future Streamdeck map). Text editors own the keyboard: bindings skip
// while an input/textarea/contenteditable has focus unless `whileTyping`.
import { useEffect } from "react";

import { isTypingTarget } from "./commands";

export interface KeyBinding {
  /** Normalized combo, e.g. "space", "j", "ctrl+z", "ctrl+shift+z", "?", "escape". */
  combo: string;
  description: string;
  /** Cheat-sheet section (Show, Modes, Quick-spawn, History, Help…). */
  group: string;
  /** Run even while a text editor has focus (rare). */
  whileTyping?: boolean;
  /** Hidden from the overlay (aliases like ctrl+shift+z). */
  hidden?: boolean;
  handler: (e: KeyboardEvent) => void;
}

/** Normalize a KeyboardEvent to a combo string. Printable keys keep their glyph
 *  ("?" stays "?"); shift is only spelled out alongside ctrl/alt so ctrl+shift+z
 *  and "?" both come out right. Meta (Cmd) folds into ctrl for mac parity. */
export function comboOf(e: KeyboardEvent): string {
  const ctrl = e.ctrlKey || e.metaKey;
  let key = e.key.toLowerCase();
  if (key === " ") key = "space";
  const printable = key.length === 1;
  const parts: string[] = [];
  if (ctrl) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey && (!printable || ctrl || e.altKey)) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

/** Mount the registry: one window keydown listener for the given bindings. */
export function useKeymap(bindings: KeyBinding[]) {
  useEffect(() => {
    const byCombo = new Map(bindings.map((b) => [b.combo, b]));
    const onKey = (e: KeyboardEvent) => {
      const b = byCombo.get(comboOf(e));
      if (!b) return;
      if (!b.whileTyping && isTypingTarget(e.target as Element | null)) return;
      b.handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bindings]);
}

/** Overlay model: visible bindings grouped in first-seen order. */
export function groupedBindings(bindings: KeyBinding[]): { group: string; items: KeyBinding[] }[] {
  const groups: { group: string; items: KeyBinding[] }[] = [];
  for (const b of bindings) {
    if (b.hidden) continue;
    let g = groups.find((x) => x.group === b.group);
    if (!g) groups.push((g = { group: b.group, items: [] }));
    g.items.push(b);
  }
  return groups;
}
