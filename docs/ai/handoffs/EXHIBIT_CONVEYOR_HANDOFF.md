# EXHIBIT CONVEYOR — HANDOFF

**Written:** 2026-08-28 00:14 UTC · **Session:** studio/exhibit conveyor (retiring)
**Exhibit stack landed at:** `908d74b9` (PR #6) · **main at handoff:** `9cec88ec` or later — always `git fetch origin` and use CURRENT `origin/main`.
**Worktree:** `C:\Users\lee\Documents\sa-exhibit-lab` · **Branch/HEAD:** `cash-accrual-exhibit` @ `bf3f9f51` (merged into main)
**Git status:** clean, no uncommitted work · **Open PRs:** none

---

## 1. Shipped and verified live

PRs **#3, #4, #5, #6** are all MERGED. #5 was cumulative and auto-closed #3/#4 on merge.
Vercel Production deployment for `908d74b9` reported `success`.

Verified **by content**, not by deploy status — all three routes return HTTP 200 and their
JS chunks were downloaded and grepped for feature-unique strings:

| Route | Result |
|---|---|
| `/leeportal` | 200 · "Lee Portal", Creative + Business doors present |
| `/study/canvas` | 200 · cycle modes present ("Source Docs", "During the period", "End of period", "Bank statement") |
| `/exhibit-demo` | 200 · all exhibit cards present |

Exhibit content confirmed in the live bundles:

- **Who's It For?** — `for the ManaGERs`, `for the people FINANCING you`, `Will they repay us?`, `Check your professor's slides`, `Follows GAAP`
- **The Rulebook & The Cops** — `THE RULEBOOK`, `private-sector`, `U.S. government agency`, `Audits the auditors`, `Enron & WorldCom`, FAF parent line
- **When It Counts** — `WHEN CASH MOVES ≠ WHEN IT COUNTS`, `Every adjusting entry exists…`
- **Importance cues** — `Must know`, `Easy point`, `A+ detail`

## 2. Exhibits DEPLOYED (do not rebuild)

1. **Accounting Cycle mode switcher** — SOURCE DOCS / DEFINITIONS / ORDER (`cards/CycleNode.tsx`, `cycle-exhibit-config.ts`)
2. **Who's It For?** — internal/external users + financial/managerial (`cards/UsersNode.tsx`, `users-exhibit-config.ts`)
3. **The Rulebook & The Cops** — standards & regulation (`cards/StandardsNode.tsx`, `standards-exhibit-config.ts`)
4. **When It Counts** — cash vs. accrual (`cards/BasisNode.tsx`, `cash-accrual-config.ts`)

> ⚠ **#4 was built ahead of its curriculum slot.** It belongs at the head of *Adjusting Entries
> & Trial Balance*. It is built, tested and live — it is **not** the next thing to work on.

## 3. Shared infrastructure available (verified on main)

Reuse these. Do not reimplement.

| Primitive | File | Notes |
|---|---|---|
| Spotlight / highlights | `exhibit-highlights.ts` | click-to-glow, `cycleState` (normal→lit→blurred), edge glow, module-level clear bus |
| Exhibit base | `exhibit-base.tsx` | `useExhibit(decl)` + `ExhibitShell`; a card DECLARES nodes/adjacency/min-size, gets film-lock + chrome free |
| Mode chips + M key | `exhibit-modes.tsx` | `useExhibitModes`, `ExhibitModeChips` (authoring chrome — hidden on film), `nextModeId` |
| Authored reveal | `exhibit-modes.tsx` | `useExhibitReveal(maxTick)`; **film surfaces only** (authoring/student render full) |
| Depth layer | `exhibit-modes.tsx` | `setExhibitDepth` / `exhibitDepthKey`; never part of a reveal sequence |
| Importance cues | `exhibit-cues.tsx` | `CueTag` — MUST KNOW / EASY POINT / A+ DETAIL, session-dismissible, deliberately NOT on the ` bus |
| Film lock / popout | `film-lock.ts`, `CeqPreviewer.tsx` | geometry locked on camera, keyboard isolation, zero chrome in Recording Mode |

**Keyboard (film surfaces)** — wired in `CeqPreviewer.tsx` in BOTH the recording branch and the
film-popout branch, each checked *before* the Tab walk so Tab still walks elsewhere:

- `M` cycle modes · `Tab` / `Shift+Tab` step authored reveal (falls through to the walk at either end)
- `D` toggle depth layer · `P` play/pause orbit (cycle ORDER mode) · `` ` `` reset all · `0` reset exhibit nodes
- `\` open/close film popout · `F` fullscreen the popout

**Registering a new exhibit kind** — five places: `types.ts` (CardKind union + interface +
CardData union + `KIND_CATEGORY`), `templates.ts` (blank factory + label), `stage-elements.tsx`
(import + STAGE_ELEMENTS + STAGE_NODE_TYPES), `routes/study_.canvas.tsx` (import + nodeTypes +
add-menu), `routes/exhibit-demo.tsx` (QA mount, wide + narrow).

**Conventions that bite:** content lives in a per-exhibit config file (Bible law 8); every
source-pin test MUST normalise CRLF at read (`readFileSync(...,"utf8").split("\r\n").join("\n")`)
— there is a test that enforces this; emphasis is opacity/border/shadow only, never geometry.

## 4. Still queued — NOT built

- **Principles & Assumptions** — source only, **no implementation prompt yet** (needs a Fable design pass)
- **Accounting Careers** — prompt + source ready ← **next**
- **Account Classification** — prompt + source ready
- **Accounting Equation Effects** — prompt + source ready
- subsequent Journal Entry / Exam 1 exhibits as separately designed

**Designed but intentionally parked:** *Cash vs. Accrual* — now BUILT (see §2). Its design file
remains at `C:\Users\lee\Downloads\cash-accrual-exhibit-DESIGN-v2.md`.

## 5. Asset paths (do not paste these into prompts — reference them)

| Asset | Path |
|---|---|
| Exhibit Production Bible v1 | `C:\Users\lee\Downloads\Survive_Exhibit_Production_Bible_v1.md` |
| Accounting Careers prompt | `C:\Users\lee\Downloads\careers-exhibit-prompt.md` |
| Accounting Careers source | `C:\Users\lee\Downloads\04_Accounting_Careers_Source.pdf` |
| Account Classification prompt | `C:\Users\lee\Downloads\account-classification-exhibit-prompt.md` |
| Account Classification source | `C:\Users\lee\Downloads\05_Account_Classification_Source.pdf` |
| Equation Effects prompt | `C:\Users\lee\Downloads\equation-effects-exhibit-prompt.md` |
| Equation Effects source | `C:\Users\lee\Downloads\06_Accounting_Equation_Effects_Source.pdf` |
| Principles & Assumptions source (no prompt) | `C:\Users\lee\Downloads\02_Principles_Assumptions_Source.pdf` |
| Standards source (built) | `C:\Users\lee\Downloads\03_Standards_Regulation_Source.pdf` |
| Cash vs Accrual design v2 (built) | `C:\Users\lee\Downloads\cash-accrual-exhibit-DESIGN-v2.md` |
| Multi-session repo bible | `docs/SESSION-CONTEXT.md` |
| Exhibit QA route | `src/routes/exhibit-demo.tsx` → `/exhibit-demo` |

## 6. NEXT EXHIBIT

```
NEXT EXHIBIT:  Accounting Careers — "Who do you work for?" (BRANCH MAP family, first outing)
BUILD INPUT:   C:\Users\lee\Downloads\careers-exhibit-prompt.md
SOURCE PACK:   C:\Users\lee\Downloads\04_Accounting_Careers_Source.pdf
CONTROLLING:   C:\Users\lee\Downloads\Survive_Exhibit_Production_Bible_v1.md
NEXT ACTION:   cd sa-exhibit-lab → git fetch origin → git checkout -b careers-exhibit origin/main
               → read the prompt + Bible → build reusing §3 primitives → tsc + bun test
               → QA on /exhibit-demo (wide + narrow) → commit → push branch → PR → merge → verify live
```

**Why Careers and not Principles:** both are Easy Points work and Principles is arguably the
higher-value teach, but Principles has **only a source PDF — no implementation prompt**. Careers
is the next item already designed enough to enter implementation. *Action for Lee/Fable: run a
design pass on Principles & Assumptions so it can follow.*

## 7. Testing status

- Full suite at handoff: **1778 pass / 1 fail**; `tsc --noEmit` clean.
- **Known pre-existing failure — NOT yours:** `src/components/site/bolt/bolt-palette.test.ts`
  → *"the whole table produces distinct accents, campus by campus"*. 119 campuses yield 93
  distinct accents; test needs `> 95.2`. Root cause: only **95 distinct primaries** exist (24
  campuses share a hex, e.g. 8 on `#C8102E`, 6 on `#003366`); `deriveAccent` is a pure function
  of the primary so identical inputs *must* collide. Only 2 true collisions
  (`#FFCD00`/`#FFCC00`; `#000000`/`#1B1B1B`, the intended achromatic fallback). **Fix belongs to
  the landing/public-web session**: dedupe by primary before asserting (verified: 93 > 76, passes).
  Confirmed it fails on pristine `origin/main` untouched by exhibit work.
- **Known console warning — pre-existing:** a React "mixing shorthand and non-shorthand style
  properties (borderColor/border)" warning on dev pages. Reproduces on `/callout-demo` with no
  exhibit code mounted. Not introduced by the exhibits.

## 8. Filming

Entry: **surviveaccounting.com/leeportal** → **Creative** → **Studio Canvas** (or `/study/canvas`).
`\` opens the film popout · `F11` fullscreen for OBS.
Add exhibits from the canvas element menu, **Teaching** group: *Accounting Cycle*, *Who's It For?*,
*Rulebook & Cops*, *When It Counts*. On film, exhibits start at reveal step 0 — `Tab` walks the
reveal, `D` opens the depth layer, click to spotlight, `` ` `` resets. Mode chips are authoring-only
chrome and never appear in Recording Mode capture; use `M` on camera.

## 9. DO NOT REDO

- Do **not** rebuild any exhibit in §2, or the primitives in §3.
- Do **not** rebuild Cash vs. Accrual — it is live.
- Do **not** "fix" the bolt-palette test here; it belongs to another session (§7).
- Do **not** re-run the full pre-merge QA suite for already-shipped exhibits.
- Do **not** hand-merge `src/routeTree.gen.ts` — it is generated; regenerate via dev/build.
- Do **not** touch other worktrees' branches.

## 10. Processes / ports

**No dev server left running.** Preview servers started by this session were stopped and the
localhost browser tab closed. No listeners on 8092 / 8091 / 5233.
`.claude/launch.json` (in `C:\Users\lee\Documents`) has an `exhibit-lab-dev` entry on **port 8092**
for the next session to start on demand.

## 11. Other active sessions — ACTION REQUIRED

`main` advanced with this work: exhibit stack at **`908d74b9`** (PR #6), handoff docs at **`9cec88ec`** (PR #7). Always integrate CURRENT `origin/main`, not a pinned sha.

> **OTHER ACTIVE FEATURE BRANCHES MUST FETCH CURRENT MAIN AND INTEGRATE IT BEFORE THEIR OWN FINAL
> MERGE.** Known active: platform/major-features, Growth/dashboard, portal/product.
> Their branches were **not** modified by this session.

Expect `src/routeTree.gen.ts` and `src/lib/analytics.ts` to conflict — both are append-heavy shared
files. `analytics.ts` conflicts are almost always "keep both event lists". Regenerate the route tree.

**Permission note:** direct `git push` to `main` and `gh pr merge` are now permitted for agent
sessions on this machine (user-level `~/.claude/settings.json` allow-rules, with force-push denied).
The rules did not take effect instantly when first added — they became active a few minutes later.
Prefer the PR flow anyway; it is what the Vercel integration and the other sessions expect.
