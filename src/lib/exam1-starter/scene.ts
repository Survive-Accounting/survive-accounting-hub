// Scene/deck/CEQ-node builders for the Exam 1 Starter Map (PURE — no crypto/DB/fs).
// Produces the exact node shapes the Studio + student practice reader expect (matches
// exam1-seed.core): a per-set scene holds ONE card deck plus its tucked CEQ nodes. Each set
// lives in its own scene so the student loader's dedupe always resolves it as the winning copy.
import type { SetPlan } from "./plan";
import { COURSE_ID } from "./plan";

const STAMP = "2026-08-25T00:00:00.000Z"; // fixed → idempotent (no wall-clock in the payload)
const POS = { x: 520, y: 210 };

export interface DeckJson { id: string; name: string; slots: never[]; access: string; filter: null; status: string; runMode: string; topicId: string; courseId: string; lessonId: null; parked: boolean; sortOrder: number; payloadType: string; showSkeletons: boolean; createdAt: string; updatedAt: string; publications: never[]; }
export interface CeqNodeJson { id: string; type: string; position: { x: number; y: number }; selected: boolean; data: Record<string, unknown>; }
export interface SetSceneJson { decks: DeckJson[]; nodes: CeqNodeJson[]; source: string; }

export function buildDeck(set: SetPlan, topicId: string): DeckJson {
  return {
    id: set.deckId, name: set.name, slots: [], access: "free", filter: null,
    status: "live", runMode: "sequence", topicId, courseId: COURSE_ID, lessonId: null,
    parked: false, sortOrder: set.sortOrder, payloadType: "cards", showSkeletons: true,
    createdAt: STAMP, updatedAt: STAMP, publications: [],
  };
}

export function buildCeqNode(set: SetPlan, ceq: SetPlan["ceqs"][number], topicId: string): CeqNodeJson {
  return {
    id: ceq.ceqId, type: "ceq", position: { ...POS }, selected: false,
    data: {
      kind: "ceq", title: set.name, prompt: ceq.prompt,
      choices: ceq.choices.map((c) => ({ id: c.id, text: c.text, correct: c.correct, ...(c.feedback ? { feedback: c.feedback } : {}) })),
      deckId: set.deckId, deckMember: true, tucked: true, faceDown: false,
      stageOrder: ceq.stageOrder, slotIndex: ceq.stageOrder, deckCategory: "ceq:studio", deckPos: { ...POS },
      ...(ceq.shorthand ? { shorthand: ceq.shorthand } : {}),
      // provenance — lets a future re-import match rows and preserves analytics lineage
      sourceKey: ceq.questionKey, provenance: ceq.source, ...(ceq.reused ? { originalCeqId: ceq.ceqId } : {}),
    },
  };
}

/** Full nodes_json for one set's scene (1 deck + its CEQ nodes), deterministic and replace-safe. */
export function buildSetScene(set: SetPlan, topicId: string): SetSceneJson {
  return {
    decks: [buildDeck(set, topicId)],
    nodes: set.ceqs.map((c) => buildCeqNode(set, c, topicId)),
    source: "exam1-global-starter-map-v1",
  };
}
