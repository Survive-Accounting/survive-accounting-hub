// CLEAR OLD RESULTS (2026-09-04) — the pure half of dismissing a pass's cards.
//
// What is pinned here: WHICH cards "Clear old results" takes (this session's
// result kinds only), that a dismissed card leaves the board without leaving
// the store, and that the flag round-trips on the wire — including the
// pre-migration shape, where the server strips the column and the row comes
// back without it (absent must read as LIVE, never as dismissed).
import { describe, expect, test } from "bun:test";

import {
  RESULTS_KINDS, dismissableResults, dismissableResultsForSet, emptyDoc, fromBoardItemRow, isDismissed,
  sessionBoard, toBoardItemRow, touchRow,
  type BoardItem, type BoardKind, type TTDoc, type TalkSession,
} from "./talkthrough";

const at = (s: string) => new Date(s);

const mkItem = (over: Partial<BoardItem> & { id: string }): BoardItem => ({
  sessionId: "s1", runId: "r1", kind: "idea", title: "T", payload: {}, quote: "he said this",
  ceqIds: [], status: "suggested", comment: "",
  createdAt: "2026-09-04T01:00:00Z", updatedAt: "2026-09-04T01:00:00Z", syncedAt: "2026-09-04T01:00:00Z",
  ...over,
});

const mkSession = (id: string, setId: string, startedAt: string, endedAt: string | null): TalkSession => ({
  id, setId, setName: `Set ${setId}`, startedAt, endedAt,
  createdAt: startedAt, updatedAt: startedAt, syncedAt: startedAt,
});

const docWith = (items: BoardItem[]): TTDoc => ({ ...emptyDoc(), boardItems: items });

describe("what counts as a result card", () => {
  test("the four kinds the review pass mints — and nothing else", () => {
    expect([...RESULTS_KINDS].sort()).toEqual(["ceq_edit", "idea", "script", "vibe_plan"]);
  });

  test("dismissableResults takes this session's live result cards only", () => {
    const d = docWith([
      mkItem({ id: "a", kind: "script" }),
      mkItem({ id: "b", kind: "ceq_edit" }),
      mkItem({ id: "c", kind: "idea" }),
      mkItem({ id: "d", kind: "vibe_plan" }),
      mkItem({ id: "take", kind: "take" }),                       // not a result
      mkItem({ id: "style", kind: "style_note" }),                // not a result
      mkItem({ id: "other", kind: "script", sessionId: "s2" }),   // another session
      mkItem({ id: "gone", kind: "idea", archivedAt: "2026-09-04T02:00:00Z" }),
      mkItem({ id: "already", kind: "idea", dismissed: true }),
    ]);
    expect(dismissableResults(d, "s1").map((b) => b.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  test("a session with nothing to clear yields nothing (the button hides)", () => {
    expect(dismissableResults(docWith([mkItem({ id: "t", kind: "take" })]), "s1")).toHaveLength(0);
  });
});

describe("set scope — the case session scope misses", () => {
  // The ordinary flow: last night's sitting was ENDED by "End Session →
  // Review", so tonight's booth is a fresh, empty session and the old cards
  // hang off the old one. The button must still reach them.
  const doc = (): TTDoc => ({
    ...emptyDoc(),
    sessions: [
      mkSession("old", "set-A", "2026-09-03T20:00:00Z", "2026-09-03T21:00:00Z"),
      mkSession("new", "set-A", "2026-09-04T20:00:00Z", null),
      mkSession("elsewhere", "set-B", "2026-09-04T18:00:00Z", null),
    ],
    boardItems: [
      mkItem({ id: "old-script", kind: "script", sessionId: "old" }),
      mkItem({ id: "old-idea", kind: "idea", sessionId: "old" }),
      mkItem({ id: "other-set", kind: "script", sessionId: "elsewhere" }),
    ],
  });

  test("tonight's empty session still finds last night's cards on this set", () => {
    const d = doc();
    expect(dismissableResults(d, "new")).toHaveLength(0);              // session scope: blind
    expect(dismissableResultsForSet(d, "set-A").map((b) => b.id)).toEqual(["old-script", "old-idea"]);
  });

  test("another set's board is never touched", () => {
    expect(dismissableResultsForSet(doc(), "set-A").some((b) => b.sessionId === "elsewhere")).toBe(false);
    expect(dismissableResultsForSet(doc(), "set-B").map((b) => b.id)).toEqual(["other-set"]);
  });

  test("newest sitting first, so the confirm can count the boards it clears", () => {
    const d = doc();
    d.boardItems.push(mkItem({ id: "new-script", kind: "script", sessionId: "new" }));
    const got = dismissableResultsForSet(d, "set-A");
    expect(got.map((b) => b.sessionId)).toEqual(["new", "old", "old"]);
    expect(new Set(got.map((b) => b.sessionId)).size).toBe(2); // "2 sittings"
  });

  test("an archived session's cards are left alone", () => {
    const d = doc();
    d.sessions = d.sessions.map((s) => (s.id === "old" ? { ...s, archivedAt: "2026-09-04T01:00:00Z" } : s));
    expect(dismissableResultsForSet(d, "set-A")).toHaveLength(0);
  });
});

describe("dismissed = off the board, still in the store", () => {
  test("absent means live; only true hides", () => {
    expect(isDismissed(mkItem({ id: "x" }))).toBe(false);
    expect(isDismissed(mkItem({ id: "x", dismissed: false }))).toBe(false);
    expect(isDismissed(mkItem({ id: "x", dismissed: true }))).toBe(true);
  });

  test("sessionBoard hides a dismissed card the way it hides an archived one", () => {
    const d = docWith([
      mkItem({ id: "live", kind: "script" }),
      mkItem({ id: "cleared", kind: "idea", dismissed: true }),
    ]);
    expect(sessionBoard(d, "s1").map((b) => b.id)).toEqual(["live"]);
    // the row itself is untouched — quote and payload survive for anything
    // already built from it
    expect(d.boardItems.find((b) => b.id === "cleared")?.quote).toBe("he said this");
  });

  test("dismissing re-queues the row for sync (touchRow stamps updatedAt)", () => {
    const item = mkItem({ id: "a", kind: "script" });
    const cleared = touchRow(item, { dismissed: true } as Partial<BoardItem>, at("2026-09-04T03:00:00Z"));
    expect(cleared.dismissed).toBe(true);
    expect(new Date(cleared.updatedAt).getTime()).toBeGreaterThan(new Date(item.updatedAt).getTime());
    expect(new Date(cleared.syncedAt!).getTime()).toBeLessThan(new Date(cleared.updatedAt).getTime()); // pending again
  });
});

describe("the wire", () => {
  test("dismissed round-trips both ways", () => {
    for (const flag of [true, false]) {
      const item = mkItem({ id: `w-${flag}`, kind: "script" as BoardKind, dismissed: flag });
      const row = toBoardItemRow(item);
      expect(row.dismissed).toBe(flag);
      expect(fromBoardItemRow(row).dismissed).toBe(flag);
    }
  });

  test("a card with no flag ships as false, not undefined", () => {
    expect(toBoardItemRow(mkItem({ id: "n" })).dismissed).toBe(false);
  });

  test("PRE-MIGRATION: a row with no dismissed column reads as LIVE", () => {
    const row = toBoardItemRow(mkItem({ id: "p", dismissed: true }));
    delete (row as { dismissed?: boolean }).dismissed; // what the stripped server returns
    const back = fromBoardItemRow(row);
    expect(back.dismissed).toBe(false);
    expect(sessionBoard(docWith([back]), "s1").map((b) => b.id)).toEqual(["p"]);
  });
});
