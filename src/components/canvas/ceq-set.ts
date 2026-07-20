// CEQ SET — the card FACTORY (Lee). A set is a TEMPLATE + a SOURCE that generates
// one CEQ card per included account. This is the abstraction that repeats for
// every course, so the engine is pure + fully tested; the scene stores the set
// (scene.ceqSets) and "approve as deck" turns the generated cards into a named
// deck. First set: "What type of account is ___?".
//
// The correct answer is DERIVED from each account's COA type via the SAME map
// the Chart-of-Accounts grouping uses (groupNameForType) — contra folds to its
// base type — so there is one source of truth for "what type is this account".
import { groupNameForType, type CoaGroupName } from "./coa-groups";
import { type CeqCard, type CeqChoice } from "./types";

/** The fixed 5 options — same five on every card in this family. */
export const CEQ_OPTIONS = ["Asset", "Liability", "Equity", "Revenue", "Expense"] as const;
export type CeqOption = (typeof CEQ_OPTIONS)[number];
export type Difficulty = "easy" | "medium" | "hard";

const GROUP_TO_OPTION: Record<CoaGroupName, CeqOption> = {
  Assets: "Asset",
  Liabilities: "Liability",
  Equity: "Equity",
  Revenue: "Revenue",
  Expenses: "Expense",
};

/** The correct 5-type answer for a COA account_type (contra folds to its base). */
export function correctOptionForType(accountType: string): CeqOption {
  return GROUP_TO_OPTION[groupNameForType(accountType)];
}

export interface CeqSetAccount {
  /** COA account id, or a synthetic id for an off-COA teaching account (e.g. COGS). */
  accountId: string;
  name: string;
  /** COA type; the correct answer derives from it unless correctOverride is set. */
  accountType: string;
  include: boolean;
  difficulty: Difficulty;
  /** Manual per-card override of the correct option (else derived). */
  correctOverride?: CeqOption | null;
  /** Per-option feedback — LEE'S words only, never generated. Keyed by option. */
  feedback?: Partial<Record<CeqOption, string>>;
  /** True when this account is NOT in the set's COA (added for teaching). */
  offCoa?: boolean;
}

export interface CeqSetDef {
  id: string;
  name: string;
  /** Stem with a {token}, e.g. "What type of account is {account}?". */
  stemTemplate: string;
  token: string;
  options: CeqOption[];
  accounts: CeqSetAccount[];
  /** The deck this set was last approved into (re-approve updates it). */
  deckId?: string | null;
}

/** The correct option for one account — the manual override, else derived. */
export function correctFor(a: CeqSetAccount): CeqOption {
  return a.correctOverride ?? correctOptionForType(a.accountType);
}

/** Fill the stem template's {token} with an account name. */
export function fillStem(set: Pick<CeqSetDef, "stemTemplate" | "token">, name: string): string {
  return set.stemTemplate.split(`{${set.token}}`).join(name);
}

const DIFF_ORDER: Difficulty[] = ["easy", "medium", "hard"];

/**
 * FILM ORDER: easy → hard, and WITHIN each difficulty tier bounce between answer
 * types so consecutive answers differ (round-robin over the 5 option buckets in
 * option order). Deterministic given the set. Only included accounts.
 */
export function filmOrder(accounts: CeqSetAccount[]): CeqSetAccount[] {
  const included = accounts.filter((a) => a.include);
  const out: CeqSetAccount[] = [];
  for (const tier of DIFF_ORDER) {
    const tierAccts = included.filter((a) => a.difficulty === tier);
    // bucket by correct answer, preserving input order within a bucket
    const buckets = new Map<CeqOption, CeqSetAccount[]>();
    for (const a of tierAccts) {
      const k = correctFor(a);
      const b = buckets.get(k) ?? [];
      b.push(a);
      buckets.set(k, b);
    }
    // round-robin drain in CEQ_OPTIONS order → consecutive answers differ while
    // ≥2 buckets still have items; a same-type tail is unavoidable, not a bug.
    let remaining = tierAccts.length;
    while (remaining > 0) {
      for (const opt of CEQ_OPTIONS) {
        const b = buckets.get(opt);
        if (b && b.length) {
          out.push(b.shift()!);
          remaining--;
        }
      }
    }
  }
  return out;
}

/** Deterministic LCG shuffle — a given seed always yields the same order. */
export function studentOrder(accounts: CeqSetAccount[], seed: number): CeqSetAccount[] {
  const arr = accounts.filter((a) => a.include).slice();
  let s = (seed >>> 0) || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** One CeqCard (data payload) per account, in the given order. Choice ids are
 *  deterministic (accountId:option) so re-generation is stable. */
export function generateCeqCards(set: CeqSetDef, order: CeqSetAccount[]): CeqCard[] {
  return order.map((a) => {
    const answer = correctFor(a);
    const choices: CeqChoice[] = set.options.map((opt) => ({
      id: `${a.accountId}:${opt}`,
      text: opt,
      correct: opt === answer ? true : undefined,
      feedback: a.feedback?.[opt] || undefined,
    }));
    return { kind: "ceq", prompt: fillStem(set, a.name), choices } as CeqCard;
  });
}

// ---- Seeding "What type of account is ___?" from a course COA -----------------

export interface SeedCoaAccount {
  id: string;
  name: string;
  accountType: string;
}

const rx = (...words: string[]) => new RegExp(`\\b(${words.join("|")})\\b`, "i");
// The HARD ramp Lee specified — tricky accounts even strong students trip on.
const HARD = rx("cost of goods sold", "cogs", "prepaid", "interest receivable", "depreciation expense", "rent expense");
// MEDIUM — the "cheat-code"/adjunct accounts (receivable/payable/unearned/accrued/notes/retained).
const MEDIUM = rx("receivable", "payable", "unearned", "accrued", "notes", "retained earnings", "prepaid");

/** Is an account type a contra/adjunct (excluded from this set — Lee traps
 *  those separately, and Dividends is out too)? */
function isContraLike(accountType: string): boolean {
  return accountType.startsWith("contra_") || accountType === "liability_adjunct";
}
function isDividends(name: string): boolean {
  return /\bdividends?\b/i.test(name);
}

/** Difficulty rank for an account (editable afterwards). */
export function seedDifficulty(name: string): Difficulty {
  if (HARD.test(name)) return "hard";
  if (MEDIUM.test(name)) return "medium";
  return "easy";
}

/**
 * Should this account be INCLUDED by default? Excludes contra/adjunct + Dividends,
 * and excludes MOST expenses — only Depreciation Expense, Rent Expense, and COGS
 * survive (Lee's call). Everything else in the 5 base types is in.
 */
export function seedInclude(a: SeedCoaAccount): boolean {
  if (isContraLike(a.accountType)) return false;
  if (isDividends(a.name)) return false;
  if (a.accountType === "expense") {
    return /\b(depreciation expense|rent expense|cost of goods sold|cogs)\b/i.test(a.name);
  }
  return true;
}

/** The off-COA COGS account the set pulls in for teaching when the COA lacks it. */
export const COGS_ACCOUNT: CeqSetAccount = {
  accountId: "ceq-extra:cogs",
  name: "Cost of Goods Sold",
  accountType: "expense",
  include: true,
  difficulty: "hard",
  offCoa: true,
};

/** Build the "What type of account is ___?" set from a course's COA. Adds COGS
 *  as an off-COA teaching account when the COA doesn't already have it. */
export function seedAccountTypeSet(id: string, coa: SeedCoaAccount[]): CeqSetDef {
  const accounts: CeqSetAccount[] = coa.map((a) => ({
    accountId: a.id,
    name: a.name,
    accountType: a.accountType,
    include: seedInclude(a),
    difficulty: seedDifficulty(a.name),
  }));
  const hasCogs = coa.some((a) => /\b(cost of goods sold|cogs)\b/i.test(a.name));
  if (!hasCogs) accounts.push({ ...COGS_ACCOUNT });
  return {
    id,
    name: "What type of account is ___?",
    stemTemplate: "What type of account is {account}?",
    token: "account",
    options: [...CEQ_OPTIONS],
    accounts,
    deckId: null,
  };
}
