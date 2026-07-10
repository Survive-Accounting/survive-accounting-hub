# SURVIVE CONTEXT HANDOFF — 09 JUL 26

Attach this to a fresh chat. It carries everything a cold session needs. (Note: the
prompt that requested this doc said "read the most recent SURVIVE-CONTEXT-HANDOFF-*.md"
— none existed in the repo; this is the first. It also said "199 docs" — the live
library is **209**. Numbers below are verified, not copied.)

## WORKING STYLE & GUARDRAILS (unchanged, still true)
- Lee = solo founder, films YouTube/course videos, runs $150/hr tutoring, sells
  made-to-order exam-prep videos. Bias every judgment toward: fewer clicks, bigger
  type, looks great on 1080p, dark theme for filming surfaces.
- Work in phases, FAIL LOUD, stop at destructive gates. Show diffs before committing.
  Commit ≠ push; push only when told. Never commit secrets — grep `sbp_`/`eyJ`/
  `service_role` before every commit.
- Live Supabase project: `unvxagsledbsdoremqeb` (two other refs are dead/old — do not
  touch). The Management-API PAT is EXPOSED/BLOCKED (committed plaintext once; rotate
  pending). Consequence: **DDL only via the dashboard SQL editor**; data-plane
  mutations via service-role REST from scripts (bun auto-loads `.env`), recorded
  afterward as idempotent SQL in `migration/supabase-migrations/` (manual-apply dir,
  own 00XX numbering; the `supabase/migrations/` dir is separate — never conflate).
- Repo: `Survive-Accounting/survive-accounting-hub`. Worktree for this stream:
  `C:\Users\lee\Documents\survive-accounting-hub-je-tool-v2`. Local toolchain: Bun
  (`~/.bun/bin`), `bunx tsc --noEmit`, `bun test`, `bun run build` (vite+nitro,
  Vercel deploys `main`). Windows: PowerShell 5.1 quirks (no `&&`, BOM on utf8
  Out-File, native-arg quote mangling → use `git commit -F file`).
- Build now needs `NODE_OPTIONS=--max-old-space-size=6144` locally (@xyflow/react
  joined the bundle; default heap OOMs with exit 134). Vercel containers are 8GB —
  fine — but if a Vercel build OOMs, set NODE_OPTIONS in project env.

## STACK / LOCKED DECISIONS
- TanStack Start + Router (file-based; trailing-underscore `study_.foo.tsx` =
  de-nested URL `/study/foo`), React 19, Tailwind v4 (+tw-animate-css), Supabase
  (anon reads; service-role ONLY in server fns via
  `@/integrations/supabase/client.server`), Zod at every boundary.
- Brand: NAVY `#14213D`, RED `#CE1126` (+`#A8101F` gradient stop), GOLD `#FCA311`,
  DM Serif Display for marketing heroes. Canvas has its OWN synthwave palette
  (`src/components/canvas/theme.ts`).
- Pricing (unchanged): 1-on-1 $2,250 package / $150 hr; Semester $99; made-to-order
  videos $40–$200+ quoted per request.
- AdminGate passcode `1000students` (localStorage `sa-admin-unlocked`).

## STATE OF THE WORLD (what this week changed)

### Product surface: /je → /study (SHIPPED to main? NO — see push state)
- `/study` = the JE study tool (explore / build / present / grid / hub / deck /
  practice). `/je` + `/je/*` are permanent 301s. Chapter-grid print footer says
  `surviveaccounting.com/study`.
- SEO foundation: per-route title/description/canonical/OG on all public routes;
  `robots.txt` (disallow /outreach/, /dashboard/, /admin/, /api/, /onboard, /o/,
  /t/, /order/, /preview, /thankyou); Organization+EducationalOrganization JSON-LD
  on home; `/order` is deliberately noindex.
- Foundations free tier: `/study/foundations` landing + `/study/scenarios/{slug}`
  (foundations-only; gated/unknown slugs 302 → /study). LearningResource/Course
  JSON-LD. DB-driven sitemap: `bun run sitemap:gen` (6 static + 10 foundations URLs).
- Vercel Web Analytics + Speed Insights mounted in `__root.tsx` — must be ENABLED in
  the Vercel dashboard once live.

### Scenario library: 209 docs, all four course families + foundations
- Live census: intro_1=51, intro_2=43, intermediate_1=39, intermediate_2=66,
  foundations=10. All entries balance, every axis combo resolves, every Build bank
  winnable, 210/210 questions resolvable. QA harness: `bun run scenarios:validate`
  (run after ANY import; 0 errors = ship).
- Import pipeline: `bun run scenarios:import` — matches by `doc.slug`, resolves
  chapter from the file's `chapter` block (course_family → courseSlug → number,
  create-if-missing); DEFAULT = IA2 Ch13 only when no block; tolerates flat authoring
  shape. Files in `data/scenarios/`.
- ACCY 201 cleanup: DONE and recorded (see migration numbering below). Legacy course,
  its 11 chapters, and 4 legacy scenarios are gone; campus link repointed to INTRO1.
- chart_of_accounts: CLEAN — 173 rows, deduped/normalized/completed (0 unclassified
  scenario accounts). Engine matches accounts by canonical_name; table has NO inbound
  FKs. Keep PLURAL "Buildings"/"Accumulated Depreciation—Buildings" (engine hardcodes).
- Migration records (manual-apply dir): je-stream records were renumbered to
  **0062–0065** (courses.course_family / foundations course / retire accy-201 / COA
  repair — all already applied live). **0066_canvas_scenes.sql is NOT applied** — run
  it in the SQL editor (canvas falls back to localStorage with a red banner until then).

### Orders / made-to-order funnel
- `/order` request flow live (noindex, conversion-only), server-side inserts with
  deny-by-default RLS; waitlist uses ANON key on purpose. Orders admin lives under
  /outreach. No changes this week beyond metadata. (Deep orders context: docs/ORDERS_CONTEXT.md.)

### Mux
- Status NOT verified this session. The canvas VIDEO card plays
  `stream.mux.com/{playbackId}/high.mp4` + thumbnail poster — it renders structurally
  but was not tested against a real playback ID. If Mux isn't provisioned yet, the
  card is inert until it is.

### Push state (IMPORTANT)
- `main` = production. Branch `je-engine-v2` (all of the above through the SEO/
  foundations work + analytics) is pushed to origin and **PR-ready, conflict-free**
  (merged up to date with main; migration numbers deconflicted). PR still needs to be
  OPENED/MERGED: https://github.com/Survive-Accounting/survive-accounting-hub/compare/main...je-engine-v2?expand=1
  → until merged, `surviveaccounting.com/study` 404s.
- Branch `present-canvas` (forked from je-engine-v2 HEAD `1145233`): commit `2744d56`
  = the entire canvas. **NOT pushed** (per instruction).
- `gh` CLI: installed via winget but needs a NEW shell + one-time `gh auth login`
  (browser flow only Lee can do). Until then, PRs via compare URLs.

## PRESENT CANVAS v1 (/study/canvas) — full documentation

**Purpose**: the filming/tutoring table. Two modes of teaching: prepared (deal cards
from the library, reveal piece-by-piece) and improvised (spawn blank, build live).

**Route**: `src/routes/study_.canvas.tsx` → `/study/canvas` (unlinked, noindex,
`ssr:false`). React Flow 12 in **UNCONTROLLED** mode (`defaultNodes` + `rf.*` store
mutations). Do NOT convert to controlled `nodes` state — card edits go through
`rf.updateNodeData` and a controlled copy races/clobbers them (observed, fixed).
List mutations (JE lines, schedule cells, T-account rows, computation steps) use the
FUNCTIONAL form (`updateFn` in `useCardActions`) so rapid commits never lose updates.

**Files**: `src/components/canvas/` — `theme.ts` (neon tokens), `types.ts` (CardData
discriminated union + SceneDoc + cardId), `templates.ts` (blank factories + schedule
presets), `ui.tsx` (EditableText/EditableNumber: dbl-click edit, `nodrag`, Enter/blur
commit, Esc revert), `BaseCard.tsx` (card contract shell: header=drag handle, title
input, edit/duplicate/minimize/delete, NodeResizer, z-front, `useCardActions`),
`library.ts` (flattens 209 docs → 1,061 spawnable items), `Palette.tsx` (drawer),
`cards/JeCardNode.tsx`, `cards/ScheduleCardNode.tsx`, `cards/OtherCards.tsx`
(T-account/Computation/CEQ/Memorize/Note/Video). Persistence:
`src/lib/canvas.functions.ts` (server fns; JSON blobs cross the boundary as STRINGS
because TanStack's serializable check rejects open records) +
`migration/supabase-migrations/0066_canvas_scenes.sql`.

**The card contract**: spawn prepared (deep-cloned COPY of doc content — edits never
write back) or blank (edit-ready); inline-edit everything; resize; duplicate (⧉);
minimize → bottom tray chips; delete; z-to-front on pointer-down; per-card reveal
state serializes with the scene.

**Card types**: JE (caption, lines w/ account autocomplete from doc accountBank +
free text, DR/CR, labels; reveal toggles `$`=amounts `ab`=labels; balance chip —
green "✓ balanced" when ΣDR=ΣCR else red "Δ {diff} DR/CR"; DISTRACTOR FLIP per line
— docs carry trap as a sentence, so flip = red styling + the feedback line; alternate
wrong values can be typed into the trap). SCHEDULE (generic engine + presets:
amortization/depreciation/fifo/bankrec; per-cell hide/reveal chips; Σ totals row;
amortization "Check" = compare vs `buildAmortSchedule` from `@/lib/je/amortization`,
±$1.5 tolerance, wavy-underline mismatches, never auto-corrects; "auto-fill" replaces
the grid with engine truth). COMPUTATION (narration + steps w/ label/formula/value).
T-ACCOUNT (two sides, small labels, live `bal N DR/CR`, clear-all). CEQ (click
distractor → its feedback; reveal-answer toggle; picked state round-trips scenes).
MEMORIZE (kind badge formula/mnemonic/watchout/tip). NOTE (marker font, 3 neon
colors, chromeless). VIDEO (Mux playback ID).

**Hotkeys**: `space` = reveal next hidden element on selected card (JE lines →
computation steps → schedule cells reading-order) · `h` = hide-all prep ·
`f`/double-click = zoom-to-fit card · `Esc` = full view (also closes Load) · `c` =
clean screen (palette/minimap/toolbar/tray hidden) · Delete/Backspace = delete
selection. Spawning exclusive-selects the new card.

**Zones**: toolbar → translucent labeled box (zIndex −1). Card dropped inside gets
`parentId` → moves with the zone; dragged out → unparented. Label inline-editable.

**Scenes**: toolbar Save / Save-as / Load / New + name input; autosave every 30s once
a scene id exists. Serialized: full node array (cards + zones + reveal/edit state) +
viewport + bg mode. Table `canvas_scenes` (RLS deny-all; service-role server fns).
**Until 0066 is applied**: red banner "Scene DB unavailable … 0066" + saves land in
localStorage (`sa-canvas-fallback-scene`) — verified round-trip: 13 cards + reveal
state restored identically after refresh. `waypoints_json` column reserved for v1.1
student map (unused).

**Verified live** (headless browser): every card type spawns blank; prepared spawn
from Foundations Ch 2 ("Buy a $1,200 computer" → Equipment/Cash 1,200, ✓ balanced,
2 traps preloaded); JE chip red Δ→green; flip round-trip; amort Check "✓ all 40
filled cells match the engine" on canonical 500,000/8%/10%/5yr/semiannual (p1:
20,000/23,070/3,070/464,461; p10 CV=500,000), then exactly 1 underline after
corrupting a cell; T-account 900−250=650 DR live; stepper on JE + schedule; clean
screen; focus zoom; scene save/refresh/load identical. 123 unit tests, build, tsc green.

**STRETCH skipped (not half-built)**: §5 save-as-template + `my_card_templates`
table (not created); §8 ink layer (laser + persistent); §9 deal button; §10 card
arrows (RF edges are wired as `defaultEdges={[]}` — nothing renders).

**Known rough edges (honest list)**:
- Bank-rec preset is a plain 4-col table — the "adjusted balances agree → green"
  rule is NOT implemented.
- Pan = drag on empty canvas (RF default) + scroll; space is the reveal key, NOT a
  pan modifier (deliberate conflict resolution — spec wanted both on space).
- Focus zoom is `f`/double-click, not single header-click (header is the drag handle).
- Video-bg uses `space intro (1).mp4` only; no picker for the other two clips.
- CEQ answer choices from library questions show resolved literals; ref-based exprs
  (bond questions) show the raw expr string — fine for improv, ugly if spawned.
- Prepared JE cards from slot-key docs (bond family) spawn with blank amounts (docs
  carry `amountSlotKey`, not literals) — fill by hand or use a schedule card.

## OPEN FLAGS
1. **Apply 0066** in the SQL editor → scene persistence goes DB-backed (fallback
   banner disappears). 30 seconds.
2. **Merge je-engine-v2 → main** (PR link above) → /study + SEO + analytics go live;
   then enable Analytics + Speed Insights in Vercel; submit sitemap in GSC; PageSpeed
   the live URLs for a real CWV baseline.
3. **Push present-canvas** when reviewed (it forks from je-engine-v2, so merge that
   first or set the PR base to je-engine-v2).
4. `gh auth login` (one-time, browser) → sessions can open/merge PRs directly.
5. Rotate the exposed Supabase PAT (still pending; blocks dashboard-cleanup push).
6. Product-name call: h1 still "Journal Entry Scenario Engine" on /study.
7. 0022 migration number is duplicated on main (pre-existing, not ours).

## SEQUENCED NEXT MOVES
1. Ship: 0066 → merge PR → enable analytics → film a first scene on /study/canvas
   (real usage will surface UX nits no probe can).
2. Canvas v1.1 — student map on `waypoints_json`: ordered card waypoints per scene,
   a "follow the path" mode for students; plus the STRETCH list in priority order:
   ink layer (laser first — biggest filming win), deal button, save-as-template,
   card arrows.
3. Filming workflow: OBS captures the browser; `c` + focus zoom + spacebar are the
   whole choreography. Consider a 1920×1080 fixed-frame toggle so recordings frame
   identically every time (small, high value).
4. SEO phase 2 (decided, unbuilt): gated teasers for non-foundations scenarios once
   a membership tier exists (CTA → /order); real Organization sameAs socials;
   purpose-built 1200×630 OG image.
5. Mux: verify account + a playback ID against the video card before relying on it
   in a scene.

— End of handoff. The table is set; go make something students remember.
