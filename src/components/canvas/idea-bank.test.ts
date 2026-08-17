// IDEA BANK — the rules that keep a note from being lost.
//
// The bug being fixed (08-16): notes lived only in localStorage, which is
// PER-ORIGIN, so anything typed on a Vercel preview hostname was invisible from
// production and orphaned by the next deploy. A real note was found stranded that
// way. These tests defend the three things that make the rewrite trustworthy:
// the migration never drops a note, merges never clobber, and a note stays queued
// until the SERVER acknowledges it.
import { describe, expect, test } from "bun:test";

import {
  CATEGORY_MIGRATION, DEFAULT_CATEGORY, IDEA_CATEGORIES, adoptLegacy, exportDigest, fromRow,
  groupIdeas, isPending, makeNote, mergeNotes, migrateCategory, migrationTable, pendingNotes,
  toRow, touch, type IdeaNote,
} from "./idea-bank";

const at = (iso: string) => new Date(iso);
const n = (over: Partial<IdeaNote> = {}): IdeaNote => ({
  id: "a", text: "t", category: "Ideas",
  createdAt: "2026-08-16T00:00:00.000Z", updatedAt: "2026-08-16T00:00:00.000Z", syncedAt: "2026-08-16T00:00:00.000Z",
  ...over,
});

describe("the new category list", () => {
  test("seven categories, IDEAS is the catch-all default", () => {
    expect(IDEA_CATEGORIES).toEqual(["Filming", "Teaching", "Studio", "Student", "Growth", "Business", "Ideas"]);
    expect(DEFAULT_CATEGORY).toBe("Ideas");
  });
  test("every legacy category maps somewhere — none can strand a note", () => {
    for (const [from, to] of Object.entries(CATEGORY_MIGRATION)) {
      expect(IDEA_CATEGORIES).toContain(to);
      expect(migrateCategory(from)).toBe(to);
    }
  });
  test("PUBLISHING → FILMING: publishing is the back half of the filming pipeline", () => {
    expect(migrateCategory("Publishing")).toBe("Filming");
    expect(migrateCategory("Authoring")).toBe("Studio");
    expect(migrateCategory("UI/UX")).toBe("Studio");
    expect(migrateCategory("Marketing")).toBe("Growth");
  });
  test("an already-migrated category is left alone (the migration is idempotent)", () => {
    for (const c of IDEA_CATEGORIES) expect(migrateCategory(c)).toBe(c);
  });
  test("an UNKNOWN category falls to the default rather than dropping the note", () => {
    expect(migrateCategory("Wingdings")).toBe("Ideas");
  });
  test("the mapping table counts what would move, for review before it runs", () => {
    const list = [n({ id: "1", category: "Publishing" as never }), n({ id: "2", category: "Publishing" as never }), n({ id: "3", category: "Ideas" })];
    const t = migrationTable(list);
    expect(t.find((r) => r.from === "Publishing")).toEqual({ from: "Publishing", to: "Filming", count: 2 });
    expect(t.find((r) => r.from === "Ideas")).toEqual({ from: "Ideas", to: "Ideas", count: 1 });
  });
});

describe("the sync queue is DERIVED, so it cannot drift from the notes", () => {
  test("never-synced and edited-since-sync are both pending", () => {
    expect(isPending(n({ syncedAt: null }))).toBe(true);
    expect(isPending(n({ updatedAt: "2026-08-16T01:00:00.000Z", syncedAt: "2026-08-16T00:00:00.000Z" }))).toBe(true);
  });
  test("acknowledged at its current version is NOT pending", () => {
    expect(isPending(n())).toBe(false);
  });
  test("a fresh capture is pending the moment it exists", () => {
    const fresh = makeNote("boss chaching variant", "Filming", at("2026-08-16T02:00:00Z"));
    expect(isPending(fresh)).toBe(true);
    expect(fresh.text).toBe("boss chaching variant");
    expect(fresh.archivedAt).toBeUndefined();
  });
  test("EVERY edit re-queues — an edit that forgot to stamp would never sync", () => {
    const edited = touch(n(), { text: "changed" }, at("2026-08-16T03:00:00Z"));
    expect(edited.updatedAt).toBe("2026-08-16T03:00:00.000Z");
    expect(isPending(edited)).toBe(true);
  });
  test("archiving is a soft delete that also re-queues", () => {
    const a = touch(n(), { archivedAt: "2026-08-16T04:00:00.000Z" }, at("2026-08-16T04:00:00Z"));
    expect(a.archivedAt).toBe("2026-08-16T04:00:00.000Z");
    expect(isPending(a)).toBe(true);
    expect(pendingNotes([n(), a])).toEqual([a]);
  });
});

describe("merging — two tabs, two machines, one server, no clobber", () => {
  test("newest updatedAt wins per NOTE, not per whole list", () => {
    const local = [n({ id: "a", text: "old" }), n({ id: "b", text: "mine" })];
    const remote = [n({ id: "a", text: "new", updatedAt: "2026-08-16T05:00:00.000Z", syncedAt: "2026-08-16T05:00:00.000Z" })];
    const out = mergeNotes(local, remote);
    expect(out.find((x) => x.id === "a")!.text).toBe("new");
    expect(out.find((x) => x.id === "b")!.text).toBe("mine"); // the other tab's note SURVIVES
  });
  test("a LOCAL note still pending beats a newer server copy — the server hasn't seen the edit", () => {
    const local = [n({ id: "a", text: "typed just now", updatedAt: "2026-08-16T01:00:00.000Z", syncedAt: null })];
    const remote = [n({ id: "a", text: "server", updatedAt: "2026-08-16T09:00:00.000Z", syncedAt: "2026-08-16T09:00:00.000Z" })];
    expect(mergeNotes(local, remote)[0].text).toBe("typed just now");
  });
  test("notes only on the server are adopted", () => {
    expect(mergeNotes([], [n({ id: "z" })]).map((x) => x.id)).toEqual(["z"]);
  });
  test("merging is stable and never loses a note from either side", () => {
    const local = [n({ id: "a" }), n({ id: "b" })];
    const remote = [n({ id: "b" }), n({ id: "c" })];
    expect(mergeNotes(local, remote).map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("recovering v1 notes", () => {
  test("a legacy note is adopted with its category migrated and marked owed to the server", () => {
    const a = adoptLegacy({ id: "old-1", text: "sponsor the chapter", category: "UI/UX", createdAt: "2026-08-15T22:05:54.451Z" });
    expect(a.category).toBe("Studio");
    expect(a.createdAt).toBe("2026-08-15T22:05:54.451Z");
    expect(a.updatedAt).toBe(a.createdAt);   // nothing pretends to be a fresh edit
    expect(a.syncedAt).toBeNull();           // ⇒ it will be pushed
    expect(a.archivedAt).toBeNull();
  });
  test("a legacy ARCHIVED flag becomes a soft-delete timestamp, not a deletion", () => {
    expect(adoptLegacy({ id: "x", text: "t", category: "Ideas", createdAt: "2026-08-01T00:00:00.000Z", archived: true }).archivedAt).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("the wire format round-trips", () => {
  test("a note survives a trip to the server and back unchanged", () => {
    const before = n({ id: "r1", text: "keep me", category: "Growth", archivedAt: null });
    const after = fromRow(toRow(before));
    expect(after.id).toBe(before.id);
    expect(after.text).toBe(before.text);
    expect(after.category).toBe(before.category);
    expect(after.createdAt).toBe(before.createdAt);
  });
  test("a row from the server arrives already synced, so it is not re-pushed forever", () => {
    expect(isPending(fromRow(toRow(n())))).toBe(false);
  });
  test("a server row carrying an OLD category is migrated on the way in", () => {
    expect(fromRow({ id: "a", text: "t", category: "Marketing", created_at: "x", updated_at: "x", archived_at: null }).category).toBe("Growth");
  });
});

describe("the board + the export", () => {
  test("groups follow chip order, newest first, archived hidden by default", () => {
    const list = [
      n({ id: "1", category: "Filming", createdAt: "2026-08-16T01:00:00.000Z" }),
      n({ id: "2", category: "Filming", createdAt: "2026-08-16T02:00:00.000Z" }),
      n({ id: "3", category: "Ideas", archivedAt: "2026-08-16T03:00:00.000Z" }),
    ];
    const g = groupIdeas(list, false);
    expect(g.map((x) => x.category)).toEqual(["Filming"]);          // Ideas group is empty once archived is hidden
    expect(g[0].items.map((x) => x.id)).toEqual(["2", "1"]);
    expect(groupIdeas(list, true).map((x) => x.category)).toEqual(["Filming", "Ideas"]);
  });
  test("the digest groups, dates, and excludes archived", () => {
    const md = exportDigest([
      n({ id: "1", text: "rig note", category: "Filming" }),
      n({ id: "2", text: "secret", category: "Ideas", archivedAt: "2026-08-16T03:00:00.000Z" }),
    ], at("2026-08-16T12:00:00Z"));
    expect(md).toContain("# Idea bank digest — 2026-08-16");
    expect(md).toContain("## Filming");
    expect(md).toContain("- rig note  *(2026-08-16)*");
    expect(md).not.toContain("secret");
  });
  test("an empty bank exports something valid rather than a broken file", () => {
    expect(exportDigest([], at("2026-08-16T12:00:00Z"))).toContain("(no active ideas)");
  });
});
