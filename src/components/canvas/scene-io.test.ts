// Regression test for the S2.0 group-drag bug: scenes must never round-trip
// multi-selection (React Flow drags ALL selected nodes as a group, so two
// cards saved selected reload as a drag-group).
import { describe, expect, test } from "bun:test";

import { migrateCheckToCram, migrateDeckFields, migrateEdges, migrateElementDeckFields, migrateIntroCards, sanitizeSceneNodes } from "./scene-io";

describe("migrateCheckToCram (Phase 7 beat rename, migrate-on-load)", () => {
  test("frame beat:'check' → 'cram'; other frames + non-frames untouched", () => {
    const nodes = [
      { id: "L1", type: "lesson", data: { label: "Intro" } },
      { id: "f1", type: "frame", parentId: "L1", data: { beat: "check", subIndex: 0, title: "Recap" } },
      { id: "f2", type: "frame", parentId: "L1", data: { beat: "teach", subIndex: 0 } },
      { id: "c1", type: "je", parentId: "f1", data: { kind: "je" } },
    ];
    const out = migrateCheckToCram(nodes);
    expect((out.find((n) => n.id === "f1")!.data as { beat: string }).beat).toBe("cram");
    expect((out.find((n) => n.id === "f2")!.data as { beat: string }).beat).toBe("teach");
    // non-frame + title preserved
    expect((out.find((n) => n.id === "f1")!.data as { title: string }).title).toBe("Recap");
    expect(out.find((n) => n.id === "c1")!.data).toEqual({ kind: "je" });
  });

  test("idempotent — a scene with no legacy 'check' is returned unchanged (same ref)", () => {
    const nodes = [{ id: "f", type: "frame", data: { beat: "cram", subIndex: 0 } }];
    expect(migrateCheckToCram(nodes)).toBe(nodes);
  });
});

describe("migrateIntroCards", () => {
  const scene = () => [
    { id: "L1", type: "lesson", position: { x: 0, y: 0 }, data: { label: "Ch 1", pathOrder: 1 } },
    { id: "L2", type: "lesson", position: { x: 0, y: 0 }, data: { label: "Ch 2", pathOrder: 2 } },
    { id: "L1-h0", type: "frame", parentId: "L1", position: { x: 0, y: 0 }, data: { beat: "hook", subIndex: 0 } },
    { id: "L1-h1", type: "frame", parentId: "L1", position: { x: 0, y: 0 }, data: { beat: "hook", subIndex: 1 } },
    { id: "L2-h0", type: "frame", parentId: "L2", position: { x: 0, y: 0 }, data: { beat: "hook", subIndex: 1 } },
  ];

  test("seeds a title heading in Hook-1 and an outline list in Hook-2, marking frames introSeeded", () => {
    const out = migrateIntroCards(scene());
    const heading = out.find((n) => n.type === "heading" && n.parentId === "L1-h0");
    expect((heading!.data as { text: string }).text).toBe("Ch 1");
    const list = out.find((n) => n.type === "list" && n.parentId === "L1-h1");
    const rows = (list!.data as { rows: { text: string; youAreHere?: boolean }[] }).rows;
    expect(rows.map((r) => r.text)).toEqual(["Ch 1", "Ch 2"]);
    expect(rows.find((r) => r.youAreHere)!.text).toBe("Ch 1");
    expect(out.find((n) => n.id === "L1-h0")!.data.introSeeded).toBe(true);
  });

  test("idempotent — a second pass adds nothing", () => {
    const first = migrateIntroCards(scene());
    const second = migrateIntroCards(first);
    expect(second.length).toBe(first.length);
  });

  test("never adds a duplicate when a heading/list already exists", () => {
    const withCards = [
      ...scene(),
      { id: "own-h", type: "heading", parentId: "L1-h0", position: { x: 0, y: 0 }, data: { kind: "heading", text: "mine" } },
    ];
    const out = migrateIntroCards(withCards);
    expect(out.filter((n) => n.type === "heading" && n.parentId === "L1-h0").length).toBe(1);
  });
});

const isElement = (k: string | undefined) => k === "heading" || k === "text" || k === "paygate" || k === "signupgate";

describe("sanitizeSceneNodes", () => {
  test("strips selected from every node — no multi-select group survives a save/load", () => {
    const nodes = [
      { id: "je-1", selected: true, data: { kind: "je" } },
      { id: "je-2", selected: true, data: { kind: "je" } },
      { id: "note-1", selected: false, data: { kind: "note" } },
    ];
    const out = sanitizeSceneNodes(nodes);
    expect(out.every((n) => !("selected" in n))).toBe(true);
    expect(out.map((n) => n.id)).toEqual(["je-1", "je-2", "note-1"]);
  });

  test("strips dragging and every _transient data key, keeps real data", () => {
    const out = sanitizeSceneNodes([
      { id: "a", dragging: true, data: { kind: "je", caption: "keep me", _arrowPending: true, _selLine: "l-3" } },
    ]);
    expect("dragging" in out[0]).toBe(false);
    expect(out[0].data).toEqual({ kind: "je", caption: "keep me" });
  });

  test("legacy staged/minimized migrate to deckMember+tucked; v2 nodes untouched", () => {
    const out = migrateDeckFields([
      { data: { kind: "je", staged: true, stageOrder: 3 } },
      { data: { kind: "note", minimized: true } },
      { data: { kind: "list", deckMember: true, tucked: false } },
      { data: { kind: "ceq" } },
    ]);
    expect(out[0].data).toEqual({ kind: "je", deckMember: true, tucked: true, stageOrder: 3 });
    expect(out[1].data).toEqual({ kind: "note", deckMember: true, tucked: true });
    expect(out[2].data).toEqual({ kind: "list", deckMember: true, tucked: false });
    expect(out[3].data).toEqual({ kind: "ceq" });
  });

  test("elements silently lose old deck membership; cards keep theirs", () => {
    const out = migrateElementDeckFields(
      [
        { data: { kind: "heading", text: "Welcome", deckMember: true, tucked: true, stageOrder: 2 } },
        { data: { kind: "je", deckMember: true, tucked: true } },
        { data: { kind: "heading", text: "clean" } },
      ],
      isElement,
    );
    expect(out[0].data).toEqual({ kind: "heading", text: "Welcome" }); // membership gone, revealed
    expect(out[1].data).toEqual({ kind: "je", deckMember: true, tucked: true }); // cards untouched
    expect(out[2].data).toEqual({ kind: "heading", text: "clean" });
  });

  test("old handle-less edges get the legacy right→left anchors + smoothstep", () => {
    const out = migrateEdges([
      { id: "e1", source: "a", target: "b" } as never,
      { id: "e2", source: "a", target: "b", sourceHandle: "t", targetHandle: "b", type: "smoothstep" } as never,
    ]);
    expect(out[0]).toMatchObject({ sourceHandle: "r", targetHandle: "l", type: "smoothstep" });
    expect(out[1]).toMatchObject({ sourceHandle: "t", targetHandle: "b" }); // already-migrated untouched
  });

  test("position/parentId/zIndex survive untouched", () => {
    const out = sanitizeSceneNodes([
      { id: "a", selected: true, position: { x: 5, y: 7 }, parentId: "zone-1", zIndex: 12, data: {} } as never,
    ]);
    expect(out[0]).toEqual({ id: "a", position: { x: 5, y: 7 }, parentId: "zone-1", zIndex: 12, data: {} } as never);
  });
});

// ---- PROMPT A: edge visual stamps + JE memo schema migration ----

import { migrateJeMemos } from "./scene-io";

describe("migrateEdges (arrow visual contract)", () => {
  test("stamps style + arrowhead marker on RF auto-added bare edges", () => {
    const [e] = migrateEdges([{ id: "xy-edge__a-b", source: "a", target: "b" } as never]) as Record<string, unknown>[];
    expect(e.type).toBe("smoothstep");
    expect((e.style as { stroke: string }).stroke).toBe("#E0284A");
    expect((e.markerEnd as { type: string }).type).toBe("arrowclosed");
  });

  test("keeps explicit style/marker/handles intact (incl. line-level handles)", () => {
    const styled = { id: "e1", source: "a", target: "b", sourceHandle: "ln:l1:r", targetHandle: "ln:l9:l", type: "smoothstep", style: { stroke: "blue" }, markerEnd: { type: "arrow" } };
    const [e] = migrateEdges([styled as never]) as Record<string, unknown>[];
    expect(e.sourceHandle).toBe("ln:l1:r");
    expect((e.style as { stroke: string }).stroke).toBe("blue");
    expect((e.markerEnd as { type: string }).type).toBe("arrow");
  });
});

describe("migrateJeMemos", () => {
  const jeNode = (lines: Record<string, unknown>[], solution?: Record<string, unknown>[]) =>
    ({ id: "n1", data: { kind: "je", lines, ...(solution ? { solution } : {}) } }) as never;

  test("legacy label/memoPos/memoOpen become a text memo entry; label survives for docs", () => {
    const [n] = migrateJeMemos([jeNode([{ id: "l1", label: "why", memoPos: { x: 3, y: 4 }, memoOpen: true }])]) as { data: { lines: Record<string, unknown>[] } }[];
    const l = n.data.lines[0];
    expect(l.memos).toEqual([{ id: "l1-m-text", kind: "text", text: "why", pos: { x: 3, y: 4 }, open: true }]);
    expect(l.label).toBe("why");
    expect(l.memoPos).toBeUndefined();
    expect(l.memoOpen).toBeUndefined();
  });

  test("solution lines migrate too; already-migrated + non-JE untouched", () => {
    const [n] = migrateJeMemos([jeNode([{ id: "l1" }], [{ id: "s1", label: "sol memo" }])]) as { data: { solution: Record<string, unknown>[] } }[];
    expect(n.data.solution[0].memos).toBeDefined();
    const already = { id: "l1", label: "x", memos: [{ id: "m", kind: "calc", text: "1 = 1" }] };
    const [m] = migrateJeMemos([jeNode([already])]) as { data: { lines: Record<string, unknown>[] } }[];
    expect(m.data.lines[0].memos).toEqual(already.memos);
    const note = { id: "n2", data: { kind: "note", body: "hi" } } as never;
    expect((migrateJeMemos([note])[0] as { data: { body: string } }).data.body).toBe("hi");
  });
});

// ---- HARDENING P3: full LOAD-pipeline round-trip (save→load must not drift) ----
// Mirrors the route's load chain: migrateJeMemos ∘ migrateElementDeckFields ∘
// migrateDeckFields ∘ sanitizeSceneNodes, plus migrateEdges for the edges.

const loadPipeline = (nodes: any[]) =>
  migrateJeMemos(migrateElementDeckFields(migrateDeckFields(sanitizeSceneNodes(nodes)), isElement));

describe("scene load pipeline — legacy scene heals; v3 scene is stable", () => {
  test("a mixed legacy scene migrates every axis in one pass", () => {
    const legacy = [
      // JE: selected (transient), legacy staged deck, legacy label memo
      { id: "je1", type: "je", selected: true, data: { kind: "je", staged: true, _selLine: "x", lines: [{ id: "l1", label: "why", memoPos: { x: 1, y: 2 }, memoOpen: true }] } },
      // element with stray deck membership from the pre-category era
      { id: "h1", type: "heading", data: { kind: "heading", deckMember: true, tucked: true } },
      // a normal note, minimized (v1)
      { id: "n1", type: "note", dragging: true, data: { kind: "note", minimized: true } },
    ];
    const [je, h, n] = loadPipeline(legacy) as any[];
    // transient stripped
    expect(je.selected).toBeUndefined();
    expect(je.data._selLine).toBeUndefined();
    expect(n.dragging).toBeUndefined();
    // legacy deck → deckMember/tucked
    expect(je.data.deckMember).toBe(true); expect(je.data.tucked).toBe(true);
    expect(je.data.staged).toBeUndefined();
    expect(n.data.deckMember).toBe(true); expect(n.data.tucked).toBe(true);
    // element deck membership stripped (elements never deck)
    expect(h.data.deckMember).toBeUndefined();
    // JE memo migrated; label preserved for doc round-trips
    expect(je.data.lines[0].memos).toEqual([{ id: "l1-m-text", kind: "text", text: "why", pos: { x: 1, y: 2 }, open: true }]);
    expect(je.data.lines[0].label).toBe("why");
  });

  test("a clean v3 scene is IDEMPOTENT through the pipeline (no drift on re-save)", () => {
    const v3 = [
      { id: "je1", type: "je", data: { kind: "je", deckMember: true, tucked: false, lines: [{ id: "l1", account: "Cash", dr: 100, cr: null, side: "dr", memos: [{ id: "m", kind: "text", text: "note", open: true }] }] } },
      { id: "n1", type: "note", data: { kind: "note", body: "hi" } },
    ];
    const once = loadPipeline(structuredClone(v3));
    const twice = loadPipeline(structuredClone(once));
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    // and the content is intact
    expect((once[0] as any).data.lines[0].account).toBe("Cash");
    expect((once[0] as any).data.lines[0].memos[0].text).toBe("note");
  });

  test("edges round-trip through migrateEdges with style+marker+handles preserved", () => {
    const saved = [
      { id: "edge-1", source: "je1", target: "n1", sourceHandle: "ln:l1:r", targetHandle: "l", type: "smoothstep", style: { stroke: "#E0284A" }, markerEnd: { type: "arrowclosed" } },
    ];
    const [e] = migrateEdges(structuredClone(saved) as never) as any[];
    expect(e.sourceHandle).toBe("ln:l1:r");
    expect(e.type).toBe("smoothstep");
    expect(e.style.stroke).toBe("#E0284A");
    expect(e.markerEnd.type).toBe("arrowclosed");
  });
});

import { migrateLegendSlips } from "./scene-io";

describe("migrateLegendSlips (Legend V2 facts → story slips)", () => {
  const legend = (data: Record<string, unknown>) => ({ id: "lg", type: "legend", data: { kind: "legend", ...data } });

  test("converts facts[] to visible slips (idempotent, preserves text + order)", () => {
    const [n] = migrateLegendSlips([legend({ facts: ["Born 1447", "Wrote Summa", ""] })]) as { data: { slips: { id: string; text: string; hidden?: boolean }[] } }[];
    expect(n.data.slips.map((s) => s.text)).toEqual(["Born 1447", "Wrote Summa", ""]);
    expect(n.data.slips.every((s) => s.hidden === false)).toBe(true); // visible after migration (were never hidden)
    expect(new Set(n.data.slips.map((s) => s.id)).size).toBe(3); // unique ids
  });

  test("empty/absent facts → a single blank slip (never zero slips)", () => {
    const [a] = migrateLegendSlips([legend({})]) as { data: { slips: unknown[] } }[];
    expect(a.data.slips).toHaveLength(1);
    const [b] = migrateLegendSlips([legend({ facts: [] })]) as { data: { slips: unknown[] } }[];
    expect(b.data.slips).toHaveLength(1);
  });

  test("cards that already have slips are untouched (returns same array ref)", () => {
    const nodes = [legend({ slips: [{ id: "s1", text: "kept", hidden: true }] })];
    expect(migrateLegendSlips(nodes)).toBe(nodes);
  });

  test("non-legend nodes pass through untouched", () => {
    const nodes = [{ id: "j", type: "je", data: { kind: "je" } }];
    expect(migrateLegendSlips(nodes)).toBe(nodes);
  });
});
