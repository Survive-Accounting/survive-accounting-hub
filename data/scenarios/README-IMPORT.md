# Ch. 13 scenario batch — import instructions

10 scenario docs for IA2 Ch. 13 (Long-Term Liabilities), generated against the
je-engine-v2 SCHEMA CONTRACT (scenario-schema.ts + _EXAMPLE_pay_periodic_interest.json).

## Install
1. Extract every .json file into:  data/scenarios/
   (alongside _EXAMPLE_pay_periodic_interest.json — which stays; it IS the
   pay-periodic-interest scenario and this batch complements it)
2. In the je-engine-v2 worktree run:   bun run scenarios:import
   (per-file result table prints; all files upsert by slug — re-running is safe)
3. Verify at /je → IA2 → Ch. 13: 11 scenarios total should render.

## Coverage map (vs the Kieso Ch. 13 problem dump)
- bonds-issue ................. E13.3/4/5, BE13.6/7
- bonds-issue-between-dates ... P13.6
- (example: pay periodic) ..... E13.6/7, P13.1 (schedules, SL vs EI)
- bonds-year-end-accrual ...... BE13.8
- bonds-retire-maturity ....... (foundation for redemption cluster)
- bonds-retire-early .......... BE13.9, E13.12-15, P13.2/4
- note-interest-bearing ....... BE13.10/12
- note-installment ............ P13.9 (installment mechanics; literal worked numbers)
- note-zero-interest .......... BE13.11/13, E13.16/17/18, P13.8 (statedRate:0 trick — no new math needed)
- bonds-fair-value-option ..... BE13.14, E13.19
- bonds-life-cycle ............ P13.7 (isSequence: true — renders as a normal scenario until the sequence player ships)
Classification/disclosure (E13.1/2/20, BE13.15) is folded into memorize items +
the Statements representation view (Prompt 2), not a standalone doc.
Troubled-debt restructuring: DEFERRED — not in this text's Ch. 13 problem set.

## Voice pass (Lee)
Every line's `why` / `trap`, every `memorize` body, and every `build.scaffold`
is a DRAFT in your register but not your literal voice. Edit via the admin
"Edit scenario" button (validates + upserts on save) or edit these files and
re-run the import — identical result. Highest-value edits first: the `trap`
lines (they're what students screenshot) and the scaffolds (they're what Build
mode shows when someone is stuck).

## Notes for the engine (fine as-is, worth knowing)
- Arithmetic slot refs are used (contract-legal per scenario-schema.ts):
  e.g. "param:face - issuePrice", "schedule:2:cashPayment * 3 / 6",
  "505000 - schedule:4:carryingValueAfter". The resolver must evaluate these;
  the question example in the contract already does ("param:face * ... / 2").
- bonds-retire-early / fair-value-option pin reacquisition price / FV as
  literals (505000 / 470000 / 480000 / 465000) tuned to the DEFAULT seed's
  period-4 CV (474,621). If params regenerate, these two docs' literals stay
  fixed — acceptable v1; parameterize when the generator learns constraints.
- note-installment uses literal amounts throughout (annuity math isn't in the
  bond schedule core yet — flagged as the "installment/annuity module" for the
  new-math lane).
- note-zero-interest runs entirely on the EXISTING schedule core via
  statedRateAnnual: 0 → cash column zeros, expense = CV × market. No new math.
