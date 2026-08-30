// Blank-card factories — the improvisation deck. Each returns fresh card data in edit-ready
// state, spawned at viewport center by the palette/toolbar.
import { cardId, type CardData, type SchedulePreset } from "./types";

function line(side: "dr" | "cr") {
  return { id: cardId("l"), account: "", dr: null, cr: null, side, label: "" };
}

export function blankCard(kind: CardData["kind"], preset?: SchedulePreset): CardData {
  switch (kind) {
    case "je":
      // caption empty → header shows the "New entry" placeholder; one debit, one credit
      return { kind: "je", caption: "", entryType: "standard", lines: [line("dr"), line("cr")], accountBank: [] };
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
    case "heading":
      return { kind: "heading", text: "", level: 1 };
    case "text":
      return { kind: "text", body: "", color: 0 };
    case "examcue":
      return { kind: "examcue", label: "Your exam", emoji: "📄", w: 300, h: 230 };
    case "ceqtease":
      return { kind: "ceqtease", text: "What type of account is ___?", emoji: "📝", w: 720, h: 150 };
    case "ceqhook":
      return { kind: "ceqhook", beats: [""], orient: "landscape", w: 900, h: 420 };
    case "framebolt":
      return { kind: "framebolt", w: 340, h: 420 };
    case "logo":
      return { kind: "logo", mode: "wordmark", colorId: "red-blue", ink: "light", w: 360, h: 120 };
    case "intro":
      return { kind: "intro", cardTitle: "Trial Balance", transparent: false, w: 800, h: 450 };
    case "outro":
      return { kind: "outro", transparent: false, w: 800, h: 450 };
    case "corner":
      return { kind: "corner", corner: "tr", boltOpacity: 0.7, transparent: true, w: 800, h: 450 };
    case "users":
      return { kind: "users", w: 960, h: 560 };
    case "standards":
      return { kind: "standards", w: 960, h: 540 };
    case "basis":
      return { kind: "basis", w: 960, h: 560 };
    case "careers":
      return { kind: "careers", w: 1000, h: 600 };
    case "classification":
      return { kind: "classification", w: 1100, h: 620 };
    case "cycle":
      return {
        kind: "cycle",
        title: "The Accounting Cycle",
        // THE NINE STEPS, in the order the bank teaches them — the same list as
        // exhibit-lab/cycle-model.ts CYCLE_STEPS and the correct answer to
        // "Which list shows the full accounting cycle in the correct order?"
        // (deck-e1s-1-1). A new cycle element must not seed a shorter summary:
        // an unlabeled 7-step ring next to a 9-step CEQ answer is a filmed
        // contradiction. Steps stay author-editable on the canvas.
        steps: [
          { id: cardId("cy"), text: "Analyze transactions" },
          { id: cardId("cy"), text: "Record journal entries" },
          { id: cardId("cy"), text: "Post to T accounts" },
          { id: cardId("cy"), text: "Make unadjusted trial balance" },
          { id: cardId("cy"), text: "Record adjusting entries" },
          { id: cardId("cy"), text: "Make adjusted trial balance" },
          { id: cardId("cy"), text: "Prep financial statements" },
          { id: cardId("cy"), text: "Record closing entries" },
          { id: cardId("cy"), text: "Make post-closing trial balance" },
        ],
        // Sized so NINE pills never collide. Pills are positioned as a % of the
        // 1000×600 viewBox but sized in real px (capped at 200 wide), so the
        // gap between pill centres is (ovalPerimeter / steps) × (width / 1000)
        // ≈ 2003/9 × w/1000. At the old 620 seed that is 138px — pills overlap;
        // at 900 it is exactly 200px — touching; at 1100 it is 245px — clean.
        // 1100×660 also keeps the viewBox's 5:3 aspect, so the arcs stay round.
        w: 1100,
        h: 660,
      };
    case "memo":
      return { kind: "memo", memoKind: "note", title: "", body: "" };
    case "paygate":
      return { kind: "paygate", label: "Members beyond this point" };
    case "signupgate":
      return { kind: "signupgate", label: "Sign up to continue" };
    case "asklee":
    case "submitproblem":
    case "shareinvite":
      return { kind } as CardData;
    case "formula":
      return {
        kind: "formula",
        segments: [
          { id: cardId("fs"), label: "", value: "" },
          { id: cardId("fs"), label: "", value: "" },
          { id: cardId("fs"), label: "", value: "" },
        ],
        operators: ["+", "="],
      };
    case "outline":
      return {
        kind: "outline",
        courseId: null, // derives from the scene's course
        freeThrough: 8,
        layout: "snake",
        stepsPerRow: null, // auto-fit
        hereOverride: null,
        w: 900,
        h: 506, // ~16:9
      };
    case "legend":
      return {
        kind: "legend",
        name: "",
        year: "",
        imageUrl: "",
        typeLine: "",
        slips: [{ id: cardId("slip"), text: "" }],
        flavor: "",
        setLabel: "Legends · 001",
      };
    case "testimonial":
      // Local, card-only values (there is no testimonials DB source). Attribution
      // defaults to the portable "generic" option per the content-portability rule.
      return {
        kind: "testimonial",
        quote: "",
        stars: 5,
        studentName: "",
        showPhoto: true,
        attrMode: "generic",
        attrGeneric: "",
        attrSpecific: "",
        attrCustom: "",
        editMode: true,
      };
    case "list":
      return {
        kind: "list",
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

/** Pinned formula preset — Foundations Ch1 films on it. */
export function formulaAle(): CardData {
  return {
    kind: "formula",
    title: "The accounting equation",
    segments: [
      { id: cardId("fs"), label: "Assets", value: "" },
      { id: cardId("fs"), label: "Liabilities", value: "" },
      { id: cardId("fs"), label: "Equity", value: "" },
    ],
    operators: ["=", "+"],
  };
}

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
  legend: "Legend card",
  testimonial: "Testimonial",
  outline: "Course outline",
  formula: "Formula",
  heading: "Heading",
  text: "Text",
  examcue: "Exam Cue",
  ceqtease: "CEQ Tease",
  ceqhook: "CEQ Hook",
  framebolt: "Bolt (boiling)",
  logo: "Logo",
  intro: "Intro card",
  outro: "Outro card",
  corner: "Corner bolt",
  cycle: "Accounting Cycle",
  users: "Who's It For?",
  standards: "Rulebook & Cops",
  basis: "When It Counts",
  careers: "Accounting Careers",
  classification: "5 Types of Accounts",
  memo: "Memo",
  paygate: "Payment Gate",
  signupgate: "Signup Gate",
  asklee: "Ask Lee",
  submitproblem: "Submit a Problem",
  shareinvite: "Share / Invite",
};
