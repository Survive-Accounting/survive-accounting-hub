// F2 — FILMING MODE: one workspace, no authoring chrome.
//
// The promise this makes is "a container change, not a fork": the same spine,
// the same takes inbox, the same handlers — only re-arranged. So the pins here
// are mostly about what ISN'T duplicated, and about the mode writing nothing.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const studio = readFileSync(join(import.meta.dir, "CeqStudio.tsx"), "utf8").split("\r\n").join("\n");
const inbox = readFileSync(join(import.meta.dir, "TakesInbox.tsx"), "utf8").split("\r\n").join("\n");
const filmstrip = readFileSync(join(import.meta.dir, "SetFilmstrip.tsx"), "utf8").split("\r\n").join("\n");

describe("the mode switch", () => {
  test("it persists, and the toggle is never hidden by the mode it toggles", () => {
    expect(studio).toContain('localStorage.getItem("sa-filming-mode") === "1"');
    expect(studio).toContain('localStorage.setItem("sa-filming-mode", v ? "1" : "0")');
    // the toggle sits BEFORE the `topTab !== "preview" && !filming` cluster, so
    // entering filming mode can never strand Lee with no way back out.
    expect(studio.indexOf('localStorage.setItem("sa-filming-mode"')).toBeLessThan(studio.indexOf('{topTab !== "preview" && !filming && (<>'));
  });
  test("entering the mode writes nothing to the set", () => {
    // Everything the toggle touches is one localStorage key and one note — no
    // patchQ, no setDecks, no bus.dispatch anywhere in the handler.
    const handler = studio.slice(studio.indexOf('const v = !filming;'), studio.indexOf('title="Switch the whole workspace'));
    expect(handler).not.toContain("patchQ");
    expect(handler).not.toContain("setDecks");
    expect(handler).not.toContain("bus.dispatch");
  });
});

describe("what filming mode shows — and what it doesn't", () => {
  test("the authoring chrome named in the prompt is hidden", () => {
    expect(studio).toContain('{topTab !== "preview" && !filming && (<>');          // tab strip + tools
    expect(studio).toContain('{topTab === "student" && !filming && (!setsOpen ? ('); // left rail
    expect(studio).toContain('{topTab === "preview" || !libOpen || filming ? null : ('); // memo library
    expect(studio).toContain("{qd && !filming && (");                                // stem/choice editor
  });
  test("ONE inbox, mounted through Recording Mode — hidden, never unmounted (P0)", () => {
    // Unmounting closed the OBS socket mid-session: record events during
    // filming were lost (no coverage) and F10 fired into a null triage handler.
    expect(studio).toContain("{(takesOpen || filming) && (");
    expect(studio).toContain("hidden={recording}");
    expect((studio.match(/<TakesInbox/g) ?? []).length).toBe(1); // two mounts = two OBS sockets
  });
  test("the status strip carries the four signals and stays out of frame", () => {
    const strip = studio.slice(studio.indexOf("{/* STATUS STRIP (F2)"), studio.indexOf('<div className="flex min-h-0 flex-1 gap-2 p-2">'));
    expect(strip).toContain("OBS ");
    expect(strip).toContain("armed");
    expect(strip).toContain("room tone");
    expect(strip).toContain("recycle");
    expect(strip).toContain("(app focus)"); // §5: surface the focus requirement subtly
  });
});

describe("the inbox learned a shape, it did not fork", () => {
  test("one component, two containers", () => {
    expect(inbox).toContain('className={inline ? "order-last ml-2 flex h-full w-[380px]');
    expect(inbox).toContain("{!inline && <button className=\"ml-auto grid h-5 w-5"); // no ✕ on a docked rail
  });
  test("the vertical clip stack became the horizontal timeline — one stage, rail never learns clips (Q1)", () => {
    expect(inbox).not.toContain("clipsPanel"); // the F2 prop is gone, not orphaned
    expect(inbox).not.toContain("cardClips"); // the inbox never learns about clips itself
    expect(studio).toContain("<PipelineStage"); // the timeline replaced the vertical stack
    expect(studio).not.toContain("{clipsPanel}"); // the stack is gone, not double-rendered
  });
});
