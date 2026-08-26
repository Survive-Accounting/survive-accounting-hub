// PICKER TYPE-TO-SEARCH — the one predicate deciding whether a keydown on a CLOSED picker
// trigger should open the panel and seed its search with that character.
//
// SCOPE GUARDRAIL BY CONSTRUCTION: this is only ever attached to the picker's own trigger
// button — never a document listener — so keystrokes inside inputs, textareas or any other
// focused control are never intercepted. The predicate itself still refuses modifier chords
// (Ctrl+F must stay the browser's) and non-printing keys (Tab keeps tabbing, Space keeps
// activating the button per native semantics).
export function seedCharFromKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key.length !== 1) return null;   // "Tab", "Enter", "ArrowDown", "F5", … are named keys
  if (e.key === " ") return null;        // Space = native button activation (click-open), not a seed
  return e.key;
}
