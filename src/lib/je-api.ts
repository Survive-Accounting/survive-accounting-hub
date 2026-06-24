// JE Scenario Engine data layer — the thin DB boundary (parallel to ceq-api.ts).
// The /je route goes through THIS file; it must not import the Supabase client itself.
// je-engine.ts stays pure; this is where I/O lives.
import { supabase } from "@/integrations/supabase/client";
import { fetchChartOfAccounts } from "@/lib/ceq-api";
import type { AccountMeta, AccountType, ScenarioDoc } from "@/lib/je-engine";

// ---- Scenarios ----

export interface ScenarioRow {
  id: string;
  slug: string;
  title: string;
  doc: ScenarioDoc;
}

/** List all scenarios (lightweight — full doc included; the prototype set is small). */
export async function fetchScenarios(): Promise<ScenarioRow[]> {
  // je_scenarios is not in the generated Supabase types yet, so we cast like ceq-api does.
  const { data, error } = await (supabase.from("je_scenarios" as never) as any)
    .select("id,slug,title,doc")
    .order("title");
  if (error) throw error;
  return ((data ?? []) as any[]).map(toScenarioRow);
}

export async function fetchScenarioBySlug(slug: string): Promise<ScenarioRow | null> {
  const { data, error } = await (supabase.from("je_scenarios" as never) as any)
    .select("id,slug,title,doc")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? toScenarioRow(data) : null;
}

function toScenarioRow(r: any): ScenarioRow {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    doc: (r.doc ?? {}) as ScenarioDoc,
  };
}

// ---- Principles (reference table) ----

export interface PrincipleRow {
  key: string;
  label: string;
  short_desc: string | null;
  sort: number | null;
}

export async function fetchPrinciples(): Promise<PrincipleRow[]> {
  const { data, error } = await (supabase.from("je_principles" as never) as any)
    .select("key,label,short_desc,sort")
    .order("sort");
  if (error) throw error;
  return (data ?? []) as PrincipleRow[];
}

// ---- Account metadata (reuse the chart-of-accounts fetch; map rows → AccountMeta) ----

const KNOWN_ACCOUNT_TYPES = new Set<AccountType>([
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
  "contra_asset",
  "contra_liability",
  "contra_equity",
  "contra_revenue",
  "liability_adjunct",
]);

/** Chart of accounts → AccountMeta[], the shape the pure engine consumes. */
export async function fetchAccountMeta(): Promise<AccountMeta[]> {
  const rows = await fetchChartOfAccounts();
  return rows.map((r) => ({
    canonical_name: r.canonical_name,
    account_type: KNOWN_ACCOUNT_TYPES.has(r.account_type as AccountType)
      ? (r.account_type as AccountType)
      : ("asset" as AccountType), // defensive fallback for unexpected types
    normal_balance: r.normal_balance === "credit" ? "credit" : "debit",
  }));
}
