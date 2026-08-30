import { describe, it, expect } from "bun:test";
import { assignSemester, type AssignCampus } from "./growth-tranche-assign-core";
import { type GreekStatus } from "./growth-tranche-core";

// 220 eligible + some 'none' that must be excluded. Deterministic (no RNG).
const make = (n: number): AssignCampus[] =>
  Array.from({ length: n }, (_, i) => {
    const greek: GreekStatus = i < 30 ? "strong" : i < 120 ? "present" : "unknown";
    return {
      campusId: `c${i}`,
      name: `Campus ${i}`,
      seats: 4000 - i * 12,
      greekStatus: greek,
      readiness: (i * 7) % 101,
      contacts: i % 5 === 0 ? 0 : i % 5,
    };
  });

describe("assignSemester", () => {
  const eligible = [
    ...make(220),
    { campusId: "none1", name: "Commuter", seats: 9000, greekStatus: "none" as GreekStatus, readiness: 100, contacts: 3 },
  ];
  const res = assignSemester(eligible);

  it("produces 5 King + 5 Unassigned tranches, ≤20 each", () => {
    expect(res.king).toHaveLength(5);
    expect(res.unassigned).toHaveLength(5);
    for (const t of [...res.king, ...res.unassigned]) expect(t.campuses.length).toBeLessThanOrEqual(20);
  });

  it("never places a 'none'-Greek campus (multiplier 0), even a huge one", () => {
    const all = [...res.king, ...res.unassigned].flatMap((t) => t.campuses.map((c) => c.campusId));
    expect(all).not.toContain("none1");
  });

  it("labels tranches T1–T5 and A–E", () => {
    expect(res.king.map((t) => t.label)).toEqual(["T1", "T2", "T3", "T4", "T5"]);
    expect(res.unassigned.map((t) => t.label)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("seeds the flagship tranches (T1/A) with strong-Greek schools", () => {
    const flag = [...res.king[0].campuses, ...res.unassigned[0].campuses];
    const strong = flag.filter((c) => c.greekStatus === "strong").length;
    expect(strong).toBeGreaterThanOrEqual(20); // the 30 strongs land here first
  });

  it("assigns each campus at most once", () => {
    const all = [...res.king, ...res.unassigned].flatMap((t) => t.campuses.map((c) => c.campusId));
    expect(new Set(all).size).toBe(all.length);
  });

  it("balances the flagship pair within 10% on seats", () => {
    const a = res.king[0].totals.seats, b = res.unassigned[0].totals.seats;
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThanOrEqual(0.1);
  });
});
