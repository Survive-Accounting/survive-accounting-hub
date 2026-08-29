// TALKTHROUGH BOOTH tests — the persistence contract and the pass, pinned.
//
// The capture layer is tested EXACTLY like the Idea Bank was: merge law,
// derived queue, whisper upgrade, wire round-trip. The pass module is tested
// on both directions: the messages carry the verbatim transcript + anchors,
// and model JSON (good, partial, and garbage) parses safely.
import { describe, expect, test } from "bun:test";

import {
  BOARD_KINDS, MOMENT_TAGS, applyWhisperText, boardForCeq, canonicalStamp, contextOfSegment,
  docPendingCount, emptyDoc, isContextTag, openContext, segmentsInContext, stampLabel,
  fromBoardItemRow, fromSegmentRow, fromSessionRow, fromTagRow, isPending, makeSegment,
  makeSession, makeTag, mergeRows, sessionMeta, sessionSegments, toBoardItemRow,
  toSegmentRow, toSessionRow, toTagRow, touchRow,
  type TTDoc, type TalkSegment,
} from "./talkthrough";
import {
  buildPassMessages, buildRegenMessages, ceqBlock, extractJsonObject, parsePass,
  transcriptBlock, type PassContext,
} from "./talkthrough-pass";

const at = (s: string) => new Date(s);

// ───────────────────────────────────────── persistence contract (Idea Bank law)

describe("the derived sync queue", () => {
  test("a fresh row is pending; an acknowledged row is not; an edit re-queues", () => {
    const seg = makeSegment("s1", 0, { ceqId: null, label: null }, at("2026-08-28T01:00:00Z"));
    expect(isPending(seg)).toBe(true);
    const acked = { ...seg, syncedAt: seg.updatedAt };
    expect(isPending(acked)).toBe(false);
    const edited = touchRow(acked, { text: "hello" } as Partial<TalkSegment>, at("2026-08-28T01:01:00Z"));
    expect(isPending(edited)).toBe(true); // touch ALWAYS stamps updatedAt — that is the re-queue
    expect(edited.updatedAt > acked.updatedAt).toBe(true);
  });
  test("docPendingCount spans all four stores", () => {
    const d: TTDoc = emptyDoc();
    d.sessions.push(makeSession("set", "Set", at("2026-08-28T01:00:00Z")));
    d.segments.push(makeSegment("s", 0, { ceqId: null, label: null }, at("2026-08-28T01:00:01Z")));
    d.tags.push(makeTag("s", "KEY", { ceqId: null, label: null }, at("2026-08-28T01:00:02Z")));
    expect(docPendingCount(d)).toBe(3);
  });
});

describe("merge law — newest wins, local-pending always survives", () => {
  const base = makeSegment("s1", 0, { ceqId: null, label: null }, at("2026-08-28T01:00:00Z"));
  test("incoming newer replaces an acknowledged local", () => {
    const local = { ...base, syncedAt: base.updatedAt };
    const incoming = touchRow(local, { text: "server copy" } as Partial<TalkSegment>, at("2026-08-28T02:00:00Z"));
    const merged = mergeRows([local], [incoming]);
    expect(merged[0].text).toBe("server copy");
  });
  test("a locally-pending row survives even a NEWER incoming copy", () => {
    const local = touchRow({ ...base, syncedAt: base.updatedAt }, { text: "local edit not yet pushed" } as Partial<TalkSegment>, at("2026-08-28T01:30:00Z"));
    const incoming = { ...base, text: "server", updatedAt: "2026-08-28T03:00:00Z", syncedAt: "2026-08-28T03:00:00Z" };
    const merged = mergeRows([local], [incoming]);
    expect(merged[0].text).toBe("local edit not yet pushed"); // the server has not seen it yet
  });
  test("unknown incoming rows are adopted", () => {
    const other = makeSegment("s1", 1, { ceqId: "q1", label: "Q1" }, at("2026-08-28T01:05:00Z"));
    expect(mergeRows([base], [other])).toHaveLength(2);
  });
});

describe("the whisper upgrade — the ONLY sanctioned text rewrite", () => {
  const seg = { ...makeSegment("s1", 0, { ceqId: null, label: null }, at("2026-08-28T01:00:00Z")), text: "live words", audioPath: "talkthrough-audio/x.wav" };
  test("live → whisper replaces text and clears pending", () => {
    const up = applyWhisperText(seg, "the canonical words", at("2026-08-28T01:00:30Z"));
    expect(up.text).toBe("the canonical words");
    expect(up.source).toBe("whisper");
    expect(up.whisperPending).toBe(false);
    expect(isPending(up)).toBe(true); // upgrade re-queues for sync
  });
  test("an already-canonical segment is never rewritten again", () => {
    const up = applyWhisperText(seg, "canonical", at("2026-08-28T01:00:30Z"));
    const again = applyWhisperText(up, "SOMETHING ELSE", at("2026-08-28T01:01:00Z"));
    expect(again).toBe(up); // identity — no rewrite, no restamp
  });
});

describe("views + wire round-trip", () => {
  test("sessionSegments orders by seq and hides archived", () => {
    const d = emptyDoc();
    const a = { ...makeSegment("s1", 2, { ceqId: null, label: null }, at("2026-08-28T01:02:00Z")), text: "second" };
    const b = { ...makeSegment("s1", 1, { ceqId: null, label: null }, at("2026-08-28T01:01:00Z")), text: "first" };
    const dead = { ...makeSegment("s1", 3, { ceqId: null, label: null }, at("2026-08-28T01:03:00Z")), archivedAt: "2026-08-28T01:04:00Z" };
    d.segments.push(a, b, dead);
    expect(sessionSegments(d, "s1").map((x) => x.text)).toEqual(["first", "second"]);
  });
  test("sessionMeta computes duration + words without storing them", () => {
    const d = emptyDoc();
    const ses = { ...makeSession("set", "Set", at("2026-08-28T01:00:00Z")), endedAt: "2026-08-28T01:10:00Z" };
    d.sessions.push(ses);
    d.segments.push({ ...makeSegment(ses.id, 0, { ceqId: null, label: null }, at("2026-08-28T01:00:05Z")), text: "one two three" });
    const m = sessionMeta(d, ses);
    expect(m.durationMs).toBe(600_000);
    expect(m.words).toBe(3);
    expect(m.segments).toBe(1);
  });
  test("every wire shape round-trips and stamps syncedAt from the server copy", () => {
    const ses = makeSession("set-1", "Exam 1 · Set A", at("2026-08-28T01:00:00Z"));
    expect(fromSessionRow(toSessionRow(ses))).toMatchObject({ id: ses.id, setId: "set-1", setName: "Exam 1 · Set A", syncedAt: ses.updatedAt });
    const seg = { ...makeSegment(ses.id, 4, { ceqId: "q9", label: "Q9" }, at("2026-08-28T01:01:00Z")), text: "verbatim", audioPath: "p.wav" };
    expect(fromSegmentRow(toSegmentRow(seg))).toMatchObject({ seq: 4, text: "verbatim", focusedCeqId: "q9", audioPath: "p.wav", syncedAt: seg.updatedAt });
    const tag = makeTag(ses.id, "EXHIBIT", { ceqId: "q9", label: "Q9" }, at("2026-08-28T01:02:00Z"));
    expect(fromTagRow(toTagRow(tag))).toMatchObject({ tag: "EXHIBIT", source: "tap", syncedAt: tag.updatedAt });
    const item = { id: "b1", sessionId: ses.id, runId: "run-1", kind: "exhibit" as const, title: "T", payload: { prompt: "p" }, quote: "q", ceqIds: ["q9"], status: "suggested" as const, comment: "", createdAt: "2026-08-28T01:03:00Z", updatedAt: "2026-08-28T01:03:00Z", syncedAt: null };
    expect(fromBoardItemRow(toBoardItemRow(item))).toMatchObject({ kind: "exhibit", ceqIds: ["q9"], syncedAt: item.updatedAt });
  });
  test("unknown enum values degrade safely instead of exploding", () => {
    const tag = fromTagRow({ id: "t", session_id: "s", tag: "BOGUS", at: "2026-08-28T01:00:00Z", focused_ceq_id: null, focused_ceq_label: null, source: "weird", note: null, created_at: "x", updated_at: "x", archived_at: null });
    expect(MOMENT_TAGS).toContain(tag.tag);
    expect(tag.source).toBe("tap");
    const item = fromBoardItemRow({ id: "b", session_id: "s", run_id: "r", kind: "nope", title: "", payload: {}, quote: "", ceq_ids: [], status: "nope", comment: "", created_at: "x", updated_at: "x", archived_at: null });
    expect(BOARD_KINDS).toContain(item.kind);
    expect(item.status).toBe("suggested");
  });
});

describe("B1.5 — the sync-backlog bug, pinned forever", () => {
  test("a server-format ack (…+00:00) settles a client-format row (…Z)", () => {
    const seg = makeSegment("s1", 0, { ceqId: null, label: null }, at("2026-08-28T21:28:41.673Z"));
    // client updatedAt: "…Z"; PostgREST echoes the SAME instant as "+00:00".
    const acked = { ...seg, syncedAt: "2026-08-28T21:28:41.673+00:00" };
    expect(acked.syncedAt < acked.updatedAt).toBe(true); // the string trap that caused "27 unsynced"
    expect(isPending(acked)).toBe(false);                // the fix: compare instants
  });
  test("a genuinely newer edit still re-queues", () => {
    const seg = makeSegment("s1", 0, { ceqId: null, label: null }, at("2026-08-28T21:28:41.673Z"));
    const acked = { ...seg, syncedAt: "2026-08-28T21:28:41.673+00:00" };
    const edited = touchRow(acked, { text: "later" } as Partial<TalkSegment>, at("2026-08-28T21:30:00.000Z"));
    expect(isPending(edited)).toBe(true);
  });
  test("merge also compares instants, not strings", () => {
    const base = { ...makeSegment("s1", 0, { ceqId: null, label: null }, at("2026-08-28T21:00:00.000Z")), syncedAt: "2026-08-28T21:00:00.000+00:00" };
    const incoming = { ...base, text: "server copy", updatedAt: "2026-08-28T21:00:00.000+00:00", syncedAt: "2026-08-28T21:00:00.000+00:00" };
    // same instant — incoming (server) wins the >= tie instead of losing the string race
    expect(mergeRows([base], [incoming])[0].text).toBe("server copy");
  });
});

describe("B1/B2 — contexts, stars and the stamp fold", () => {
  test("legacy v1 tags fold into the v2 vocabulary at read (never rewritten)", () => {
    expect(canonicalStamp("SHORT")).toBe("short");
    expect(canonicalStamp("TALK")).toBe("review_vibe");
    expect(canonicalStamp("EXHIBIT_SPEC")).toBe("exhibit");
    expect(canonicalStamp("TEACH")).toBe("blast_off");
    expect(canonicalStamp("reword")).toBe("reword");
    expect(canonicalStamp("nonsense")).toBeNull();
    expect(stampLabel("NERDOUT")).toBe("Nerd Out");
    expect(stampLabel("revise_choices")).toBe("Revise Choices");
  });
  test("segments group under the open context by TIME WINDOW — a derived view", () => {
    const open = { ...makeTag("s1", "reword" as never, { ceqId: "q3", label: "Q3" }, at("2026-08-29T01:00:00Z")), endedAt: "2026-08-29T01:02:00Z" };
    const later = { ...makeTag("s1", "blast_off" as never, { ceqId: null, label: null }, at("2026-08-29T01:02:00Z")), endedAt: null };
    const inFirst = { ...makeSegment("s1", 0, { ceqId: "q3", label: "Q3" }, at("2026-08-29T01:00:30Z")), text: "say it plainer" };
    const inSecond = { ...makeSegment("s1", 1, { ceqId: null, label: null }, at("2026-08-29T01:03:00Z")), text: "open with the trap" };
    const before = { ...makeSegment("s1", 2, { ceqId: null, label: null }, at("2026-08-29T00:59:00Z")), text: "general talk" };
    expect(contextOfSegment(inFirst, [open, later])?.id).toBe(open.id);
    expect(contextOfSegment(inSecond, [open, later])?.id).toBe(later.id); // still-open window
    expect(contextOfSegment(before, [open, later])).toBeNull();          // untagged = general set talk
    expect(segmentsInContext([inFirst, inSecond, before], open).map((x) => x.text)).toEqual(["say it plainer"]);
  });
  test("openContext returns the un-closed tap stamp; stars never open contexts", () => {
    const star = { ...makeTag("s1", "short" as never, { ceqId: "q1", label: "Q1" }, at("2026-08-29T01:00:00Z")), starred: true, endedAt: null };
    const ctx = { ...makeTag("s1", "review_vibe" as never, { ceqId: null, label: null }, at("2026-08-29T01:01:00Z")), endedAt: null };
    expect(openContext([star, ctx], "s1")?.id).toBe(ctx.id);
    expect(isContextTag(star)).toBe(false);
  });
  test("v2 tag fields round-trip the wire", () => {
    const t = { ...makeTag("s1", "memo" as never, { ceqId: "q1", label: "Q1" }, at("2026-08-29T01:00:00Z")), endedAt: "2026-08-29T01:01:00Z", starred: true };
    const rt = fromTagRow(toTagRow(t));
    expect(rt.endedAt).toBe("2026-08-29T01:01:00Z");
    expect(rt.starred).toBe(true);
    expect(rt.tag).toBe("memo"); // v2 stamps survive (not coerced to KEY)
  });
});

// ─────────────────────────────────────────────────────────── the AI pass

const CTX: PassContext = {
  setName: "Exam 1 · Accounts",
  ceqs: [
    { id: "q1", label: "Q1 · Unearned", stem: "What type of account is Unearned Revenue?", choices: [{ text: "Liability", correct: true, feedback: "You OWE the service." }, { text: "Revenue", correct: false }] },
    { id: "q2", label: "Q2 · Prepaid", stem: "Prepaid Rent is a(n)…", choices: [{ text: "Asset", correct: true }] },
  ],
  segments: [
    { id: "g1", seq: 0, text: "okay so unearned revenue this is the trap", focusedCeqId: "q1", focusedCeqLabel: "Q1 · Unearned", source: "whisper", whisperPending: false },
    { id: "g2", seq: 1, text: "this would be a good short honestly", focusedCeqId: "q1", focusedCeqLabel: "Q1 · Unearned", source: "live", whisperPending: true },
    { id: "g3", seq: 2, text: "", focusedCeqId: null, focusedCeqLabel: null, source: "live", whisperPending: true },
  ],
  tags: [{ tag: "EXHIBIT", at: "2026-08-28T01:00:10Z", focusedCeqLabel: "Q1 · Unearned", source: "tap" }],
  docs: { method: "METHOD DOC", bible: "BIBLE DOC", blastOff: "BLAST OFF DOC" },
};

describe("pass message assembly", () => {
  test("the transcript block is verbatim, anchored, and announces focus changes", () => {
    const block = transcriptBlock(CTX);
    expect(block).toContain("[S0] okay so unearned revenue this is the trap");
    expect(block).toContain("— focus: Q1 · Unearned —");
    expect(block).toContain("[S1] (live text — Whisper pending) this would be a good short honestly");
    expect(block).not.toContain("[S2]"); // empty segments don't ship
  });
  test("the CEQ block carries order, stems, correct marks and feedback", () => {
    const block = ceqBlock(CTX);
    expect(block).toContain("1. [q1] Q1 · Unearned");
    expect(block).toContain("✔ Liability — fb: You OWE the service.");
    expect(block.indexOf("[q1]")).toBeLessThan(block.indexOf("[q2]"));
  });
  test("messages carry all three reference docs and the staging-area law", () => {
    const { system, user } = buildPassMessages(CTX);
    for (const doc of ["METHOD DOC", "BIBLE DOC", "BLAST OFF DOC"]) expect(system).toContain(doc);
    expect(system).toContain("Lee's hands make real changes");
    expect(system).toContain("NEVER question-by-question");
    expect(user).toContain("=== VERBATIM TRANSCRIPT ===");
  });
  test("regen mode narrows to one key and carries Lee's notes above the old draft", () => {
    const { system, user } = buildRegenMessages(CTX, "exhibit", { prompt: "old prompt" }, "make it a branch map");
    expect(system).toContain('output ONLY the "exhibit" key');
    expect(user).toContain("old prompt");
    expect(user).toContain("make it a branch map");
    expect(buildRegenMessages(CTX, "short", {}, "").system).toContain("EXACTLY ONE improved item");
  });
});

describe("pass parsing — good, partial and garbage replies", () => {
  const GOOD = {
    ceqOrder: { title: "Reorder", quote: "q", ceqIds: ["q1"], proposed: [{ ceqId: "q2", label: "Q2 first", why: "prepaid is the on-ramp" }], wordingFlags: [] },
    outline: { title: "Blast Off", quote: "q", beats: [{ title: "The trap", coversCeqIds: ["q1", "bogus"], exhibitMoment: "click Unearned", notes: "" }] },
    exhibit: { title: "Trap board", summary: "sum", prompt: "BUILD ...", quote: "okay so unearned revenue this is the trap", ceqIds: ["q1"] },
    vibeBeats: [{ title: "Why owe?", why: "gray area", talkPrompt: "you tell me", quote: "q", ceqIds: ["q1"] }],
    shorts: [{ title: "The trap short", format: "short", pitch: "15s", quote: "this would be a good short honestly", ceqIds: ["q1"] }],
    phrases: [{ phrase: "You OWE the service", meaning: "unearned = liability", quote: "q" }],
    accuracyFlags: [{ claim: "always a current liability", why: "verify long-term deferrals", quote: "q", ceqIds: ["q1"] }],
    proposedTags: [{ tag: "SHORT", quote: "this would be a good short honestly", seq: 1 }, { tag: "BOGUS", quote: "x", seq: 0 }],
  };
  test("a full reply becomes one item per section entry, quotes intact", () => {
    const { items, proposedTags } = parsePass(GOOD as never, "s1", "run-1", ["q1", "q2"], at("2026-08-28T02:00:00Z"));
    expect(items.map((i) => i.kind).sort()).toEqual(["accuracy", "ceq_order", "exhibit", "outline", "phrase", "short", "vibe"]);
    const ex = items.find((i) => i.kind === "exhibit")!;
    expect(ex.quote).toBe("okay so unearned revenue this is the trap");
    expect((ex.payload as { prompt: string }).prompt).toBe("BUILD ...");
    expect(ex.status).toBe("suggested");
    // unknown ceq ids are dropped, valid ones kept
    expect(items.find((i) => i.kind === "outline")!.ceqIds).toEqual(["q1"]);
    // bogus proposed tag filtered, real one kept with its anchor
    expect(proposedTags).toEqual([{ tag: "SHORT", quote: "this would be a good short honestly", seq: 1 }]);
    // ids unique
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
  test("a single-key regen reply parses through the same door", () => {
    const { items } = parsePass({ shorts: GOOD.shorts } as never, "s1", "run-2", ["q1"], at("2026-08-28T02:00:00Z"));
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("short");
  });
  test("garbage degrades to zero items, never a throw", () => {
    expect(parsePass({} as never, "s1", "r", []).items).toEqual([]);
    expect(parsePass({ exhibit: { title: "no prompt" } } as never, "s1", "r", []).items).toEqual([]);
    expect(parsePass({ vibeBeats: "not an array", shorts: [{}] } as never, "s1", "r", []).items).toEqual([]);
  });
  test("bankChanges parse into bank items; quick-kind tags round-trip the wire", () => {
    const { items } = parsePass({ bankChanges: [
      { action: "cut", ceqId: "q1", title: "Cut the shortcut question", proposal: "doesn't earn its slot", quote: "q" },
      { action: "add", ceqId: null, title: "Add a trigger-word CEQ", proposal: "Prepaids are always ___", quote: "q" },
      { action: "bogus", ceqId: "nope", title: "", proposal: "", quote: "" },
    ] } as never, "s1", "r", ["q1"], at("2026-08-28T02:00:00Z"));
    expect(items.map((i) => i.kind)).toEqual(["bank", "bank"]);
    expect(items[0].ceqIds).toEqual(["q1"]);
    expect((items[0].payload as { action: string }).action).toBe("cut");
    expect(items[1].ceqIds).toEqual([]);
    // quick-action tags survive the wire (they are NOT coerced to KEY)
    const quick = { ...makeTag("s1", "REWORD", { ceqId: "q1", label: "Q1" }, at("2026-08-28T02:01:00Z")), note: "say it like the deck does" };
    const rt = fromTagRow(toTagRow(quick));
    expect(rt.tag).toBe("REWORD");
    expect(rt.note).toBe("say it like the deck does");
  });

  test("quick-action notes ride the tag block into the pass messages", () => {
    const ctx = { ...CTX, tags: [{ tag: "REWORD" as const, at: "2026-08-28T01:00:10Z", focusedCeqLabel: "Q1 · Unearned", source: "tap" as const, note: "swap liability wording" }] };
    const { user } = buildPassMessages(ctx);
    expect(user).toContain("Reword @");
    expect(user).toContain(`LEE'S NOTE: "swap liability wording"`);
  });

  test("extractJsonObject peels fences and wrapping prose", () => {
    expect(extractJsonObject('Sure! Here it is:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject('{"broken": ')).toBeNull();
  });
  test("boardForCeq slices the per-CEQ view", () => {
    const { items } = parsePass(GOOD as never, "s1", "run-1", ["q1", "q2"], at("2026-08-28T02:00:00Z"));
    expect(boardForCeq(items, "q1").length).toBeGreaterThan(3);
    expect(boardForCeq(items, "q2").map((i) => i.kind)).toEqual(["ceq_order"]);
  });
});
