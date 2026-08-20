// The GroupMe copy is forwarded verbatim into real chats, so its exact shape is contract, not
// styling — and the claimed variant speaks FOR the chapter ("X partnered with…"), which must
// never happen on an unclaimed page. These tests pin both messages and the shorthand rules.
import { describe, expect, test } from "bun:test";

import { chapterShortName, chapterUrl, groupMeMessage } from "./ChapterShare";

describe("chapterShortName", () => {
  test("roster nickname wins outright — it is what students actually call the chapter", () => {
    expect(chapterShortName("Alpha Delta Pi", "ΑΔΠ", "ADPi")).toBe("ADPi");
    expect(chapterShortName("Pi Kappa Alpha", null, "Pike")).toBe("Pike");
    expect(chapterShortName("Alpha Chi Omega", "AXO", "Alpha Chi")).toBe("Alpha Chi");
    // empty/whitespace nickname falls through to the letters rule
    expect(chapterShortName("Alpha Tau Omega", "ATO", "  ")).toBe("ATO");
  });
  test("roster letters win when clean ASCII", () => {
    expect(chapterShortName("Alpha Tau Omega", "ATO")).toBe("ATO");
    expect(chapterShortName("Alpha Tau Omega", "ato")).toBe("ATO");
  });
  test("3+ Greek-letter words initial themselves, Chi → X", () => {
    expect(chapterShortName("Alpha Tau Omega", null)).toBe("ATO");
    expect(chapterShortName("Kappa Kappa Gamma", null)).toBe("KKG");
    expect(chapterShortName("Alpha Chi Omega", null)).toBe("AXO");
    expect(chapterShortName("Sigma Alpha Epsilon", null)).toBe("SAE");
  });
  test("two-word and non-Greek names stay in full", () => {
    expect(chapterShortName("Sigma Nu", null)).toBe("Sigma Nu");
    expect(chapterShortName("FarmHouse", null)).toBe("FarmHouse");
    expect(chapterShortName("Acacia", "")).toBe("Acacia");
  });
  test("multi-word roster letters are used verbatim (the roster really stores these)", () => {
    expect(chapterShortName("Phi Kappa Psi", "Phi Psi")).toBe("Phi Psi");
    expect(chapterShortName("Phi Kappa Tau", "Phi Tau")).toBe("Phi Tau");
    expect(chapterShortName("Sigma Phi Epsilon", "SigEp")).toBe("SigEp");
  });
  test("Phi/Psi names never get invented initials — real shorthands aren't initialisms", () => {
    expect(chapterShortName("Phi Delta Theta", null)).toBe("Phi Delta Theta");
    expect(chapterShortName("Sigma Phi Epsilon", null)).toBe("Sigma Phi Epsilon");
    expect(chapterShortName("Phi Gamma Delta", null)).toBe("Phi Gamma Delta");
  });
  test("garbage letters (unicode, too long) fall through to derivation", () => {
    expect(chapterShortName("Alpha Tau Omega", "ΑΤΩ")).toBe("ATO");
    expect(chapterShortName("Sigma Nu", "not-a-token-123")).toBe("Sigma Nu");
  });
});

describe("groupMeMessage", () => {
  const url = chapterUrl("florida-state-university", "alpha-tau-omega");

  test("unclaimed copy never speaks for the chapter and never mentions professors", () => {
    const m = groupMeMessage({ claimed: false, shortName: "ATO", courseLabel: "ACG 2021", url });
    expect(m).toBe(
      `For anyone taking ACG 2021 — Survive Accounting has free cram videos + practice exams to help you ace your exams. Go check them out!\nStart studying here:\n${url}`,
    );
    expect(m).not.toContain("partnered");
    expect(m.toLowerCase()).not.toContain("professor");
  });

  test("claimed copy carries the partnership under the shorthand", () => {
    const m = groupMeMessage({ claimed: true, shortName: "ATO", courseLabel: "ACG 2021", url });
    expect(m).toBe(
      `Hey everyone — ATO partnered with Survive Accounting to help boost our chapter GPA in ACG 2021. There are cram videos + practice exams available — go check them out!\nStart studying here:\n${url}`,
    );
    expect(m.toLowerCase()).not.toContain("professor");
  });

  test("degrades to plain Intro Accounting when no verified course code exists", () => {
    const m = groupMeMessage({ claimed: false, shortName: "ATO", courseLabel: "Intro Accounting", url });
    expect(m).toContain("For anyone taking Intro Accounting —");
  });
});
