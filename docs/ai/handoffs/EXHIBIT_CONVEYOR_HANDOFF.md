# EXHIBIT CONVEYOR — HANDOFF

**Written:** 2026-08-27 · **Session:** studio/exhibit conveyor — Accounting Careers (retiring)
**Careers exhibit landed at:** `d01df668`, merged to main as `33ac9ef2` (PR #9)
**main at handoff:** `33ac9ef2` or later — always `git fetch origin` and use CURRENT `origin/main`.
**Worktree:** `C:\Users\lee\Documents\sa-exhibit-lab` · **Branch/HEAD:** `careers-exhibit` @ `d01df668` (merged)
**Git status:** clean, no uncommitted work · **Open PRs:** none

---

## 1. Shipped and verified live

PRs **#3, #4, #5, #6, #7** and now **#9** are all MERGED.

Verified **by content**, not by deploy status — the route is fetched, its `/assets/*.js`
chunks are downloaded and grepped for feature-unique strings. Chunk filenames change on
every rebuild, so a green Vercel status proves nothing; *always* re-grep.

| Route | Result |
|---|---|
| `/leeportal` | 200 · "Lee Portal", Creative + Business doors present |
| `/study/canvas` | 200 · cycle modes present |
| `/exhibit-demo` | 200 · all exhibit cards present, Careers included |

Exhibit content confirmed in the live bundles:

- **Who's It For?** — `for the ManaGERs`, `Will they repay us?`, `Follows GAAP`
- **The Rulebook & The Cops** — `THE RULEBOOK`, `private-sector`, `U.S. government agency`
- **When It Counts** — `WHEN CASH MOVES ≠ WHEN IT COUNTS`
- **Accounting Careers** — verified in `CareersNode-lXFd2rZJ.js` (chunk name as of this
  build; it WILL change on the next one): `Who do you work for`, `PRIVATE / CORPORATE`,
  `GOVERNMENT & NONPROFIT`, `DOORS IT OPENS`, `not accounting jobs`, `Investing / VC / PE`,
  `STATE-issued license`, `EXTERNAL AUDITOR`, `Internal auditor = employee`,
  `Longer hours in busy season` — 10/10 present. Vercel status for `33ac9ef2`: `success`.
- **Importance cues** — `Must know`, `Easy point`, `A+ detail`

## 2. Exhibits DEPLOYED (do not rebuild)

1. **Accounting Cycle mode switcher** — SOURCE DOCS / DEFINITIONS / ORDER (`cards/CycleNode.tsx`, `cycle-exhibit-config.ts`)
2. **Who's It For?** — internal/external users + financial/managerial (`cards/UsersNode.tsx`, `users-exhibit-config.ts`)
3. **The Rulebook & The Cops** — standards & regulation (`cards/StandardsNode.tsx`, `standards-exhibit-config.ts`)
4. **When It Counts** — cash vs. accrual (`cards/BasisNode.tsx`, `cash-accrual-config.ts`)
5. **Accounting Careers** — "Who do you work for?", the BRANCH MAP family's first outing
   (`cards/CareersNode.tsx`, `careers-exhibit-config.ts`, `careers-exhibit.test.ts`)

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
| Importance cues | `exhibit-cues.tsx` | `CueTag` — MUST KNOW / EASY POINT / A+ DETAIL, session-dismissible, deliberately NOT on the `` ` `` bus |
| 【exam-answer phrase】 | `standards-exhibit-config.ts` | `splitHighlights()` — import it; both Standards and Careers render Bible law 2 through it |
| Single-select + co-lighting | `cards/StandardsNode.tsx`, `cards/CareersNode.tsx` | the `primary` pattern: clicked node takes the full bloom, co-lit relations take a soft accent halo |
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

**Conventions that bite:**

- Content lives in a per-exhibit config file (Bible law 8).
- Every source-pin test MUST normalise CRLF at read
  (`readFileSync(...,"utf8").split("\r\n").join("\n")`) — a test enforces this.
- **Source files have MIXED line endings — even within one file.** A scripted patch that
  assumes one EOL will silently fail to match. Try LF *and* CRLF per pattern.
- Emphasis is opacity/border/shadow only, never geometry.
- **Give a reveal band's hidden state precedence over the muted state.** If an
  `emphasis()` spread lands after `opacity: 0`, a spotlight resurrects unrevealed
  elements on camera. See `emphasisIn()` in `CareersNode.tsx` and its pinning test.
- Don't scan a config *file* for banned words in a test — the file's own accuracy notes
  name what is banned and will trip it. Scan the rendered strings instead.

## 4. Still queued — NOT built

- **Principles & Assumptions** — source only, **no implementation prompt yet** (needs a Fable design pass)
- **Account Classification** — prompt + source ready ← **next**
- **Accounting Equation Effects** — prompt + source ready
- subsequent Journal Entry / Exam 1 exhibits as separately designed

## 5. Asset paths (do not paste these into prompts — reference them)

| Asset | Path |
|---|---|
| Exhibit Production Bible v1 | `C:\Users\lee\Downloads\Survive_Exhibit_Production_Bible_v1.md` |
| Account Classification prompt | `C:\Users\lee\Downloads\account-classification-exhibit-prompt.md` |
| Account Classification source | `C:\Users\lee\Downloads\05_Account_Classification_Source.pdf` |
| Equation Effects prompt | `C:\Users\lee\Downloads\equation-effects-exhibit-prompt.md` |
| Equation Effects source | `C:\Users\lee\Downloads\06_Accounting_Equation_Effects_Source.pdf` |
| Principles & Assumptions source (no prompt) | `C:\Users\lee\Downloads\02_Principles_Assumptions_Source.pdf` |
| Careers prompt / source (built) | `C:\Users\lee\Downloads\careers-exhibit-prompt.md` · `04_Accounting_Careers_Source.pdf` |
| Standards source (built) | `C:\Users\lee\Downloads\03_Standards_Regulation_Source.pdf` |
| Cash vs Accrual design v2 (built) | `C:\Users\lee\Downloads\cash-accrual-exhibit-DESIGN-v2.md` |
| Careers build notes + decisions | `BUILD-NOTES.md` (repo root) |
| Multi-session repo bible | `docs/SESSION-CONTEXT.md` |
| Exhibit QA route | `src/routes/exhibit-demo.tsx` → `/exhibit-demo` |

## 6. NEXT EXHIBIT

```
NEXT EXHIBIT:  Account Classification (CLASSIFIER family)
BUILD INPUT:   C:\Users\lee\Downloads\account-classification-exhibit-prompt.md
SOURCE PACK:   C:\Users\lee\Downloads\05_Account_Classification_Source.pdf
CONTROLLING:   C:\Users\lee\Downloads\Survive_Exhibit_Production_Bible_v1.md
NEXT ACTION:   cd sa-exhibit-lab → git fetch origin → git checkout -b classification-exhibit origin/main
               → read the prompt + Bible → build reusing §3 primitives → tsc + bun test
               → QA on /exhibit-demo (wide + narrow) → commit → push branch → PR → merge
               → verify live BY CONTENT (grep the chunks)
```

**Why Classification and not Principles:** unchanged from the last handoff — Principles has
**only a source PDF, no implementation prompt**. *Action for Lee/Fable: run a design pass on
Principles & Assumptions so it can enter the conveyor.*

## 7. Testing status

- Full suite at handoff: **1809 pass / 1 fail**; `tsc --noEmit` clean.
  (Careers added 31 tests: 1778 → 1809.)
- **Known pre-existing failure — NOT yours:** `src/components/site/bolt/bolt-palette.test.ts`
  → *"the whole table produces distinct accents, campus by campus"*. 119 campuses yield 93
  distinct accents; test needs `> 95.2`. Root cause: only **95 distinct primaries** exist, and
  `deriveAccent` is a pure function of the primary, so identical inputs *must* collide. **Fix
  belongs to the landing/public-web session**: dedupe by primary before asserting. Confirmed
  it fails on pristine `origin/main` untouched by exhibit work.
- **Known console warning — pre-existing:** a React "mixing shorthand and non-shorthand style
  properties" warning on dev pages. Reproduces on `/callout-demo` with no exhibit code
  mounted. Avoid it in new cards by always setting the `border` shorthand, never `borderColor`.

## 8. Filming

Entry: **surviveaccounting.com/leeportal** → **Creative** → **Studio Canvas** (or `/study/canvas`).
`\` opens the film popout · `F11` fullscreen for OBS.
Add exhibits from the canvas element menu, **Teaching** group: *Accounting Cycle*, *Who's It For?*,
*Rulebook & Cops*, *When It Counts*, *Accounting Careers*. On film, exhibits start at reveal step 0
— `Tab` walks the reveal, `D` opens the depth layer, click to spotlight, `` ` `` resets. Mode chips
are authoring-only chrome and never appear in Recording Mode capture; use `M` on camera.

**Careers on camera:** `Tab` walks trunks → PUBLIC leaves → PRIVATE leaves → GOV/NP → doors strip
→ CPA badge + Big Four caption. Click a trunk to spotlight a whole branch; click **Internal Audit**
to crosslight **Audit** under PUBLIC with the external-vs-internal contrast line — that is the
most-tested trap in the topic and the beat worth pausing on. `D` opens public-vs-private day to day.

## 9. DO NOT REDO

- Do **not** rebuild any exhibit in §2, or the primitives in §3.
- Do **not** rebuild Accounting Careers or Cash vs. Accrual — both are live.
- Do **not** "fix" the bolt-palette test here; it belongs to another session (§7).
- Do **not** re-run the full pre-merge QA suite for already-shipped exhibits.
- Do **not** hand-merge `src/routeTree.gen.ts` — it is generated; regenerate via dev/build.
- Do **not** touch other worktrees' branches.

## 10. Processes / ports

**No dev server left running.** The preview server this session started on **8092** was stopped.
`.claude/launch.json` (in `C:\Users\lee\Documents`) has an `exhibit-lab-dev` entry on port 8092
for the next session to start on demand.

> **Visual QA caveat learned this session:** when the browser pane is not displayed, the page
> stops compositing — `requestAnimationFrame` never fires and CSS transitions freeze, so
> `getComputedStyle(...).opacity` reports the *pre-transition* value and screenshots time out.
> Read React's **inline** styles and measured geometry instead; they are the truth about what
> the reveal/emphasis logic set. A human OBS pass is still worth doing before filming.

## 11. Other active sessions — ACTION REQUIRED

`main` advanced with this work: careers exhibit at **`33ac9ef2`** (PR #9).
Always integrate CURRENT `origin/main`, not a pinned sha.

> **OTHER ACTIVE FEATURE BRANCHES MUST FETCH CURRENT MAIN AND INTEGRATE IT BEFORE THEIR OWN FINAL
> MERGE.** Known active: platform/major-features, Growth/dashboard, portal/product.
> Their branches were **not** modified by this session.

Expect `src/routeTree.gen.ts` and `src/lib/analytics.ts` to conflict — both are append-heavy shared
files. `analytics.ts` conflicts are almost always "keep both event lists". Regenerate the route tree.
Careers touched no route tree (it mounts on the existing `/exhibit-demo`), so it adds no conflict there.

**Permission note:** direct `git push` to `main` and `gh pr merge` are permitted for agent
sessions on this machine (user-level `~/.claude/settings.json` allow-rules, force-push denied).
Prefer the PR flow anyway; it is what the Vercel integration and the other sessions expect.

**Repo `CLAUDE.md` contradicts the conveyor.** It still says "Branch `canvas-v2`. NEVER checkout
or merge to main." Every exhibit PR (#3–#9) branched from and merged to `main` under the
conveyor's explicit instruction. **`CLAUDE.md` needs updating so the two stop disagreeing** —
flagged, deliberately not changed by this session.
