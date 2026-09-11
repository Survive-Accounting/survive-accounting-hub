// The note on a set card, pinned: where a new one sits, that a dragged one stays on the phone, the
// fit search, and the dimming contract with the card (the class it targets must exist there).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { clampNoteBox, defaultNoteBox, fitFont, noteBox } from "./card-note";
import { NOTE_DIM_CSS } from "./CardNote";

function read(f: string): string {
  return readFileSync(join(import.meta.dir, f), "utf8").split("\r\n").join("\n");
}

describe("the note on a set card", () => {
  test("a new note sits just under the stem — higher on pass 2, whose card is at the top", () => {
    expect(defaultNoteBox("pass2").y).toBeLessThan(defaultNoteBox("pass1").y);
    expect(noteBox({ text: "" }, "pass2")).toEqual(defaultNoteBox("pass2"));
    expect(noteBox({ text: "", x: 0.3, h: 0.1 }, "pass1")).toEqual({ ...defaultNoteBox("pass1"), x: 0.3, h: 0.1 });
  });

  test("a dragged or resized note stays on the phone and a sensible size", () => {
    expect(clampNoteBox({ x: 0.9, y: -0.2, w: 0.5, h: 0.3 })).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.3 });
    expect(clampNoteBox({ x: 0, y: 0, w: 0.01, h: 2 })).toEqual({ x: 0, y: 0, w: 0.2, h: 0.6 });
  });

  test("the fit search: the biggest size that fits, to half a pixel; max when it all fits; min when nothing does", () => {
    expect(fitFont(() => true, 22, 7)).toBe(22);
    expect(fitFont(() => false, 22, 7)).toBe(7);
    const px = fitFont((p) => p <= 13.3, 22, 7);
    expect(px).toBeLessThanOrEqual(13.3);
    expect(px).toBeGreaterThan(12.8);
  });

  test("the dimming targets the card's own choice rows, keyed on the phone", () => {
    expect(NOTE_DIM_CSS).toContain("[data-sa-note-dim] .sa-ceq-choice");
    expect(read("../canvas/CeqPreviewer.tsx")).toContain("className={`sa-ceq-choice");
    expect(read("PhoneFrame.tsx")).toContain('data-sa-note-dim={noteDim ? "" : undefined}');
  });
});
