// THE TELEPROMPTER SYNC's contract with the two ends it sits between: what
// the Studio writes (canvas/CeqStudio.tsx) and what the prompter window reads
// (routes/v3.teleprompter.tsx). Pure helpers here, source pins on both ends —
// a change to either shape fails HERE, not on Lee's other monitor mid-take.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { FILM_ACTIVE_KEY, POPOUT_HEARTBEAT_MS, POPOUT_STALE_MS, filmActiveRecord, filmNodeId, filmNodeIdForFrameId, popoutTake, previewIndex, type FilmActive } from "./prompter-sync";

const src = (rel: string) => readFileSync(join(import.meta.dir, rel), "utf8").split("\r\n").join("\n");
const teleprompter = src("../../../routes/v3.teleprompter.tsx");
const studio = src("../../canvas/CeqStudio.tsx");

describe("the record", () => {
  test("the Studio's key, the Studio's three fields", () => {
    expect(FILM_ACTIVE_KEY).toBe("sa-film-active");
    expect(filmActiveRecord("set-1", "ceq-9", 1234)).toEqual({ setId: "set-1", qId: "ceq-9", at: 1234 });
    expect(Object.keys(filmActiveRecord("s", null))).toEqual(["setId", "qId", "at"]);
    expect(typeof filmActiveRecord("s", null).at).toBe("number");
  });
  test("the pop-out's flags are added only when true — never written as false", () => {
    expect(filmActiveRecord("s", "blast-f1", 1, { popout: true })).toEqual({ setId: "s", qId: "blast-f1", at: 1, popout: true });
    expect(filmActiveRecord("s", null, 1, { popout: true, countdown: true })).toEqual({ setId: "s", qId: null, at: 1, popout: true, countdown: true });
    expect(Object.keys(filmActiveRecord("s", "q", 1, { popout: false, countdown: false }))).toEqual(["setId", "qId", "at"]);
    expect(filmActiveRecord("s", null, 1, { popout: true, countdown: true, count: 3 })).toEqual({ setId: "s", qId: null, at: 1, popout: true, countdown: true, count: 3 });
    expect(Object.keys(filmActiveRecord("s", "q", 1, { count: 3 }))).toEqual(["setId", "qId", "at"]);  // a count with no countdown is not a count
  });
  // THE MAP (2026-09-07): a cluster frame publishes the shot being walked; the prompter shows
  // that shot's note. Shot 0 is a shot — only a missing shot is left off.
  test("the map's shot rides on the record only when there is one", () => {
    expect(filmActiveRecord("s", "blast-f1", 1, { shot: 0 })).toEqual({ setId: "s", qId: "blast-f1", at: 1, shot: 0 });
    expect(filmActiveRecord("s", "blast-f1", 1, { popout: true, shot: 3 })).toEqual({ setId: "s", qId: "blast-f1", at: 1, popout: true, shot: 3 });
    expect(Object.keys(filmActiveRecord("s", "q", 1, { shot: undefined }))).toEqual(["setId", "qId", "at"]);
  });
  test("a set card publishes its CEQ node, an insert its blast-<frame id> node", () => {
    expect(filmNodeId({ id: "f1", kind: "ceq", ceqId: "ceq-9" })).toBe("ceq-9");
    expect(filmNodeId({ id: "f2", kind: "phrase" })).toBe("blast-f2");
    expect(filmNodeId({ id: "f3", kind: "ceq" })).toBe("blast-f3"); // a card frame missing its CEQ still resolves
    expect(filmNodeId(null)).toBeNull();
    expect(filmNodeIdForFrameId("f2")).toBe("blast-f2");
    expect(filmNodeIdForFrameId(null)).toBeNull();
  });
});

// Lee, 2026-09-07: "I would prefer with capture window having a 10 second countdown… like we're
// on slide 0 at that point. and once that countdown starts, we have the /film on slide one… BUT,
// when countdown hits, we advance /film to slide 2." The main window's side, pure.
describe("the main window reading the pop-out's take", () => {
  const rec = (over: Partial<FilmActive>): FilmActive => ({ setId: "set-1", qId: "blast-f2", at: 10_000, popout: true, ...over });
  const frames = [{ id: "f1", kind: "open" as const }, { id: "f2", kind: "ceq" as const, ceqId: "ceq-9" }, { id: "f3", kind: "outro" as const }];

  test("a live pop-out record is a take; the plain record (the main window's own, or the Studio's) is not", () => {
    expect(popoutTake(rec({}), "set-1", 11_000)).toEqual({ qId: "blast-f2", countdown: false, count: null });
    expect(popoutTake({ setId: "set-1", qId: "blast-f2", at: 10_000 }, "set-1", 11_000)).toBeNull();
    expect(popoutTake(null, "set-1", 11_000)).toBeNull();
  });
  test("another set's pop-out is not this window's take", () => {
    expect(popoutTake(rec({ setId: "set-2" }), "set-1", 11_000)).toBeNull();
  });
  test("stale after POPOUT_STALE_MS without a heartbeat — the pop-out closed or froze", () => {
    expect(POPOUT_HEARTBEAT_MS * 2).toBeLessThan(POPOUT_STALE_MS);              // two missed beats before it's called dead
    expect(popoutTake(rec({}), "set-1", 10_000 + POPOUT_STALE_MS)).not.toBeNull();
    expect(popoutTake(rec({}), "set-1", 10_001 + POPOUT_STALE_MS)).toBeNull();
    expect(popoutTake(rec({}), "set-1", 10_000 - POPOUT_STALE_MS - 1)).toBeNull(); // a clock far ahead of ours is no better
  });
  test("the countdown is slide 0: qId null whatever was written", () => {
    expect(popoutTake(rec({ countdown: true, qId: null }), "set-1", 11_000)).toEqual({ qId: null, countdown: true, count: null });
    expect(popoutTake(rec({ countdown: true }), "set-1", 11_000)).toEqual({ qId: null, countdown: true, count: null });
  });
  // 2026-09-08. Lee: "So, will students see the 3 2 1?" — not any more. The pop-out IS the OBS
  // capture, so the digits ride the record to the main window instead of drawing in the shot.
  test("the number itself crosses to the main window, and only while counting", () => {
    expect(popoutTake(rec({ countdown: true, count: 7 }), "set-1", 11_000)).toEqual({ qId: null, countdown: true, count: 7 });
    expect(popoutTake(rec({ count: 7 }), "set-1", 11_000).count).toBeNull();   // no count without the flag
  });
  test("the preview is the slide AFTER the pop-out's; during the countdown it is slide 1", () => {
    expect(previewIndex(frames, { qId: null, countdown: true, count: null })).toBe(0);
    expect(previewIndex(frames, { qId: "blast-f1", countdown: false, count: null })).toBe(1);
    expect(previewIndex(frames, { qId: "ceq-9", countdown: false, count: null })).toBe(2);       // a set card by its CEQ node…
    expect(previewIndex(frames, { qId: "blast-f2", countdown: false, count: null })).toBe(2);    // …or by its frame id, as the Studio/prompter contract allows
    expect(previewIndex(frames, { qId: "blast-f3", countdown: false, count: null })).toBe(3);    // the last slide → frames.length: "— end —"
    expect(previewIndex(frames, { qId: "blast-nope", countdown: false, count: null })).toBeNull();
    expect(previewIndex(frames, { qId: null, countdown: false, count: null })).toBeNull();
  });
});

describe("the two ends (source pins)", () => {
  test("the Studio writes the same key and shape", () => {
    expect(studio).toContain('localStorage.setItem("sa-film-active", JSON.stringify({ setId: deck.id, qId: qId && qId !== LAYOUT_Q0 ? qId : null, at: Date.now() }))');
  });
  test("the prompter reads the key, keeps its own set, resolves a card by ceqId and ANY frame by blast-<id>", () => {
    expect(teleprompter).toContain('localStorage.getItem("sa-film-active")');
    expect(teleprompter).toContain("active.setId === setId");
    // The frame-id path useCapturePrompterSync relies on: the blast- clause is
    // not gated on kind, so a set card resolves by its frame id as well.
    expect(teleprompter).toContain('(f.kind === "ceq" && f.ceqId === qId) || `blast-${f.id}` === qId');
  });
  test("the prompter follows the map's shot: a new shot is a new record, and the shot's note is the line", () => {
    expect(teleprompter).toContain("n.shot !== prev.shot");
    expect(teleprompter).toContain("shotNoteFor(");
  });
  test("a plain write is the whole publish: the prompter polls the key and hears the cross-window storage event", () => {
    expect(teleprompter).toContain("window.setInterval(tick, 500)");
    expect(teleprompter).toContain('window.addEventListener("storage", tick)');
  });
});
