// THE TELEPROMPTER SYNC's contract with the two ends it sits between: what
// the Studio writes (canvas/CeqStudio.tsx) and what the prompter window reads
// (routes/v3.teleprompter.tsx). Pure helpers here, source pins on both ends —
// a change to either shape fails HERE, not on Lee's other monitor mid-take.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { FILM_ACTIVE_KEY, filmActiveRecord, filmNodeId, filmNodeIdForFrameId } from "./prompter-sync";

const src = (rel: string) => readFileSync(join(import.meta.dir, rel), "utf8").split("\r\n").join("\n");
const teleprompter = src("../../../routes/v3.teleprompter.tsx");
const studio = src("../../canvas/CeqStudio.tsx");

describe("the record", () => {
  test("the Studio's key, the Studio's three fields", () => {
    expect(FILM_ACTIVE_KEY).toBe("sa-film-active");
    expect(filmActiveRecord("set-1", "ceq-9", 1234)).toEqual({ setId: "set-1", qId: "ceq-9", at: 1234 });
    expect(Object.keys(filmActiveRecord("s", null))).toEqual(["setId", "qId", "at"]);
    expect(typeof filmActiveRecord("s", null).at).toBe("number");
  });
  test("a set card publishes its CEQ node, an insert its blast-<frame id> node", () => {
    expect(filmNodeId({ id: "f1", kind: "ceq", ceqId: "ceq-9" })).toBe("ceq-9");
    expect(filmNodeId({ id: "f2", kind: "phrase" })).toBe("blast-f2");
    expect(filmNodeId({ id: "f3", kind: "ceq" })).toBe("blast-f3"); // a card frame missing its CEQ still resolves
    expect(filmNodeId(null)).toBeNull();
    expect(filmNodeIdForFrameId("f2")).toBe("blast-f2");
    expect(filmNodeIdForFrameId(null)).toBeNull();
  });
});

describe("the two ends (source pins)", () => {
  test("the Studio writes the same key and shape", () => {
    expect(studio).toContain('localStorage.setItem("sa-film-active", JSON.stringify({ setId: deck.id, qId: qId && qId !== LAYOUT_Q0 ? qId : null, at: Date.now() }))');
  });
  test("the prompter reads the key, keeps its own set, resolves a card by ceqId and ANY frame by blast-<id>", () => {
    expect(teleprompter).toContain('localStorage.getItem("sa-film-active")');
    expect(teleprompter).toContain("active.setId === setId");
    // The frame-id path useCapturePrompterSync relies on: the blast- clause is
    // not gated on kind, so a set card resolves by its frame id as well.
    expect(teleprompter).toContain('(f.kind === "ceq" && f.ceqId === qId) || `blast-${f.id}` === qId');
  });
  test("a plain write is the whole publish: the prompter polls the key and hears the cross-window storage event", () => {
    expect(teleprompter).toContain("window.setInterval(tick, 500)");
    expect(teleprompter).toContain('window.addEventListener("storage", tick)');
  });
});
