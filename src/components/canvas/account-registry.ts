// THE SHARED ACCOUNT REGISTRY — one source of truth for "what kind of account
// is this, and why". Consumed by the Account Classification exhibit today, and
// intended for Equation Effects, journal-entry teaching and statement
// classification next. Adding an account here makes it available everywhere;
// an accuracy fix here fixes every exhibit at once (Bible law 8).
//
// WHY THIS EXISTS AS ITS OWN MODULE (see BUILD-NOTES.md): account knowledge was
// already spread across three places that each knew a piece of it —
//   · `exhibit-lab/rubric-model.ts` → ACCOUNTS: names + type, but bare strings;
//   · `exhibit-lab/rubric-view.ts`  → CONTRA + the CURRENT_ASSET_COUNT seam;
//   · `coa-groups.ts`               → DB account_type → the 5 group headers.
// None carried the teaching metadata (why-line, trap, term). This registry is
// the superset. It deliberately does NOT rewrite the Rubric — that exhibit is
// shipped and its account ORDER is a tested contract — but
// `classification-exhibit.test.ts` pins this registry against all three of the
// above, so the eventual Rubric migration is mechanical rather than risky.
//
// CATEGORY vs CONTRA: a contra account keeps its PARENT category and sets
// `contra: true` — Dividends is equity, Accumulated Depreciation is an asset.
// That matches `coa-groups.ts`, which nests contras under the parent type
// rather than inventing a sixth bucket, and `rubric-view.CONTRA`.
//
// WHY ONLY TWO CONTRAS (checked 2026-08-30 — do not "fix" this to three).
// The bank teaches a THIRD contra account: deck-ch1-full asks "Dividends,
// Accumulated Depreciation, and Allowance for Doubtful Accounts are all
// ______." → Contra accounts, and deck-e1s-3-1 asks which side increases
// "Allowance for Doubtful Accounts, a contra-asset related to Accounts
// Receivable". Both CEQs are CORRECT — Allowance IS a contra-asset. It is
// absent here on purpose: this registry is the Exam 1 classification set, and
// Allowance is never asked "what type of account is it?", only used as a
// concept example (receivables are a later chapter). Adding it is not a
// one-line fix — `classification-exhibit.test.ts` pins this contra set equal
// to `rubric-view.CONTRA`, so it would change the SHIPPED Rubric board and the
// classification exhibit's current-asset pile on camera. If Allowance should
// become a first-class account, do it as a deliberate exhibit change with its
// own film QA, not as a registry tidy-up.
import type { CueLevel } from "./users-exhibit-config";

export type AccountCategory = "asset" | "liability" | "equity" | "revenue" | "expense";
export type AccountTerm = "current" | "longterm";

export interface AccountDef {
  id: string;
  label: string;
  category: AccountCategory;
  /** Sits inside its category but carries the OPPOSITE sign (Bible law 3 bait). */
  contra?: boolean;
  /** One line, Lee's language: why it lands in that category. */
  whyLine: string;
  /** The classic misclassification, if this account is one. */
  trap?: { note: string; tag: CueLevel };
  /** Balance-sheet accounts only — drives the Current / Long-term depth layer. */
  term?: AccountTerm;
  /** Long-term assets with no physical form; shown only in the depth layer. */
  intangible?: boolean;
  aliases?: readonly string[];
}

/** THE REGISTRY. Order within a category is display order. */
export const ACCOUNT_REGISTRY: readonly AccountDef[] = [
  // ---------------------------------------------------------------- assets
  { id: "cash", label: "Cash", category: "asset", term: "current",
    whyLine: "The money itself — you OWN it." },
  { id: "accounts-receivable", label: "Accounts Receivable", category: "asset", term: "current",
    whyLine: "Cash we EXPECT TO RECEIVE from a customer — you OWN that claim.",
    trap: { note: "Cash we expect to RECEIVE — you own that claim.", tag: "easy" },
    aliases: ["A/R", "Receivables", "Notes Receivable", "Interest Receivable", "Rent Receivable"] },
  { id: "supplies", label: "Supplies", category: "asset", term: "current",
    whyLine: "Bought now, used later — you OWN them until you use them." },
  { id: "prepaid-insurance", label: "Prepaid Insurance", category: "asset", term: "current",
    whyLine: "Coverage bought upfront — an asset until it expires." },
  { id: "prepaid-rent", label: "Prepaid Rent", category: "asset", term: "current",
    whyLine: "Rent bought upfront — you OWN the months you haven't used yet." },
  { id: "inventory", label: "Inventory", category: "asset", term: "current",
    whyLine: "Goods you OWN — until they sell." },
  { id: "equipment", label: "Equipment", category: "asset", term: "longterm",
    whyLine: "A long-term thing you OWN and use for years.", aliases: ["Machines"] },
  { id: "vehicles", label: "Vehicles", category: "asset", term: "longterm",
    whyLine: "Cars and trucks you OWN — used for years.", aliases: ["Cars & Trucks"] },
  { id: "buildings", label: "Buildings", category: "asset", term: "longterm",
    whyLine: "Property you OWN and use for years.", aliases: ["Building"] },
  { id: "land", label: "Land", category: "asset", term: "longterm",
    whyLine: "Property you OWN — and it never depreciates.", aliases: ["Land Improvements"] },
  { id: "trademarks", label: "Trademarks", category: "asset", term: "longterm", intangible: true,
    whyLine: "You OWN it, you just can't touch it." },
  { id: "copyrights", label: "Copyrights", category: "asset", term: "longterm", intangible: true,
    whyLine: "You OWN it, you just can't touch it." },
  { id: "patents", label: "Patents", category: "asset", term: "longterm", intangible: true,
    whyLine: "You OWN it, you just can't touch it." },
  { id: "goodwill", label: "Goodwill", category: "asset", term: "longterm", intangible: true,
    whyLine: "Value you OWN beyond the physical stuff." },
  { id: "accumulated-depreciation", label: "Accumulated Depreciation", category: "asset", contra: true, term: "longterm",
    whyLine: "Rides with the assets and REDUCES them.",
    trap: { note: "“Contra” = opposite-of. Rides with assets, reduces them.", tag: "aplus" } },

  // ----------------------------------------------------------- liabilities
  { id: "accounts-payable", label: "Accounts Payable", category: "liability", term: "current",
    whyLine: "Cash we expect to PAY another party.", aliases: ["A/P", "Payables"] },
  { id: "wages-payable", label: "Wages Payable", category: "liability", term: "current",
    whyLine: "Work already done that you still OWE for.", aliases: ["Salaries Payable"] },
  { id: "interest-payable", label: "Interest Payable", category: "liability", term: "current",
    whyLine: "Interest racked up that you still OWE." },
  { id: "unearned-revenue", label: "Unearned Revenue", category: "liability", term: "current",
    whyLine: "Cash taken upfront — you OWE the service.",
    trap: { note: "“Revenue” in the name, liability in reality — you OWE the service.", tag: "must" },
    aliases: ["Deferred Revenue"] },
  { id: "notes-payable", label: "Notes Payable", category: "liability", term: "current",
    whyLine: "A written promise to pay — you OWE it." },
  { id: "notes-payable-long", label: "Long-Term Notes Payable", category: "liability", term: "longterm",
    whyLine: "The same promise, owed over 1+ years." },
  { id: "mortgage-payable", label: "Mortgage Payable", category: "liability", term: "longterm",
    whyLine: "Borrowed against property — owed for years." },
  { id: "bonds-payable", label: "Bonds Payable", category: "liability", term: "longterm",
    whyLine: "Debt you issued to investors — owed for years." },

  // ---------------------------------------------------------------- equity
  { id: "common-stock", label: "Common Stock", category: "equity",
    whyLine: "Ownership shares in YOUR OWN company, issued to investors." },
  { id: "retained-earnings", label: "Retained Earnings", category: "equity",
    whyLine: "Profits kept in the business instead of paid out." },
  { id: "dividends", label: "Dividends", category: "equity", contra: true,
    whyLine: "Retained earnings paid back to owners — it REDUCES equity.",
    trap: { note: "Not an expense. Retained earnings paid back to owners — reduces equity.", tag: "easy" } },

  // -------------------------------------------------------------- revenues
  { id: "service-revenue", label: "Service Revenue", category: "revenue",
    whyLine: "You did the work — that's EARNED.", aliases: ["Fees Earned"] },
  { id: "sales-revenue", label: "Sales Revenue", category: "revenue",
    whyLine: "Goods delivered — that's EARNED.", aliases: ["Sales"] },
  { id: "interest-revenue", label: "Interest Revenue", category: "revenue",
    whyLine: "Interest you EARNED on money you're owed.", aliases: ["Interest Earned"] },
  { id: "rent-revenue", label: "Rent Revenue", category: "revenue",
    whyLine: "Rent you've EARNED by letting someone use your space.", aliases: ["Rent Earned"] },

  // -------------------------------------------------------------- expenses
  { id: "rent-expense", label: "Rent Expense", category: "expense",
    whyLine: "Rent you've USED up — a COST of operating." },
  { id: "wages-expense", label: "Wages Expense", category: "expense",
    whyLine: "Work you've already received — a COST." },
  { id: "salaries-expense", label: "Salaries Expense", category: "expense",
    whyLine: "Work you've already received — a COST." },
  { id: "utilities-expense", label: "Utilities Expense", category: "expense",
    whyLine: "Power and water you've USED — a COST." },
  { id: "supplies-expense", label: "Supplies Expense", category: "expense",
    whyLine: "Supplies once you USE them — no longer an asset." },
  { id: "insurance-expense", label: "Insurance Expense", category: "expense",
    whyLine: "Coverage once it EXPIRES — no longer an asset." },
  { id: "depreciation-expense", label: "Depreciation Expense", category: "expense",
    whyLine: "This period's slice of a long-term asset's COST." },
  { id: "interest-expense", label: "Interest Expense", category: "expense",
    whyLine: "The COST of borrowing money." },
  { id: "cost-of-goods-sold", label: "Cost of Goods Sold", category: "expense",
    whyLine: "What the sold inventory COST you.",
    trap: { note: "Inventory is an asset UNTIL it sells — then it becomes this expense.", tag: "easy" },
    aliases: ["COGS"] },
] as const;

// ---- pure helpers --------------------------------------------------------

const BY_ID: ReadonlyMap<string, AccountDef> = new Map(ACCOUNT_REGISTRY.map((a) => [a.id, a]));
const BY_LABEL: ReadonlyMap<string, AccountDef> = new Map(ACCOUNT_REGISTRY.map((a) => [a.label, a]));

export const account = (id: string): AccountDef | undefined => BY_ID.get(id);

/** Look an account up by the exact name another module prints (the Rubric's
 *  bare strings, a COA row's canonical_name). Aliases are matched too. */
export const accountByLabel = (label: string): AccountDef | undefined =>
  BY_LABEL.get(label) ?? ACCOUNT_REGISTRY.find((a) => a.aliases?.includes(label));

export const accountsIn = (category: AccountCategory): AccountDef[] =>
  ACCOUNT_REGISTRY.filter((a) => a.category === category);

/** Balance-sheet accounts of a category, split into the two piles the depth
 *  layer draws. Intangibles ride at the end of the long-term pile; the contra
 *  account rides last of all, exactly as the Rubric board orders them. */
export const accountsByTerm = (category: AccountCategory, term: AccountTerm): AccountDef[] =>
  accountsIn(category)
    .filter((a) => a.term === term)
    .sort((a, b) => rank(a) - rank(b));

const rank = (a: AccountDef): number => (a.contra ? 2 : a.intangible ? 1 : 0);

/** Every account carrying trap metadata, in registry order. */
export const trapAccounts = (): AccountDef[] => ACCOUNT_REGISTRY.filter((a) => a.trap);
