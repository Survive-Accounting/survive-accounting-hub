// FILM LOCK regression tests (A1) — the shared law: ON CAMERA, GEOMETRY IS
// READ-ONLY. These pin the rules so T-accounts / JE / trial-balance exhibit
// cards can't reintroduce the 2026-08-14 incident (film-mode resize persisting
// w/h while positions rubber-band back to the authored layout).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { FILM_LOCK_CSS, filmDragAllowed } from "./film-lock";

const previewerSrc = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");

describe("filmDragAllowed — what may move on camera", () => {
  test("arrow heads stay live (dragging an arrow is a performance tool)", () => {
    expect(filmDragAllowed({ id: "ah:memo-1" })).toBe(true);
  });
  test("cards, memos and staged exhibits are frozen by default", () => {
    expect(filmDragAllowed({ id: "ceq-1", data: {} })).toBe(false);
    expect(filmDragAllowed({ id: "memo-1" })).toBe(false);
    expect(filmDragAllowed({ id: "el-cycle-1", data: { kind: "cycle" } })).toBe(false);
  });
  test("the explicit per-object unlock is the only opt-out", () => {
    expect(filmDragAllowed({ id: "el-cycle-1", data: { filmMovable: true } })).toBe(true);
    expect(filmDragAllowed({ id: "el-cycle-1", data: { filmMovable: false } })).toBe(false);
  });
});

describe("FILM_LOCK_CSS — no authoring affordance renders on camera", () => {
  test("resize handles, element chrome and sa-chrome are display:none (not just invisible)", () => {
    expect(FILM_LOCK_CSS).toContain(".film-mode .react-flow__resize-control { display: none !important; }");
    expect(FILM_LOCK_CSS).toContain(".film-mode .card-actions { display: none !important; }");
    expect(FILM_LOCK_CSS).toContain(".film-mode .sa-chrome { display: none !important; }");
  });
});

describe("the film popout enforces the lock (source-level pins)", () => {
  test("FILM_LOCK_CSS is injected into the popout window (it never had FILM_MODE_CSS)", () => {
    expect(previewerSrc).toContain("{FLAME_CSS}{PV_CSS}{FILM_LOCK_CSS}");
  });
  test("film nodes get per-node draggability from filmDragAllowed", () => {
    expect(previewerSrc).toContain("draggable: filmDragAllowed(n)");
  });
  test("film drag-stop persists ARROWS ONLY — a card/memo move on camera never saves", () => {
    // The popout's onNodeDragStop must keep its ah:-only guard.
    const popout = previewerSrc.slice(previewerSrc.indexOf("filmNodes"));
    expect(popout).toContain('if (node.id.startsWith("ah:")) persistArrow(node.id.slice(3));');
  });
  test("Recording Mode's R hotkey is deprecated — the film popout is the one surface", () => {
    expect(previewerSrc).not.toContain("onEnterRecording");
  });
  test("film windows never run the authoring key branches (Delete / arrow-nudge write geometry)", () => {
    expect(previewerSrc).toContain('(e.key === "Delete" || e.key === "Backspace") && !filmWindow && selMemoIds.size > 0');
    expect(previewerSrc).toContain('&& !filmWindow && selMemoIds.size > 0 && !layoutMode) {');
  });
});

describe("film stack / spacewalk preload (A2) — transitions may never remount", () => {
  test("stand-in cards keep the REAL question id, so activation is a data flip", () => {
    // If someone prefixes these ids (like overview's ov:), the walk becomes a
    // remount again and the on-camera flash returns.
    expect(previewerSrc).toContain('out.push({ id: qid, type: "ceqPreview"');
    expect(previewerSrc).toContain("inert: true");
  });
  test("inert cards read the base practice state, never the active question's", () => {
    expect(previewerSrc).toContain("const pr = inert ? INERT_PRACTICE : prLive;");
  });
  test("the popout holds a preparing gate until fonts + images are warm", () => {
    expect(previewerSrc).toContain("Preparing set…");
    expect(previewerSrc).toContain("fonts?.ready");
  });
  test("the recording surface (Rehearse) gets the same stack treatment", () => {
    expect(previewerSrc).toContain("recording && filmStack ? recNodes : nodes");
  });
});
