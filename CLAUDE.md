# CLAUDE.md — Survive Accounting canvas

## Always
- Branch `canvas-v2`. NEVER checkout or merge to main. Main waits for Lee's explicit word.
- `NODE_OPTIONS=--max-old-space-size=6144`
- Fail loud. No silent fallbacks, no stubs that pretend to work.
- Show diffs before commits. Secret-scan, then push canvas-v2 when verified.
- Two failed attempts on an item → stub it loudly, log it, move on.
- Never delete or weaken a passing test to go green.

## Protected zones — do not touch unless the prompt names them explicitly
- Element/frame parent-membership assignment: `onNodeDragStop` (~3454-3606),
  spawn parenting, `hitFor` geometry test
- Scene serialization internals (additive fields OK; schema_version handling not)
- Command-bus core
- Space-walk core
If a task requires touching these, STOP and report instead.

## Cloning
Never write new node-cloning or parent-assignment logic. Reuse the existing
duplicate-lesson / duplicate-frame paths. If they're wrong, report — don't fix.

## Migrations
Additive only unless told otherwise. Number AFTER a true high-water check.
List under "SQL LEE MUST RUN". Never auto-run. Never write code that silently
no-ops when its migration is missing — gate loudly.

## Unattended runs
Additive only. No data-rewriting. No touching protected zones. Nothing that
changes what students see. When in doubt, do nothing and report.

## Risk tiers
- RISKY (membership, serialization, migrations, data): commit per item, run the
  suite after each, full report.
- STANDARD (UI, styling, view modes, removals): one commit, one test run at the
  end, brief report.

## Report format
Per-item pass/fail/stubbed · SQL LEE MUST RUN · anything ambiguous you decided
and how. No narrative unless RISKY.

## Reference docs
`docs/UI-AUDIT.md` (control inventory + file:line for the whole canvas),
membership diagnosis in session scratchpad. Use these instead of re-exploring.

## Speed
- Run typecheck + tests per item (tests are ~300ms). Run a FULL BUILD only once,
  at the end of the session.
- Work from cited file:line ranges. Do not read `study_.canvas.tsx` in full.
- STANDARD tier: no subagents, no codebase surveys, no exploratory reads. Use
  `docs/UI-AUDIT.md` for locations.
- RISKY tier only: exploration and subagents are allowed when the prompt asks
  for a diagnosis.
