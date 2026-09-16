# Accounting Pong — workshop file

Lee's brief (2026-09-16, from ChatGPT) reworked with what the app already has. Open this in a fresh session and say
"build Accounting Pong from docs/ACCOUNTING-PONG.md" — everything a builder needs is here or pointed to.

## The one thing the brief gets wrong

There is **no existing Accounting Pong / Bad Assets implementation in this repo** — no route, no component, no branch,
no commit mentions it. Whatever "previous implementation" the brief revises lived in ChatGPT. So this is a fresh build
inside the app, and "keep the existing game logic that still fits" means: reuse the app's content and components, not
a prior game.

## What it is (agreed)

A student taps the right red cups in a pyramid before a short clock runs out. One round = one pyramid + one instruction.
Rounds are grouped into the four Easy Points topics. Three lives for the run, perfect-round streaks heat up the
multiplier, a recap between rounds, a results screen built around replay and sharing. Called **Accounting Pong**
everywhere. No throwing hand, no rule selector, no prototype controls.

## Where it lives and how a student reaches it

- Route: `/play/pong` (public, free, no account). Student-facing, so it goes in the site-qa manifest.
- Entry points: the set screen's **Bonus** tab on the Easy Points sets ("Play Accounting Pong →" next to the bonus
  content; `src/components/learn/BonusPanel.tsx`), the recap slides' up-next, and a card on `/learn` under Easy Points
  once every topic is posted. Do not gate it behind the 80 % practice score — it *is* practice.
- Chrome: the /learn navy (`#101C39`) as the field, cream ink, Survive red cups (`#E63B2D`, the outro's CtaButton red)
  with cream account names, a gold ball carrying the bolt. Fonts: League Spartan display, Rubik body (`BRAND_DISPLAY`,
  `BRAND_SANS` in `src/components/canvas/brand.ts`).

## Content — nothing new to author

Every round is built from data the app already has. No new question bank.

| Topic section | Correct cups | Distractors | Source |
| --- | --- | --- | --- |
| Types of Accounts (5 rounds: assets, liabilities, equity, revenues, expenses) | accounts of that category | accounts of the other categories, weighted toward the traps (Unearned Revenue for revenue, Prepaid Rent / Prepaid Insurance for expenses, Accumulated Depreciation for assets) | `src/components/canvas/account-registry.ts` — `ACCOUNT_REGISTRY` (15 assets, 8 liabilities, 3 equity, 4 revenue, 9 expense), `accountsIn`, `trapAccounts`, `whyLine`, `trap.note` |
| Debit vs. Credit Increases (2 rounds: increases with a debit / with a credit) | debit-side = assets, expenses (+ Dividends); credit-side = liabilities, equity, revenues | the other side; contras are the traps (Accumulated Depreciation increases with a credit, Dividends with a debit) | `src/components/blastoff/ledger.ts` — `DC_SIDE`, `dcColor`; `AccountDef.contra` flips the side |
| Normal Balances (2 rounds: normal debit / normal credit) | same rule as increases — the normal balance IS the increase side | same, contras again | `DC_SIDE`; the Normal balances set's cheat "Normal balance = the + side" |
| Permanent vs. Temporary (2 rounds) | temporary = revenues, expenses, Dividends; permanent = assets, liabilities, equity (Retained Earnings is the trap — it is where closing goes, but it is permanent) | the other set | `AccountCategory` + the Dividends contra; the cycle set's temp/perm cards (`deck-e1s-1-1`, group g3) |

Round order and pyramid sizes: 3 → 6 → 10 → 15 cups within each section, but only as far as the bank supports the
mix (a 15-cup equity round has 3 correct cups out of 3 equity accounts — fine; a 15-cup revenue round would need 4 of 4
revenues plus 11 distractors — fine; never pad with invented accounts). Target 2–5 correct cups per rack; the rest
distractors, at least one trap per rack from 6 cups up.

Cup labels: use `AccountDef.label`, with a short form for the long ones on phones ("Accum. Depreciation",
"Accounts Payable" → "A/P" is *not* okay — students must read the real name; abbreviate only the adjective).

Recap explanations: the cup's `whyLine` (one line, Lee's words), plus the topic's cheat code from the film plans —
"Receivable" = always an asset, "Payable" = always a liability, "Unearned" = liability, "Prepaid" = asset, "Anything
'expense'" = expense, the cash cheat code (cash received → debit, paid → credit), "Normal balance = the + side",
"Temporary = closed, permanent = not closed", "Dividends starts with D → increases with a Debit". These already exist as
cheat frames in `deck-e1s-2-1`, `deck-e1s-3-1`, `deck-e1s-3-3`, `deck-e1s-1-1` — read them from the plan or copy the
strings into `pong-content.ts` with a comment naming the source set.

## Rules (the brief, tightened)

- **Clock**: starts when the rack is interactive, stops on the last required correct cup. `SECONDS_FOR(cups)` lives in
  one config object. Start at 5 s for a 3-cup rack; **open question** whether 15 cups get more (reading 15 names in 5 s
  is a reading test, not an accounting test) — proposal: `5 + 0.4 × (cups − 3)` → 3 cups 5 s, 6 cups 6.2 s, 10 cups 7.8 s,
  15 cups 9.8 s. Tune after playing.
- **Taps**: select immediately; ball flight 150–220 ms; many balls in flight; a cup is locked the moment it is tapped
  (no double score, no double life loss). Correct choices always land. Wrong cup → −1 life, streak → 1×, cup disabled,
  round continues. Timeout → −1 life, round ends, recap shows the misses.
- **Score**: 100 per correct cup × multiplier at the moment of the tap. Never subtracts. Never resets.
- **Heat** = consecutive *perfect rounds* (all correct cups, no wrong cups, before the clock): 1st perfect = 1×,
  2nd = HEATING UP! 2×, 3rd+ = ON FIRE! 3×. Any wrong tap or timeout → 1× at once. Clearing a round after a mistake is
  not perfect. The upgrade applies from the next round's first tap.
- **Lives**: 3 for the run. 0 → results screen.
- **Recap** after every round (stopped clock): the miniature pyramid rebuilt from recorded round data — ✓ correct
  chosen (green), ✕ wrong chosen (red), ○ correct missed (amber outline), · distractor left alone (dim) — symbols and
  colour both; round points; PERFECT! / not; one explanation line; "Next up: Normal Balances"; one **Continue →**
  (Enter / Space). Next clock starts after Continue and after the rack is drawn.
- **Results**: final score; rounds completed; personal best (localStorage, this device — say "on this device");
  "New personal best!" only when true; **Start over**; **Share your score** ("I scored 2,400 in Accounting Pong. Can you
  beat me? surviveaccounting.com/play/pong" via the existing share helper — Web Share on a phone, copy on a desk);
  **Review your rounds** (expandable, every rack in order, the unfinished one included).
- **Leaderboard**: there is no student score infrastructure in the app today (the "leaderboard" hits in the repo are
  outreach). Phase 1 = local personal best + previous scores on this device. Phase 2 (needs a `game_scores` table —
  SQL for Lee to run — and the existing sign-in) = ranked board per campus. Never show a ranking that isn't real.

## Feel

- Big centered arcade text over the field during the stopped clock only: PERFECT! · HEATING UP! · ON FIRE! ·
  NEXT UP: NORMAL BALANCES. League Spartan 900, cream with a gold edge, 500 ms in, gone on Continue. Never over live cups.
- Heating up: the ball gets the electric trail — reuse `ChainLightning` / the arc palette (`ARC_BLUE`, `ARC_CORE` in
  `src/components/brand-cards/chain-lightning.ts`). On fire: warm glow (`CTA_RED_LIT`, gold), 3× badge lit. Reduced
  motion: no trails, instant ball, text fades only.
- Sound: synthesize with WebAudio the way `src/components/canvas/sfx.ts` does (no licensed files to source): swoosh =
  band-passed noise burst 120 ms; plop = 90 Hz sine with a 6 ms noise click, 180 ms decay; rim = 2.4 kHz tick 40 ms;
  heat accents = two rising notes. One toggle in the corner, remembered in localStorage, off until the first tap (browser
  audio rules).

## Build shape

- `src/lib/pong.ts` — pure: rack building from the registry, the round/run state machine (tap, timeout, continue),
  scoring, heat, recap data. **Tests** pin: 5-second boundary, duplicate taps, a wrong tap disables the cup and resets
  heat, timeout costs exactly one life, perfect-round streak 1×/2×/3×, upgrade applies to the next round only, rack
  composition (correct count, at least one trap from 6 cups).
- `src/lib/pong-content.ts` — the topic sections, round list, cheat-code strings with their source set ids.
- `src/components/play/AccountingPong.tsx` — the field (SVG cups in a pyramid, CSS/SVG ball arcs, no library),
  recap, results. Phone-first: cups ≥ 44 px, 15-cup rack fits 360 px wide, names never truncated.
- `src/routes/play.pong.tsx` — noindex until Lee says otherwise; PostHog events `pong_start`, `pong_round`, `pong_end`.
- Entry links from BonusPanel and the /learn card come last.

## Open questions for Lee (answer these in the workshop session)

1. Clock: flat 5 s, or the scaled formula above?
2. Should Dividends appear in the Types of Accounts rounds (it is "contra equity" — a fine trap for the equity round) or
   only in Debit/Credit and Temporary?
3. Cup names on phones: allow "Accum. Depreciation", or keep full names and let the cup grow?
4. Where does it show first — the Bonus tab, a /learn card, or both?
5. Ranked leaderboard now (SQL to run) or after students have played the local version?
6. Sharing image: text only, or a brand-kit score card (the thumbnails generator in `/branding` could stamp one)?
