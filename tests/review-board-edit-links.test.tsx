import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ReviewBoardV2 } from "../src/components/canvas/ReviewBoard";
import type { BoardItem } from "../src/components/canvas/talkthrough";

// The Results board renders a CEQ edit card as two columns — CURRENT and
// PROPOSED — and each column carries its own "Edit" link. These render the
// real ReviewBoardV2 to static markup, so a column losing its link (or the
// two drifting apart) fails here rather than on Lee's screen.

const NOW = "2026-01-01T00:00:00.000Z";
const EDIT_BASE = "/v3/easy-points/internal-vs-external-users/blast-off/edit";

const ceqEditItem = {
  id: "bi-1", createdAt: NOW, updatedAt: NOW, archivedAt: null, syncedAt: NOW,
  sessionId: "tts-test", runId: "run-test", kind: "ceq_edit",
  title: "Edit · Q1", quote: "", ceqIds: ["ceq-1"], status: "suggested", comment: "",
  payload: {
    state: "ready",
    current: { stem: "Current stem?", choices: [{ text: "Inside the company", correct: true, feedback: null }] },
    proposed: { proposedStem: "Proposed stem?", proposedChoices: [{ text: "Managers inside", correct: true, feedback: null }] },
  },
} as unknown as BoardItem;

const board = (editBase?: string) =>
  renderToStaticMarkup(
    <ReviewBoardV2 items={[ceqEditItem]} ceqs={[]} onRegen={async () => {}} editBase={editBase} />,
  );

describe("Results board — Edit links on a CEQ edit card", () => {
  test("the Proposed column has an Edit link carrying side=proposed", () => {
    const html = board(EDIT_BASE);
    expect(html).toContain(`href="${EDIT_BASE}?side=proposed&amp;item=bi-1&amp;ceq=ceq-1"`);
    expect(html).toContain("Edit the PROPOSED question on its own screen");
  });

  test("the Current column still has its own, with side=current", () => {
    const html = board(EDIT_BASE);
    expect(html).toContain(`href="${EDIT_BASE}?side=current&amp;item=bi-1&amp;ceq=ceq-1"`);
    expect(html).toContain("Edit the CURRENT question on its own screen");
  });

  test("both columns are labelled and each is followed by its own link", () => {
    const html = board(EDIT_BASE);
    // Current heading, then the current link, then the Proposed heading, then
    // the proposed link — one Edit per column, in column order.
    const order = [">Current<", "side=current", ">Proposed<", "side=proposed"].map((s) => html.indexOf(s));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order]).toEqual([...order].sort((a, b) => a - b));
    expect(html.split(">Edit</a>").length - 1).toBe(2);
  });

  test("no editBase (the studio board) means no Edit links at all", () => {
    const html = board(undefined);
    expect(html).toContain(">Proposed<");
    expect(html).not.toContain("side=proposed");
    expect(html).not.toContain(">Edit</a>");
  });
});
