// Blank-card factories — the improvisation deck. Each returns fresh card data in edit-ready
// state, spawned at viewport center by the palette/toolbar.
import { cardId, type CardData, type SchedulePreset } from "./types";

function line() {
  return { id: cardId("l"), account: "", dr: null, cr: null, label: "" };
}

export function blankCard(kind: CardData["kind"], preset?: SchedulePreset): CardData {
  switch (kind) {
    case "je":
      return { kind: "je", caption: "New entry", lines: [line(), line()], accountBank: [], showAmounts: true, showLabels: true, editMode: true };
    case "taccount":
      return { kind: "taccount", account: "Account", debits: [{ id: cardId("d"), label: "", amount: null }], credits: [{ id: cardId("c"), label: "", amount: null }], editMode: true };
    case "computation":
      return { kind: "computation", narration: "", steps: [{ id: cardId("s"), label: "Step 1", formulaText: "", value: "" }], editMode: true };
    case "memorize":
      return { kind: "memorize", itemKind: "formula", body: "", editMode: true };
    case "note":
      return { kind: "note", body: "", color: 0, editMode: true };
    case "ceq":
      return {
        kind: "ceq",
        prompt: "Question?",
        choices: [
          { id: cardId("ch"), text: "Correct answer", correct: true, feedback: "" },
          { id: cardId("ch"), text: "Distractor", feedback: "Why this is wrong" },
        ],
        editMode: true,
      };
    case "video":
      return { kind: "video", playbackId: "", editMode: true };
    case "image":
      return { kind: "image", url: "", fit: "contain", caption: "", editMode: true };
    case "list":
      return {
        kind: "list",
        definition: "",
        rows: [
          { id: cardId("r"), text: "" },
          { id: cardId("r"), text: "" },
          { id: cardId("r"), text: "" },
        ],
        showChips: false,
        editMode: true,
      };
    case "schedule":
      return scheduleTemplate(preset ?? "generic");
    default:
      return { kind: "note", body: "", color: 0 };
  }
}

const cell = (v = "") => ({ v });
const row = (n: number) => Array.from({ length: n }, () => cell());

export function scheduleTemplate(preset: SchedulePreset): CardData {
  switch (preset) {
    case "amortization":
      return {
        kind: "schedule",
        preset,
        headers: ["Period", "Cash", "Interest Expense", "Amort", "Carrying Value"],
        rows: [row(5), row(5), row(5)],
        numericCols: [false, true, true, true, true],
        bond: { face: 500000, statedRateAnnual: 0.08, marketRateAnnual: 0.1, paymentsPerYear: 2, termYears: 5, method: "effective" },
        editMode: true,
      };
    case "depreciation":
      return {
        kind: "schedule",
        preset,
        headers: ["Year", "Computation", "Expense", "Accum", "Book Value"],
        rows: [row(5), row(5), row(5)],
        numericCols: [false, false, true, true, true],
        editMode: true,
      };
    case "fifo":
      return {
        kind: "schedule",
        preset,
        headers: ["Layer", "Units", "Cost", "Total"],
        rows: [row(4), row(4)],
        numericCols: [false, true, true, true],
        footerCheck: true,
        editMode: true,
      };
    case "bankrec":
      return {
        kind: "schedule",
        preset,
        headers: ["Bank side", "", "Book side", ""],
        rows: [row(4), row(4), row(4)],
        numericCols: [false, true, false, true],
        runningTotals: true, // adjusted balances land on the green rule
        editMode: true,
      };
    case "incomestmt":
      return {
        kind: "schedule",
        preset,
        headers: ["Income Statement", "Amount"],
        rows: [
          [cell("Revenues"), cell()],
          [cell(), cell()],
          [cell("Expenses"), cell()],
          [cell(), cell()],
          [cell("Net income"), cell()],
        ],
        numericCols: [false, true],
        editMode: true,
      };
    case "balancesheet":
      return {
        kind: "schedule",
        preset,
        headers: ["", "Assets", "Liab + Equity"],
        rows: [row(3), row(3), row(3), row(3)],
        numericCols: [false, true, true],
        footerCheck: true, // totals row + A = L + E chip
        editMode: true,
      };
    default:
      return {
        kind: "schedule",
        preset: "generic",
        headers: ["Col A", "Col B", "Col C"],
        rows: [row(3), row(3)],
        numericCols: [false, true, true],
        editMode: true,
      };
  }
}

export const CARD_KIND_LABEL: Record<CardData["kind"], string> = {
  je: "Journal Entry",
  schedule: "Schedule",
  computation: "Computation",
  taccount: "T-Account",
  ceq: "Question (CEQ)",
  memorize: "Memorize",
  note: "Note",
  video: "Video",
  list: "List",
  image: "Image",
};
