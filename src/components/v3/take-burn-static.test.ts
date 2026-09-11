// THE UPLOAD PATH LOADS WITH THE PAGE (2026-09-11). Lee's first-five posting died on "failed to
// fetch dynamically imported module …/take-burn-DTxPtzup.js": /v3/post loaded the upload code on
// demand, a deploy landed while the page was open, and the old hashed chunk was gone. These pin
// that nothing on the upload / burn / download path is fetched on demand again.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

function read(f: string): string {
  return readFileSync(join(import.meta.dir, f), "utf8");
}

describe("the post page's upload path", () => {
  test("PostProduction imports take-burn up front, never on demand", () => {
    const src = read("PostProduction.tsx");
    expect(src).not.toContain('await import("@/components/v3/take-burn")');
    expect(src).toMatch(/import \{[^}]*uploadTake[^}]*\} from "@\/components\/v3\/take-burn"/);
  });

  test("take-burn loads nothing on demand, and its burn goes through the patient loop", () => {
    const src = read("take-burn.ts");
    expect(src).not.toContain("await import(");
    expect(src).toContain("return runBurn(");
  });

  test("take-transcript loads nothing on demand (step 2 must survive a deploy too)", () => {
    expect(read("take-transcript.ts")).not.toContain("await import(");
  });
});
