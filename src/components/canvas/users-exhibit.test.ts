// "WHO'S IT FOR?" (users exhibit) tests — the config is the contract: correct
// classifications (the accuracy audit, pinned), the text diet, the reveal
// sequence shape, and the film-controller wiring precedence.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  USERS_DIFFERENCES, USERS_REVEAL_MAX, USERS_REVEAL_STEPS, USERS_SIDES,
  usersBandVisible, usersChip, usersNodeIds, usersSideOf,
} from "./users-exhibit-config";

const previewerSrc = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");
const cardSrc = readFileSync(join(import.meta.dir, "cards", "UsersNode.tsx"), "utf8").split("\r\n").join("\n");

describe("classifications — the accuracy audit, pinned", () => {
  test("internal: owners, managers, employees, board (Lee's framing)", () => {
    for (const id of ["owners", "managers", "employees", "board"]) expect(usersSideOf(id)).toBe("inside");
  });
  test("external: investors, banks, regulators, IRS, customers", () => {
    for (const id of ["investors", "banks", "regulators", "irs", "customers"]) expect(usersSideOf(id)).toBe("outside");
  });
  test("board carries the A+ professor-variance tag AND the check-your-professor line", () => {
    const board = usersChip("board")!;
    expect(board.cue).toBe("aplus");
    expect(board.wantExtra).toContain("Check your professor's slides");
  });
  test("the gimme classifications carry EASY POINT: the IRS and Banks & Creditors", () => {
    expect(usersChip("irs")!.cue).toBe("easy");
    expect(usersChip("banks")!.cue).toBe("easy");
  });
  test("the branch plates and headers carry MUST KNOW", () => {
    for (const s of USERS_SIDES) { expect(s.plate.cue).toBe("must"); expect(s.headerCue).toBe("must"); }
  });
});

describe("text diet", () => {
  test("every want is one short line", () => {
    for (const s of USERS_SIDES) for (const c of s.chips) {
      expect(c.want.length).toBeGreaterThan(0);
      expect(c.want.length).toBeLessThan(45);
      expect(c.want).not.toContain("\n");
    }
  });
  test("mnemonics are the exact memory hooks", () => {
    expect(USERS_SIDES[0].plate.mnemonic).toBe("for the ManaGERs");
    expect(USERS_SIDES[1].plate.mnemonic).toBe("for the people FINANCING you");
  });
  test("difference cells stay tight (≤4 words plus a parenthetical/suffix)", () => {
    for (const p of USERS_DIFFERENCES) for (const cell of [p.managerial, p.financial]) {
      expect(cell.replace(/\(.*?\)/g, "").trim().split(/\s+/).length).toBeLessThanOrEqual(5);
    }
  });
  test("exactly four opposing pairs", () => expect(USERS_DIFFERENCES).toHaveLength(4));
});

describe("reveal sequence", () => {
  test("four authored states: wall → chips → plates → mnemonics", () => {
    expect([...USERS_REVEAL_STEPS]).toEqual(["wall", "chips", "plates", "mnemonics"]);
    expect(USERS_REVEAL_MAX).toBe(3);
  });
  test("band visibility is cumulative", () => {
    expect(usersBandVisible("wall", 0)).toBe(true);
    expect(usersBandVisible("chips", 0)).toBe(false);
    expect(usersBandVisible("chips", 1)).toBe(true);
    expect(usersBandVisible("mnemonics", 2)).toBe(false);
    expect(usersBandVisible("mnemonics", 3)).toBe(true);
  });
  test("the differences strip is NOT a reveal band (manual toggle only)", () => {
    expect([...USERS_REVEAL_STEPS]).not.toContain("differences");
  });
});

describe("declarations + wiring", () => {
  test("node ids are unique across both sides", () => {
    const ids = usersNodeIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(2 + 9 + 2); // 2 headers + 9 chips + 2 plates
  });
  test("both film keymaps step the reveal BEFORE the Tab walk", () => {
    const rec = previewerSrc.indexOf('if (e.key === "Enter" || e.key === "Tab")');
    expect(previewerSrc.slice(0, rec)).toContain('exhibitRevealKey(e.shiftKey ? "back" : "step")');
    const walk = previewerSrc.indexOf('if (e.key === "Tab") { e.preventDefault();');
    expect(previewerSrc.slice(0, walk).split('exhibitRevealKey(e.shiftKey ? "back" : "step")').length).toBe(3); // once per branch
    expect(previewerSrc.split("exhibitDepthKey()").length).toBe(3); // D in both branches
  });
  test("film surfaces render the sequence; other surfaces are always full", () => {
    expect(cardSrc).toContain("!film || usersBandVisible(band, revealTick)");
  });
  test("emphasis is opacity/filter/border/shadow only — nothing moves", () => {
    // The card's emphasis helpers must not touch geometry.
    const emph = cardSrc.slice(cardSrc.indexOf("const emphasis"), cardSrc.indexOf("// ---- the wall"));
    expect(emph).not.toMatch(/transform|width|height|left|top|margin/);
  });
  test("selection rides the shared highlight store, so ` clears it for free", () => {
    expect(cardSrc).toContain("hl.clear();");
    expect(cardSrc).toContain("hl.cycle(nodeId);");
  });
});
