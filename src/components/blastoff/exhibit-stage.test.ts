// STAGED EXHIBITS — the copies must not drift from the originals.
//
// The sync stages an exhibit onto a Blast Off frame by reproducing what
// CeqStudio.stageCardData does when Lee adds one from the Add menu: the same
// node kind, the same size, the same centring on the 1600x900 stage. Those
// numbers live in stage-elements.tsx, and the sync holds a copy because it is a
// server function and stage-elements pulls in React node components.
//
// A copy that can drift silently is the failure mode this file exists to catch:
// if someone resizes an exhibit in the Add menu, a staged one would quietly land
// at the old size and sit off-centre on camera. These tests fail instead.
import { describe, expect, test } from "bun:test";

import { EXHIBIT_STAGE, STAGE_H, STAGE_W, stagePos, stagedExhibitNode } from "@/lib/blastoff-sync.functions";
import { EXHIBIT_REGISTRY } from "@/lib/talkthrough.functions";
import { STAGE_ELEMENTS } from "@/components/canvas/stage-elements";

/** The Add-menu entry that makes each exhibit, found by the kind it produces. */
const addMenuEntry = (kind: string) =>
  STAGE_ELEMENTS.find((e) => (e.make() as { kind?: string }).kind === kind);

describe("every shipped exhibit can be staged", () => {
  test("EXHIBIT_STAGE covers the whole registry", () => {
    const missing = EXHIBIT_REGISTRY.filter((r) => !EXHIBIT_STAGE[r.id]).map((r) => r.id);
    expect(missing).toEqual([]);
  });

  test("no entry names a kind the Add menu cannot make", () => {
    for (const [id, spec] of Object.entries(EXHIBIT_STAGE)) {
      expect(addMenuEntry(spec.kind), `${id} → ${spec.kind}`).toBeDefined();
    }
  });
});

describe("sizes match the Add menu exactly", () => {
  // THE DRIFT GUARD. stage-elements.tsx is the original; this asserts the copy.
  for (const [id, spec] of Object.entries(EXHIBIT_STAGE)) {
    test(`${id} is the same box the Add menu uses`, () => {
      const entry = addMenuEntry(spec.kind);
      expect(entry?.size).toEqual({ w: spec.w, h: spec.h });
    });
  }
});

describe("placement matches stageCardData", () => {
  // CeqStudio.stageCardData:
  //   x = round((frameW - w) / 2)
  //   y = round((frameH - h) / 2) - 60
  const expected = (w: number, h: number) => ({
    x: Math.round((STAGE_W - w) / 2),
    y: Math.round((STAGE_H - h) / 2) - 60,
  });

  test("centred horizontally, nudged up so it does not bury the choices", () => {
    for (const spec of Object.values(EXHIBIT_STAGE)) {
      expect(stagePos(spec.w, spec.h)).toEqual(expected(spec.w, spec.h));
    }
  });

  test("the nudge is real — an element is never dead-centre", () => {
    const { y } = stagePos(900, 560);
    expect(y).toBe(Math.round((STAGE_H - 560) / 2) - 60);
    expect(y).toBeLessThan(Math.round((STAGE_H - 560) / 2));
  });

  test("the stage is the previewer's frame, not an invented one", () => {
    expect([STAGE_W, STAGE_H]).toEqual([1600, 900]);
  });
});

describe("the staged node itself", () => {
  const node = stagedExhibitNode("blast-bf-exhibit-abc", "bf-exhibit-abc", "cycle")!;

  test("it attaches to the FRAME, by stage.ceqId", () => {
    // The whole feature turns on this one field. Wrong, and the exhibit exists
    // but belongs to no frame — invisible until Lee is already filming.
    expect((node.data.stage as { ceqId: string }).ceqId).toBe("blast-bf-exhibit-abc");
  });

  test("it is the real exhibit node type, not a note about one", () => {
    expect(node.type).toBe("cycle");
    expect(node.data.kind).toBe("cycle");
  });

  test("it carries the exhibit's own content, from the same factory the Add menu uses", () => {
    // blankCard("cycle") seeds the nine steps; a staged exhibit must not be blank.
    expect(Array.isArray(node.data.steps)).toBe(true);
    expect((node.data.steps as unknown[]).length).toBeGreaterThan(0);
  });

  test("its id is derived, so re-syncing updates rather than duplicating", () => {
    expect(node.id).toBe("blast-el-bf-exhibit-abc");
    expect(stagedExhibitNode("blast-bf-exhibit-abc", "bf-exhibit-abc", "cycle")!.id).toBe(node.id);
  });

  test("position and stage coordinates agree", () => {
    const st = node.data.stage as { x: number; y: number; scale: number };
    expect({ x: st.x, y: st.y }).toEqual(node.position);
    expect(st.scale).toBe(1);
  });

  test("it is tagged so cleanup can tell it from an element Lee added by hand", () => {
    expect(node.data.provenance).toBe("blast-off-el");
  });

  test("an unknown exhibit stages nothing rather than a broken node", () => {
    expect(stagedExhibitNode("f", "f", "not-an-exhibit")).toBeNull();
  });

  test("every registry exhibit produces a node", () => {
    for (const r of EXHIBIT_REGISTRY) {
      expect(stagedExhibitNode("frame", "f", r.id), r.id).not.toBeNull();
    }
  });
});
