// THE TDZ RATCHET — a rule that scans, instead of a list I remember to update.
//
// WHY THIS FILE EXISTS. tdz-hazards.test.ts names the files that had already
// crashed. That is a record of the past, not a guard: on 2026-09-01 the capture
// window died in `orientation-store.ts`, which had never crashed before and so
// was not on the list. Widening the list by hand to five files was the same
// mistake one size larger — 86 files under src/components/canvas carry the
// pattern, and a hand-kept list is always behind the code.
//
// THE RULE. Walk the real import graph out of the render-path entry points, and
// for every module in it, look for module-scope callables declared as
// `const f = () => …`. Those sit in a temporal dead zone until their module body
// runs, and a bundler may order that body after the render that calls them:
//
//     const f = () => …   dead zone until the module body reaches this line
//     function f() {}     hoisted — initialised before any code in the module
//
// A HARD ZERO would fail on 86 pre-existing files and get switched off within a
// day, so this is a RATCHET instead: the known violators are baselined, and the
// test fails when a NEW file joins them or a baselined file gets worse. Existing
// debt can only shrink. That is what makes it survive contact with real work.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const CANVAS = import.meta.dir;
const SRC = resolve(CANVAS, "..", "..");

/** The surfaces a render can start from. Anything they reach is in scope. */
const ENTRIES = ["CeqPreviewer.tsx", "CeqStudio.tsx"].map((f) => join(CANVAS, f));

const EXTS = [".ts", ".tsx"];

/** Read source with CRLF normalised — the house rule import-cycles.test.ts pins,
 *  so line endings can never change what a source-reading test sees. */
function readSrc(f: string): string {
  return readFileSync(f, "utf8").split("\r\n").join("\n");
}

/** Resolve one import specifier to a file on disk, or null if it's external. */
function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else return null; // node_modules / bare specifier
  for (const e of EXTS) if (existsSync(base + e)) return base + e;
  for (const e of EXTS) if (existsSync(join(base, "index" + e))) return join(base, "index" + e);
  return null;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;

/** Every module reachable from the entry points. */
function importGraph(): string[] {
  const seen = new Set<string>();
  const queue = [...ENTRIES];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    const src = readSrc(f);
    for (const m of src.matchAll(IMPORT_RE)) {
      const next = resolveImport(f, m[1]);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen].sort();
}

/** Module-scope `const NAME = (…) => …` / `= function` — a callable in a dead
 *  zone. Indented (in-component) declarations are out of scope here: those run
 *  after mount, and tdz-hazards.test.ts covers the render-time cases. */
function tdzCallables(src: string): string[] {
  return [...src.matchAll(/^(?:export )?const ([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)\s*(?::[^=]+)?=>|function\b|async\s*\()/gm)].map((m) => m[1]);
}

const rel = (f: string) => f.slice(SRC.length + 1).split("\\").join("/");

/** KNOWN DEBT, 2026-09-01. Files already carrying module-scope arrow callables
 *  when this ratchet went in. These may SHRINK — never grow, and no file may be
 *  added. When you empty one, drop its line and the ratchet tightens for good.
 *
 *  Regenerate the current numbers with:
 *    bun test src/components/canvas/tdz-graph.test.ts
 *  and read the failure message — it prints the exact line to change. */
const BASELINE: Record<string, number> = {
  "components/blastoff/found-on-exam.ts": 2,
  "components/blastoff/stage.tsx": 2,
  "components/canvas/CanvasSettingsContext.tsx": 1,
  // Arrived with the usage-telemetry work while this branch was open. Baselined,
  // not fixed — they are another session's files and this branch has no business
  // rewriting them. The ratchet's job here is to record the debt, not to block.
  "components/usage/UsageTelemetryProvider.tsx": 2,
  "lib/usage-elements.ts": 5,
  "lib/usage-telemetry.ts": 6,
  "components/canvas/CeqChainEditor.tsx": 2,
  "components/canvas/CeqStudio.tsx": 3,
  "components/canvas/CeqVideoLibrary.tsx": 3,
  "components/canvas/DecksContext.tsx": 2,
  "components/canvas/FrameNavContext.tsx": 2,
  "components/canvas/MemoLightbulb.tsx": 2,
  "components/canvas/PipelineStage.tsx": 2,
  "components/canvas/SpotlightContext.tsx": 1,
  "components/canvas/TrimDetail.tsx": 1,
  "components/canvas/account-registry.ts": 6,
  "components/canvas/arrows.ts": 4,
  "components/canvas/card-marks.ts": 2,
  "components/canvas/cards/BlastOffNodes.tsx": 1,
  "components/canvas/cards/CareersNode.tsx": 1,
  "components/canvas/cards/CycleNode.tsx": 4,
  "components/canvas/cards/FormulaCardNode.tsx": 2,
  "components/canvas/cards/OtherCards.tsx": 1,
  "components/canvas/cards/ScheduleCardNode.tsx": 1,
  "components/canvas/cards/UsersNode.tsx": 1,
  "components/canvas/cards/note-content.ts": 1,
  "components/canvas/careers-exhibit-config.ts": 7,
  "components/canvas/cash-accrual-config.ts": 6,
  "components/canvas/ceq-export.ts": 2,
  "components/canvas/ceq-takes.ts": 3,
  "components/canvas/ceq-walk.ts": 2,
  "components/canvas/classification-exhibit-config.ts": 11,
  "components/canvas/commands.ts": 1,
  "components/canvas/coverage-log.ts": 1,
  "components/canvas/cut-sequencer.ts": 2,
  "components/canvas/cycle-exhibit-config.ts": 1,
  "components/canvas/deck-defs.ts": 1,
  "components/canvas/edit-telemetry.ts": 10,
  "components/canvas/exhibit-cues.tsx": 2,
  "components/canvas/film-lock.ts": 1,
  "components/canvas/film-readiness.ts": 1,
  "components/canvas/film-runs.ts": 2,
  "components/canvas/film-slate.ts": 3,
  "components/canvas/frames.ts": 1,
  "components/canvas/idea-bank-sync.ts": 4,
  "components/canvas/idea-bank.ts": 5,
  "components/canvas/memo-kinds.ts": 1,
  "components/canvas/memo-scope.ts": 1,
  "components/canvas/mux-rates.ts": 4,
  "components/canvas/obs-bridge.ts": 1,
  "components/canvas/outline-snake.ts": 1,
  "components/canvas/platform-store.ts": 4,
  "components/canvas/scene-io.ts": 1,
  "components/canvas/script-doc.ts": 4,
  "components/canvas/sfx.ts": 1,
  "components/canvas/spotlight.ts": 2,
  "components/canvas/stage-elements.tsx": 1,
  "components/canvas/standards-exhibit-config.ts": 3,
  "components/canvas/stitch-defs.ts": 7,
  "components/canvas/takes-folder.ts": 1,
  "components/canvas/takes-store.ts": 10,
  "components/canvas/templates.ts": 2,
  "components/canvas/transcript-client.ts": 4,
  "components/canvas/types.ts": 3,
  "components/canvas/ui.tsx": 1,
  "components/canvas/users-exhibit-config.ts": 3,
  "lib/canvas.functions.ts": 3,
  "lib/edit-events.functions.ts": 1,
  "lib/idea-bank.functions.ts": 1,
  "lib/publish.functions.ts": 2,
  "lib/render-worker.functions.ts": 2,
  "lib/transcribe.functions.ts": 1,
};

describe("TDZ ratchet — the render-path import graph", () => {
  const graph = importGraph();

  test("the walker actually reaches the modules that have crashed", () => {
    // A resolver that silently returned nothing would make this whole file pass
    // while checking zero modules. Pin the three that have taken prod down.
    const names = graph.map(rel);
    expect(names).toContain("components/canvas/CeqPreviewer.tsx");
    expect(names).toContain("components/canvas/orientation-store.ts");
    expect(names).toContain("components/canvas/ceq-geom.ts");
    expect(graph.length).toBeGreaterThan(40);
  });

  test("the modules that crashed are clean and stay clean", () => {
    for (const f of ["orientation-store.ts", "orientation.ts", "film-camera.ts", "ceq-geom.ts", "CeqPreviewer.tsx", "exhibit-modes.tsx"]) {
      expect({ [f]: tdzCallables(readSrc(join(CANVAS, f))) }).toEqual({ [f]: [] });
    }
  });

  test("no NEW module-scope arrow callables on the render path", () => {
    const offenders: Record<string, number> = {};
    for (const f of graph) {
      const n = tdzCallables(readSrc(f)).length;
      if (n > 0) offenders[rel(f)] = n;
    }

    const added = Object.keys(offenders).filter((f) => !(f in BASELINE));
    const worse = Object.keys(offenders).filter((f) => f in BASELINE && offenders[f] > BASELINE[f]);

    // A helpful failure: print the exact baseline lines to paste.
    const report = [...added, ...worse]
      .sort()
      .map((f) => `  "${f}": ${offenders[f]},`)
      .join("\n");

    expect({ added, worse, paste: report ? "\n" + report : "" })
      .toEqual({ added: [], worse: [], paste: "" });
  });

  test("baselined debt only shrinks", () => {
    const stale: string[] = [];
    for (const [f, n] of Object.entries(BASELINE)) {
      const full = join(SRC, f);
      const now = existsSync(full) ? tdzCallables(readSrc(full)).length : 0;
      if (now < n) stale.push(`${f}: ${n} → ${now} (lower the baseline)`);
    }
    // Not a failure — debt going down is the point. Surface it so the baseline
    // gets tightened rather than drifting into fiction.
    if (stale.length) console.log("[tdz ratchet] debt reduced:\n  " + stale.join("\n  "));
    expect(true).toBe(true);
  });
});
