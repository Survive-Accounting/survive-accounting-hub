// CEQ CHAIN TEMPLATES (prompt 1, part 5) — named, reusable chain STRUCTURES keyed
// by choice index (A, B, C…): ordered kinds + labels, content EMPTY. Stored in
// localStorage so they carry across scenes/lessons (a scene-agnostic library).
// Ship ZERO defaults. Save captures the current CEQ's chain shape; load stamps
// empty labeled slots at the same indices onto another CEQ.
import type { CeqChainTemplate, CeqChoice } from "./types";

const LS_KEY = "sa-ceq-chain-templates";

export function listChainTemplates(): CeqChainTemplate[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    return Array.isArray(raw) ? (raw as CeqChainTemplate[]).filter((t) => t && t.id && Array.isArray(t.slots)) : [];
  } catch { return []; }
}

function writeAll(list: CeqChainTemplate[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/** Capture a template from a CEQ's choices — structure only (kind + label), NO
 *  memoNodeId / content. slots[choiceIndex] preserves order. */
export function captureChainTemplate(name: string, choices: CeqChoice[]): CeqChainTemplate {
  const id = `ceqtpl-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const slots = choices.map((c) => (c.chain ?? []).map((it) => ({ kind: it.kind, label: it.label })));
  const tpl: CeqChainTemplate = { id, name: name.trim() || "Untitled template", slots };
  writeAll([...listChainTemplates(), tpl]);
  return tpl;
}

export function deleteChainTemplate(id: string): void {
  writeAll(listChainTemplates().filter((t) => t.id !== id));
}
