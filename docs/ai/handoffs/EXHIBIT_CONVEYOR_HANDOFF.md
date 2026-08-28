# EXHIBIT CONVEYOR — HANDOFF

**Written:** 2026-08-28 · **Session:** studio — Talkthrough Booth overnight (retiring)
**Previous:** Careers + Account Classification session (2026-08-27)
**This session landed:** Accounting Careers (PR #9 → `33ac9ef2`) and Account Classification
+ the shared account registry (PR #11 → `179309ca`).
**main at handoff:** `179309ca` or later — always `git fetch origin` and use CURRENT `origin/main`.
**Worktree:** `C:\Users\lee\Documents\sa-exhibit-lab` · **Branch/HEAD:** `classification-exhibit` @ `5b6b64db` (merged)
**Git status:** clean, no uncommitted work · **Open PRs:** none

---

## 1. Shipped and verified live

PRs **#3–#11** are all MERGED. Verified **by content**, not by deploy status — the route is
fetched, its `/assets/*.js` chunks downloaded and grepped for feature-unique strings. Chunk
filenames change on every rebuild, so a green Vercel badge proves nothing; *always* re-grep.

| Route | Result |
|---|---|
| `/leeportal` | 200 · Creative + Business doors |
| `/study/canvas` | 200 · cycle modes present |
| `/exhibit-demo` | 200 · all six exhibit cards present |

Exhibit content confirmed in the live bundles:

- **Who's It For?** — `for the ManaGERs`, `Will they repay us?`, `Follows GAAP`
- **The Rulebook & The Cops** — `THE RULEBOOK`, `private-sector`, `U.S. government agency`
- **When It Counts** — `WHEN CASH MOVES ≠ WHEN IT COUNTS`
- **Accounting Careers** — `PRIVATE / CORPORATE`, `DOORS IT OPENS`, `STATE-issued license`,
  `Internal auditor = employee`, `Investing / VC / PE` (10/10 checked strings)
- **Account Classification** — `Trap accounts`, `Unearned Revenue`, `CONTRA-EQUITY`,
  `Payables are ALWAYS liabilities`, `Accumulated Depreciation`

## 2. Exhibits DEPLOYED (do not rebuild)

1. **Accounting Cycle mode switcher** (`cards/CycleNode.tsx`, `cycle-exhibit-config.ts`)
2. **Who's It For?** (`cards/UsersNode.tsx`, `users-exhibit-config.ts`)
3. **The Rulebook & The Cops** (`cards/StandardsNode.tsx`, `standards-exhibit-config.ts`)
4. **When It Counts** — cash vs. accrual (`cards/BasisNode.tsx`, `cash-accrual-config.ts`)
5. **Accounting Careers** — BRANCH MAP (`cards/CareersNode.tsx`, `careers-exhibit-config.ts`)
6. **Account Classification** — CLASSIFIER (`cards/ClassificationNode.tsx`,
   `classification-exhibit-config.ts`) **+ `account-registry.ts`, shared**

> ⚠ **#4 was built ahead of its curriculum slot.** It belongs at the head of *Adjusting
> Entries & Trial Balance*. Built, tested, live — not the next thing to work on.

## 3. THE SHARED ACCOUNT REGISTRY — read this before any account work

`src/components/canvas/account-registry.ts` is now the single source of truth for
*what kind of account is this, and why*:

```
{ id, label, category, contra?, whyLine, trap?, term?, intangible?, aliases? }
```

**Equation Effects, journal-entry teaching and statement classification are meant to consume
it — do not seed new account lists.** `accountByLabel()` resolves aliases, so a module
holding bare strings (like the Rubric) can look itself up.

It is PINNED BY TEST against the three modules that previously each knew a piece:
`rubric-model.ACCOUNTS` (same categories), `rubric-view.CONTRA` (identical contra set) and
its `CURRENT_ASSET_COUNT` seam (agreeing terms), and `coa-groups.groupNameForType`. Edit
either side into disagreement and `classification-exhibit.test.ts` fails.

> **QUEUED FOLLOW-UP — Rubric migration.** The Rubric was deliberately NOT rewritten: it is
> shipped and its account ORDER is a tested contract (`coaGroups` slices `ACCOUNTS.A` at a
> seam index; probes narrow against that list). Migrating it onto the registry is a
> standalone prompt, made safe by the pins above.

## 4. Shared infrastructure available (verified on main)

Reuse these. Do not reimplement.

| Primitive | File | Notes |
|---|---|---|
| Spotlight / highlights | `exhibit-highlights.ts` | click-to-glow, `cycleState`, edge glow, module-level clear bus |
| Exhibit base | `exhibit-base.tsx` | `useExhibit(decl)` + `ExhibitShell`; declare nodes/adjacency/min-size, get film-lock + chrome free |
| Mode chips + M key | `exhibit-modes.tsx` | `useExhibitModes`, `ExhibitModeChips` (authoring chrome — hidden on film) |
| Authored reveal | `exhibit-modes.tsx` | `useExhibitReveal(maxTick)`; **film surfaces only** |
| Depth layer | `exhibit-modes.tsx` | `setExhibitDepth` / `exhibitDepthKey`; never part of a reveal sequence |
| Importance cues | `exhibit-cues.tsx` | `CueTag` — MUST KNOW / EASY POINT / A+ DETAIL, session-dismissible |
| 【exam-answer phrase】 | `standards-exhibit-config.ts` | `splitHighlights()` — import it |
| Single-select + co-lighting | `StandardsNode` · `CareersNode` · `ClassificationNode` | clicked node = full bloom; co-lit relations = soft accent halo |
| Account data | `account-registry.ts` | see §3 |
| Film lock / popout | `film-lock.ts`, `CeqPreviewer.tsx` | locked geometry, keyboard isolation, zero chrome in Recording Mode |

**Keyboard (film surfaces)** — wired in `CeqPreviewer.tsx` in BOTH the recording branch and
the film-popout branch, each checked *before* the Tab walk:

- `M` cycle modes · `Tab` / `Shift+Tab` step authored reveal (falls through at either end)
- `D` toggle depth layer · `P` play/pause orbit · `` ` `` reset all · `0` reset exhibit nodes
- `\` open/close film popout · `F` fullscreen the popout

**Registering a new exhibit kind** — five places: `types.ts` (CardKind union + interface +
CardData union + `KIND_CATEGORY`), `templates.ts` (blank factory + label),
`stage-elements.tsx` (import + STAGE_ELEMENTS + STAGE_NODE_TYPES), `routes/study_.canvas.tsx`
(import + nodeTypes + add-menu), `routes/exhibit-demo.tsx` (QA mount, wide + narrow).

**Conventions that bite:**

- Content lives in a per-exhibit config file (Bible law 8); shared *account* content lives
  in the registry (§3).
- Every source-pin test MUST normalise CRLF at read
  (`readFileSync(...,"utf8").split("\r\n").join("\n")`) — a test enforces this.
- **Source files have MIXED line endings, even within one file.** A scripted patch that
  assumes one EOL silently matches zero times. Try LF *and* CRLF per pattern.
- Emphasis is opacity/border/shadow only, never geometry.
- **Give a reveal band's hidden state precedence over the muted state** — otherwise a
  spotlight resurrects unrevealed elements on camera. See `emphasisIn()` in `CareersNode`
  and `ClassificationNode`, and the tests pinning the ordering.
- **Don't scan a config FILE for banned words in a test** — the file's own accuracy notes
  name what is banned and will trip it. Scan the rendered strings.
- **Popovers stop scaling at ~4 columns.** Careers (3 columns) can hang a panel under a
  chip; Classification (5) cannot without spilling outside the card — it uses one fixed
  readout strip with reserved height instead. Prefer the strip for dense layouts.
- Set the `border` shorthand, never `borderColor` — mixing them warns in React.

## 4b. THE TALKTHROUGH BOOTH — how exhibit prompts arrive now (built 08-28, PR #13)

Lee said the shipped exhibits are not yet at his video standard and he wants to DICTATE
iteration notes. **`/talkthrough`** is that loop: open a set, talk (Whisper canonical,
SpeechRecognition live), segments anchor to the focused CEQ, moment tags, then "Draft
the starting points" produces a board whose EXHIBIT items are conveyor-format Claude
Code prompts with a COPY button. **Expect exhibit build prompts to arrive via this loop
— treat a pasted booth prompt exactly like a Downloads prompt file.** The board is a
staging area; transcripts are verbatim-forever. Modules: `talkthrough.ts`/`-sync`/`-audio`/
`-pass` + `src/lib/talkthrough.functions.ts`. Reference docs ship in-repo:
`docs/SURVIVE_METHOD_v1.md` · `docs/SURVIVE_MASTER_CONTEXT_V2.md` ·
`docs/EXHIBIT-PRODUCTION-BIBLE-v1.md` (the Bible now lives in the repo — cite it, not Downloads).

> **SQL LEE MUST RUN:** `migration/supabase-migrations/20260828_0900_talkthrough_booth.sql`
> (four tables, RLS deny-by-default). Until then the booth is local-first with a loud
> badge naming that file. Production pass smoke-tested live 08-28: gateway key, model
> slug and ?raw doc bundling all verified with a real generation (9 board items).
> Phase 3 (doodle wall) is queued in BUILD-NOTES.md.

## 5. Still queued — NOT built

- **Accounting Equation Effects** — prompt + source ready ← **next**
- **Principles & Assumptions** — source only, **no implementation prompt yet**
- **Rubric → account-registry migration** (§3), standalone prompt
- subsequent Journal Entry / Exam 1 exhibits as separately designed

## 6. Asset paths (reference, don't paste into prompts)

| Asset | Path |
|---|---|
| Exhibit Production Bible v1 | `C:\Users\lee\Downloads\Survive_Exhibit_Production_Bible_v1.md` |
| Equation Effects prompt | `C:\Users\lee\Downloads\equation-effects-exhibit-prompt.md` |
| Equation Effects source | `C:\Users\lee\Downloads\06_Accounting_Equation_Effects_Source.pdf` |
| Principles & Assumptions source (no prompt) | `C:\Users\lee\Downloads\02_Principles_Assumptions_Source.pdf` |
| Careers prompt / source (built) | `careers-exhibit-prompt.md` · `04_Accounting_Careers_Source.pdf` |
| Classification prompt / source (built) | `account-classification-exhibit-prompt.md` · `05_Account_Classification_Source.pdf` |
| Standards source (built) | `03_Standards_Regulation_Source.pdf` |
| Cash vs Accrual design v2 (built) | `cash-accrual-exhibit-DESIGN-v2.md` |
| Build notes + decisions (both this session's exhibits) | `BUILD-NOTES.md` (repo root) |
| Multi-session repo bible | `docs/SESSION-CONTEXT.md` |
| Exhibit QA route | `src/routes/exhibit-demo.tsx` → `/exhibit-demo` |

## 7. NEXT EXHIBIT

```
NEXT EXHIBIT:  Accounting Equation Effects
BUILD INPUT:   C:\Users\lee\Downloads\equation-effects-exhibit-prompt.md
SOURCE PACK:   C:\Users\lee\Downloads\06_Accounting_Equation_Effects_Source.pdf
CONTROLLING:   C:\Users\lee\Downloads\Survive_Exhibit_Production_Bible_v1.md
NEXT ACTION:   cd sa-exhibit-lab → git fetch origin → git checkout -b equation-effects-exhibit origin/main
               → read the prompt + Bible → CONSUME account-registry.ts (§3), do not seed
               new account lists → build reusing §4 primitives → tsc + bun test
               → QA on /exhibit-demo (wide + narrow) → commit → push → PR → merge
               → verify live BY CONTENT (grep the chunks)
```

**Principles & Assumptions is still blocked**: source PDF only, no implementation prompt.
*Action for Lee/Fable: run a design pass on it so it can enter the conveyor.*

## 8. Testing status

- Full suite at handoff: **1853 pass / 1 fail**; `tsc --noEmit` clean.
  (Careers +31, Classification +38.)
- **Known pre-existing failure — NOT yours:** `src/components/site/bolt/bolt-palette.test.ts`
  → *"the whole table produces distinct accents, campus by campus"*. 119 campuses yield 93
  distinct accents; the test needs `> 95.2`. Only **95 distinct primaries** exist and
  `deriveAccent` is a pure function of the primary, so identical inputs *must* collide.
  **Fix belongs to the landing/public-web session**: dedupe by primary before asserting.
  Confirmed it fails on pristine `origin/main` untouched by exhibit work.
- **Known console warning — pre-existing:** a React "mixing shorthand and non-shorthand
  style properties" warning on dev pages; reproduces on `/callout-demo` with no exhibit
  mounted. Avoid it in new cards by always setting the `border` shorthand.

## 9. Filming

Entry: **surviveaccounting.com/leeportal** → **Creative** → **Studio Canvas**
(or `/study/canvas`). `\` opens the film popout · `F11` fullscreen for OBS.
Add exhibits from the canvas element menu, **Teaching** group: *Accounting Cycle*,
*Who's It For?*, *Rulebook & Cops*, *When It Counts*, *Accounting Careers*,
*5 Types of Accounts*.

**`/exhibit-demo` is the QA page** — every exhibit mounted at once, already in film mode,
each at desktop and narrow widths. No canvas, no login. Use it to click through everything
in one scroll; use `/study/canvas` to actually film.

**Careers on camera:** `Tab` walks trunks → PUBLIC → PRIVATE → GOV/NP → doors → CPA badge.
Click **Internal Audit** to crosslight **Audit** with the external-vs-internal contrast.
`D` opens public-vs-private day to day.

**Classification on camera:** `Tab` walks tiles → anchors → chips → traps. The money moment
is clicking the **Unearned Revenue** trap: it lights LIABILITIES and reads out "revenue in
the name, liability in reality — you OWE the service." `D` regroups assets and liabilities
into Current / Long-term (intangibles appear only there).

## 10. DO NOT REDO

- Do **not** rebuild any exhibit in §2, or the primitives in §4.
- Do **not** seed a new account list — consume `account-registry.ts` (§3).
- Do **not** rewrite the Rubric as a side quest; its migration is its own prompt (§3).
- Do **not** "fix" the bolt-palette test here; it belongs to another session (§8).
- Do **not** re-run the full pre-merge QA suite for already-shipped exhibits.
- Do **not** hand-merge `src/routeTree.gen.ts` — it is generated.
- Do **not** touch other worktrees' branches.

## 11. Processes / ports

**No dev server left running.** The preview server on **8092** was stopped and its tab
closed. `.claude/launch.json` (in `C:\Users\lee\Documents`) has an `exhibit-lab-dev` entry
on port 8092 for the next session.

> **Visual QA caveat:** when the browser pane is not displayed the page stops compositing —
> `requestAnimationFrame` never fires, CSS transitions freeze, screenshots time out, and
> `getComputedStyle(...).opacity` reports the *pre-transition* value. Read React's **inline**
> styles and measured geometry instead. Also: long async probe loops that repeatedly reset
> the reveal store hang the hidden pane — drive one interaction per call. A human OBS pass
> is still worth doing before filming.

## 12. Other active sessions — ACTION REQUIRED

`main` advanced with this work: talkthrough booth `6f0da15f` (PR #13); before it careers
(PR #9/#10) and classification (PR #11/#12). Always integrate CURRENT `origin/main`.

> **OTHER ACTIVE FEATURE BRANCHES MUST FETCH CURRENT MAIN AND INTEGRATE IT BEFORE THEIR OWN
> FINAL MERGE.** Known active: platform/major-features, Growth/dashboard, portal/product.
> Their branches were **not** modified by this session.

Expect `src/routeTree.gen.ts` and `src/lib/analytics.ts` to conflict — both append-heavy
shared files. `analytics.ts` conflicts are almost always "keep both event lists".
Neither exhibit this session touched the route tree (both mount on the existing
`/exhibit-demo`), so they add no conflict there.

**Permission note:** direct `git push` to `main` and `gh pr merge` are permitted for agent
sessions on this machine (user-level `~/.claude/settings.json` allow-rules, force-push
denied). Prefer the PR flow — it is what the Vercel integration and other sessions expect.

**Repo `CLAUDE.md` contradicts the conveyor.** It still says "Branch `canvas-v2`. NEVER
checkout or merge to main." Every exhibit PR (#3–#11) branched from and merged to `main`
under the conveyor's explicit instruction. **`CLAUDE.md` needs updating so the two stop
disagreeing** — flagged twice now, deliberately not self-resolved.
