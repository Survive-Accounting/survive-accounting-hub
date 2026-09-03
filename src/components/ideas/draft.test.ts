// THE DRAFT THAT SURVIVES — the guarantee is "the words come back". These tests
// exist because the failure mode is silent: a draft that round-trips wrong looks
// exactly like a draft that was never written.
import { describe, expect, test } from "bun:test";

import {
  clampBox, clearDraft, coerceDraft, draftKey, emptyDraft, hasContent,
  readDraft, shouldReopen, writeDraft, MIN_H, MIN_W, type IdeaDraft,
} from "./draft";

/** A localStorage stand-in — bun has no DOM. */
function mem(seed: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(seed));
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, v); },
  } as Storage;
}

const filled = (over: Partial<IdeaDraft> = {}): IdeaDraft => ({
  ...emptyDraft(new Date("2026-09-03T10:00:00Z")),
  open: true, step: "capture", intent: "page", text: "the modal loses everything",
  ...over,
});

describe("the key", () => {
  test("is per person so King's draft never lands in Lee's modal", () => {
    expect(draftKey("lee")).toBe("ideaBankDraft_lee");
    expect(draftKey("KING")).toBe("ideaBankDraft_king");
  });
  test("an unlocked-but-unnamed device still gets its own slot", () => {
    expect(draftKey(null)).toBe("ideaBankDraft_anon");
    expect(draftKey("  ")).toBe("ideaBankDraft_anon");
  });
});

describe("round trip", () => {
  test("the words, the kind and the attachments all come back", () => {
    const s = mem();
    const d = filled({
      todo: "work", other: "pricing", phased: true, category: "STUDENT_SIDE",
      files: [{ id: "p", name: "shot.png", mime: "image/png", size: 12, path: "p", url: "u" }],
      audio: { path: "a/1.webm", status: "ok" },
      editingId: "idea-1",
    });
    writeDraft("lee", d, s);
    const back = readDraft("lee", s).draft!;
    expect(back.text).toBe("the modal loses everything");
    expect(back.intent).toBe("page");
    expect(back.todo).toBe("work");
    expect(back.other).toBe("pricing");
    expect(back.phased).toBe(true);
    expect(back.category).toBe("STUDENT_SIDE");
    expect(back.files).toHaveLength(1);
    expect(back.audio?.path).toBe("a/1.webm");
    expect(back.editingId).toBe("idea-1");
    expect(back.step).toBe("capture");
    expect(back.open).toBe(true);
  });

  test("nothing saved is not an error", () => {
    expect(readDraft("lee", mem())).toEqual({ draft: null, error: null });
  });

  test("unreadable storage is REPORTED, never swallowed", () => {
    const s = mem({ [draftKey("lee")]: "{not json" });
    const r = readDraft("lee", s);
    expect(r.draft).toBeNull();
    expect(r.error).toContain("unreadable");
  });

  test("a draft from an older shape is dropped rather than half-read", () => {
    const s = mem({ [draftKey("lee")]: JSON.stringify({ v: 0, text: "old" }) });
    expect(readDraft("lee", s).draft).toBeNull();
  });

  test("a junk field costs that field only — never the words", () => {
    const d = coerceDraft({ ...filled(), intent: "nonsense", todo: "maybe", step: 7, files: "no" })!;
    expect(d.text).toBe("the modal loses everything");
    expect(d.intent).toBeNull();
    expect(d.todo).toBe("");
    expect(d.step).toBe("kind");
    expect(d.files).toEqual([]);
  });

  test("clear removes it — the only two callers are Save and Discard", () => {
    const s = mem();
    writeDraft("lee", filled(), s);
    clearDraft("lee", s);
    expect(readDraft("lee", s).draft).toBeNull();
  });

  test("writing stamps the time, so reopen can age it", () => {
    const s = mem();
    const out = writeDraft("lee", filled(), s, new Date("2026-09-03T12:34:00Z"));
    expect(out.updatedAt).toBe("2026-09-03T12:34:00.000Z");
    expect(readDraft("lee", s).draft!.updatedAt).toBe("2026-09-03T12:34:00.000Z");
  });
});

describe("what counts as content", () => {
  test("an empty draft has none", () => expect(hasContent(emptyDraft())).toBe(false));
  test("whitespace is not content", () => expect(hasContent(filled({ text: "   " }))).toBe(false));
  test("an attachment alone is content — a screenshot IS the idea", () => {
    expect(hasContent(filled({ text: "", files: [{ id: "p", name: "n", mime: "image/png", size: 1, path: "p", url: "u" }] }))).toBe(true);
  });
  test("audio alone is content", () => expect(hasContent(filled({ text: "", audio: { path: "a", status: "ok" } }))).toBe(true));
});

describe("reopening", () => {
  const now = new Date("2026-09-03T12:00:00Z");
  test("a draft left open minutes ago comes straight back", () => {
    expect(shouldReopen(filled({ updatedAt: "2026-09-03T11:56:00Z" }), now)).toBe(true);
  });
  test("a draft from yesterday does NOT ambush the page", () => {
    expect(shouldReopen(filled({ updatedAt: "2026-09-02T11:00:00Z" }), now)).toBe(false);
  });
  test("a closed draft stays closed", () => {
    expect(shouldReopen(filled({ open: false, updatedAt: "2026-09-03T11:56:00Z" }), now)).toBe(false);
  });
  test("an empty draft never reopens", () => {
    expect(shouldReopen(filled({ text: "", updatedAt: "2026-09-03T11:56:00Z" }), now)).toBe(false);
  });
});

describe("the floating window's box", () => {
  test("never smaller than 400x300", () => {
    expect(clampBox({ x: 10, y: 10, w: 50, h: 50 }, 1600, 900)).toMatchObject({ w: MIN_W, h: MIN_H });
  });
  test("never bigger than 90vw x 90vh", () => {
    const b = clampBox({ x: 0, y: 0, w: 9999, h: 9999 }, 1600, 900);
    expect(b.w).toBe(1440);
    expect(b.h).toBe(810);
  });
  test("a window dragged off-screen keeps a grabbable strip", () => {
    const b = clampBox({ x: 99999, y: 99999, w: 500, h: 400 }, 1200, 800);
    expect(b.x).toBeLessThanOrEqual(1200 - 120);
    expect(b.y).toBeLessThanOrEqual(800 - 40);
    const l = clampBox({ x: -99999, y: -50, w: 500, h: 400 }, 1200, 800);
    expect(l.x).toBe(-(500 - 120));
    expect(l.y).toBe(0);
  });
  test("a tiny viewport still gets a usable window rather than a sliver", () => {
    expect(clampBox({ x: 0, y: 0, w: 500, h: 400 }, 320, 280)).toMatchObject({ w: MIN_W, h: MIN_H });
  });
});
