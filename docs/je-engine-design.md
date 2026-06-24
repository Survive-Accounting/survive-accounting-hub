# Journal Entry Scenario Engine — Design

> Status: **Phase 1 prototype** (crude UI, correct model). This doc is the contract that
> later phases bolt onto. The engine (`src/lib/je-engine.ts`) is pure; everything else
> projects off it.

## The core idea

The atom of this system is **not** a journal entry. It is a **Scenario**: a real-world
event that produces journal entries, which vary based on **conditions**.

- **Sell equipment** varies by outcome (gain / loss / break-even) — the *structure* of the
  entry changes (a Gain credit vs. a Loss debit vs. neither).
- **Record a merchandise sale** varies by method (perpetual / periodic) — perpetual posts
  two entries, periodic posts one.
- **Recognize unearned revenue** keeps the *same* entry but the *computation path* differs
  (months elapsed vs. % complete).

A Scenario declares **condition axes** and holds **enumerated variants**, each tagged with
the condition values it represents. A journal entry is what you get when you fix the
conditions (`resolveVariant`). The ledger (T-accounts), the financial statements, the trial
balance, and the accounting equation are all **live projections** computed from the entry —
never separately authored. **One truth, many views.**

The centerpiece interaction: **the student toggles a condition and the entry + all
downstream projections re-derive live.** No incumbent (McGraw Connect, Pearson, Cengage)
does this — they hardcode each problem. This is the differentiator.

Amounts are **not** important yet — Phase 1 uses `???` placeholders. The pedagogy lives in
structure, reasoning ("why this account, why this side"), and how entries vary. The engine
types already accept amounts so the numbers phase drops in cleanly.

## Architecture / one source of truth

```
chart_of_accounts ──┐                       ┌─ Ledger (deriveLedger)
                    ├─ AccountMeta ──┐       ├─ Statement effects (deriveStatementEffects)
je_scenarios.doc ───┘                ├─ engine ─┤─ Equation (deriveEquationEffect)
  (ScenarioDoc)                      │       └─ Trace / highlight (tracePostingsToStatementLine)
                                resolveVariant
```

- **`src/lib/je-engine.ts`** — PURE. No React, no fetch, no Supabase. Types + projection
  functions. Because it is pure, the same projection logic feeds the student tool, Lee's
  filming, and (later) an auto-rendered video pipeline (Remotion / Motion-Canvas).
- **`src/lib/je-api.ts`** — the thin DB boundary (parallel to `ceq-api.ts`). The `/je` route
  never imports the Supabase client directly.
- **`src/routes/je.tsx`** — the prototype UI. Crude on purpose.

### Reuse, not reinvention

- Reuses `chart_of_accounts` (`account_type`, `normal_balance`) — this is what makes
  projections possible. asset/liability/equity → balance sheet; revenue/expense → income
  statement; contra accounts follow their parent and are handled by the equation-bucket rule
  below.
- Reuses the existing `JeLine` field names (`account`, `side`, `label`, `tooltip`).
  `EngineLine extends JeLine`.
- **`deriveLedger` is the single ledger implementation.** The Resource Bank's
  `deriveTAccounts` (`ResourceBankSection.tsx`) now delegates to it, so there is one truth.

### The projection rule that makes contra accounts "just work"

Within an equation bucket, a **debit always pushes the asset side up and the
liability+equity side down** (and a credit the reverse) — regardless of whether the account
is a contra account — because the contra's `normal_balance` already encodes its sign. So:

| Bucket | Debit | Credit |
| --- | --- | --- |
| Assets (`asset`, `contra_asset`) | up | down |
| Liabilities (`liability`, `contra_liability`, `liability_adjunct`) | down | up |
| Equity (`equity`, `contra_equity`, `revenue`, `contra_revenue`, `expense`) | down | up |

Gains and losses are modeled as `revenue` (credit) and `expense` (debit) account types in the
chart of accounts, so they fall out of the same rule.

## Data model

Stored as a single **jsonb document** per scenario (`je_scenarios.doc`). We are prototyping
and will iterate the shape constantly, so we deliberately do **not** over-normalize into many
tables yet. Canonical TypeScript lives in `src/lib/je-engine.ts`:

`ScenarioDoc → ConditionAxis[] + Variant[]`, `Variant → EntryTemplate[] + ComputationPath[]`,
`EntryTemplate → EngineLine[]`. Every scenario/variant/entry/line carries a **stable id** so
CEQs and sequences can target a specific cell later.

### Tables (migration `0021_je_scenarios.sql`)

- **`je_scenarios`** — `id`, `slug` (unique), `title`, `doc jsonb`, `created_at`,
  `updated_at` (+ shared `set_updated_at` trigger). The whole `ScenarioDoc` lives in `doc`.
- **`je_principles`** — seeded reference table (`key`, `label`, `short_desc`, `sort`).
- **RLS:** authenticated full access; anon `SELECT` only on both tables (students read; no
  anon writes).
- **Chart of accounts:** the migration adds any referenced accounts missing from the 0018
  seed (Merchandise Inventory, Unearned Service Revenue, Gain/Loss on Disposal of Equipment).

### Seed scenarios (the prototype's testable surface)

1. **`sell-equipment-cash`** — axis `outcome: gain | loss | even`. Flagship structural-variant
   demo: the Gain credit / Loss debit / neither line is the toggle's payload, with a strong
   `trap` on the gain/loss line.
2. **`merch-sale`** — axis `method: perpetual | periodic`. Perpetual = **two** entries
   (revenue + COGS); periodic = **one**. Demonstrates variants with differing entry counts.
3. **`adjust-unearned-revenue`** — axis `given: months_elapsed | percent_complete`. **Same**
   entry both ways; two `computationPaths` carry the difference. Demonstrates
   computation-path-as-axis.
4. **`adjust-depreciation`** — axes `method × period`. Same two accounts; four
   `computationPaths` carry the variation. The richest computation example.

## Engine API (Phase 1)

| Function | Purpose |
| --- | --- |
| `resolveVariant(scenario, selected)` | Fix conditions → the matching `Variant` (or `null` → "not built yet"). The centerpiece. |
| `resolveComputationPath(variant, selected)` | Pick the active `ComputationPath` (catch-all if none `appliesWhen`). |
| `validateEntry(entry)` | At least one debit and one credit. Amounts not required. |
| `isBalanced(entry \| entries)` | `true \| false \| "unknown"` — `"unknown"` when amounts absent. |
| `deriveLedger(entries, coa)` | Per-account debit/credit postings tagged `{entryId,lineId}`, normal-balance side, net balance when amounts exist. The single ledger impl. |
| `deriveStatementEffects(entry \| entries, coa)` | Structured IS/BS line movements with direction + a cash-flow flag (best-effort operating/investing/financing). |
| `deriveEquationEffect(entry \| entries, coa)` | `A = L + E` directions + `balanced`. |
| `tracePostingsToStatementLine(entries, coa, account)` | Reverse lookup → bidirectional highlight. |

Projection functions accept a single entry **or** an array, so multi-entry variants (e.g.
perpetual sale) project correctly.

## Phase roadmap

### Phase 1 — this prototype (done)
Scenario picker, condition toggles, live re-derive, progressive-reveal entry grid (reveal
next / all / reset / per-cell / accounts-only), why+trap panel, ledger, statement effects,
equation, bidirectional highlight. Amounts are `???` throughout.

### Phase 2 — Parameterized numbers
A formula layer over `EngineLine.amount` via `amountSlotKey` + `ComputationPath.steps[].
resultSlotKey` (both already reserved in the types). A generator (`AmountGenerator`) produces
fresh numbers per attempt (`AmountBindings`). The existing balance/ledger/statement functions
already compute with amounts when present — no rewrite needed.

### Phase 2 — "Build it backwards"
Show the statement/ledger effect; the student constructs the entry that produces it. Reuse
`deriveStatementEffects` / `tracePostingsToStatementLine` as the answer key (`BuildBackwards
Prompt` reserved). No new engine logic.

### Phase 2 — Attempts & progress
Tables `je_attempts` (`student_intake_id`, `scenario_slug`, `variant_id`, `answer jsonb`,
`correct`, `created_at`) + per-concept progress, tied to the onboarding `student_intakes` and
the concept spine. (Reserved — no table yet.)

### Phase 3 — Lifecycle sequences (horizontal view)
A `je_sequences` table with an ordered `steps jsonb`. The **step union is reserved now** in
`je-engine.ts` (`SequenceStep`, `SequenceDoc`) so scenarios/variants (stable ids) can be
referenced:

```ts
type SequenceStep =
  | { kind: "entry";      scenarioSlug: string; variantId?: string; narration?: string }
  | { kind: "period_end"; label: string; narration?: string }          // time passes here
  | { kind: "adjusting";  scenarioSlug?: string; variantId?: string; inlineEntry?: EntryTemplate; narration?: string }
  | { kind: "statements"; show: ("income"|"balance"|"equation")[]; narration?: string }
  | { kind: "reversing";  reversesStepId: string; narration?: string }; // defined by the adjusting step it undoes
```

**Key insight:** a lifecycle can span multiple periods, so adjusting entries, financial
statements, and reversing entries appear *between* transaction steps. A `reversing` step
references (by id) the `adjusting` step it undoes — store the link, render them paired. The
horizontal view renders these steps as a scrollable/pannable timeline with cross-entry
highlighting and flow arrows. (Build later.)

### Phase — CEQ references
CEQs are a **separate layer** that reference scenarios. The reference shape is reserved
(`CeqScenarioRef`): a CEQ points at `{ scenarioSlug, variantId?, targetEntryId?, target
LineId? }` plus its question (MC / short-answer about the JE, debit/credit, T-account, or
principle). Scenarios/variants/lines carry stable ids precisely so CEQs (and sequences) can
target them. Do not build CEQ authoring now.

### Phase — Condition-toggle endgame
The same `resolveVariant` + projection engine enables the future "student flips a condition
and the whole ledger/statement landscape re-derives live" interaction **across sequences**,
not just single entries.

### Phase — Auto-rendered videos
Because `je-engine.ts` is pure, its projection outputs (+ future dictation timestamps) feed a
Remotion / Motion-Canvas pipeline: write the projection logic once, reuse it for the student
tool, Lee's filming, and generated videos.

## Conventions / guardrails

- `je-engine.ts` stays pure (no React, no fetch). The `JeLine` import is `import type` only,
  so it is erased at build time and never pulls the Supabase client into the engine graph.
- Centralize DB access in `je-api.ts`; the route does not import the Supabase client.
- No `<form>` tags (use `onClick`); no `localStorage`/`sessionStorage`.
- Migration statements are idempotent (safe to re-run).
