// THREE REAL MAPS — hand-written, validating, clean under checkMapSpec (the test asserts it).
// They are the few-shot examples the spec brief renders (cluster-brief.ts) AND the one-click
// inserts under "Map" on the Editor's quick row. Lee, 2026-09-07: "Some of these ideas may be
// better fit as part of a cluster. Others may be better fit as just a slide we add that's a
// list" — (b) is that list slide: a one-node map.
//
// Account names are the registry's (account-registry.ts); every camera comes from fitCamera so
// the examples teach the assistant the same framing rule the vocabulary states. Field
// coordinates are laid out top to bottom in teaching order with air between the boxes.
//
// Pure data. The insert clones a spec and gives it a fresh id (cloneExample).
import { DEFAULT_FIELD, PHONE, fitCamera, newClusterId, overviewCamera, type ClusterNode, type ClusterSpec } from "./cluster-spec";

export interface MapExampleDef { id: string; title: string; spec: ClusterSpec }

const box = (id: string, x: number, y: number, w: number, h: number, data: ClusterNode["data"], title?: string): ClusterNode => ({ id, x, y, w, h, ...(title ? { title } : {}), data });
/** The camera that frames one node, or the box around several. */
const frame = (...nodes: ClusterNode[]) => {
  const x = Math.min(...nodes.map((n) => n.x)), y = Math.min(...nodes.map((n) => n.y));
  const r = Math.max(...nodes.map((n) => n.x + n.w)), b = Math.max(...nodes.map((n) => n.y + n.h));
  return fitCamera({ x, y, w: r - x, h: b - y });
};

// ---------------------------------------------------------------- (a) buy supplies on account

const aEq = box("eq", 630, 200, 900, 400, { kind: "equation", arrows: { assets: "up", liabilities: "up", equity: "none" }, caption: "Buy supplies on account" }, "A = L + E");
const aJe = box("je", 630, 760, 900, 380, { kind: "je", description: "Bought $500 of supplies on account", lines: [{ account: "Supplies", dr: 500, type: "A" }, { account: "Accounts Payable", cr: 500, type: "L" }], badge: "JE" }, "The entry");
const aT1 = box("t-supplies", 480, 1300, 420, 420, { kind: "taccount", account: "Supplies", normal: "dr", fromNodes: ["je"] }, "Supplies");
const aT2 = box("t-ap", 1260, 1300, 420, 420, { kind: "taccount", account: "Accounts Payable", normal: "cr", fromNodes: ["je"] }, "Accounts Payable");
const aNote = box("note", 630, 1880, 900, 160, { kind: "note", text: "On ==account== means no cash yet. A payable, not Cash." });

const buySuppliesOnAccount: ClusterSpec = {
  version: 1, id: "map-example-supplies", title: "A = L + E effects: buy supplies on account", field: { ...DEFAULT_FIELD },
  nodes: [aEq, aJe, aT1, aT2, aNote],
  edges: [
    { from: "je", to: "eq", kind: "link", label: "effect" },
    { from: "je", to: "t-supplies", kind: "post", label: "Dr 500" },
    { from: "je", to: "t-ap", kind: "post", label: "Cr 500" },
  ],
  shots: [
    { id: "s1", label: "A up, L up", camera: fitCamera(aEq), reveal: ["eq"], note: "Supplies on account. Assets up. Liabilities up. Equity untouched." },
    { id: "s2", label: "the transaction", camera: fitCamera(aJe), reveal: ["eq", "je#1"], note: "Five hundred of supplies, on account. Two lines coming." },
    { id: "s3", label: "debit Supplies", camera: fitCamera(aJe), reveal: ["eq", "je#3"], note: "Supplies is an asset. Asset up is a debit. Five hundred." },
    { id: "s4", label: "credit Accounts Payable", camera: fitCamera(aJe), reveal: ["eq", "je#5"], note: "On account means Accounts Payable. Liability up is a credit. Balanced." },
    { id: "s5", label: "post it", camera: frame(aT1, aT2), reveal: ["eq", "je", "t-supplies", "t-ap"], note: "Post it. Debit lands left in Supplies, credit lands right in Accounts Payable." },
    { id: "s6", label: "the cheat code", camera: fitCamera(aNote), reveal: ["eq", "je", "t-supplies", "t-ap", "note"], note: "Cheat code: on account means a payable, not Cash. Next." },
  ],
};

// ---------------------------------------------------------------- (b) the five types — a list slide

const bList = box("types", 190, 360, 700, 1200, {
  kind: "accounts", revealBy: "group",
  groups: [
    { label: "Assets", accounts: ["Cash", "Accounts Receivable", "Supplies", "Equipment"], normal: "dr", note: "You own it" },
    { label: "Liabilities", accounts: ["Accounts Payable", "Unearned Revenue", "Notes Payable"], normal: "cr", note: "You owe it" },
    { label: "Equity", accounts: ["Common Stock", "Retained Earnings", "Dividends"], normal: "cr", note: "The owners' claim" },
    { label: "Revenue", accounts: ["Service Revenue", "Sales Revenue"], normal: "cr", note: "Earned" },
    { label: "Expenses", accounts: ["Rent Expense", "Wages Expense", "Supplies Expense"], normal: "dr", note: "Used up" },
  ],
}, "The five types");

const fiveTypes: ClusterSpec = {
  version: 1, id: "map-example-five-types", title: "The five types of accounts", field: { w: PHONE.w, h: PHONE.h },
  nodes: [bList],
  edges: [],
  shots: [
    { id: "s1", label: "Assets", camera: fitCamera(bList), reveal: ["types#1"], note: "Assets. You own it. Cash, receivables, supplies, equipment." },
    { id: "s2", label: "Liabilities", camera: fitCamera(bList), reveal: ["types#2"], note: "Liabilities. You owe it. Payable in the name, you owe it. Unearned Revenue too." },
    { id: "s3", label: "Equity", camera: fitCamera(bList), reveal: ["types#3"], note: "Equity. The owners' claim. Stock, retained earnings, dividends." },
    { id: "s4", label: "Revenue", camera: fitCamera(bList), reveal: ["types#4"], note: "Revenue. Earned. Not cash, earned." },
    { id: "s5", label: "Expenses", camera: fitCamera(bList), reveal: ["types#5"], note: "Expenses. Used up. Five types. Next." },
  ],
};

// ---------------------------------------------------------------- (c) pay off a payable

const cEq = box("eq", 630, 200, 900, 400, { kind: "equation", arrows: { assets: "down", liabilities: "down", equity: "none" }, caption: "Pay the supplier" }, "A = L + E");
const cJe = box("je", 630, 760, 900, 380, { kind: "je", description: "Paid the $500 owed for supplies", lines: [{ account: "Accounts Payable", dr: 500, type: "L" }, { account: "Cash", cr: 500, type: "A" }], badge: "JE" }, "The entry");
const cTb = box("tb", 680, 1300, 800, 360, {
  kind: "tb", title: "Trial balance after paying",
  rows: [
    { account: "Cash", dr: 4500 },
    { account: "Supplies", dr: 500 },
    { account: "Accounts Payable", cr: 0 },
    { account: "Common Stock", cr: 5000 },
  ],
}, "Trial balance");

const payAPayable: ClusterSpec = {
  version: 1, id: "map-example-pay-payable", title: "Pay off a payable", field: { ...DEFAULT_FIELD },
  nodes: [cEq, cJe, cTb],
  edges: [
    { from: "je", to: "eq", kind: "link", label: "effect" },
    { from: "je", to: "tb", kind: "link", label: "rolls up" },
  ],
  shots: [
    { id: "s1", label: "A down, L down", camera: fitCamera(cEq), reveal: ["eq"], note: "Pay the supplier. Cash down, payable down. Both sides shrink." },
    { id: "s2", label: "the transaction", camera: fitCamera(cJe), reveal: ["eq", "je#1"], note: "Paid the five hundred we owed." },
    { id: "s3", label: "debit Accounts Payable", camera: fitCamera(cJe), reveal: ["eq", "je#3"], note: "Liability down is a debit. Accounts Payable, five hundred." },
    { id: "s4", label: "credit Cash", camera: fitCamera(cJe), reveal: ["eq", "je#5"], note: "Cash leaves. Asset down is a credit. Balanced." },
    { id: "s5", label: "the trial balance", camera: fitCamera(cTb), reveal: ["eq", "je", "tb"], note: "Trial balance. Payable is gone. Debits still equal credits. Next." },
  ],
};

/** The three, in the order the quick row offers them. */
export const MAP_EXAMPLES: readonly MapExampleDef[] = [
  { id: "supplies", title: "A = L + E effects", spec: buySuppliesOnAccount },
  { id: "five-types", title: "5 types", spec: fiveTypes },
  { id: "pay-payable", title: "pay a payable", spec: payAPayable },
];

/** A fresh copy of an example for a new frame — its own map id, nothing shared. */
export function cloneExample(e: MapExampleDef): ClusterSpec {
  return { ...(JSON.parse(JSON.stringify(e.spec)) as ClusterSpec), id: newClusterId() };
}

/** Kept exported so the brief's test can assert the last-shot rule the same way the check does. */
export const exampleOverviewZoom = (spec: ClusterSpec): number => overviewCamera(spec.field).zoom;
