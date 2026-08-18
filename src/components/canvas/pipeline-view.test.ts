// PIPELINE VIEW (P1) — a NEW ROOM on the SAME PIPES.
//
// The pins here defend the two laws of the prompt: (1) nothing was rebuilt —
// the player runs the P0 sequencer, the cut is the existing stitch recipe, TRUE
// RENDER is the existing per-CEQ render; (2) there is ONE takes surface — the
// clip stack left the rail, the rail kept the queues, and no second copy of
// either exists anywhere.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8").split("\r\n").join("\n");
const studio = read("CeqStudio.tsx");
const inbox = read("TakesInbox.tsx");
const navbar = read("CanvasNavbar.tsx");
const player = read("PipelinePlayer.tsx");
const hook = read("use-cut-player.ts");
const route = read("../../routes/study_.canvas.tsx");

describe("the way in", () => {
  test("PIPELINE is a top-level navbar button next to File, not a buried menu row", () => {
    expect(navbar).toContain("onClick={onPipeline}");
    expect(navbar).toContain("<Clapperboard className=\"h-3.5 w-3.5\" /> Pipeline");
    // next to File: the button sits between the File dropdown and the name field.
    expect(navbar.indexOf("onClick={onPipeline}")).toBeGreaterThan(navbar.indexOf("File <ChevronDown"));
    expect(navbar.indexOf("onClick={onPipeline}")).toBeLessThan(navbar.indexOf("{/* Name — pool mode shows"));
  });
  test("the button reaches BOTH a fresh Studio (localStorage) and an open one (event)", () => {
    expect(route).toContain('onPipeline={() => { localStorage.setItem("sa-filming-mode", "1"); setCeqStudioOpen(true); window.dispatchEvent(new Event("sa-open-pipeline")); }}');
    expect(studio).toContain('window.addEventListener("sa-open-pipeline", on)');
  });
});

describe("same pipes, no rebuilds", () => {
  test("the inline player is the P0 sequencer — no second playback engine", () => {
    expect(player).toContain("useCutPlayer(");
    expect(hook).toContain('from "./cut-sequencer"');
    // no home-grown advancing: the player never touches the video element
    // directly — every decision goes through the hook.
    expect(player).not.toContain("new Audio");
    expect(player).not.toContain("setInterval");
    expect(player).not.toContain("currentTime");
  });
  test("the cut is the EXISTING recipe — derived, auto-joining, and it never writes", () => {
    const memo = studio.slice(studio.indexOf("const pipelineStitch = useMemo"), studio.indexOf("}, [deck, questions, rf]);"));
    expect(memo).toContain("setStitchId(deck.id)");           // the same set-scope id
    expect(memo).toContain("const fresh = spine.filter((i) => !known.has(i.takePath));"); // new keeps auto-join
    expect(memo).not.toContain("setDecks");                    // derived only —
    expect(memo).not.toContain("saveStitch");                  // previewing must never write
  });
  test("TRUE RENDER is the existing per-CEQ render path, not a new one", () => {
    expect(studio).toContain("onTrueRender={() => { if (qId && qId !== LAYOUT_Q0) runStitch(qId); }}");
    expect(player).not.toContain("startDissectStitch"); // the player only asks; the Studio renders
  });
});

describe("one takes surface", () => {
  test("the rail kept the queues and lost the stack — no second clip list anywhere", () => {
    expect(inbox).not.toContain("clipsPanel");
    expect((studio.match(/\{clipsPanel\}/g) ?? []).length).toBe(1); // exactly one home
    expect((studio.match(/<PipelinePlayer/g) ?? []).length).toBe(1); // and one player
  });
  test("the stack follows the spine — the open frame's group scrolls into view", () => {
    expect(studio).toContain('if (el && r.id === qId) el.scrollIntoView({ block: "nearest" });');
  });
});

describe("the loop stays on the keyboard", () => {
  test("F10/F8 triage works in the Studio itself, guarded against double-fire", () => {
    const km = studio.slice(studio.indexOf("// PIPELINE (P1): F10 keep / F8 trash"), studio.indexOf("}, [filming, recording]);"));
    expect(km).toContain('triageLatest(e.key === "F8" ? "trash" : "keep")');
    // the film keymaps preventDefault on capture — this guard is what makes a
    // studio-level listener safe to add at all.
    expect(km).toContain("e.defaultPrevented || recording");
    expect(km).toContain("isTypingTarget()");
  });
});

describe("the top strip", () => {
  test("capture-window launch is ON the strip, through the previewer's ONE launcher", () => {
    expect(studio).toContain('window.dispatchEvent(new Event("sa-launch-capture"))');
    const prev = read("CeqPreviewer.tsx");
    expect(prev).toContain('window.addEventListener("sa-launch-capture", on)');
    expect(prev).toContain("toggleFilmRef.current(undefined, true)"); // same args as 🎯 Capture
  });
});

describe("film-safe", () => {
  test("recording hides the column AND silences the player — pixels off, audio off", () => {
    expect(studio).toContain('style={{ display: recording ? "none" : undefined, background: "rgba(9,14,26,0.92)"');
    expect(player).toContain("if (hidden) stopRef.current();");
  });
  test("stop() cancels an in-flight clip load — a post-stop load can't seek+play (audio bleed)", () => {
    // The generation guard: stop() bumps genRef; a begin()/fail() captured the
    // old value and bails, so metadata arriving after stop never plays audio
    // over a live take. This was a CONFIRMED high-sev finding.
    expect(hook).toContain("const genRef = useRef(0);");
    expect(hook).toContain("const stop = () => { genRef.current += 1;");
    expect(hook).toContain("const myGen = genRef.current;");
    expect(hook).toContain("if (genRef.current !== myGen) return;"); // begin bails
  });
});
