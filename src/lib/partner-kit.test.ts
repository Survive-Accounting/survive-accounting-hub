// The partner kit's naming and cover rules (2026-08-28). The PDFs themselves are drawn by
// pdf-lib and verified by generating the real ZIP; these are the pure rules around them.
import { describe, expect, test } from "bun:test";

import { chapterFolder, semesterLabel, stamp } from "./partner-kit.server";

describe("cover stamp", () => {
  test("names the council when the officer told us one", () => {
    expect(stamp("Panhellenic", "Alabama", "Fall 2026")).toBe("Prepared for Panhellenic at Alabama · Fall 2026");
  });
  test("falls back to the school alone — never a person's name, never an invented council", () => {
    expect(stamp(null, "Alabama", "Fall 2026")).toBe("Prepared for Alabama · Fall 2026");
  });
});

describe("semester label", () => {
  test("derived from the date, not hardcoded into an asset", () => {
    expect(semesterLabel(new Date("2026-02-10"))).toBe("Spring 2026");
    expect(semesterLabel(new Date("2026-06-10"))).toBe("Summer 2026");
    expect(semesterLabel(new Date("2026-09-10"))).toBe("Fall 2026");
  });
});

describe("chapter folder names", () => {
  test("ASCII letters lead; the name always follows", () => {
    expect(chapterFolder({ name: "Alpha Delta Phi", slug: "a", letters: "ADP" })).toBe("ADP-Alpha-Delta-Phi");
  });
  test("Greek-character letters are dropped from the FOLDER NAME — unzip tools mangle them", () => {
    expect(chapterFolder({ name: "Alpha Delta Chi", slug: "a", letters: "ΑΔΧ" })).toBe("Alpha-Delta-Chi");
  });
  test("never empty, never path-breaking", () => {
    expect(chapterFolder({ name: "!!!", slug: "a", letters: null })).toBe("Chapter");
    expect(chapterFolder({ name: "Phi Psi / Phi Tau", slug: "a", letters: null })).not.toContain("/");
  });
});
