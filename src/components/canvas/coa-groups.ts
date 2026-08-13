// Chart-of-accounts grouping — Manage Accounts (both the master list and a
// course's curated set) groups rows under the 5 balance-sheet/income-
// statement type headers. Contra accounts (and the liability_adjunct
// oddball) nest under their PARENT type, not a 6th "contra" bucket — the
// existing CONTRA(+DR/+CR) badge already carries that distinction per-row.
export const COA_GROUP_ORDER = ["Assets", "Liabilities", "Equity", "Revenue", "Expenses"] as const;
export type CoaGroupName = (typeof COA_GROUP_ORDER)[number];

const TYPE_TO_GROUP: Record<string, CoaGroupName> = {
  asset: "Assets",
  contra_asset: "Assets",
  liability: "Liabilities",
  contra_liability: "Liabilities",
  liability_adjunct: "Liabilities",
  equity: "Equity",
  contra_equity: "Equity",
  revenue: "Revenue",
  contra_revenue: "Revenue",
  expense: "Expenses",
};

export function groupNameForType(accountType: string): CoaGroupName {
  return TYPE_TO_GROUP[accountType] ?? "Assets";
}

/** Buckets rows into the 5 groups (GROUP_ORDER), alphabetical by name within
 *  each group. Groups with zero rows are omitted — nothing to collapse. */
export function groupCoaByType<T extends { canonical_name: string; account_type: string }>(
  rows: T[],
): { group: CoaGroupName; rows: T[] }[] {
  const buckets = new Map<CoaGroupName, T[]>();
  for (const r of rows) {
    const g = groupNameForType(r.account_type);
    (buckets.get(g) ?? buckets.set(g, []).get(g)!).push(r);
  }
  for (const list of buckets.values()) list.sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
  return COA_GROUP_ORDER.filter((g) => buckets.has(g)).map((g) => ({ group: g, rows: buckets.get(g)! }));
}
