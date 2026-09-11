// Topic Complete / Up Next derive everything from the bank — pinned here so the charge bar can
// never disagree with the map and the next topic is never a strategy short.
import { describe, expect, test } from "bun:test";

import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

import { TOPIC_DONE_COPY, UP_NEXT_DEMO, UP_NEXT_EVERY_MS, demoIndexAt, examTopics, topicProgress, upNextFor } from "./end-of-topic";

const set = (id: string): BoothSetInfo => ({ id, name: `Set ${id}`, ceqs: [], liveCount: 0, draftCount: 0 });
const bank: BoothTopic[] = [
  { id: "t1", name: "Easy Points", number: 1, sets: [set("a"), set("b")] },
  { id: "s", name: "Strategy", number: null, sets: [set("st")], kind: "strategy" },
  { id: "t2", name: "Recording Journal Entries", number: 2, sets: [set("c")] },
  { id: "t3", name: "Adjusting Entries", number: 3, sets: [set("d"), set("e")] },
];

describe("the end-of-topic frames' data", () => {
  test("the exam is every non-strategy topic, in bank order", () => {
    expect(examTopics(bank).map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  test("topic progress: X of Y over exam topics, null off the bank or on a strategy set", () => {
    expect(topicProgress(bank, "b")).toMatchObject({ done: 1, total: 3 });
    expect(topicProgress(bank, "b")!.topic.name).toBe("Easy Points");
    expect(topicProgress(bank, "c")).toMatchObject({ done: 2, total: 3 });
    expect(topicProgress(bank, "e")).toMatchObject({ done: 3, total: 3 });
    expect(topicProgress(bank, "st")).toBeNull();
    expect(topicProgress(bank, "nope")).toBeNull();
    expect(TOPIC_DONE_COPY.note(2, 3)).toBe("2 of 3 topics charged");
  });

  test("up next skips strategy topics and is null after the last set", () => {
    expect(upNextFor(bank, "b")!.topic.name).toBe("Recording Journal Entries");
    expect(upNextFor(bank, "b")!.set.id).toBe("c");
    expect(upNextFor(bank, "a")!.topic.id).toBe("t1");         // mid-topic: the same topic, honestly
    expect(upNextFor(bank, "e")).toBeNull();
    expect(upNextFor(bank, "st")).toBeNull();
  });

  test("the demo cycles borrow → supplies → services → rent every ~3 s", () => {
    expect(UP_NEXT_DEMO.map((p) => p.id)).toEqual(["borrow", "supplies", "services", "rent"]);
    expect(demoIndexAt(0)).toBe(0);
    expect(demoIndexAt(UP_NEXT_EVERY_MS - 1)).toBe(0);
    expect(demoIndexAt(UP_NEXT_EVERY_MS)).toBe(1);
    expect(demoIndexAt(UP_NEXT_EVERY_MS * 4)).toBe(0);
    expect(demoIndexAt(-5)).toBe(0);
  });
});
