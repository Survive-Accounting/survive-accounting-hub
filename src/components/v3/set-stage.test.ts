import { describe, expect, test } from "bun:test";

import { isFilmedUnconfirmed, matchesFilter, postedCount, stageOf, stageRank, talkStageFromReview, type StageInput } from "./set-stage";
import type { SetPublishStatus } from "@/lib/publish-queue.functions";

const none: SetPublishStatus = {
  site: { postedAt: null, url: null }, youtube: { postedAt: null, url: null },
  instagram: { postedAt: null, url: null }, tiktok: { postedAt: null, url: null }, filmedAt: null,
};
const posted = (...keys: ("site" | "youtube" | "instagram" | "tiktok")[]): SetPublishStatus => ({
  ...none, ...Object.fromEntries(keys.map((k) => [k, { postedAt: "2026-09-06T00:00:00Z", url: null }])),
});

const base = (over: Partial<StageInput> = {}): StageInput => ({
  talk: talkStageFromReview(null), hasPlan: false, filmSeconds: 0, filmedAt: null, publish: null, ...over,
});

describe("talkStageFromReview — the queue's old switch, unchanged in meaning", () => {
  test("no session → not started, resume in the booth", () => {
    expect(talkStageFromReview(null)).toMatchObject({ stage: "not_started", label: "not started", next: "talkthrough" });
  });
  test("capturing → talking; stale keeps the 'session open' wording", () => {
    expect(talkStageFromReview("capturing")).toMatchObject({ stage: "talking", label: "talking" });
    expect(talkStageFromReview("stale")).toMatchObject({ stage: "talking", label: "session open", next: "talkthrough" });
  });
  test("queued/generating resume at Review", () => {
    expect(talkStageFromReview("queued")).toMatchObject({ stage: "generating", next: "results" });
    expect(talkStageFromReview("generating")).toMatchObject({ stage: "generating", label: "generating…", next: "results" });
  });
  test("ready → results ready at Review; error → review failed, back to the booth", () => {
    expect(talkStageFromReview("ready")).toMatchObject({ stage: "talked", label: "results ready", next: "results" });
    expect(talkStageFromReview("error")).toMatchObject({ stage: "talked", label: "review failed", next: "talkthrough" });
  });
  test("ended with nothing generated → talked", () => {
    expect(talkStageFromReview("idle")).toMatchObject({ stage: "talked", label: "talked", next: "talkthrough" });
  });
});

describe("stageOf — the later signals win", () => {
  test("nothing at all → the talk stage passes through", () => {
    expect(stageOf(base())).toMatchObject({ stage: "not_started", next: "talkthrough" });
    expect(stageOf(base({ talk: talkStageFromReview("ready") }))).toMatchObject({ stage: "talked", label: "results ready", next: "results" });
  });
  test("a saved plan → reviewed, resume at Film (even if the talk stage says less)", () => {
    expect(stageOf(base({ hasPlan: true }))).toMatchObject({ stage: "reviewed", label: "reviewed", next: "film" });
    expect(stageOf(base({ hasPlan: true, talk: talkStageFromReview("capturing") }))).toMatchObject({ stage: "reviewed" });
  });
  test("film timer ran, nobody confirmed → filmed but labelled 'filmed?'", () => {
    const r = stageOf(base({ hasPlan: true, filmSeconds: 90 }));
    expect(r).toMatchObject({ stage: "filmed", label: "filmed?", next: "post" });
    expect(isFilmedUnconfirmed(r)).toBe(true);
  });
  test("the manual flag wins over the timer — and over a missing plan", () => {
    const r = stageOf(base({ filmedAt: "2026-09-06T01:00:00Z" }));
    expect(r).toMatchObject({ stage: "filmed", label: "filmed", next: "post" });
    expect(isFilmedUnconfirmed(r)).toBe(false);
    expect(stageOf(base({ filmSeconds: 500, filmedAt: "2026-09-06T01:00:00Z" })).label).toBe("filmed");
  });
  test("any destination posted → posting with the count; all four → posted", () => {
    expect(stageOf(base({ publish: posted("site", "youtube") }))).toMatchObject({ stage: "posting", label: "posted 2/4", next: "post" });
    expect(stageOf(base({ publish: posted("site", "youtube", "instagram", "tiktok") }))).toMatchObject({ stage: "posted", label: "posted", next: "post" });
  });
  test("posting beats a bare filmed flag and the timer", () => {
    expect(stageOf(base({ filmedAt: "x", filmSeconds: 10, publish: posted("tiktok") })).stage).toBe("posting");
  });
  test("postedCount tolerates a null status", () => {
    expect(postedCount(null)).toBe(0);
    expect(postedCount(posted("site"))).toBe(1);
  });
});

describe("stageRank + matchesFilter — the Post ordering and chips", () => {
  test("ranks climb through the four steps", () => {
    const order = ["not_started", "talking", "talked", "generating", "reviewed", "filmed", "posting", "posted"] as const;
    for (let i = 1; i < order.length; i++) expect(stageRank(order[i])).toBeGreaterThan(stageRank(order[i - 1]));
  });
  test("ready = filmed or posting; in progress = before filmed; done = posted", () => {
    expect(matchesFilter("filmed", "ready")).toBe(true);
    expect(matchesFilter("posting", "ready")).toBe(true);
    expect(matchesFilter("posted", "ready")).toBe(false);
    expect(matchesFilter("reviewed", "ready")).toBe(false);
    expect(matchesFilter("reviewed", "progress")).toBe(true);
    expect(matchesFilter("not_started", "progress")).toBe(true);
    expect(matchesFilter("filmed", "progress")).toBe(false);
    expect(matchesFilter("posted", "done")).toBe(true);
    expect(matchesFilter("posting", "done")).toBe(false);
    expect(matchesFilter("talking", "all")).toBe(true);
  });
});
