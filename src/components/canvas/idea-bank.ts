// IDEA BANK — capture that cannot lose a note.
//
// WHAT WENT WRONG (diagnosed 08-16). v1 stored notes in localStorage and nowhere
// else. The save path itself worked fine — the bug is that localStorage is
// PER-ORIGIN, and Lee works across three of them: surviveaccounting.com, a
// per-deployment Vercel preview URL (a NEW origin on every push), and localhost.
// A note typed on a preview URL is invisible from production and is orphaned the
// moment the next deploy changes the hostname. Proven, not guessed: a Marketing
// note from 08-16 18:20 was found stranded on a preview origin while production
// showed six unrelated notes.
//
// A second, real hazard on ONE origin: v1 read the whole array at mount and wrote
// the whole array back. Two open Studio tabs therefore clobber each other — the
// same last-writer-wins failure that has eaten scene writes twice (CLOBBER LAW).
//
// THE MODEL NOW:
//   · SUPABASE is the source of truth — one store, every origin, every machine.
//   · Writes are LOCAL-FIRST: the note lands in localStorage and the UI confirms
//     synchronously. Capture never awaits the network; Lee is filming.
//   · Sync is a QUEUE derived from the data itself (`syncedAt < updatedAt`), not a
//     separate list that can drift out of step with the notes.
//   · Nothing is ever hard-deleted: `archivedAt` only.
//   · Merges are per-NOTE by id, so two tabs can no longer overwrite each other.
//
// This module is pure + storage; the network lives in idea-bank-sync.ts.

// ---------------------------------------------------------------- categories

export const IDEA_CATEGORIES = ["Filming", "Teaching", "Studio", "Student", "Growth", "Business", "Ideas"] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];
export const DEFAULT_CATEGORY: IdeaCategory = "Ideas";

/** The v1 six. Kept so old notes stay readable and the migration has a domain. */
export const LEGACY_CATEGORIES = ["Filming", "Publishing", "Authoring", "Marketing", "UI/UX", "Ideas"] as const;
export type LegacyCategory = (typeof LEGACY_CATEGORIES)[number];

/** v1 → v2. PUBLISHING is the judgement call: publishing is the back half of the
 *  filming pipeline (stitch, upload, Mux), so it lands in FILMING rather than
 *  STUDIO — STUDIO is the authoring surface, not the output path. */
export const CATEGORY_MIGRATION: Record<LegacyCategory, IdeaCategory> = {
  Filming: "Filming",
  Publishing: "Filming",
  Authoring: "Studio",
  "UI/UX": "Studio",
  Marketing: "Growth",
  Ideas: "Ideas",
};

/** Anything already valid passes through; anything unknown falls to the default
 *  rather than being dropped. A note is never lost to an unrecognised label. */
export function migrateCategory(c: string): IdeaCategory {
  if ((IDEA_CATEGORIES as readonly string[]).includes(c)) return c as IdeaCategory;
  return CATEGORY_MIGRATION[c as LegacyCategory] ?? DEFAULT_CATEGORY;
}

/** The mapping table, with counts, for review BEFORE anything is rewritten. */
export function migrationTable(list: IdeaNote[]): { from: string; to: IdeaCategory; count: number }[] {
  const seen = new Map<string, number>();
  for (const n of list) seen.set(n.category, (seen.get(n.category) ?? 0) + 1);
  return [...seen.entries()]
    .map(([from, count]) => ({ from, to: migrateCategory(from), count }))
    .sort((a, b) => b.count - a.count);
}

// -------------------------------------------------------------------- model

export interface IdeaNote {
  id: string;
  text: string;
  category: IdeaCategory;
  createdAt: string;              // ISO
  updatedAt: string;              // ISO — drives both merge and sync
  archivedAt?: string | null;     // soft delete ONLY
  /** `updatedAt` at the moment the server last confirmed this note. Behind (or
   *  absent) ⇒ this note is still owed to the server. */
  syncedAt?: string | null;
}

export const KEY_V2 = "sa-idea-bank-v2";
export const KEY_V1 = "sa-idea-bank";        // read for recovery; NEVER cleared

export const isPending = (n: IdeaNote): boolean => !n.syncedAt || n.syncedAt < n.updatedAt;
export const pendingNotes = (list: IdeaNote[]): IdeaNote[] => list.filter(isPending);

export const newId = (now = new Date()): string => `idea-${now.getTime()}-${Math.floor(Math.random() * 1e6)}`;

export function makeNote(text: string, category: IdeaCategory, now = new Date()): IdeaNote {
  const iso = now.toISOString();
  return { id: newId(now), text: text.trim(), category, createdAt: iso, updatedAt: iso, syncedAt: null };
}

/** Apply a change. ALWAYS stamps updatedAt, which is what re-queues the note —
 *  an edit that forgot to stamp would be saved locally and never sync. */
export function touch(n: IdeaNote, patch: Partial<Pick<IdeaNote, "text" | "category" | "archivedAt">>, now = new Date()): IdeaNote {
  return { ...n, ...patch, updatedAt: now.toISOString() };
}

/** MERGE by id, newest `updatedAt` wins — the rule that lets two tabs, two
 *  machines and the server all reconcile without a note disappearing.
 *  A LOCAL note that is still pending always survives, even when the server copy
 *  looks newer, because the server has not seen the local edit yet. */
export function mergeNotes(local: IdeaNote[], incoming: IdeaNote[]): IdeaNote[] {
  const by = new Map<string, IdeaNote>();
  for (const n of local) by.set(n.id, n);
  for (const r of incoming) {
    const l = by.get(r.id);
    if (!l) { by.set(r.id, r); continue; }
    if (isPending(l)) { by.set(r.id, l); continue; }   // local edit not yet pushed
    by.set(r.id, r.updatedAt >= l.updatedAt ? r : l);
  }
  return [...by.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Read a v1 note into the v2 shape. Categories migrate; nothing is dropped. */
export function adoptLegacy(v1: { id: string; text: string; category: string; createdAt: string; archived?: boolean }): IdeaNote {
  return {
    id: v1.id,
    text: v1.text,
    category: migrateCategory(v1.category),
    createdAt: v1.createdAt,
    updatedAt: v1.createdAt,
    archivedAt: v1.archived ? v1.createdAt : null,
    syncedAt: null,                                   // owed to the server
  };
}

// ------------------------------------------------------------------ storage

const readJson = <T>(key: string, fallback: T): T => {
  try { const v = JSON.parse(localStorage.getItem(key) ?? "null"); return v ?? fallback; } catch { return fallback; }
};

export function loadLocal(): IdeaNote[] {
  const v = readJson<unknown>(KEY_V2, null);
  return Array.isArray(v) ? (v as IdeaNote[]) : [];
}

/** THROWS on failure. v1 swallowed the quota error, so a full localStorage lost
 *  notes in total silence — the exact class of bug this rewrite exists to kill. */
export function saveLocal(list: IdeaNote[]): void {
  localStorage.setItem(KEY_V2, JSON.stringify(list));
}

/** Every orphan reachable on THIS origin: the v1 key, plus its preflight backup.
 *  Runs on open, so simply visiting an origin sweeps whatever was stranded there.
 *  Reads only — v1 is never cleared, so a sweep can be repeated safely. */
export function recoverOrphans(existing: IdeaNote[]): { notes: IdeaNote[]; found: number; sources: string[] } {
  const sources: string[] = [];
  const have = new Set(existing.map((n) => n.id));
  const found: IdeaNote[] = [];
  for (const key of [KEY_V1, `${KEY_V1}-backup-preflight`]) {
    const raw = readJson<unknown>(key, null);
    if (!Array.isArray(raw) || !raw.length) continue;
    let n = 0;
    for (const r of raw as { id?: string; text?: string; category?: string; createdAt?: string; archived?: boolean }[]) {
      if (!r?.id || !r.text || !r.createdAt || have.has(r.id)) continue;
      have.add(r.id);
      found.push(adoptLegacy({ id: r.id, text: r.text, category: r.category ?? "Ideas", createdAt: r.createdAt, archived: r.archived }));
      n++;
    }
    if (n) sources.push(`${key} (${n})`);
  }
  return { notes: found.length ? mergeNotes(existing, found) : existing, found: found.length, sources };
}

// -------------------------------------------------------------------- views

/** Board order: grouped by category (fixed chip order), newest first inside. */
export function groupIdeas(list: IdeaNote[], showArchived: boolean): { category: IdeaCategory; items: IdeaNote[] }[] {
  return IDEA_CATEGORIES.map((category) => ({
    category,
    items: list
      .filter((n) => n.category === category && (showArchived || !n.archivedAt))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  })).filter((g) => g.items.length > 0);
}

/** "Export for Claude" — grouped, dated, archived excluded, paste-ready. Reads
 *  whatever list it is handed, which is the PERSISTED one. */
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

// ------------------------------------------------------- wire format (server)

export interface IdeaRow {
  id: string;
  text: string;
  category: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export const toRow = (n: IdeaNote): IdeaRow => ({
  id: n.id, text: n.text, category: n.category,
  created_at: n.createdAt, updated_at: n.updatedAt, archived_at: n.archivedAt ?? null,
});

export const fromRow = (r: IdeaRow): IdeaNote => ({
  id: r.id, text: r.text, category: migrateCategory(r.category),
  createdAt: r.created_at, updatedAt: r.updated_at, archivedAt: r.archived_at,
  syncedAt: r.updated_at,                              // straight from the server ⇒ synced
});
