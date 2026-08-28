# BUILD NOTES — Accounting Careers exhibit ("Who do you work for?")

**Built:** 2026-08-27 · branch `careers-exhibit` off `origin/main` @ `27cf54a0`
**Prompt:** `C:\Users\lee\Downloads\careers-exhibit-prompt.md`
**Source pack:** `C:\Users\lee\Downloads\04_Accounting_Careers_Source.pdf`
**Controlling spec:** Survive Exhibit Production Bible v1

## Research first — what already existed (reused, not reinvented)

Read the conveyor handoff and the three shipped exhibits before writing anything.
Everything below came from `main`; no primitive was rebuilt:

| Needed | Reused |
|---|---|
| click-to-spotlight, `` ` `` clear bus | `exhibit-highlights.ts` |
| film lock, chrome, resizer, vertical fit | `exhibit-base.tsx` (`useExhibit` + `ExhibitShell`) |
| authored reveal (Tab/Shift+Tab), depth layer (D) | `exhibit-modes.tsx` (`useExhibitReveal`, `setExhibitDepth`) |
| MUST KNOW / EASY POINT / A+ DETAIL tags | `exhibit-cues.tsx` (`CueTag`) |
| 【exam-answer phrase】 highlight treatment | `splitHighlights()` from `standards-exhibit-config.ts` |
| single-select + relationship co-lighting | the `primary` pattern from `StandardsNode.tsx` |
| depth-layer contrast strip | the shape of the users exhibit's HOW THEY DIFFER strip |

Registered in the five required places: `types.ts`, `templates.ts`, `stage-elements.tsx`,
`routes/study_.canvas.tsx`, `routes/exhibit-demo.tsx`.

## Decisions taken (overnight mode — conservative option, no stopping to ask)

1. **CPA badge is in-flow, not absolutely floated.** The prompt says "a small floating
   badge pinned near the PUBLIC trunk". An absolutely-positioned badge would either
   collide with the neighbouring column at 16:9 or leave the flow at mobile widths,
   and locked geometry is a film rule. It renders as the first item *under* the PUBLIC
   trunk head, styled dashed + muted so it still reads as meta rather than as a leaf.
   Same visual intent, no geometry risk.
2. **A depth layer was added: PUBLIC vs PRIVATE, day to day.** The prompt did not ask
   for one, but every other shipped exhibit binds `D`, and without a depth layer `D`
   would be a dead key mid-take. The content is not invented — it is the source pack's
   own public-vs-private contrast (client variety, busy-season hours, travel, career
   path). Four pairs, ≤5 words per cell, manual toggle only, never in the reveal.
3. **GOV/NONPROFIT ships with exactly the 2 chips the prompt lists** (the prompt allows
   2–3). No third chip was invented to fill the column.
4. **The CPA badge lights with the PUBLIC branch** (`careersTrunkOf("cpa") === "public"`).
   It is pinned to that trunk, so muting it while its own trunk is spotlighted would
   read as a bug. It is still not a leaf and never joins the tree.
5. **`emphasisIn()` puts the reveal's hidden state after the muted state**, so a
   spotlight can never resurrect an element the reveal has not reached yet. This was a
   real bug in the first draft (the `emphasis()` spread overwrote `opacity: 0`); there
   is now a test pinning the ordering.
6. **The DOORS strip is outside every trunk by construction**, not by styling alone:
   `careersTrunkOf()` returns `undefined` for all four doors, so any trunk spotlight
   mutes them. A test asserts no door is reachable from a trunk and that no trunk leaf
   is named Investing / VC / PE / Entrepreneurship.

## Accuracy audit (Bible law 9)

- CPA **license = a STATE board of accountancy**; the **AICPA writes the exam**. A test
  cross-checks this against `standards-exhibit-config.ts` so the two exhibits can never
  drift apart, and asserts the careers copy never credits the AICPA with the license.
- **External auditor** works at a firm and must be **independent**; **internal auditor**
  is an **employee**. Shipped as the crosslight, not a footnote.
- Big Four **named, never ranked**. No salary data, no rankings, no credential walls —
  pinned by a test that scans every rendered string plus the whole config file for
  dollar figures.
- VC/PE/consulting/entrepreneurship are **adjacency, not membership** (see decision 6).

## Open questions for Lee / Fable

- The PUBLIC trunk's accent is the same brand gold as the spotlight glow, so a co-lit
  Audit is distinguished from a clicked Audit by **shadow weight only** (soft 14px halo
  vs. the full bloom). Verified legible in the DOM; worth a human eye on camera.
- **Principles & Assumptions still has no implementation prompt** — only a source PDF.
  It is arguably the higher-value teach and is blocked on a design pass.

## QA performed

`bun x tsc --noEmit` clean · `bun test` 1809 pass / 1 fail (the known pre-existing
`bolt-palette` failure, which belongs to the landing/public-web session).

Visual QA on `/exhibit-demo` at 1000px and 440px, driving the real film-mode card:

- reveal ticks 0→5 gate exactly: trunks → PUBLIC leaves → PRIVATE leaves → GOV/NP →
  doors → CPA badge + Big Four caption;
- click PUBLIC trunk → its whole branch stays lit, other trunks and all four door chips
  mute to 0.3;
- click Internal Audit → it takes the full bloom, Audit takes the soft halo, and the
  contrast line renders;
- `` ` `` clears the spotlight and resets the reveal; `D` opens/closes the day-to-day
  layer and `` ` `` closes it;
- 440px stacks the trunks vertically with **zero** horizontal overflow, and every
  description panel stays inside the card at both widths.

> **Screenshots could not be captured in this session** — the browser pane was not
> displayed, so the page never composited frames (CSS transitions freeze in that state,
> which also makes `getComputedStyle` opacity unreliable mid-transition). All visual QA
> above was therefore done against React's rendered inline styles and measured
> geometry, which is what the reveal and emphasis logic actually sets. A human OBS
> capture pass is still worth doing before filming.

## Note on CLAUDE.md

Repo `CLAUDE.md` still says "Branch `canvas-v2`. NEVER checkout or merge to main."
That instruction predates the exhibit conveyor: PRs #3–#7 were all branched from and
merged to `main`, and the conveyor handoff explicitly authorises the PR-to-main flow.
This exhibit followed the conveyor. **`CLAUDE.md` should be updated so the two stop
contradicting each other.**
