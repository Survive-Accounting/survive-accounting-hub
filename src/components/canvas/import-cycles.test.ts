// NO RUNTIME IMPORT CYCLES under src/.
//
// Why this test exists (Lee, 08-16): CeqPreviewer and ceq-geom imported each
// other. A cycle is harmless right up until the bundler orders the two modules
// unfavourably inside one chunk — then one module's consts are still in their
// temporal dead zone when the other's code runs, and the app dies in PRODUCTION
// with "Cannot access X before initialization" while dev stays perfectly green
// (dev serves unbundled ESM, so the ordering never bites). It took a live
// previewer crash to find, and an unrelated import elsewhere was enough to
// trigger it. Nothing in a unit test would have caught it — so this checks the
// import graph itself.
//
// Type-only imports are erased at build time and create no runtime edge, so
// they are excluded: `import type {...}`, and named imports where EVERY
// specifier is `type X`.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..", "..").replace(/\\/g, "/"); // src/

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name).replace(/\\/g, "/");
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith(".")) base = normalize(join(dirname(from), spec)).replace(/\\/g, "/");
  else if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2)).replace(/\\/g, "/");
  else return null; // a package, not our source
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + ext)) return (base + ext).replace(/\\/g, "/");
  }
  return null;
}

/** Runtime import edges only — the ones that survive into the bundle. */
function runtimeGraph(): Map<string, string[]> {
  const g = new Map<string, string[]>();
  for (const f of sourceFiles(ROOT)) {
    const src = readFileSync(f, "utf8").split("\r\n").join("\n");
    const deps = new Set<string>();
    const re = /import\s+(?!type\s)([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const named = m[1].match(/^\{([\s\S]*)\}$/);
      if (named) {
        const parts = named[1].split(",").map((s) => s.trim()).filter(Boolean);
        if (parts.length && parts.every((p) => p.startsWith("type "))) continue; // fully erased
      }
      const r = resolveSpec(f, m[2]);
      if (r) deps.add(r);
    }
    const re2 = /import\s+["']([^"']+)["']/g; // side-effect imports
    while ((m = re2.exec(src))) { const r = resolveSpec(f, m[1]); if (r) deps.add(r); }
    g.set(f, [...deps]);
  }
  return g;
}

/** Tarjan — every strongly-connected component larger than one node is a cycle. */
function cycles(g: Map<string, string[]>): string[][] {
  let idx = 0;
  const stack: string[] = [], onStack = new Set<string>();
  const index = new Map<string, number>(), low = new Map<string, number>();
  const found: string[][] = [];
  const strong = (v: string): void => {
    index.set(v, idx); low.set(v, idx); idx++;
    stack.push(v); onStack.add(v);
    for (const w of g.get(v) ?? []) {
      if (!index.has(w)) { strong(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const c: string[] = [];
      let w: string;
      do { w = stack.pop()!; onStack.delete(w); c.push(w); } while (w !== v);
      if (c.length > 1) found.push(c);
    }
  };
  for (const v of g.keys()) if (!index.has(v)) strong(v);
  return found;
}

describe("the import graph", () => {
  test("has NO runtime cycles — a cycle is a production-only TDZ crash waiting for a bundler reshuffle", () => {
    const found = cycles(runtimeGraph()).map((c) => c.map((f) => f.replace(ROOT + "/", "")).sort());
    // Named, not just counted: a failure here should say exactly which files.
    expect(found).toEqual([]);
  });

  test("the graph builder actually sees this project (guards against a silently empty scan)", () => {
    const g = runtimeGraph();
    expect(g.size).toBeGreaterThan(50);
    const previewer = [...g.keys()].find((f) => f.endsWith("/CeqPreviewer.tsx"));
    expect(previewer).toBeTruthy();
    expect((g.get(previewer!) ?? []).length).toBeGreaterThan(0);
  });

  test("type-only imports are treated as erased, or the check would be all false positives", () => {
    const g = runtimeGraph();
    const types = [...g.keys()].find((f) => f.endsWith("/canvas/types.ts"))!;
    // types.ts imports stitch-defs type-only; stitch-defs imports types type-only.
    expect((g.get(types) ?? []).some((d) => d.endsWith("/stitch-defs.ts"))).toBe(false);
  });
});

describe("source-pin tests are line-ending proof", () => {
  // WHY (Lee's landing session found this, 08-17): a source-pin test reads a .tsx
  // as raw text and asserts on multi-line snippets written with plain \n. Git
  // leaves CRLF on a Windows checkout, so those assertions failed against code
  // that was exactly right — the suite was RED on this machine and GREEN on
  // another, for the same commit. It cost a bad push to find.
  //
  // Every such test now normalises at read. This keeps it that way.
  test("every test that reads source normalises CRLF at read", () => {
    const dir = import.meta.dir;
    const offenders: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".test.ts")) continue;
      const src = readFileSync(join(dir, f), "utf8").split("\r\n").join("\n");
      if (!src.includes("readFileSync")) continue;
      // NO REGEX, and no escape literals. A test about an escaping bug is the
      // last place to depend on escaping surviving a shell, a script and a
      // replacement string — plain string scanning cannot be mangled.
      const TAIL = '"utf8")';
      for (const seg of src.split("readFileSync(").slice(1)) {
        const close = seg.indexOf(TAIL);
        if (close < 0) continue;                       // not a utf8 read
        const after = seg.slice(close + TAIL.length, close + TAIL.length + 10);
        if (!after.startsWith(".split(")) { offenders.push(f); break; }
      }
    }
    // Named, not counted — a failure should say which file to fix.
    expect(offenders).toEqual([]);
  });
});
