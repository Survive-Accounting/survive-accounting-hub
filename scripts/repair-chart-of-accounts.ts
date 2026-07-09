// One-time chart_of_accounts repair — `bun scripts/repair-chart-of-accounts.ts`
// Recorded as migration 0051 (data-only; no DDL). Idempotent — safe to re-run.
//
// SAFE TO DELETE ROWS: chart_of_accounts has no inbound foreign keys (generated types show
// Relationships: []), and the whole JE engine matches accounts by canonical_name (string),
// never by id. So collapsing duplicate rows orphans nothing.
//
// Three operations, in order:
//   1. DEDUPE  — rows sharing an exact canonical_name (e.g. "Cash" stored twice, once with
//                lowercase enum values, once capitalized). Keep one winner per name, delete
//                the rest. Only EXACT-name dupes; near-variants ("Salaries Payable" vs
//                "Salaries & Wages Payable") are left alone and REPORTED, not merged.
//   2. NORMALIZE — coerce the winner's account_type/normal_balance to the lowercase
//                vocabulary je-engine consumes ("Liability"→"liability", "Other Income"→
//                "revenue", etc.); Premium on Bonds Payable → liability_adjunct.
//   3. INSERT  — every account the scenario library uses that the COA still lacks.
//   4. MERGE   — punctuation/plural variants that mean the SAME account as an existing
//                canonical row (e.g. "Building"→"Buildings", "Salaries & Wages Payable"→
//                "Salaries and Wages Payable"). Delete the loser; the scenario docs that
//                referenced it are rewritten to the winner name in the same commit.

import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const TYPE_MAP: Record<string, string> = {
  asset: "asset", liability: "liability", equity: "equity", revenue: "revenue", expense: "expense",
  "contra asset": "contra_asset", "contra liability": "contra_liability", "contra equity": "contra_equity",
  "contra revenue": "contra_revenue", "other income": "revenue", "other expense": "expense",
  contra_asset: "contra_asset", contra_liability: "contra_liability", contra_equity: "contra_equity",
  contra_revenue: "contra_revenue", liability_adjunct: "liability_adjunct",
};
// Base types are the least specific; when a same-name group disagrees, the more specific wins.
const SPECIFICITY: Record<string, number> = {
  liability_adjunct: 3, contra_asset: 3, contra_liability: 3, contra_equity: 3, contra_revenue: 3,
  asset: 1, liability: 1, equity: 1, revenue: 1, expense: 1,
};
const NAME_TYPE_OVERRIDE: Record<string, string> = {
  "Premium on Bonds Payable": "liability_adjunct",
};

interface Row { id: string; canonical_name: string; account_type: string | null; normal_balance: string | null; is_global_default: boolean | null; keywords: string[] | null; created_at: string; }

const { data, error } = await sb
  .from("chart_of_accounts")
  .select("id,canonical_name,account_type,normal_balance,is_global_default,keywords,created_at");
if (error) throw error;
const rows = data as Row[];
console.log(`fetched ${rows.length} rows`);

// ---- group by exact canonical_name ----
const groups = new Map<string, Row[]>();
for (const r of rows) {
  const name = r.canonical_name ?? "(null)";
  const g = groups.get(name) ?? [];
  g.push(r);
  groups.set(name, g);
}

const toDelete: string[] = [];
const toUpdate: { id: string; account_type: string; normal_balance: string; keywords: string[] | null }[] = [];
const conflicts: string[] = [];

for (const [name, g] of groups) {
  // target type: name override → most-specific normalized type present → fallback
  const normTypes = g.map((r) => TYPE_MAP[(r.account_type ?? "").toLowerCase()]).filter(Boolean) as string[];
  let targetType = NAME_TYPE_OVERRIDE[name];
  if (!targetType) {
    targetType = normTypes.sort((a, b) => (SPECIFICITY[b] ?? 2) - (SPECIFICITY[a] ?? 2))[0] ?? null as any;
    const distinct = new Set(normTypes);
    if (distinct.size > 1) conflicts.push(`${name}: types ${[...distinct].join(" / ")} → chose ${targetType}`);
  }
  // target normal_balance: majority lowercase value (they always agree in practice)
  const nbs = g.map((r) => (r.normal_balance ?? "").toLowerCase()).filter((v) => v === "debit" || v === "credit");
  const targetNb = nbs[0] ?? "debit";
  if (!targetType) { conflicts.push(`${name}: UNMAPPED type, skipped`); continue; }

  // winner: prefer is_global_default, then oldest, then lowest id — deterministic
  const winner = [...g].sort((a, b) =>
    Number(b.is_global_default ?? false) - Number(a.is_global_default ?? false) ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id),
  )[0];

  // merge any keywords across the group onto the winner
  const kw = [...new Set(g.flatMap((r) => r.keywords ?? []))];
  const mergedKw = kw.length > 0 ? kw : null;

  toUpdate.push({ id: winner.id, account_type: targetType, normal_balance: targetNb, keywords: mergedKw });
  for (const r of g) if (r.id !== winner.id) toDelete.push(r.id);
}

console.log(`\nplan: ${toUpdate.length} winners to normalize, ${toDelete.length} duplicate rows to delete`);
if (conflicts.length) { console.log("type conflicts resolved:"); for (const c of conflicts) console.log("   " + c); }

// ---- report near-duplicate NAME variants (NOT merged — informational) ----
const canon = (s: string) => s.toLowerCase().replace(/[—–-]/g, " ").replace(/&/g, "and").replace(/\s+/g, " ").trim();
const byCanon = new Map<string, string[]>();
for (const name of groups.keys()) {
  const k = canon(name);
  const a = byCanon.get(k) ?? [];
  a.push(name);
  byCanon.set(k, a);
}
const nearDupes = [...byCanon.values()].filter((names) => names.length > 1);
if (nearDupes.length) {
  console.log(`\nNEAR-DUPLICATE name variants (left intact — merging these is a meaning call, your review):`);
  for (const names of nearDupes) console.log("   " + names.join("   |   "));
}

// ---- execute: delete losers, then normalize winners ----
if (toDelete.length) {
  // delete in chunks to keep the URL short
  for (let i = 0; i < toDelete.length; i += 50) {
    const chunk = toDelete.slice(i, i + 50);
    const { error: delErr } = await sb.from("chart_of_accounts").delete().in("id", chunk);
    if (delErr) throw new Error(`delete failed: ${delErr.message}`);
  }
  console.log(`deleted ${toDelete.length} duplicate rows`);
}
let normalized = 0;
for (const u of toUpdate) {
  const before = rows.find((r) => r.id === u.id)!;
  const kwSame = JSON.stringify(before.keywords ?? null) === JSON.stringify(u.keywords);
  if (before.account_type === u.account_type && before.normal_balance === u.normal_balance && kwSame) continue;
  const { error: upErr } = await sb.from("chart_of_accounts")
    .update({ account_type: u.account_type, normal_balance: u.normal_balance, keywords: u.keywords })
    .eq("id", u.id);
  if (upErr) throw new Error(`normalize failed (${u.id}): ${upErr.message}`);
  normalized++;
}
console.log(`normalized ${normalized} winner rows`);

// ---- insert missing accounts the scenario library uses ----
const NEW: Record<string, [string, "debit" | "credit"]> = {
  "Paid-in Capital in Excess of Par — Common": ["equity", "credit"],
  "Paid-in Capital in Excess of Par — Preferred": ["equity", "credit"],
  "Paid-in Capital in Excess of Stated Value": ["equity", "credit"],
  "Paid-in Capital — Stock Options": ["equity", "credit"],
  "Paid-in Capital — Expired Stock Options": ["equity", "credit"],
  "Paid-in Capital — Stock Warrants": ["equity", "credit"],
  "Paid-in Capital from Treasury Stock": ["equity", "credit"],
  "Paid-In Capital, Treasury Stock": ["equity", "credit"],
  "Common Stock Dividend Distributable": ["equity", "credit"],
  "Income Summary": ["equity", "credit"],
  "Owner's Capital": ["equity", "credit"],
  "Owner's Draws": ["contra_equity", "debit"],
  "Unearned Compensation": ["contra_equity", "debit"],
  "OCI—Gain/Loss": ["equity", "credit"],
  "OCI—Prior Service Cost": ["contra_equity", "debit"],
  "Unrealized Holding Gain or Loss — Equity": ["equity", "credit"],
  "Debt Investments": ["asset", "debit"],
  "Equity Investments": ["asset", "debit"],
  "Right-of-Use Asset": ["asset", "debit"],
  "Lease Receivable": ["asset", "debit"],
  "Fair Value Adjustment — AFS": ["asset", "debit"],
  "Fair Value Adjustment — Trading": ["asset", "debit"],
  "Fair Value Adjustment — Equity Investments": ["asset", "debit"],
  "Construction in Process": ["asset", "debit"],
  "Inventory on Consignment": ["asset", "debit"],
  "Estimated Inventory Returns": ["asset", "debit"],
  "Equipment (new)": ["asset", "debit"],
  "Equipment (old)": ["asset", "debit"],
  "Petty Cash": ["asset", "debit"],
  "Coal Inventory": ["asset", "debit"],
  "Repair Parts Inventory": ["asset", "debit"],
  "Work in Process—Assembly": ["asset", "debit"],
  "Work in Process—Cutting": ["asset", "debit"],
  "Accumulated Depreciation": ["contra_asset", "credit"],
  "Lease Liability": ["liability", "credit"],
  "Pension Asset/Liability": ["liability", "credit"],
  "Liability to Repurchase Inventory": ["liability", "credit"],
  "Refund Liability": ["liability", "credit"],
  "Warranty Liability": ["liability", "credit"],
  "Estimated Warranty Liability": ["liability", "credit"],
  "Unearned Warranty Revenue": ["liability", "credit"],
  "Estimated Liability on Purchase Commitments": ["liability", "credit"],
  "Dividends Payable — Preferred": ["liability", "credit"],
  "Dividends Payable — Common": ["liability", "credit"],
  "FICA Taxes Payable": ["liability", "credit"],
  "Sales Taxes Payable": ["liability", "credit"],
  "Employee Income Taxes Payable": ["liability", "credit"],
  "Federal Unemployment Taxes Payable": ["liability", "credit"],
  "State Unemployment Taxes Payable": ["liability", "credit"],
  "Salaries and Wages Payable": ["liability", "credit"],
  "Wages Payable": ["liability", "credit"],
  "Factory Wages Payable": ["liability", "credit"],
  "Discount on Notes Payable": ["contra_liability", "debit"],
  "Fair Value Adjustment — Bonds Payable": ["contra_liability", "debit"],
  "Unrealized Holding Gain or Loss — Income": ["revenue", "credit"],
  "Gain on Sale of Investments": ["revenue", "credit"],
  "Gain on Sale of Equipment": ["revenue", "credit"],
  "Gain on Exchange": ["revenue", "credit"],
  "Dividend Revenue": ["revenue", "credit"],
  "Investment Income": ["revenue", "credit"],
  "Lease Revenue": ["revenue", "credit"],
  "Warranty Revenue": ["revenue", "credit"],
  "Revenue from Long-Term Contracts": ["revenue", "credit"],
  "Compensation Expense": ["expense", "debit"],
  "Pension Expense": ["expense", "debit"],
  "Factory Overhead": ["expense", "debit"],
  "Lease Expense": ["expense", "debit"],
  "Advertising Expense": ["expense", "debit"],
  "Bond Interest Expense": ["expense", "debit"],
  "Debt Conversion Expense": ["expense", "debit"],
  "Construction Expenses": ["expense", "debit"],
  "Loss from Long-Term Contracts": ["expense", "debit"],
  "Loss on Sale of Investments": ["expense", "debit"],
  "Loss on Sale of Equipment": ["expense", "debit"],
  "Loss on Inventory Write-Down": ["expense", "debit"],
  "Loss on Impairment": ["expense", "debit"],
  "Loss on Purchase Commitments": ["expense", "debit"],
  "Loss on Bond Retirement": ["expense", "debit"],
  "Commission Expense": ["expense", "debit"],
  "Warranty Expense": ["expense", "debit"],
  "Operating Expenses": ["expense", "debit"],
  "Expenses (total)": ["expense", "debit"],
  "Salaries and Wages Expense": ["expense", "debit"],
  "Wages Expense": ["expense", "debit"],
  "Payroll Taxes Expense": ["expense", "debit"],
  "Purchases": ["expense", "debit"],
  "Purchase Discounts Lost": ["expense", "debit"],
  "Repairs and Maintenance Expense": ["expense", "debit"],
  "Miscellaneous Expense": ["expense", "debit"],
  "Postage Expense": ["expense", "debit"],
  "Office Supplies Expense": ["expense", "debit"],
  "Delivery Expense": ["expense", "debit"],
  "Cash Over and Short": ["expense", "debit"],
};
const survivingNames = new Set(groups.keys()); // names that still exist after dedupe (winners kept)
const toInsert = Object.entries(NEW)
  .filter(([name]) => !survivingNames.has(name))
  .map(([name, [type, nb]]) => ({ canonical_name: name, account_type: type, normal_balance: nb, is_global_default: true }));
console.log(`\ninserting ${toInsert.length} new accounts (of ${Object.keys(NEW).length} candidates)`);
if (toInsert.length) {
  const { error: insErr } = await sb.from("chart_of_accounts").insert(toInsert as never);
  if (insErr) throw new Error(`insert failed: ${insErr.message}`);
}

// ---- 4. MERGE punctuation/plural variants into their canonical row (delete losers) ----
// The scenario docs referencing the loser are rewritten to the winner name in the same commit.
const MERGES: Record<string, string> = {
  "Building": "Buildings",
  "Accumulated Depreciation—Building": "Accumulated Depreciation—Buildings",
  "Salaries & Wages Payable": "Salaries and Wages Payable",
};
const { data: postInsert } = await sb.from("chart_of_accounts").select("id,canonical_name");
const nameToIds = new Map<string, string[]>();
for (const r of (postInsert ?? []) as { id: string; canonical_name: string }[]) {
  const a = nameToIds.get(r.canonical_name) ?? [];
  a.push(r.id);
  nameToIds.set(r.canonical_name, a);
}
let merged = 0;
for (const [loser, winner] of Object.entries(MERGES)) {
  const loserIds = nameToIds.get(loser) ?? [];
  if (loserIds.length === 0) continue; // already merged (idempotent)
  if (!nameToIds.has(winner)) { console.log(`⚠ merge skipped: winner "${winner}" absent`); continue; }
  const { error: mErr } = await sb.from("chart_of_accounts").delete().in("id", loserIds);
  if (mErr) throw new Error(`merge delete failed (${loser}): ${mErr.message}`);
  merged += loserIds.length;
  console.log(`merged "${loser}" → "${winner}" (deleted ${loserIds.length})`);
}
if (merged) console.log(`merged ${merged} variant rows`);

// ---- verify ----
const { data: after } = await sb.from("chart_of_accounts").select("canonical_name,account_type,normal_balance");
const a = after as { canonical_name: string; account_type: string; normal_balance: string }[];
const seen = new Map<string, number>();
for (const r of a) seen.set(r.canonical_name, (seen.get(r.canonical_name) ?? 0) + 1);
const dupes = [...seen.entries()].filter(([, n]) => n > 1);
const validTypes = new Set(Object.values(TYPE_MAP));
const badType = a.filter((r) => !validTypes.has(r.account_type));
const badNb = a.filter((r) => r.normal_balance !== "debit" && r.normal_balance !== "credit");
console.log(`\n=== POST-CHECK ===`);
console.log(`total rows: ${a.length}`);
console.log(`exact-name duplicates: ${dupes.length} ${dupes.length ? "❌ " + dupes.map(([n, c]) => `${n}(${c})`).join(", ") : "✅"}`);
console.log(`rows with non-canonical type: ${badType.length} ${badType.length ? "❌ " + [...new Set(badType.map((r) => r.account_type))].join(", ") : "✅"}`);
console.log(`rows with bad normal_balance: ${badNb.length} ${badNb.length ? "❌" : "✅"}`);
console.log(dupes.length === 0 && badType.length === 0 && badNb.length === 0 ? "\n✅ COA repair complete & clean" : "\n❌ post-check found problems");
