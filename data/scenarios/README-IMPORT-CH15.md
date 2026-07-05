# Ch. 15 batch — Dilutive Securities and EPS (10 docs)

⚠️ ORDER MATTERS: run the SCHEMA-TWEAK prompt (computation scenarios) BEFORE
importing — 4 of these docs have variants with NO entries (computationPaths
only) and will fail validation on the old schema.

## Install
1. Run the schema-tweak prompt in the je session (Lee has it in chat).
2. Extract all 10 .json into data/scenarios/
3. bun run scenarios:import → verify /je → Ch. 15 shows 10.

## The docs
ENTRY DOCS (6) — all literal amounts, balanced:
- convert-bonds-book-value ... E15.1–15.6 (discount/premium axes; CV→equity, no gain ever)
- convert-bonds-induced ...... sweetener = expense, conversion untouched
- convert-preferred .......... book value incl. its PIC rolls to common
- bonds-with-warrants ........ E15.7–15.9 (proportional/incremental — lump-sum logic reused)
- stock-options-lifecycle .... E15.10–15.12, P15.3/4 (expense/exercise/expiration axes;
                               expiration reclasses, NEVER reverses)
- restricted-stock ........... E15.13–15.14 (grant/vest/forfeit; forfeiture DOES reverse —
                               the deliberate contrast with options)

COMPUTATION DOCS (4) — Path B, no entries:
- eps-weighted-average-shares  E15.15 (issuance weights; split restates retroactively)
- eps-basic .................. E15.16–15.21 (cumulative vs noncumulative axes)
- eps-diluted-convertible .... E15.22–15.25 (if-converted; after-tax add-back)
- eps-diluted-options ........ E15.26/28 (treasury-stock method; antidilutive variant)
Contingent shares (E15.27) → watchout territory, folded into diluted docs' memorize.
P15.5–15.9 (complex-structure EPS) are combinations of these four building blocks.

## Notes
- Misconception ids still borrow bond-era tags with explicit feedback overrides
  (same as Ch. 14 — re-tag when equity/EPS-native ids get added).
- EPS answers use decimal answerExpr values (2.45, 2.28, 2.43) — confirm the
  practice-mix comparison tolerates decimals (±0.01), not just the ±1 dollar rule.
- Voice pass: the options-vs-restricted-stock contrast (expiration vs forfeiture)
  is the chapter's teaching centerpiece — worth your best trap-line rewrites.
