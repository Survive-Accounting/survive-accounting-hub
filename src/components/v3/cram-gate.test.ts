import { describe, expect, test } from "bun:test";

import { cramPathGate, videoKeys } from "./cram-gate";

const takes = { a: [{ headId: "h1", name: "Assets" }, { headId: "h2", name: "Liabilities" }], b: [], off: [] } as Record<string, { headId: string; name: string }[]>;
const takesOf = (id: string) => takes[id] ?? [];
const topic = [{ id: "a" }, { id: "b" }, { id: "off", lane: "offshoot", branchFrom: "a" }, { id: "pitch", lane: "pitch", branchFrom: "a" }];

describe("videoKeys", () => {
  test("one video = the set id; splits = id, id#2, id#3", () => {
    expect(videoKeys("b", [])).toEqual(["b"]);
    expect(videoKeys("b", [{ headId: "x", name: "" }])).toEqual(["b"]);
    expect(videoKeys("a", takes.a)).toEqual(["a", "a#2"]);
  });
});

describe("cramPathGate", () => {
  test("a cram set is never gated", () => {
    expect(cramPathGate({ set: { id: "a" }, topicSets: topic, takesOf, publish: {} })).toBeNull();
  });
  test("an offshoot is gated until every cram video in the topic is filmed", () => {
    const g = cramPathGate({ set: topic[2], topicSets: topic, takesOf, publish: { a: { filmedAt: "t" } } });
    expect(g).toEqual({ done: 1, total: 3, reason: "Cram path first — 1 of 3 cram videos in this topic are filmed." });
  });
  test("a pitch too; and the door opens when the path is filmed end to end", () => {
    const publish = { a: { filmedAt: "t" }, "a#2": { filmedAt: "t" }, b: { filmedAt: "t" } };
    expect(cramPathGate({ set: topic[3], topicSets: topic, takesOf, publish })).toBeNull();
    expect(cramPathGate({ set: topic[2], topicSets: topic, takesOf, publish: { ...publish, b: { filmedAt: null } } })?.done).toBe(2);
  });
  test("a topic with no cram videos gates nothing", () => {
    expect(cramPathGate({ set: { id: "x", lane: "offshoot" }, topicSets: [{ id: "x", lane: "offshoot" }], takesOf, publish: {} })).toBeNull();
  });
});
