// THE TYPES OF ACCOUNTS SLIDE's content — Lee's own teaching slide, as data.
//
// Lee (2026-09-11): "I need a 'Types of accounts' slide that let's me toggle between A, L, E, Rev,
// Exp, Contra accounts … once I finish my videos on Assets, I want to do a quick recap of all the
// assets. I'm taking a page from my old google slide I used to teach from... it's set up perfectly
// for how I teach." Then the four toggles: current vs long-term, contra accounts inside the type,
// the one-word definition, and the +/− signs.
//
// The defaults are that slide, word for word — his quotes included ("Receivables" means any
// receivable), his caps on COST OF GOODS SOLD!, his signs. Two things weren't on it: long-term
// liabilities (the current / long-term toggle needs something on that side, so they come from
// canvas/account-registry.ts) and the Contra tab, which lists the two contras his slide carried
// under A and E. Every list is editable per slide (`frame.types.lists`); clearing one brings the
// default back.
//
// Pure: no React. TypesFrame.tsx draws it; the Editor (ReviewDeck TypesEditor) edits it.

export const TYPE_TABS = ["A", "L", "E", "Rev", "Exp", "Contra"] as const;
export type TypeTab = (typeof TYPE_TABS)[number];
export type TypeKey = Exclude<TypeTab, "Contra">;
export const TYPE_KEYS: readonly TypeKey[] = ["A", "L", "E", "Rev", "Exp"];

/** The lists a slide can override, by id. */
export const TYPE_LISTS = ["A.current", "A.longterm", "A.contra", "L.current", "L.longterm", "E.all", "E.contra", "Rev.all", "Exp.all"] as const;
export type TypeListId = (typeof TYPE_LISTS)[number];

export interface TypeInfo {
  name: string;
  /** The one-word definition, in his quotes on the slide. */
  word: string;
  /** Increase / decrease — his (+/-) and (-/+). */
  sign: string;
  /** A balance-sheet type: its lists split into current and long-term. */
  term: boolean;
  /** What the long-term group is called with the split off — his "LT Assets". */
  ltLabel?: string;
  /** The contra account that rides inside this type, and its sign. */
  contra?: { label: string; sign: string; list: TypeListId };
}

export const TYPE_INFO: Record<TypeKey, TypeInfo> = {
  A: { name: "Assets", word: "OWN", sign: "+/−", term: true, ltLabel: "LT Assets", contra: { label: "Contra asset", sign: "−/+", list: "A.contra" } },
  L: { name: "Liabilities", word: "OWE", sign: "−/+", term: true, ltLabel: "LT Liabilities" },
  E: { name: "Equity", word: "VALUE", sign: "−/+", term: false, contra: { label: "Contra equity", sign: "+/−", list: "E.contra" } },
  Rev: { name: "Revenue", word: "EARN", sign: "−/+", term: false },
  Exp: { name: "Expenses", word: "COSTS", sign: "+/−", term: false },
};

/** The Contra tab's own header. "Contra" = opposite-of (the registry's own trap note). */
export const CONTRA_INFO = { name: "Contra accounts", word: "OPPOSITE" } as const;

export const DEFAULT_LISTS: Record<TypeListId, readonly string[]> = {
  "A.current": ["Cash", "Supplies", "“Receivables”", "“Prepaids”"],
  "A.longterm": ["Equipment", "Machine", "Car / Truck", "Building"],
  "A.contra": ["Accumulated Depreciation"],
  "L.current": ["“Payables”", "Unearned Revenue"],
  "L.longterm": ["Long-Term Notes Payable", "Mortgage Payable", "Bonds Payable"],
  "E.all": ["Common Stock", "Retained Earnings"],
  "E.contra": ["Dividends"],
  "Rev.all": ["Fees Earned", "Anything “earned”", "Sales"],
  "Exp.all": ["Anything “expense”", "COST OF GOODS SOLD!"],
};

/** What the Editor calls each list. */
export const LIST_LABEL: Record<TypeListId, string> = {
  "A.current": "Current", "A.longterm": "Long-term", "A.contra": "Contra",
  "L.current": "Current", "L.longterm": "Long-term",
  "E.all": "Accounts", "E.contra": "Contra",
  "Rev.all": "Accounts", "Exp.all": "Accounts",
};

/** The slide's saved settings (`frame.types`). Absent fields are the defaults below. */
export interface TypesSpec {
  /** The tab it opens on. Absent = A. */
  tab?: TypeTab;
  /** Split balance-sheet types into current and long-term. Absent = off (his slide nests "LT Assets"). */
  term?: boolean;
  /** Show the contra account inside A and E. Absent = off. */
  contra?: boolean;
  /** The one-word definition. Absent = on. */
  def?: boolean;
  /** The +/− signs. Absent = on. */
  sign?: boolean;
  /** His words, per type. */
  words?: Partial<Record<TypeKey, string>>;
  lists?: Partial<Record<TypeListId, string[]>>;
}

export interface TypesView { tab: TypeTab; term: boolean; contra: boolean; def: boolean; sign: boolean }

export function typesView(spec: TypesSpec | undefined): TypesView {
  return { tab: spec?.tab ?? "A", term: spec?.term ?? false, contra: spec?.contra ?? false, def: spec?.def ?? true, sign: spec?.sign ?? true };
}

/** A list as it draws: his edit (blank lines dropped), else the default. */
export function listOf(spec: TypesSpec | undefined, id: TypeListId): string[] {
  const own = (spec?.lists?.[id] ?? []).map((s) => s.trim()).filter(Boolean);
  return own.length ? own : [...DEFAULT_LISTS[id]];
}

export function wordOf(spec: TypesSpec | undefined, key: TypeKey): string {
  return spec?.words?.[key]?.trim() || TYPE_INFO[key].word;
}

export interface TypeItem { text: string; sub?: string[] }
export interface TypeSection {
  /** "Current", "Long-term", "Contra asset" — absent on a plain list. */
  heading?: string;
  /** A contra group's sign, drawn with its heading. */
  sign?: string;
  contra?: boolean;
  items: TypeItem[];
}

/** What one tab shows, top to bottom. */
export function sectionsFor(spec: TypesSpec | undefined, tab: TypeTab): TypeSection[] {
  const v = typesView(spec);
  if (tab === "Contra") {
    return (["A", "E"] as const).map((k) => {
      const c = TYPE_INFO[k].contra!;
      return { heading: c.label, sign: c.sign, contra: true, items: listOf(spec, c.list).map((text) => ({ text })) };
    });
  }
  const info = TYPE_INFO[tab];
  const out: TypeSection[] = [];
  if (info.term) {
    const cur = listOf(spec, `${tab}.current` as TypeListId).map((text) => ({ text }));
    const lt = listOf(spec, `${tab}.longterm` as TypeListId);
    if (v.term) out.push({ heading: "Current", items: cur }, { heading: "Long-term", items: lt.map((text) => ({ text })) });
    else out.push({ items: [...cur, ...(lt.length ? [{ text: info.ltLabel ?? "Long-term", sub: lt }] : [])] });
  } else {
    out.push({ items: listOf(spec, `${tab}.all` as TypeListId).map((text) => ({ text })) });
  }
  if (v.contra && info.contra) out.push({ heading: info.contra.label, sign: info.contra.sign, contra: true, items: listOf(spec, info.contra.list).map((text) => ({ text })) });
  return out;
}

/** The lists the Editor offers for one type, in order. */
export function listsOfType(key: TypeKey): TypeListId[] {
  return TYPE_LISTS.filter((id) => id.startsWith(`${key}.`));
}

/** Set one list from the Editor's lines. All blank = back to the default (the field is dropped). */
export function withList(spec: TypesSpec | undefined, id: TypeListId, lines: string[]): TypesSpec {
  const lists = { ...(spec?.lists ?? {}) };
  if (lines.some((l) => l.trim())) lists[id] = lines; else delete lists[id];
  return { ...(spec ?? {}), lists };
}

/** Set one type's word. Blank = back to the default. */
export function withWord(spec: TypesSpec | undefined, key: TypeKey, word: string): TypesSpec {
  const words = { ...(spec?.words ?? {}) };
  if (word.trim()) words[key] = word; else delete words[key];
  return { ...(spec ?? {}), words };
}
