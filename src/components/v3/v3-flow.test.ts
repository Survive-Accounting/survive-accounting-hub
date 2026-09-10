// THE FLOW BETWEEN THE BLAST OFF STEPS — source pins on the route files, because the three
// things Lee asked for on 2026-09-09 are all "where does this land":
//   (1) /blast-off is a redirect into the Editor, so Escape from /film is one key back to the
//       deck instead of a bounce through a menu of the same five doors the StepBar already draws;
//   (2) ending a brainstorm lands on THIS set's Suggestions, not the next set's Brainstorm;
//   (3) the pre-flight numbers moved into the Editor, folded and mounted only when opened.
// Pins, not a router harness: each is a line a well-meaning refactor could quietly undo.
//
// WHY it lives here and not in src/routes: every file in src/routes is a page as far as the
// site-qa manifest coverage test is concerned (lib/site-qa/manifest.coverage.test.ts fails on any
// file there that no QA template owns and IGNORED_ROUTES doesn't name), so a test beside the
// routes turns that suite red. The V3 tests live next to StepBar instead.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

// Line-ending proof (import-cycles.test.ts, "source-pin tests are line-ending proof"): git
// leaves CRLF on this Windows checkout, so every multi-line snippet below is matched against \n.
function src(rel: string): string {
  return readFileSync(join(import.meta.dir, rel), "utf8").split("\r\n").join("\n");
}
function route(name: string): string {
  return src(`../../routes/${name}`);
}

const index = route("v3.$topic.$set.blast-off.index.tsx");
const results = route("v3.$topic.$set.blast-off.results.tsx");
const talk = route("v3.$topic.$set.blast-off.talkthrough.tsx");
const film = route("v3.$topic.$set.blast-off.film.tsx");
const setIndex = route("v3.$topic.$set.index.tsx");
const capture = src("../blastoff/BlastOffCapture.tsx");
const stepBar = src("./StepBar.tsx");

describe("/blast-off is a redirect into the Editor", () => {
  test("beforeLoad throws a redirect to /results — the shape blast-off.arrange.tsx set", () => {
    expect(index).toContain("beforeLoad");
    expect(index).toContain("throw redirect({");
    expect(index).toContain('to: "/v3/$topic/$set/blast-off/results"');
  });
  test("replace, not push — browser back never bounces through the redirect", () => {
    expect(index).toContain("replace: true");
  });
  test("the search rides along, so ?frame=<id> survives the hop", () => {
    expect(index).toMatch(/redirect\(\{[^}]*\bsearch\b[^}]*\}\)/);
  });
  test("no menu is left behind it — the doors and the stat block are gone from the route", () => {
    expect(index).not.toContain("<Door");
    expect(index).not.toContain("<FilmPreflight");
    expect(index).not.toContain("function FilmPreflight");
    expect(index).not.toContain("STEPS.map");
    expect(index).not.toContain("component:");
  });
  // WHY the redirect is what makes Escape land on the Editor: /film's exit is the bare
  // blastOffPath(topic, set) — this route — and BlastOffCapture binds Escape to onExit. Neither
  // is changed; the redirect does the work. If either moves, the bounce comes back.
  test("Escape on /film exits to /blast-off, which is now the Editor", () => {
    expect(film).toContain("navigate({ to: blastOffPath(topic, set) })");
    expect(capture).toMatch(/e\.key === "Escape"\) \{ e\.preventDefault\(\); onExit\(\); \}/);
  });
});

describe("ending a brainstorm lands on this set's Suggestions", () => {
  const onGo = talk.slice(talk.indexOf("onGo={"), talk.indexOf("/>", talk.indexOf("onGo={")));
  test("PreFlight's onGo navigates to blastOffPath(topic, set, \"suggestions\")", () => {
    expect(onGo).toContain('blastOffPath(topic, set, "suggestions")');
  });
  test("and no longer to the next set's Brainstorm (the dock's Review ↗ covers the batch case)", () => {
    expect(onGo).not.toContain("nextSetAfter(");
    expect(onGo).not.toContain("next.set");
    expect(talk).not.toContain("nextSetAfter");
    expect(talk).not.toContain('"talkthrough") : "/v3"');
  });
  test("the review is still queued before leaving — the board fills in behind the navigation", () => {
    expect(onGo.indexOf("queueIncrementalReview(")).toBeGreaterThan(-1);
    expect(onGo.indexOf("queueIncrementalReview(")).toBeLessThan(onGo.indexOf("navigate("));
  });
});

describe("the pre-flight numbers fold into the Editor", () => {
  test("a <details> titled Pre-flight, next to the transcript fold", () => {
    expect(results).toMatch(/<summary[^>]*>\s*Pre-flight\s*<\/summary>/);
    expect(results).toContain("Transcript &amp; AI board");
    expect(results.indexOf("Pre-flight")).toBeLessThan(results.indexOf("Transcript &amp; AI board"));
  });
  test("closed by default, and the readout is mounted only while it is open", () => {
    expect(results).toContain("const [preflightOpen, setPreflightOpen] = useState(false)");
    expect(results).toContain("onToggle={(e) => setPreflightOpen(e.currentTarget.open)}");
    expect(results).toContain("{preflightOpen && <FilmPreflight set={set} />}");
    expect(results).not.toContain("<details open");
  });
  test("the same numbers the menu showed, from the same counters, plus the length estimate", () => {
    const body = results.slice(results.indexOf("function FilmPreflight("));
    expect(body).toContain("usePlan(set)");
    expect(body).toContain("listIllustrationLibrary({ data: { setId: set.id } })");
    expect(body).toContain("slideCounts(plan.frames)");
    for (const label of ["Slides", "Questions", "Memorize this", "Cheat code", "Deep question", "Illustrations"]) {
      expect(body).toContain(`stat("${label}"`);
    }
    expect(body).toContain("Production cost so far");
    expect(body).toContain("fmtRange(range)");
  });
});

describe("what this flow change must NOT move", () => {
  // The ids are load-bearing: production-time.ts's runStepFromPath and blastOffPath both spell
  // URLs from them. Labels may change (they have, four times); the ids and their order may not.
  test("StepBar's STEPS are the same five ids in the same order", () => {
    const ids = [...stepBar.matchAll(/\{ step: "([a-z]+)", n: (\d),/g)].map((m) => [m[1], Number(m[2])] as const);
    expect(ids).toEqual([["talkthrough", 1], ["results", 2], ["film", 3], ["post", 4], ["improve", 5]]);
  });
  // /v3/$topic/$set stays a page: its TemplatePicker is the one place plan.layout is chosen.
  test("the set screen still mounts the TemplatePicker (it writes plan.layout)", () => {
    expect(setIndex).toContain("<TemplatePicker set={set} />");
    expect(setIndex).toContain("setLayout(");
    expect(setIndex).not.toContain("beforeLoad");
  });
});
