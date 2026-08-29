import { describe, it, expect } from "bun:test";
import {
  evaluateTranche,
  trancheProgressLabel,
  TRANCHE_LAUNCH_TARGET,
  TRANCHE_RESPONSE_TARGET,
  type TrancheCampusState,
} from "./growth-tranche-core";

const campuses = (launched: number, responded: number, total = 20): TrancheCampusState[] =>
  Array.from({ length: total }, (_, i) => ({
    campusId: `c${i}`,
    launched: i < launched,
    responded: i < responded,
  }));

describe("evaluateTranche", () => {
  it("unlocks only when BOTH launch and response floors are met", () => {
    expect(evaluateTranche(campuses(15, 5)).unlocked).toBe(true);
    expect(evaluateTranche(campuses(20, 5)).unlocked).toBe(true);
  });

  it("does NOT unlock on launches alone — the failure mode this rule prevents", () => {
    const p = evaluateTranche(campuses(20, 4));
    expect(p.launchMet).toBe(true);
    expect(p.responseMet).toBe(false);
    expect(p.unlocked).toBe(false);
  });

  it("does NOT unlock on responses alone", () => {
    const p = evaluateTranche(campuses(14, 20));
    expect(p.launchMet).toBe(false);
    expect(p.responseMet).toBe(true);
    expect(p.unlocked).toBe(false);
  });

  it("counts launched and responded independently", () => {
    // 16 launched, of which only 3 also responded, plus 2 responded-but-not-launched = 5 responded
    const list: TrancheCampusState[] = [
      ...Array.from({ length: 3 }, (_, i) => ({ campusId: `a${i}`, launched: true, responded: true })),
      ...Array.from({ length: 13 }, (_, i) => ({ campusId: `b${i}`, launched: true, responded: false })),
      ...Array.from({ length: 2 }, (_, i) => ({ campusId: `c${i}`, launched: false, responded: true })),
      ...Array.from({ length: 2 }, (_, i) => ({ campusId: `d${i}`, launched: false, responded: false })),
    ];
    const p = evaluateTranche(list);
    expect(p.launched).toBe(16);
    expect(p.responded).toBe(5);
    expect(p.unlocked).toBe(true);
  });

  it("uses the spec's 15 / 5 targets", () => {
    expect(TRANCHE_LAUNCH_TARGET).toBe(15);
    expect(TRANCHE_RESPONSE_TARGET).toBe(5);
    const p = evaluateTranche(campuses(0, 0));
    expect(p.launchTarget).toBe(15);
    expect(p.responseTarget).toBe(5);
  });

  it("renders the gap-legible progress label", () => {
    expect(trancheProgressLabel(evaluateTranche(campuses(14, 3)))).toBe(
      "14/15 campuses launched · 3/5 with response",
    );
  });
});
