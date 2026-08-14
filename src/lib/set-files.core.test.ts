// SET FILES — split/extract/merge laws. The fixture mirrors the REAL live shape
// (from the 2026-08-13 recon of "Start Here Course"): ceq nodes with data.deckId
// membership, tucked legacy orphans WITHOUT deckId, memo nodes referenced via
// choice chains, frames as parents, clip stacks in data.takes.
import { describe, expect, test } from "bun:test";

import { chainMemoIds, extractSetJson, memberCards, mergePool, setHash, splitLibraryScene, type SceneJsonLike } from "./set-files.core";

const ceq = (id: string, deckId: string | undefined, extra: Record<string, unknown> = {}) => ({
  id,
  type: "ceq",
  parentId: extra.parentId as string | undefined,
  position: { x: 1, y: 2 },
  data: { kind: "ceq", prompt: `stem ${id}`, deckId, deckMember: true, tucked: true, deckPos: { x: 520, y: 210 }, choices: [], ...extra },
});

const memo = (id: string) => ({ id, type: "memo", position: { x: 0, y: 0 }, data: { kind: "memo", title: id } });

const FIXTURE: SceneJsonLike = {
  schema_version: 5,
  decks: [
    { id: "deck-a", name: "Set A", payloadType: "cards", status: "draft", topicId: "t1" },
    { id: "deck-b", name: "Set B", payloadType: "cards", status: "live", topicId: "t2" },
    { id: "deck-memos", name: "memo dump", payloadType: "memos" }, // non-cards → not a set
  ],
  nodes: [
    ceq("q1", "deck-a", { takes: [{ takeId: "tk-1", type: "hook" }], choices: [{ id: "c1", text: "x", correct: true, chain: [{ kind: "memo", memoNodeId: "m-shared", label: "L" }] }] }),
    ceq("q2", "deck-a", { parentId: "frame-1" }),
    ceq("q3", "deck-b", { choices: [{ id: "c2", text: "y", chain: [{ kind: "memo", memoNodeId: "m-shared" }, { kind: "memo", memoNodeId: "m-b-only" }] }] }),
    ceq("q-orphan", undefined, {}), // legacy tucked card, no deckId → archive only
    memo("m-shared"),
    memo("m-b-only"),
    memo("m-loose"), // referenced by nobody → workspace inventory
    { id: "frame-1", type: "frame", position: { x: 0, y: 0 }, data: { kind: "frame" } },
    { id: "lesson-1", type: "lesson", position: { x: 0, y: 0 }, data: { kind: "lesson" } },
  ],
  edges: [
    { id: "e1", source: "m-shared", target: "q1" }, // internal to set A
    { id: "e2", source: "m-b-only", target: "q3" }, // internal to set B
    { id: "e3", source: "lesson-1", target: "frame-1" }, // canvas-only → no set file
  ],
  ceqSets: [{ id: "factory-1" }],
  sceneSettings: { courseId: "course-1", sfx: true },
};

describe("memberCards / chainMemoIds", () => {
  test("membership is data.deckId, nothing else", () => {
    expect(memberCards("deck-a", FIXTURE.nodes!).map((n) => n.id)).toEqual(["q1", "q2"]);
    expect(memberCards("deck-b", FIXTURE.nodes!).map((n) => n.id)).toEqual(["q3"]);
  });
  test("chain memo ids collected across choices", () => {
    expect([...chainMemoIds(FIXTURE.nodes![2])]).toEqual(["m-shared", "m-b-only"]);
  });
});

describe("extractSetJson", () => {
  const a = extractSetJson(FIXTURE.decks![0], FIXTURE.nodes!, FIXTURE.edges!);
  test("cards + referenced memos only, ids verbatim", () => {
    expect(a.nodes.map((n) => n.id).sort()).toEqual(["m-shared", "q1", "q2"]);
    expect(a.decks[0].id).toBe("deck-a");
  });
  test("MARKERS RESOLVE: clip stacks + choice/chain ids survive byte-identical", () => {
    const q1 = a.nodes.find((n) => n.id === "q1")!;
    const d = q1.data as Record<string, unknown>;
    expect(d.takes).toEqual([{ takeId: "tk-1", type: "hook" }]);
    const chain = (d.choices as { id: string; chain?: { memoNodeId: string }[] }[])[0];
    expect(chain.id).toBe("c1");
    expect(chain.chain![0].memoNodeId).toBe("m-shared");
  });
  test("parentId stripped; position falls back to deckPos", () => {
    const q2 = a.nodes.find((n) => n.id === "q2")!;
    expect("parentId" in q2).toBe(false);
    expect(q2.position).toEqual({ x: 520, y: 210 });
  });
  test("only fully-internal edges ride along", () => {
    expect(a.edges.map((e) => e.id)).toEqual(["e1"]);
  });
});

describe("splitLibraryScene", () => {
  const plan = splitLibraryScene(FIXTURE);
  test("one set file per cards-deck; memo deck excluded", () => {
    expect(plan.setFiles.map((f) => f.name)).toEqual(["Set A", "Set B"]);
    expect(plan.stats).toEqual({ sets: 2, cards: 3, memosCopied: 3, orphanCards: 1 }); // m-shared rides in BOTH sets
  });
  test("archive keeps every original node and is only marked", () => {
    expect(plan.archiveJson.archived).toBe(true);
    expect(plan.archiveJson.nodes!.length).toBe(FIXTURE.nodes!.length);
  });
  test("workspace holds loose memos + settings + factories", () => {
    expect(plan.workspaceJson.nodes!.map((n) => n.id)).toEqual(["m-loose"]);
    expect(plan.workspaceJson.sceneSettings).toEqual(FIXTURE.sceneSettings!);
    expect(plan.workspaceJson.ceqSets).toEqual(FIXTURE.ceqSets!);
  });
});

describe("mergePool", () => {
  const plan = splitLibraryScene(FIXTURE);
  test("round-trip: split → merge rebuilds every set card + memo + deck", () => {
    const pool = mergePool([...plan.setFiles.map((f) => ({ json: f.json as SceneJsonLike })), { json: plan.workspaceJson }]);
    expect(pool.nodes.map((n) => n.id).sort()).toEqual(["m-b-only", "m-loose", "m-shared", "q1", "q2", "q3"]);
    expect(pool.decks.map((d) => d.id)).toEqual(["deck-a", "deck-b"]);
    expect(pool.sceneSettings).toEqual(FIXTURE.sceneSettings!);
    expect(pool.ceqSets).toEqual(FIXTURE.ceqSets!);
  });
  test("shared memo dedupes last-write-wins (newest row last)", () => {
    const older = { json: { setFile: true as const, schema_version: 5, decks: [{ id: "d1", name: "x" }] as [any], nodes: [{ ...memo("m-shared"), data: { title: "old" } }], edges: [] } };
    const newer = { json: { setFile: true as const, schema_version: 5, decks: [{ id: "d2", name: "y" }] as [any], nodes: [{ ...memo("m-shared"), data: { title: "new" } }], edges: [] } };
    const pool = mergePool([older, newer]);
    expect(pool.nodes).toHaveLength(1);
    expect((pool.nodes[0].data as { title: string }).title).toBe("new");
  });
});

describe("setHash", () => {
  test("stable for same content, moves on any change", () => {
    const a = extractSetJson(FIXTURE.decks![0], FIXTURE.nodes!, FIXTURE.edges!);
    const b = extractSetJson(FIXTURE.decks![0], FIXTURE.nodes!, FIXTURE.edges!);
    expect(setHash(a)).toBe(setHash(b));
    const mutated = { ...a, nodes: a.nodes.map((n) => (n.id === "q1" ? { ...n, data: { ...(n.data as object), prompt: "edited" } } : n)) };
    expect(setHash(mutated as never)).not.toBe(setHash(a));
  });
});
