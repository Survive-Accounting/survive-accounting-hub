// The Types of accounts slide, pinned: Lee's old teaching slide as the defaults (his words, his
// signs, his lists), the four toggles, the Contra tab, his edits winning and a cleared one coming
// back — and the column fitting the safe area beside the corner camera.
import { describe, expect, test } from "bun:test";

import { DEFAULT_LISTS, TYPE_INFO, TYPE_KEYS, TYPE_LISTS, TYPE_TABS, listOf, sectionsFor, tabLabel, typesView, withList, withWord, wordOf } from "./account-types";
import { camRect } from "./capture/webcam-spots";
import { SAFE, camDefault, cardPlacement, isColumnKind } from "./layout";
import { PHONE_W } from "./PhoneFrame";
import { TYPES_GEOM } from "./TypesFrame";

describe("the types of accounts slide", () => {
  test("his old slide: the tabs, the words, the signs, the lists", () => {
    expect(TYPE_TABS).toEqual(["A", "L", "E", "Rev", "Exp", "Contra"]);
    expect(TYPE_KEYS.map((k) => TYPE_INFO[k].word)).toEqual(["OWN", "OWE", "VALUE", "EARN", "COSTS"]);
    expect(TYPE_KEYS.map((k) => TYPE_INFO[k].sign)).toEqual(["+/−", "−/+", "−/+", "−/+", "+/−"]);
    expect(TYPE_INFO.A.contra?.sign).toBe("−/+");
    expect(TYPE_INFO.E.contra?.sign).toBe("+/−");
    expect(DEFAULT_LISTS["A.current"]).toEqual(["Cash", "Supplies", "“Receivables”", "“Prepaids”"]);
    expect(DEFAULT_LISTS["A.longterm"]).toEqual(["Equipment", "Machine", "Car / Truck", "Building"]);
    expect(DEFAULT_LISTS["Exp.all"]).toContain("COST OF GOODS SOLD!");
    for (const id of TYPE_LISTS) expect(DEFAULT_LISTS[id].length).toBeGreaterThan(0);
  });

  test("defaults: opens on A, the split and the contras off, words and signs on", () => {
    expect(typesView(undefined)).toEqual({ tab: "A", term: false, contra: false, def: true, sign: true, full: false });
    // 2026-09-12: the same slide with the words spelled out.
    expect(tabLabel("A", false)).toBe("A");
    expect(tabLabel("A", true)).toBe("Assets");
    expect(tabLabel("Rev", true)).toBe("Revenue");
    expect(tabLabel("Contra", true)).toBe("Contra");
  });

  test("the split off nests the long-term ones under LT Assets, like his slide; on, two headed groups", () => {
    const off = sectionsFor({}, "A");
    expect(off).toHaveLength(1);
    expect(off[0].items.at(-1)).toEqual({ text: "LT Assets", sub: [...DEFAULT_LISTS["A.longterm"]] });
    expect(sectionsFor({ term: true }, "A").map((s) => s.heading)).toEqual(["Current", "Long-term"]);
    // Not a balance-sheet type: one plain list either way.
    expect(sectionsFor({ term: true }, "Rev")).toEqual([{ items: DEFAULT_LISTS["Rev.all"].map((text) => ({ text })) }]);
  });

  test("contras: inside A and E only when asked, never under L; always on their own tab", () => {
    expect(sectionsFor({}, "A").some((s) => s.contra)).toBe(false);
    expect(sectionsFor({ contra: true }, "A").at(-1)).toEqual({ heading: "Contra asset", sign: "−/+", contra: true, items: [{ text: "Accumulated Depreciation" }] });
    expect(sectionsFor({ contra: true }, "E").at(-1)).toEqual({ heading: "Contra equity", sign: "+/−", contra: true, items: [{ text: "Dividends" }] });
    expect(sectionsFor({ contra: true }, "L").some((s) => s.contra)).toBe(false);
    expect(sectionsFor({}, "Contra").map((s) => s.heading)).toEqual(["Contra asset", "Contra equity"]);
  });

  test("his edits win; clearing a list or a word brings the default back", () => {
    let s = withList(undefined, "Rev.all", ["Service Revenue", "", "  "]);
    expect(listOf(s, "Rev.all")).toEqual(["Service Revenue"]);
    s = withList(s, "Rev.all", ["", " "]);
    expect(s.lists?.["Rev.all"]).toBeUndefined();
    expect(listOf(s, "Rev.all")).toEqual([...DEFAULT_LISTS["Rev.all"]]);
    const w = withWord(undefined, "A", "HAVE");
    expect(wordOf(w, "A")).toBe("HAVE");
    expect(wordOf(withWord(w, "A", " "), "A")).toBe("OWN");
  });

  test("the column fits the safe area, the header keeps left of the corner camera, and there's no caption rail", () => {
    const H = PHONE_W * 16 / 9;
    const top = H * (SAFE.top + 0.02);
    expect(TYPES_GEOM.w).toBeLessThanOrEqual(Math.round(PHONE_W * (SAFE.right - SAFE.left)));
    expect((top + TYPES_GEOM.h) / H).toBeLessThanOrEqual(SAFE.bottom);
    for (const layout of ["pass1", "pass2"] as const) {
      expect(cardPlacement(layout, "types").align).toBe("top");
      expect(camDefault(layout, "types")).toEqual({ spot: "corner" });
    }
    const corner = camRect("corner", PHONE_W, H);
    expect(PHONE_W * SAFE.left + TYPES_GEOM.headerW).toBeLessThan(corner.x);
    // The tabs start under the corner circle.
    expect(top + (16 + 50 + 6)).toBeGreaterThan(corner.y + corner.h);
    expect(isColumnKind("types")).toBe(true);
  });
});
