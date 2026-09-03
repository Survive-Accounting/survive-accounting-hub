// /v3/edit-button-test — TEST PAGE for the Results "Edit" button.
//
// The Edit link above a CEQ edit card's CURRENT column only shows up on a set
// that actually has a CEQ edit on its board, which not every set does. This
// route mounts the SAME review board with ONE fake CEQ edit card so the button
// can be checked without hunting for real data.
//
// It writes nothing on load. The card's own APPROVE / → QUEUE / → IDEA BANK /
// ARCHIVE buttons belong to the real board and are NOT part of this test —
// they would try to save a card that does not exist and fail loudly. Only the
// Edit link is under test here.
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { ReviewBoardV2 } from "@/components/canvas/ReviewBoard";
import type { BoardItem } from "@/components/canvas/talkthrough";
import { V3Shell, V3Note } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/edit-button-test")({
  component: () => <AdminGate><EditButtonTest /></AdminGate>,
  head: () => ({ meta: [{ title: "Edit button test" }, { name: "robots", content: "noindex" }] }),
});

const NOW = "2026-01-01T00:00:00.000Z";

/** A stand-in CEQ edit card. The id is TEST- prefixed so it can never be
 *  mistaken for a real board item. */
const TEST_ITEM: BoardItem = {
  id: "TEST-edit-button-card",
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
  syncedAt: NOW,
  sessionId: "TEST-session",
  runId: "TEST-run",
  kind: "ceq_edit",
  title: "Sample question — internal vs external users",
  quote: "This one reads backwards — flip the stem.",
  ceqIds: ["TEST-ceq"],
  status: "suggested",
  comment: "",
  payload: {
    state: "ready",
    instruction: "flip the stem so it asks who the report is FOR",
    current: {
      stem: "Which report is prepared mainly for people inside the company?",
      choices: [
        { text: "The income statement", correct: false, feedback: null },
        { text: "A departmental budget", correct: true, feedback: null },
        { text: "The 10-K", correct: false, feedback: null },
      ],
    },
    proposed: {
      proposedStem: "A departmental budget is prepared mainly for whom?",
      proposedChoices: [
        { text: "Investors outside the company", correct: false, feedback: null },
        { text: "Managers inside the company", correct: true, feedback: null },
        { text: "The IRS", correct: false, feedback: null },
      ],
      note: "Sample copy — this card is not real.",
    },
  },
};

const EDIT_BASE = "/v3/easy-points/internal-vs-external-users/blast-off/edit";

function EditButtonTest() {
  return (
    <V3Shell crumbs={[{ label: "The Queue", to: "/v3" }, { label: "Edit button test" }]} wide>
      <V3Note tone="bad">
        TEST PAGE — the card below is fake sample copy, not a real question. Click only the
        small “Edit” link above the CURRENT column. Do not click approve / → queue / → idea
        bank / archive on this card: there is no real card behind them and they will error.
      </V3Note>
      <div style={{ marginTop: 18 }}>
        <ReviewBoardV2
          items={[TEST_ITEM]}
          ceqs={[]}
          onRegen={() => Promise.reject(new Error("Test page: regeneration is not wired here. Use a real Results page."))}
          editBase={EDIT_BASE}
        />
      </div>
    </V3Shell>
  );
}
