# Curriculum invariants — facts that live in more than one place

Every fact below is authored in **two or more** files/tables. None of them can
reference each other yet (exhibit configs are static modules; CEQs are rows in
`canvas_scenes.nodes_json`, loaded async). Until that link exists, they are kept
in agreement **by hand**, and this file is the index of what must move together.

**If you change one side of an entry, change the other in the same commit.**

Created 2026-08-30 after the pre-filming data pass. The structural fix — a real
CEQ↔exhibit data link so an exhibit reads its parent question — is scoped in
`EXHIBIT-COMPONENT-AUDIT-2026-08-30.md` (items #5 and #9) and is *not* done.

---

## 1. The accounting cycle — nine steps

**Canonical order** (`exhibit-lab/cycle-model.ts` → `CYCLE_STEPS`):

1. Analyze transactions · 2. Record journal entries · 3. Post to T accounts ·
4. Make unadjusted trial balance · 5. Record adjusting entries ·
6. Make adjusted trial balance · 7. Prep financial statements ·
8. Record closing entries · 9. Make post-closing trial balance

| Where | What it holds | Must equal |
|---|---|---|
| `exhibit-lab/cycle-model.ts` `CYCLE_STEPS` | the canonical 9, with definitions | — (source) |
| `templates.ts` `blankCard("cycle")` | what a NEW cycle element seeds | the 9, same order |
| `ceq-seed.ts` `S_ANALYZE…S_PCTB` | labels for the generated ch3 deck | the same 9 steps |
| live CEQs `deck-e1s-1-1` | teaches the order 3 ways, incl. "Which list shows the full accounting cycle in the correct order?" | the same 9 steps |

`cycle-exhibit-config.ts` is **not** a fourth copy — it is a keyword *matcher*
that maps any authored label onto per-step content. It deliberately serves both
the 9-step vocabulary and the older 7-step shorthand, and its row order is
audited for collisions (post-closing before post, unadjusted before adjusted).
Adding a step means adding a matcher row, not reordering the existing ones.

**Fixed 2026-08-30:** the template seeded a 7-step shorthand while the bank
graded the 9. Pinned by `exhibit-modes.test.ts` → "the seeded cycle element
agrees with the bank".

**Granularity rule:** a shorter summary list is allowed *only if labeled as a
summary on screen*. Two unlabeled versions of the same list is the defect.

---

## 2. Cash vs accrual — the December/January expense scenario

One scenario, authored twice:

| Where | Text |
|---|---|
| `cash-accrual-config.ts` `BASIS_EXAMPLES[0]` | DECEMBER "Electricity used — cost incurred" → JANUARY "Bill paid"; accrual stamps DECEMBER |
| live CEQ `deck-e1s-1-4` | "A company uses electricity in December but pays the bill in January. Under accrual accounting, when is the expense normally recognized?" → "December, when the cost is incurred" |

The CEQ is the source of truth (it is graded, and its feedback calls itself
"the bridge to adjusting entries" — i.e. this exhibit). Both sides carry a
cross-reference comment.

**Not an invariant:** `BASIS_EXAMPLES[1]` (revenue, MAY/JUNE) is a *second,
different* illustration, not a drifted copy of `deck-e1s-1-4`'s December product
sale. Different months on purpose: switching examples visibly moves the columns,
and accrual must not read as a year-end-only rule. **Do not "align" it.**

Also duplicated, lower risk: the Revenue/Expense Recognition principle lines in
`cash-accrual-config.ts` `BASES[].principle` restate `deck-e1s-1-4` #4/#5. The
file's own `TODO(principles-exhibit)` says to import them from the Principles
exhibit when it ships.

---

## 3. Account classification — four copies

| # | Where | Shape | Scope |
|---|---|---|---|
| A | `account-registry.ts` | 39 `AccountDef` (category, contra, term, why-line, traps, aliases) | the superset |
| B | `exhibit-lab/rubric-model.ts` `ACCOUNTS` | bare names in 5 buckets | deliberate **subset** — the Rubric's on-screen list; its order is a tested contract |
| C | `ceq-seed.ts` `COA` | 30 `{name, type}` | generated the live chapter decks |
| D | DB `chart_of_accounts.account_type` → `coa-groups.ts` `TYPE_TO_GROUP` | type → 5 group headers | authoring vocabulary (JE pickers) |

Pinned by `classification-exhibit.test.ts`: B ⊆ A with matching categories, B's
CONTRA set == A's, B's current/long-term seam == A's terms, A's categories map
onto D's group headers, and (added 2026-08-30) **C resolves through A**.

### Deliberate exceptions — do not "fix" these

- **B is a subset, not a disagreement.** Cost of Goods Sold, Salaries Expense,
  Utilities Expense, the intangibles and the long-term liabilities are in A and
  not B. The Rubric is shipped and its account order is a tested contract.
- **Only two contra accounts in A** (Accumulated Depreciation, Dividends) while
  the bank teaches a third — Allowance for Doubtful Accounts, in `deck-ch1-full`
  ("…are all ______" → Contra accounts) and `deck-e1s-3-1`. **Both CEQs are
  correct.** Allowance is omitted from A on purpose: it is never asked "what type
  of account is it?", receivables are a later chapter, and adding it would change
  `rubric-view.CONTRA` (the shipped Rubric board) and the classification
  exhibit's current-asset pile on camera. Promote it only as a deliberate
  exhibit change with its own film QA.
- **Seed-only accounts:** `Taxes Payable` and `Dividends Payable` exist in C
  only, allow-listed in the C→A test. Both are liabilities; nothing contradicts
  them. They are absent from A because adding current liabilities changes the
  classification exhibit's liability pile on screen. Note the trap pair:
  **Dividends** is contra-**equity**, **Dividends Payable** is a **liability**.

### Open, not fixed — answer-shape inconsistency in live CEQs

`deck-ch1-full` answers the same concept two different ways:

- "What type of account is Accumulated Depreciation?" → **"Contra-asset — it offsets Equipment"**
- "What type of account is Dividends?" → **"Equity — a contra account that reduces it"**

Both are correct; the *shape* differs (contra-first vs parent-category-first).
Not changed here — editing live CEQ choice text is a student-facing DB write.
**Lee's call**, and worth settling before filming account classification, since
the on-camera answer to "what type is it" should be phrased one way.
