# README-IMPORT — Combined coverage maps, all batches (Jul 6 generation run)
# One file replacing the six per-zip READMEs. Keep in docs/import-notes/, NOT in data/scenarios/.


---

# README-IMPORT — Intro 1 (INTRO1 / intro-accounting-1) Chapters 1–6 · v2 (grounded)

Chapter linkage: every file carries {"chapter": {"courseFamily":"intro_1","courseSlug":"intro-accounting-1","number":N,"name":"<exact DB name>"}}.
Import: extract all .json into data/scenarios/ (keep this README out or it will be ignored by the *.json glob), then `bun run scenarios:import`.
Verify the per-file table shows INTRO1 chapters — if ANY row shows intermediate_2 / Ch 13, STOP and report.

## Coverage map (doc -> dump problem clusters)

### Ch 1 — Accounting in Business (QS1.1–1.21 · E1.1–1.25 · P-series A/B)
- intro1-accounting-equation — transaction effects on the equation; computing missing info
- intro1-owner-investment — analyzing transactions (owner financing)
- intro1-buy-supplies — analyzing transactions (asset purchase, cash vs credit)
- intro1-statement-links — preparing income statement / retained earnings / balance sheet linkage
- intro1-return-on-assets — return on assets P-series
DEFERRED: statement of cash flows prep (covered properly in Intro 2 Ch 12); dupe rows E1.1×3 flagged for dedupe pass.

### Ch 2 — Journalizing Transactions (QS2.1–2.19 · E2.1–2.29 · P-series A/B)
- intro1-normal-balances — debit/credit rules; reconstructing balances
- intro1-earn-revenue — prep+post journal entries (revenue events)
- intro1-collect-receivable — journal entries (collections)
- intro1-pay-cash — journal entries (expense vs payable payments)
- intro1-unearned-receipt — journal entries (advance receipts)
FOLDED INTO MEMORIZE: trial balance prep mechanics (tip in normal-balances). DEFERRED: full record→ledger→statements P-series (cycle-level; served by hub sequencing).

### Ch 3 — Adjusting Entries (QS3.1–3.40 · E3.1–3.37 · P-series A/B)
- intro1-adjust-prepaid / -supplies / -unearned / -accrued-salaries / -accrued-revenue / -depreciation — the five adjustment families + depreciation (identifying + recording clusters)
- intro1-closing-entries — closing entries P-series (income/loss axis)
- intro1-current-ratio — balance-sheet classification cluster
FOLDED: subsequent-period entries (traps in accrued docs). DEFERRED: work sheet, reversing entries (low exam weight at Ole Miss; revisit on demand), adjusted-TB→statements (cycle-level).

### Ch 4 — Merchandising (QS4.1–4.31 · E4.1–4.29 · P-series A/B)
- intro1-merch-purchase-discount — merchandising entries (purchases, terms)
- intro1-merch-sale — merchandising entries (sales, two-entry perpetual)
- intro1-shrinkage — adjusting entries for merchandisers
- intro1-gross-profit — computing merch amounts + income statement formatting
FOLDED: closing for merchandisers (same REID pattern; tip references Ch 3 doc).

### Ch 5 — FIFO/LIFO (QS5.1–5.28 · E5.1–5.23 · P-series A/B)
- intro1-inventory-costing — perpetual & periodic alternative cost flows + income comparisons (FIFO/LIFO/WA axis)
- intro1-lcm — LCM cluster
- intro1-inventory-errors — inventory-error analysis
- intro1-gross-profit-method — gross-profit estimation
DEFERRED: retail inventory method (rare on ACCY 201 exams; revisit on demand).

### Ch 6 — Cash & Internal Controls (QS6.1–6.16 · E6.1–6.17 · P-series A/B)
- intro1-bank-reconciliation — bank reconciliation computation
- intro1-bank-rec-entries — reconciliation journal entries
- intro1-petty-cash — petty-cash establish/reimburse (+ over/short)
FOLDED: petty-cash fund increase (tip: resize = the only other Petty Cash entry). DEFERRED: internal-control analysis problems (conceptual/essay; candidate for memorize-grid doc later).

## Core (first-run filming) tags
Ch1: equation, owner-investment, statement-links · Ch2: normal-balances, earn-revenue, collect-receivable, unearned-receipt · Ch3: all six adjusting docs + closing-entries · Ch4: merch-sale, purchase-discount · Ch5: inventory-costing, lcm · Ch6: bank-reconciliation, petty-cash

---

# README-IMPORT — Intro 1 (intro-accounting-1) Chapters 7–11
Chapter blocks carry exact DB names: 7 Receivables · 8 Long Term Assets · 9 Current Liabilities · 10 Long Term Liabilities · 11 Equity.
COVERAGE NOTE: the grounding dump listed problem clusters only for Ch 1–6; these chapters are keyed to standard Wild coverage. Review against teaching_assets and request additions.

Ch 7 Receivables (4): bad-debts-methods (%-sales vs aging axis) · write-off-recovery · note-receivable (90-day, 360-day year) · ar-turnover. DEFERRED: dishonored notes, direct write-off comparison (folded into watchout).
Ch 8 Long Term Assets (5): lump-sum-purchase · depreciation-methods (SL/units/DDB axis) · revised-depreciation · sell-equipment (gain/loss axis — REPLACES deleted legacy sell-equipment-cash) · capital-vs-revenue-expenditure. DEFERRED: partial-year depreciation, exchanges, natural resources/intangibles (Wild folds these here — flag if teaching_assets shows demand).
Ch 9 Current Liabilities (4): sales-tax · short-term-note-payable (3-entry cycle across year-end) · payroll-entries (employee + employer) · warranty-liability. FOLDED: contingency accrual rules (warranty watchout). DEFERRED: multi-period known liabilities, bonus obligations.
Ch 10 Long Term Liabilities (4): bond-issue (discount/premium axis, canonical 500,000/8%/10%/5yr semi, 461,391) · bond-interest-payment (straight-line vs effective-interest axis) · bond-retirement (at 102) · installment-note. NOTE: literal amounts by choice — convert bond-issue/interest docs to {kind:"bond"} params by copying the params block from any IA2 Ch 13 doc in the editor (field names not visible from this session; literals guarantee clean import). Premium price factors: PV 3%,10: single 0.74409, annuity 8.53020.
Ch 11 Equity (5): issue-common-stock · cash-dividend (3 dates) · small-stock-dividend · treasury-stock (reissue above/below axis) · basic-eps. DEFERRED: preferred stock issuance, large stock dividends (rule in watchout), dividend yield/book value per share.

Core (first-run filming): bad-debts-methods · note-receivable · depreciation-methods · sell-equipment · short-term-note-payable · warranty-liability · bond-issue · bond-interest-payment · bond-retirement · cash-dividend · treasury-stock · basic-eps

---

# README-IMPORT — Intro 2 (INTRO2 / intro-accounting-2) Chapters 12–17
Chapter blocks: courseFamily intro_2 · courseSlug intro-accounting-2 · exact DB names.
Ch 12 Cash Flow Statements: cfo-indirect (indirect P-series) · cfo-direct (direct P-series) · classify-activities (classification QS/E). DEFERRED: full SCF prep + spreadsheet method (cycle-level; served by hub sequencing).
Ch 13 Financial Statement Analysis: liquidity-ratios (working capital & liquidity) · profitability-ratios (ratio computation/comparative) · common-size-trend (trend percents, common-size). DEFERRED: income-statement format problems.
Ch 14 Managerial Accounting Concepts: cost-classification (classifying costs) · cogm-schedule (COGM P-series) · manufacturer-cogs (reporting COGS). FOLDED: raw-materials turnover (tip candidate later).
Ch 15 Job Order Costing: overhead-rate (job costs + OH rate) · job-cost-flow (recording job costs / full recording) · over-underapplied (applying overhead). DEFERRED: job cost sheets + materials ledger detail.
Ch 16 Process Costing: equivalent-units-wa + cost-per-eu-wa (WA cost/EU + production cost report) · fifo-equivalent-units (FIFO report) · process-cost-entries (cost flow + JEs).
Ch 17 Activity Based Costing: plantwide-allocation (plantwide) · abc-allocation (ABC allocation) · departmental-rates (departmental rate). DEFERRED: ABC for a service company.

---

# README-IMPORT — Intro 2 (intro-accounting-2) Chapters 18–24
Chapter blocks carry exact DB names: 18 Cost Volume Profit · 19 Variable Costing · 20 Master Budgets · 21 Standard Costing · 22 Performance Measures · 23 Relevant Costing · 24 Capital Budgeting.
COVERAGE NOTE: keyed to standard Wild coverage (cluster dump covered Ch 12–17 only). All docs are computation docs — these chapters are JE-light by nature; standard-costing journal entries (appendix material) deferred.

Ch 18 CVP (4): contribution-margin · break-even · target-income · margin-of-safety. DEFERRED: multiproduct/composite-unit break-even, scatter/high-low cost estimation, operating leverage.
Ch 19 Variable Costing (3): unit-cost-two-methods (absorption/variable axis) · income-difference · variable-costing-income. DEFERRED: multi-year reconciliation problems.
Ch 20 Master Budgets (4): production-budget · materials-purchases-budget · cash-collections · cash-budget (borrowing). DEFERRED: full master-budget P-series (cycle-level; hub sequencing serves it), budgeted income statement/balance sheet, merchandise purchases variant.
Ch 21 Standard Costing (3): materials-variances · labor-variances · overhead-variance (total). DEFERRED: controllable/volume OH split, standard-cost journal entries, flexible budgets (if teaching_assets shows a separate cluster, request a flexible-budget doc).
Ch 22 Performance Measures (3): departmental-contribution · return-on-investment (with margin×turnover) · residual-income. DEFERRED: transfer pricing, balanced scorecard (conceptual), indirect-expense allocation mechanics.
Ch 23 Relevant Costing (4): special-order · make-or-buy · sell-or-process · eliminate-segment. DEFERRED: constrained-resource (CM per bottleneck hour), keep-or-replace equipment.
Ch 24 Capital Budgeting (3): payback-period · npv · accounting-rate-of-return. DEFERRED: IRR (factor-lookup), uneven-cash-flow payback/NPV.

Core (first-run filming): contribution-margin · break-even · unit-cost-two-methods · income-difference · production-budget · cash-collections · materials-variances · labor-variances · return-on-investment · special-order · make-or-buy · npv

---

# README-IMPORT — IA1 (intermediate-accounting-1) Chapters 1–6
Chapter blocks: courseFamily intermediate_1 · courseSlug intermediate-accounting-1 · exact DB names.
Ch 1 The Conceptual Framework: qualitative-characteristics + assumptions-principles (BE/E conceptual sets; both memorization-grid docs).
Ch 2 The Accounting System: adjusting-suite (4-family axis; adjusting + statements clusters) · closing-process (adjusting & closing) · reversing-entries (added per request). DEFERRED: full transactions→statements P-series (cycle-level).
Ch 3 The Income Statement: multiple-step-income (multiple/single-step P-series) · discontinued-operations (unusual/infrequent items) · prior-period-adjustment (prior-period adjustments).
Ch 4 The Balance Sheet: balance-sheet-classification (classified BS prep) · corrected-balance-sheet (corrected BS). DEFERRED: SCF prep problem (belongs with cash-flow coverage).
Ch 5 Time Value of Money: pv-single-sum · annuity-due-vs-ordinary · deferred-annuity (E/BE sets). NOTE: prime candidates for the future annuity param engine; literal for now.
Ch 6 Cash & Receivables: proper-cash-balance (proper cash) · bad-debts-allowance (%-sales vs aging axis; incl. aging cluster) · write-off-recovery · notes-receivable-interest (notes receivable). DEFERRED: assigned A/R entries, comprehensive receivables P-series.

---

# README-IMPORT — IA1 (intermediate-accounting-1) Chapters 7–12
Chapter blocks carry exact DB names: 7 Inventories, Cost Approach · 8 Inventories, Additional Issues · 9 Property, Plant, and Equipment · 10 Depreciation, Impairments, and Depletion · 11 Intangible Assets · 12 Current Liabilities.
COVERAGE NOTE: keyed to standard Kieso coverage (cluster dump covered Ch 1–6 only). Deliberately pitched ABOVE the Intro 1 docs — no duplication of basic FIFO/LIFO, straight-line depreciation, basic bad debts, or basic warranty.

Ch 7 (4): goods-included (transit/consignment) · perpetual-vs-periodic (system axis) · dollar-value-lifo · gross-vs-net-purchases (method axis, pay-late twist). DEFERRED: LIFO liquidation/reserve, multi-year DVL layers.
Ch 8 (4): lcnrv (loss method) · gross-profit-method-ia (markup ON COST conversion) · retail-method (conventional/LCM) · purchase-commitment. DEFERRED: LIFO retail, relative sales value allocation, IA-depth error analysis (basic version lives in Intro 1 Ch 5).
Ch 9 (3): asset-cost-components · interest-capitalization · nonmonetary-exchange (substance axis). DEFERRED: WAAE weighting sub-computation, deferred-payment purchases, government grants.
Ch 10 (4): syd-depreciation · partial-year-depreciation · impairment (two-step) · depletion. DEFERRED: component/group depreciation, held-for-sale assets, activity-method at IA depth.
Ch 11 (3): patent-amortization (+ defense-cost rule in trap) · goodwill · rd-costs (alternative-use equipment twist). DEFERRED: goodwill impairment mechanics, franchises, software development costs.
Ch 12 (4): refinancing-classification · premium-liability · contingency-rules (GAAP min vs IFRS midpoint) · compensated-absences. DEFERRED: asset retirement obligations (IA2-adjacent), payroll at IA depth (basic version in Intro 1 Ch 9).

Core (first-run filming): goods-included · dollar-value-lifo · lcnrv · retail-method · interest-capitalization · nonmonetary-exchange · syd-depreciation · impairment · depletion · goodwill · rd-costs · refinancing-classification · contingency-rules
