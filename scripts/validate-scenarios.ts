// Scenario library QA — `bun run scenarios:validate`
//
// Pulls EVERY je_scenarios row from the live DB and exercises it through the same engine
// code the /je route runs: Zod parse, variant resolution for every axis combination,
// amount resolution (literal + schedule-backed slots), per-entry balance, question/option
// resolution, Build-mode account-bank coverage, and chart_of_accounts coverage.
//
// ERRORS are student-visible breakages (unresolvable default view, unbalanced entry,
// unwinnable Build mode, questions that can never resolve). WARNINGS are degradations
// (uncovered toggle combos, accounts missing from the COA, raw {placeholders}).
// Exits non-zero when any ERROR exists — safe for CI.
//
// Uses the SERVICE-ROLE key (bun auto-loads .env), same as scripts/import-scenarios.ts.

import { createClient } from "@supabase/supabase-js";

import {
  isBalanced,
  resolveVariant,
  validateEntry,
  type EngineLine,
  type ScenarioDoc,
  type Variant,
} from "../src/lib/je-engine";
import { buildExplore } from "../src/lib/je/explore";
import { resolveSlot } from "../src/lib/je/slot-resolver";
import { normalizeScenarioDoc, scenarioDocV2Schema } from "../src/lib/je/scenario-schema";

interface Finding {
  slug: string;
  level: "ERROR" | "WARN";
  code: string;
  detail: string;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (expected in .env)`);
  return v;
}

/** Cartesian product of all axis options (docs are small — a few dozen combos max). */
function allCombos(doc: ScenarioDoc): Record<string, string>[] {
  let combos: Record<string, string>[] = [{}];
  for (const axis of doc.axes) {
    const next: Record<string, string>[] = [];
    for (const combo of combos)
      for (const opt of axis.options) next.push({ ...combo, [axis.key]: opt.value });
    combos = next;
  }
  return combos;
}

function defaultConditions(doc: ScenarioDoc): Record<string, string> {
  const c: Record<string, string> = {};
  for (const a of doc.axes) c[a.key] = a.options[0]?.value ?? "";
  return c;
}

function comboLabel(c: Record<string, string>): string {
  const s = Object.entries(c).map(([k, v]) => `${k}=${v}`).join(",");
  return s || "(no axes)";
}

async function main(): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL ?? env("VITE_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const { data: rows, error } = await (supabase.from("je_scenarios" as never) as any).select(
    "slug,title,doc",
  );
  if (error) throw error;
  const { data: coaRows, error: coaErr } = await supabase
    .from("chart_of_accounts")
    .select("canonical_name");
  if (coaErr) throw coaErr;
  const coaNames = new Set(((coaRows ?? []) as { canonical_name: string }[]).map((r) => r.canonical_name));

  const findings: Finding[] = [];
  const missingCoa = new Map<string, number>(); // account → docs referencing it
  let docsChecked = 0;
  let questionsResolvable = 0;
  let questionsTotal = 0;

  for (const row of (rows ?? []) as { slug: string; doc: unknown }[]) {
    docsChecked++;
    const slug = row.slug;
    const push = (level: Finding["level"], code: string, detail: string) =>
      findings.push({ slug, level, code, detail });

    // ---- 1. schema ----
    const parsed = scenarioDocV2Schema.safeParse(normalizeScenarioDoc(row.doc));
    if (!parsed.success) {
      push("ERROR", "schema", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
      continue;
    }
    const doc = parsed.data as ScenarioDoc;

    // ---- 2. every axis combination resolves to a variant ----
    const combos = allCombos(doc);
    const defaults = defaultConditions(doc);
    for (const combo of combos) {
      const v = resolveVariant(doc, combo);
      if (!v) {
        const isDefault = comboLabel(combo) === comboLabel(defaults);
        push(isDefault ? "ERROR" : "WARN", isDefault ? "default-unresolved" : "combo-unresolved",
          `no variant matches ${comboLabel(combo)}`);
      }
    }

    // ---- 3. per-variant entry checks ----
    const hasParams = !!doc.params;
    const usedAccounts = new Set<string>();
    for (const variant of doc.variants) {
      for (const entry of variant.entries ?? []) {
        for (const p of validateEntry(entry)) push("ERROR", "entry-structure", `${variant.id}/${entry.id}: ${p}`);
        for (const line of entry.lines) {
          usedAccounts.add(line.account);
          if (!coaNames.has(line.account)) missingCoa.set(line.account, (missingCoa.get(line.account) ?? 0) + 1);
          if (line.amountSlotKey && !hasParams && typeof line.amount !== "number") {
            push("ERROR", "slot-without-params",
              `${variant.id}/${entry.id}/${line.id}: amountSlotKey "${line.amountSlotKey}" but doc has no params — renders ???`);
          }
        }
        // literal balance: only when every line carries a literal amount
        const allLiteral = entry.lines.every((l) => typeof l.amount === "number");
        if (allLiteral && isBalanced(entry) === false) {
          const dr = entry.lines.filter((l) => l.side === "debit").reduce((s, l) => s + (l.amount as number), 0);
          const cr = entry.lines.filter((l) => l.side === "credit").reduce((s, l) => s + (l.amount as number), 0);
          push("ERROR", "unbalanced", `${variant.id}/${entry.id}: dr ${dr} ≠ cr ${cr}`);
        }
        const someLiteral = entry.lines.some((l) => typeof l.amount === "number");
        if (someLiteral && !allLiteral && !hasParams) {
          const blanks = entry.lines.filter((l) => typeof l.amount !== "number" && !l.amountSlotKey).map((l) => l.id);
          if (blanks.length > 0)
            push("WARN", "partial-amounts", `${variant.id}/${entry.id}: lines [${blanks.join(",")}] render ??? next to real numbers`);
        }
      }
    }

    // ---- 4. bond docs: every line resolves for every combo ----
    if (hasParams) {
      for (const combo of combos) {
        const variant = resolveVariant(doc, combo);
        if (!variant) continue;
        let ex;
        try {
          ex = buildExplore(doc, combo, doc.params!.defaultSeed ?? 1, false);
        } catch (e) {
          push("ERROR", "explore-throws", `${comboLabel(combo)}: ${e instanceof Error ? e.message : e}`);
          continue;
        }
        if (!ex) continue;
        for (const entry of variant.entries ?? []) {
          for (const line of entry.lines) {
            if (!line.amountSlotKey && typeof line.amount !== "number") continue; // authored ???
            const r = ex.resolveLine(line as EngineLine);
            if (!r) push("ERROR", "line-unresolvable", `${variant.id}/${entry.id}/${line.id} @ ${comboLabel(combo)}`);
          }
        }
      }
    }

    // ---- 5. Build mode: the bank must cover every account the entries use ----
    if (doc.build) {
      const bank = new Map(doc.build.accountBank.map((b) => [b.account, b]));
      for (const acct of usedAccounts) {
        const hit = bank.get(acct);
        if (!hit) push("ERROR", "bank-missing", `entries use "${acct}" but build.accountBank lacks it — Build mode unwinnable`);
        else if (hit.decoy) push("ERROR", "bank-decoy-used", `"${acct}" is marked decoy but the entries USE it`);
      }
    }

    // ---- 6. questions resolve (mirrors hub.tsx buildDocQuestions: defaults first, then
    // every other combo — a question authored about a non-default condition may collapse
    // at par but resolve at a discount) ----
    const schedules: (ReturnType<typeof resolveSlot> extends infer _ ? any : never)[] = [];
    if (hasParams) {
      const ordered = [defaults, ...combos.filter((c) => comboLabel(c) !== comboLabel(defaults))];
      for (const c of ordered) {
        try {
          const s = buildExplore(doc, c, doc.params!.defaultSeed ?? 1, false)?.schedule ?? null;
          if (s) schedules.push(s);
        } catch { /* combo can't build — try next */ }
      }
      if (schedules.length === 0) schedules.push(null);
    } else {
      schedules.push(null);
    }
    for (const q of doc.questions ?? []) {
      questionsTotal++;
      let resolved = false;
      let lastFail = "";
      for (const schedule of schedules) {
        try {
          const answer = resolveSlot(q.answerExpr, schedule).value;
          const values = new Set<number>([answer]);
          for (const d of q.distractors) {
            try { values.add(resolveSlot(d.expr, schedule).value); } catch { /* single bad distractor: tolerable */ }
          }
          if (values.size >= 2) { resolved = true; break; }
          lastFail = `all options resolve to ${answer} under every combo`;
        } catch (e) {
          lastFail = `answerExpr "${q.answerExpr}" — ${e instanceof Error ? e.message : e}`;
          break; // a bad ref won't improve under another combo
        }
      }
      if (resolved) questionsResolvable++;
      else push("ERROR", "question-dead", `${q.id}: ${lastFail}`);
    }

    // ---- 7. event prose placeholders need params to substitute ----
    if (!hasParams && /\{\w+\}/.test(doc.event)) {
      push("WARN", "raw-placeholders", `event text contains {placeholders} but doc has no params — renders literally`);
    }
  }

  // ---- report ----
  const errors = findings.filter((f) => f.level === "ERROR");
  const warns = findings.filter((f) => f.level === "WARN");

  const byCode = (list: Finding[]) => {
    const m = new Map<string, Finding[]>();
    for (const f of list) { const a = m.get(f.code) ?? []; a.push(f); m.set(f.code, a); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  };

  console.log(`\n=== scenario QA: ${docsChecked} docs, ${questionsResolvable}/${questionsTotal} questions resolvable ===`);
  for (const [label, list] of [["ERRORS", errors], ["WARNINGS", warns]] as const) {
    console.log(`\n---- ${label}: ${list.length} ----`);
    for (const [code, fs] of byCode(list)) {
      console.log(`  [${code}] ×${fs.length}`);
      for (const f of fs.slice(0, 12)) console.log(`     ${f.slug}: ${f.detail}`);
      if (fs.length > 12) console.log(`     … and ${fs.length - 12} more`);
    }
  }

  if (missingCoa.size > 0) {
    console.log(`\n---- INFO: accounts used by entries but missing from chart_of_accounts (${missingCoa.size}) ----`);
    console.log(`     (statements/equation panels show these as unclassified until added)`);
    for (const [acct, n] of [...missingCoa.entries()].sort((a, b) => b[1] - a[1]))
      console.log(`     ${acct}  (${n} doc${n > 1 ? "s" : ""})`);
  }

  console.log(`\n${errors.length === 0 ? "✅ no errors" : `❌ ${errors.length} error(s)`} · ${warns.length} warning(s)`);
  if (errors.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
