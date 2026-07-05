# Ch. 14 scenario batch — Stockholder's Equity (7 docs)

Docs-only lane: every amount is a LITERAL — no params, no schedule, no resolver
dependency. These render full numbers immediately, even before Prompt 2 lands.

## Install
1. Extract all 7 .json into data/scenarios/  (alongside the Ch. 13 batch)
2. bun run scenarios:import
3. Verify /je → IA2 → Ch. 14 shows 7 scenarios.

## Coverage map (vs the 50-problem dump)
- equity-issue-common .......... E14.1/2 + the BE cluster (par / stated / no-par axes)
- equity-stock-for-noncash ..... E14.3
- equity-lump-sum .............. E14.4/5, P14.4 (proportional vs incremental axes)
- equity-treasury-cost ......... E14.6/7, P14.2/5/6 (purchase / above / below axes; the
                                 PIC-TS→RE cascade is variant 3 — the chapter's best trap)
- equity-cash-dividend ......... E14.12/15, P14.7 (regular vs liquidating; record-date
                                 no-entry taught as trap + question)
- equity-preferred-dividends ... E14.9/21 (cumulative vs noncumulative, 2 yrs arrears)
- equity-stock-dividends ....... E14.14, P14.8/10/11 (small-FV vs large-par; SPLIT taught
                                 as a memorize watchout — "no entry" can't be a doc, and
                                 teaches better as the trap it is)
Presentation/statement problems (E14.10/11/17/18, P14.1/3/9), RE computation (E14.16),
and concept items (E14.8/19/20) fold into memorize + the presentation view.

## Notes
- Misconception ids: distractors borrow the nearest BOND-era ids (with explicit feedback
  text overriding, so students see correct messages). Worth adding equity-native ids to
  misconceptions.ts later (par_vs_proceeds, treasury_gain_to_income, record_date_entry,
  arrears_miscount, small_vs_large_flip) and re-tagging — analytics nicety, not a blocker.
- Voice pass: same as Ch. 13 — trap lines first.
