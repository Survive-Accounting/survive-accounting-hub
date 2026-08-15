// IDEA BANK (P7) — the parking lot as a feature: sticky notes by category,
// captured with F7 (moved off F8 on 08-15 — takes triage owns F8/F10 now).
// captured in under 5 seconds, exportable as a Claude-ready markdown digest.
// Self-contained: no interaction with sets/memos/entitlements.
//
// STORAGE v1: localStorage (one author, one machine — same call as the P6 set
// templates, and it works even while Supabase is down, which is exactly when
// tonight was). The EXPORT button is the durability story: digests leave the
// browser regularly by design. Revisit as a table if cross-device matters.
// Never hard-deletes: archive only.

export const IDEA_CATEGORIES = ["Filming", "Publishing", "Authoring", "Marketing", "UI/UX", "Ideas"] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

export interface IdeaNote {
  id: string;
  text: string;
  category: IdeaCategory;
  createdAt: string; // ISO
  archived?: boolean;
}

const KEY = "sa-idea-bank";

export function loadIdeas(): IdeaNote[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveIdeas(list: IdeaNote[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota/blocked — the board still shows this session's notes */ }
}
export function addIdea(list: IdeaNote[], text: string, category: IdeaCategory, now = new Date()): IdeaNote[] {
  const t = text.trim();
  if (!t) return list;
  return [{ id: `idea-${now.getTime()}-${Math.floor(Math.random() * 1e6)}`, text: t, category, createdAt: now.toISOString() }, ...list];
}
export function editIdea(list: IdeaNote[], id: string, patch: Partial<Pick<IdeaNote, "text" | "category" | "archived">>): IdeaNote[] {
  return list.map((n) => (n.id === id ? { ...n, ...patch } : n));
}

/** Board order: grouped by category (fixed chip order), newest first inside. */
export function groupIdeas(list: IdeaNote[], showArchived: boolean): { category: IdeaCategory; items: IdeaNote[] }[] {
  return IDEA_CATEGORIES.map((category) => ({
    category,
    items: list
      .filter((n) => n.category === category && (showArchived || !n.archived))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  })).filter((g) => g.items.length > 0);
}

/** "Export for Claude" — a clean markdown digest: grouped by category, dated,
 *  archived excluded, formatted to paste straight into a chat. */
export function exportDigest(list: IdeaNote[], now = new Date()): string {
  const groups = groupIdeas(list, false);
  const lines = [`# Idea bank digest — ${now.toISOString().slice(0, 10)}`, ""];
  if (groups.length === 0) lines.push("(no active ideas)");
  for (const g of groups) {
    lines.push(`## ${g.category}`, "");
    for (const n of g.items) lines.push(`- ${n.text}  *(${n.createdAt.slice(0, 10)})*`);
    lines.push("");
  }
  return lines.join("\n");
}
