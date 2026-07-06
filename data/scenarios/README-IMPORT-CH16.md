# Ch. 16 batch — Investments (7 docs)

## Install
Extract into data/scenarios/ → bun run scenarios:import → /je Ch. 16 shows 7.
(No schema changes needed — runs on the computation-scenario schema already live.)

## The docs
PARAMETERIZED (the Ch. 13 mirror — schedule slots, same canonical example):
- inv-htm-purchase-interest ... E16.2/3/5, P16.1/4 — investor chair: expense column
                                becomes revenue; discount amortization DEBITS the asset
- inv-debt-sale ............... realized G/L vs schedule:4 carrying amount (retire-early mirror)

LITERAL:
- inv-trading-fv .............. FV through INCOME (up/down axes)
- inv-afs-fv .................. FV through OCI — the one-word "—Equity vs —Income" contrast
- inv-afs-sale ................ E16.9, P16.2/9 — realized vs amortized cost + OCI recycling
- inv-equity-fvni ............. E16.6/7/8 — passive equity: FVNI, dividends = revenue
- inv-equity-method ........... E16.12–17, P16.8/10 — dividends SHRINK the investment;
                                carrying-value computationPath (cost + income% − div%)

DEFERRED (appendix lane, like Ch.13 TDR): derivatives & hedging (E16.24–29, P16.12–17).
Impairment (E16.18/22/23) folded into HTM/AFS watchouts. Classification/presentation
(E16.1/19, P16.11) folded into memorize + the classification-map formula card.

## Notes
- The HTM docs bind to the SAME canonical schedule (500k/8%/10%) as Ch. 13 — deliberate:
  students who built Ch. 13 recognize every number from the other chair. Great filming hook.
- Misconception ids still borrow bond-era tags w/ feedback overrides (running theme; re-tag
  when native ids ship).
