import { afterEach, describe, expect, test } from "bun:test";

import { newRun, reduceRun, type ProductionRun, type RunAction } from "./production-run";
import {
  defaultPostRun, earlierRunningSteps, iterateHref, parseProductionUi, postUsable, PRODUCTION_UI_EVENT, PRODUCTION_UI_KEY, PRODUCTION_UI_OPTIONS,
  readProductionUi, writeProductionUi,
} from "./production-ui";

// bun has no localStorage and no window; each test that needs one installs a stub and the
// afterEach removes it, so the "no storage at all" cases run against the real bare global.
type G = { localStorage?: unknown; window?: unknown };
const g = globalThis as G;
afterEach(() => { delete g.localStorage; delete g.window; });

function stubStorage(store: Record<string, string>, opts: { throws?: boolean } = {}): void {
  g.localStorage = {
    getItem(k: string) { if (opts.throws) throw new Error("SecurityError"); return k in store ? store[k] : null; },
    setItem(k: string, v: string) { if (opts.throws) throw new Error("QuotaExceededError"); store[k] = v; },
  };
}
function stubWindow(): Event[] {
  const events: Event[] = [];
  g.window = { dispatchEvent(e: Event) { events.push(e); return true; } };
  return events;
}

describe("parseProductionUi", () => {
  test("the three words round-trip", () => {
    expect(parseProductionUi("full")).toBe("full");
    expect(parseProductionUi("quiet")).toBe("quiet");
    expect(parseProductionUi("off")).toBe("off");
  });
  test("anything else is quiet — the default, never a louder mode by accident", () => {
    expect(parseProductionUi(null)).toBe("quiet");
    expect(parseProductionUi("")).toBe("quiet");
    expect(parseProductionUi("loud")).toBe("quiet");
    expect(parseProductionUi("FULL")).toBe("quiet");
    expect(parseProductionUi(" off")).toBe("quiet");
  });
  test("the radio lists exactly the three, full → quiet → off, with the spec's copy", () => {
    expect(PRODUCTION_UI_OPTIONS.map((o) => o.value)).toEqual(["full", "quiet", "off"]);
    expect(PRODUCTION_UI_OPTIONS.map((o) => o.label)).toEqual(["Full (ask at every step)", "Quiet (time silently)", "Off (no timing)"]);
  });
});

describe("readProductionUi", () => {
  test("no storage at all (SSR, a private window that throws) → quiet", () => {
    expect(readProductionUi()).toBe("quiet");
    stubStorage({}, { throws: true });
    expect(readProductionUi()).toBe("quiet");
  });
  test("reads the key, defended", () => {
    const store: Record<string, string> = {};
    stubStorage(store);
    expect(readProductionUi()).toBe("quiet");
    store[PRODUCTION_UI_KEY] = "off";
    expect(readProductionUi()).toBe("off");
    store[PRODUCTION_UI_KEY] = "banana";
    expect(readProductionUi()).toBe("quiet");
  });
});

describe("writeProductionUi", () => {
  test("stores the word under the key and tells the window", () => {
    const store: Record<string, string> = {};
    stubStorage(store);
    const events = stubWindow();
    writeProductionUi("full");
    expect(store[PRODUCTION_UI_KEY]).toBe("full");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(PRODUCTION_UI_EVENT);
    expect((events[0] as CustomEvent<string>).detail).toBe("full");
  });
  test("a browser that refuses storage still gets the event — the change holds until reload", () => {
    stubStorage({}, { throws: true });
    const events = stubWindow();
    expect(() => writeProductionUi("off")).not.toThrow();
    expect((events[0] as CustomEvent<string>).detail).toBe("off");
  });
  test("no window (a test, SSR) → stores and stays quiet about it", () => {
    const store: Record<string, string> = {};
    stubStorage(store);
    expect(() => writeProductionUi("quiet")).not.toThrow();
    expect(store[PRODUCTION_UI_KEY]).toBe("quiet");
  });
});

describe("iterateHref", () => {
  test("a set page links to that set's Step 5; Arrange counts as the set's Editor", () => {
    expect(iterateHref("/v3/easy-points/internal-vs-external-users/blast-off/results")).toBe("/v3/easy-points/internal-vs-external-users/blast-off/improve");
    expect(iterateHref("/v3/easy-points/internal-vs-external-users/blast-off/film")).toBe("/v3/easy-points/internal-vs-external-users/blast-off/improve");
    expect(iterateHref("/v3/easy-points/internal-vs-external-users/blast-off/arrange")).toBe("/v3/easy-points/internal-vs-external-users/blast-off/improve");
    expect(iterateHref("/v3/easy-points/internal-vs-external-users/blast-off/improve")).toBe("/v3/easy-points/internal-vs-external-users/blast-off/improve");
  });
  test("no set in the URL → the cross-set report", () => {
    expect(iterateHref("/v3/post")).toBe("/admin/production");
    expect(iterateHref("/v3")).toBe("/admin/production");
    expect(iterateHref("/v3/easy-points")).toBe("/admin/production");
    expect(iterateHref("/admin/ideas")).toBe("/admin/production");
  });
});

// ------------------------------------------------------------------ quiet mode's run rules

const T0 = new Date("2026-09-09T10:00:00.000Z");
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);
const fresh = (id: string, startedAt = T0): ProductionRun =>
  newRun({ id, setId: `set-${id}`, setName: `Set ${id}`, topicSlug: "ch1", topicName: "Chapter 1", setSlug: `set-${id}`, now: startedAt });
const play = (run: ProductionRun, script: [RunAction, number][]): ProductionRun => script.reduce((r, [a, s]) => reduceRun(r, a, at(s)), run);
/** A run that filmed and finished filming `endAt` seconds after T0, Cross-post still pending. */
const filmed = (id: string, endAt: number): ProductionRun =>
  play(fresh(id), [[{ type: "startStep", step: "film" }, endAt - 60], [{ type: "finishStep", step: "film", note: null }, endAt]]);

describe("defaultPostRun — which set is this for, without asking", () => {
  test("nothing waiting → null (nothing starts)", () => {
    expect(defaultPostRun([])).toBeNull();
    const done = play(filmed("a", 100), [[{ type: "startStep", step: "post" }, 200]]); // post already running
    expect(defaultPostRun([done])).toBeNull();
  });
  test("the most recently FILMED run wins, whatever order the server sent them in", () => {
    const early = filmed("a", 100), late = filmed("b", 900), mid = filmed("c", 500);
    expect(defaultPostRun([early, late, mid])?.id).toBe("b");
    expect(defaultPostRun([late, early, mid])?.id).toBe("b");
  });
  test("a run that never filmed falls back to when it started; done and abandoned runs are ignored", () => {
    const neverFilmed = fresh("n", at(2000)); // started after everyone filmed, never filmed
    expect(defaultPostRun([filmed("a", 900), neverFilmed])?.id).toBe("n");
    const abandoned = reduceRun(filmed("z", 5000), { type: "abandon" }, at(6000));
    expect(abandoned.status).toBe("abandoned");
    expect(defaultPostRun([filmed("a", 900), abandoned])?.id).toBe("a");
  });
});

describe("postUsable — the run in hand that /v3/post can time", () => {
  test("running with Cross-post pending or running: yes", () => {
    expect(postUsable(filmed("a", 100))).toBe(true);
    expect(postUsable(play(filmed("a", 100), [[{ type: "startStep", step: "post" }, 200]]))).toBe(true);
  });
  test("no run, a finished run, or Cross-post already decided: no — pick another", () => {
    expect(postUsable(null)).toBe(false);
    expect(postUsable(undefined)).toBe(false);
    expect(postUsable(reduceRun(filmed("a", 100), { type: "abandon" }, at(200)))).toBe(false);
    expect(postUsable(play(filmed("a", 100), [[{ type: "skipStep", step: "post" }, 200]]))).toBe(false);
  });
});

describe("earlierRunningSteps — what landing on a later step finishes silently", () => {
  test("only the steps BEFORE the landed one, only the running ones, in run order", () => {
    const r = play(fresh("a"), [[{ type: "startStep", step: "talkthrough" }, 0], [{ type: "startStep", step: "results" }, 10]]);
    expect(earlierRunningSteps(r, "film")).toEqual(["talkthrough", "results"]);
    expect(earlierRunningSteps(r, "post")).toEqual(["talkthrough", "results"]);
    expect(earlierRunningSteps(r, "results")).toEqual(["talkthrough"]);
    expect(earlierRunningSteps(r, "talkthrough")).toEqual([]);
  });
  test("a later step running is left alone — going back never finishes forward", () => {
    const r = play(fresh("a"), [[{ type: "startStep", step: "film" }, 0]]);
    expect(earlierRunningSteps(r, "results")).toEqual([]);
    expect(earlierRunningSteps(r, "post")).toEqual(["film"]);
  });
  test("done and skipped steps are not 'running'", () => {
    const r = play(fresh("a"), [[{ type: "skipStep", step: "talkthrough" }, 0], [{ type: "startStep", step: "results" }, 1], [{ type: "finishStep", step: "results", note: null }, 50]]);
    expect(earlierRunningSteps(r, "post")).toEqual([]);
  });
});
