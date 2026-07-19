import { describe, expect, test } from "bun:test";

import { buildSuggestMessages, parseVisualSuggestion, type FrameContext } from "./suggest-visual";

const ctx: FrameContext = {
  title: "What is Accounting?",
  beat: "hook",
  entry: "Open big.",
  beats: "- the language of business",
  cardKinds: ["heading"],
};

describe("buildSuggestMessages", () => {
  test("system lists every world + template id and demands JSON-only", () => {
    const { system, user } = buildSuggestMessages(ctx);
    expect(system).toContain("deep-space");
    expect(system).toContain("quiet-void");
    expect(system).toContain("comparison");
    expect(system).toContain("cram");
    expect(system.toLowerCase()).toContain("json");
    // the user message carries the frame's own context
    expect(user).toContain("Beat: hook");
    expect(user).toContain("What is Accounting?");
    expect(user).toContain("heading");
  });
  test("empty frame degrades gracefully", () => {
    const { user } = buildSuggestMessages({ beat: "teach", cardKinds: [] });
    expect(user).toContain("Cards on the frame: none yet");
    expect(user).toContain("Script: (none yet)");
  });
});

describe("parseVisualSuggestion", () => {
  test("valid ids pass; intensity clamps to the muted band", () => {
    const s = parseVisualSuggestion({ world: "distant-nebula", template: "stage", intensity: 0.3, rationale: "hook shot" });
    expect(s.world).toBe("distant-nebula");
    expect(s.template).toBe("stage");
    expect(s.worldIntensity).toBe(0.3);
    expect(s.rationale).toBe("hook shot");
  });
  test("unknown ids → null; over-range intensity clamps; null world drops intensity", () => {
    const s = parseVisualSuggestion({ world: "nope", template: "not-a-template", intensity: 9 });
    expect(s.world).toBeNull();
    expect(s.template).toBeNull();
    expect(s.worldIntensity).toBeNull(); // no world ⇒ no intensity
    const s2 = parseVisualSuggestion({ world: "deep-space", intensity: 9 });
    expect(s2.worldIntensity).toBe(0.6); // clamp ceiling
  });
  test("garbage / non-object never throws → all-null suggestion", () => {
    expect(parseVisualSuggestion(null)).toEqual({ world: null, worldIntensity: null, template: null, rationale: "" });
    expect(parseVisualSuggestion("oops")).toEqual({ world: null, worldIntensity: null, template: null, rationale: "" });
    expect(parseVisualSuggestion(42)).toEqual({ world: null, worldIntensity: null, template: null, rationale: "" });
  });
});
