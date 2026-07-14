# CANVAS ROADMAP — parked items

Living list of Present Canvas directions that are decided-enough to park, not
build. Each entry carries just enough context to cold-start later. Appended by
build runs; don't delete entries — strike them through when shipped.

## Frames — the shot tier (student side)
FRAME (shipped: WORLD › REGION › LESSON › FRAME › CARD) is the unit of ONE SHOT /
ONE STUDENT STEP: a bounded 16:9 stage a student walks through. Student navigation
= prev/next frames (‹ ›, [ / ], PageUp/Down) + the outline (frames nested under
their lesson with beat tags). The "take a tour" wizard auto-drives the frames in
order with narration stops (rides the frame `order` — one source of truth, like
the snake spine did for lessons). Mobile = ONE FRAME PER SCREEN: the 16:9 frame is
the natural phone-friendly unit — revisit portrait with a phone in hand (see the
9:16 variant below). The beat tag (Hook | Teach | Model-Practice | Check) is a
per-frame label, not a container — a lesson may hold 3 Teach frames and 1 Check.

## Multi-format frames (shorts)
Content is DATA, not pixels — never AI-reframe footage; give frames a responsive
layout instead.
- FRAME ASPECT VARIANTS: a frame has a primary 16:9 layout + optional 9:16 (and
  1:1) variants. Each card stores a position PER VARIANT. Default 9:16 auto-derives
  (stack cards vertically in reading/beat order, scale to width); Lee nudges from
  there. Switching a frame to Shorts re-lays it out; film via a 1080x1920
  browser/OBS region.
- SAFE ZONES as toggleable authoring guides (on while authoring, hidden in film
  mode), per platform: YouTube 16:9 (bottom controls band, top-left title on
  mobile, end-screen region bottom-right for the last ~20s); TikTok/Reels/Shorts
  9:16 (right ~15% action rail, bottom ~25% caption/username/music, top platform
  tabs). Cards warn/snap out of unsafe zones. Irrelevant on our own Mux player (we
  control the chrome) — this is purely for off-platform distribution.
- RE-FILM > RE-CROP: cropping 16:9 to vertical butchers cards. Because scenes
  persist, a second vertical take is nearly free — the expensive part (authoring)
  is already done. Structural advantage: cheap re-shoots forever.
- AI's real job here is SELECTION, not layout: suggest which 30 seconds / which
  memo of a lesson is short-worthy. Layout is deterministic.
- KEY INSIGHT: memo decks ARE the shorts library. A "cheat" memo ("ANY receivable
  is an asset") or an exam trap is a 20-second short. Workflow: open the Cheat
  Codes deck → switch to 9:16 → deal one memo per take → ten shorts in twenty
  minutes. Promotional engine falls out of the teaching structure for free.

SHORTS PIPELINE (post-filming, per lesson):
1. Film the core 16:9 lesson → Mux auto-transcript (infra exists).
2. AI SHORTLISTS short-worthy moments from the transcript — never chooses. The
   transcript can't see whether the cards looked good; Lee picks from the
   shortlist. Same "AI drafts, Lee reviews" rule as everywhere.
3. TRANSCRIPT → MEMO → SHORT (the real loop): phrasing Lee invents live on camera
   gets captured back as a cheat/trap memo. That memo then feeds the memo deck
   (Check recap), the shorts library, and the wrap-up. Improvised gold gets
   caught, not lost in a 20-min video.
4. TWO CUTS, not one: SOCIAL cut = hook in first 2s (trap/payoff first) → card
   moment → outro bump ("The whole foundations course is free — Start Here at
   surviveaccounting.com" — name the free thing, never generic "tools"). PLAYLIST
   cut = no hook, just the moment; lives in Course Wrap-up as the exam-eve
   highlights reel (20× 30s of every trap and cheat code — the best cram artifact
   in the product).
5. DISTRIBUTION: drip, don't dump — one lesson = weeks of social. TIME POSTS TO
   THE ACADEMIC CALENDAR: adjusting entries land ~week 6 nearly everywhere; post
   the deferrals short when the whole country hits deferrals. Waitlist campus/
   course/professor data makes this calendar knowable — real edge, no competitor
   has it.

## Map-run navigation
Student-facing traversal of a prepared scene: "Begin" buttons on zones that
walk the teaching path (zone `path_order` already ships), an intro tour video
embed, a breadcrumb minimap showing where you are in the run, and scene-wide
search. The deck + path_order are the data spine; this is mostly chrome.

## Free/paid territory
The canvas map splits into free and paid regions: free content renders B&W,
paid renders in full color, with a border treatment built from Lee's photo
frames and a Join button at the boundary. Gate placement decision: after the
trial-balance material / at adjusting entries. Needs the map-run work first.

## Globe (long-term)
The whole course as a navigable globe/world — canvas scenes as territories.
Blue-sky; revisit after map-run navigation proves the traversal UX.

## Deck store
Custom decks per course/chapter/topic: prebuilt cram decks students pick up,
timed runs against a deck, and AI-mixed decks (sample across chapters
weighted by exam_chapters). Deck membership/order/categories already persist
per scene (`deckMember`, `stageOrder`, `deckCategory`) — the store is a
library of saved deck definitions + a loader.

## Mock textbook problems card
A card that mirrors the student's real textbook: picker for the campus
textbook, problem-type chips (BE/QS/Ex/PR), generates a "Survive version" of
the problem solved in cards on the canvas. Lee-only solutions verifier before
anything is student-visible, plus an "Ask Lee" card wired to the same question
box as the dashboard. Depends on the scenario-doc generator pipeline.

## Mobile landscape student mode
Read-only-ish canvas tuned for phones held landscape: bigger hit targets,
deal/reveal via tap, no editing chrome. Pairs with map-run navigation; the
type-floor warning logic is reusable as a legibility gate.

## Guided navigation menu
A cluster/menu that jumps the camera to any Region Home or Lesson in path
order. Prev / home / next controls live in each lesson header; the full menu
lives in the Region Home lesson (its "menu · soon" placeholder slot already
renders). Replaces reliance on the minimap for navigation. Data spine ships:
lesson `pathOrder` + `home` flag (B1/B4, July run).

## Minimap → MAP → globe/legend
Visual navigation showing Regions, then zoomed-in Lessons with card-type
markers (JE/CEQ/vocab/memorize) so students explore like a game map. The
stepping stone between today's minimap and the long-term globe (see Globe).

## Per-chapter filtered scenario views
Inside a given Region/chapter, the JE description picker (A12) filters to
that chapter's scenarios only — the picker already filters by course +
chapter; this wires the ambient region context in as the default filter.

## Natural zoom from anywhere
Evaluate replacing minimap-driven nav with free scroll-zoom (zoom out to the
map, dive back in). A UX decision to TEST, not a build — don't rip the
minimap until the map view proves itself.

## Region visual identity — the Pacioli polyhedra
Region sigils = the skeletal polyhedra Leonardo da Vinci illustrated for
Pacioli's De Divina Proportione (public domain, on-brand for the father of
accounting, Escher-adjacent). One rotating line-art solid per region —
SVG/CSS animation, no heavy 3D. The world/map view shows regions as floating
sigils: purchased/free regions in color, locked regions in B&W wireframe
(gate-as-terrain). Region header = one licensed 2021 animation loop — CONFIRM
the license covers web/app background use before shipping it. Motion
hierarchy: world most alive → region header one loop → lessons static with an
arrival micro-motion → cards functional motion only. Long-game: completing a
chapter lights one facet of the region's solid — finish the course, complete
the polyhedron.

## Calc memos fed by problem text (Solve-It)
JE lines carry TEXT + CALC memos (PROMPT A, July run) — the calc box renders
tabular arithmetic ("500,000 × 8% × 6/12 = 20,000", = signs aligned). Next
step: Solve-It's problem-text pipeline generates these calc memos from the
source problem's numbers, so every solved line arrives with its arithmetic
attached. Doc schema gains a calc field on lines at that point (today calc
memos are canvas-only; only the text memo round-trips through doc.label).

## Card-flip help for all card types
The "stuck?" back face (reveal / hint / switch-to-guided) shipped on JE (A2,
July run). Generalize the mechanism so every card kind flips: CEQ shows the
answer + feedback, computation reveals steps, memorize shows the body. Same
dispatcher command, same gate-in-practice contract.

## Gate rendering (free/paid boundary)
GATE = a marker dropped between lessons. Free region renders with a B&W
tint, paid in full color; the boundary carries a border treatment from Lee's
photo frames + a Join button. Ties into Free/paid territory + World v1.

## Zone → REGION rename (follow-up)
B1 added LESSON as a second grouping tier and adopted the WORLD → REGION →
LESSON → CARD vocabulary in comments/UI copy, but the zone node type, files,
and scene payloads still say "zone". Finish the rename in one sweep (node
type alias + loader migration) — don't half-rename.

Course structure cleanup (migration 0089, July run) added a rung ABOVE this
one: Course → Chapter → Lesson → Card. Chapter is the existing `chapters`
DB table (course_id, chapter_number, chapter_name) — a syllabus-level grouping,
now editable (rename/add/reorder/archive) via canvas settings' "Manage
course". Chapters are NOT lessons: Lesson stays the on-canvas scene-grouping
element (WORLD/REGION → LESSON → CARD, above). A course's FINAL chapter is
conventionally its Region-level Check — see Foundations chapter 8, "Course
Wrap-up · Cram Decks".

## Solve-It pipeline (September)

### Textbook registry
`textbook_problems` catalog per book (chapter, problem code QS/E/PR/BE, type,
page). Catalog acquired via vision intake: photograph TOC/problem pages →
Claude extracts rows. Rebuild clean — do NOT port Lovable-era code; check the
old repo for salvageable *extracted data* only. Campus onboarding
prepopulates that campus's textbooks; an "Add yours" flow covers missing
books; rent a textbook on demand once ~3 requests hit an uncovered one.
Solved problems publish to ALL subscribers of that book (solve once, serve
many). Pricing: $25 flat per problem, 1 included with the semester pass, no
rush tier at launch (rush = $50+ later, only if demanded). Card-on-file
needs Stripe Customers + saved payment methods — add to
FREE-PASS-SYSTEM-DESIGN.md scope, August.

## Beta program (early August — jumps the queue)
5–8 former students on magic-link beta accounts (the pass-system auth doing
double duty), each dropped into a prepped sandbox world — their own scene,
resettable. The ask: screen-record the first 5 minutes (Loom/OBS), think out
loud, send the video. This forces student-safe mode into July's scope: auth,
scene protection, COA/library read-only, dorm-laptop performance. Beta infra
IS the World v1 dry run — build it once, get both.

## Student card mode (World v1 / mobile)
The authoring/filming card and the student practice card are TWO MODES of one
card, not one UI with controls hidden. Student mode exposes exactly FOUR verbs:
choose account, enter amount, flip-for-help (reads Lee's memos/hints — this is
where teaching lives), check/reveal. REMOVED for students: lock toggle,
settings gear, memo/calc CREATION (they read, not write), arrow drawing, deck
management, all scene/authoring tools. The author sets Guided/Practice at build
time; the student receives that mode and can't change structure. Touch-first:
big account picker, number-pad amount entry, tap-to-flip. The portrait-phone
layout is the hard open problem — evaluate (a) the tetris shape scales to width
vs (b) a stacked debit-section / credit-section variant that preserves the
teaching structure without the wide DR/CR grid; decide with a phone in hand.
Student cards are read-only re: structure; practice state (their attempt) is
per-student and does NOT mutate the authored scene. Ties to auth + read-only
scene mode (already flagged for beta / World v1). NB: the invariant that debits
always render as a contiguous group above credits (built in the "JE interaction
+ polish" pass) is what makes the stacked-section mobile variant clean — the
data is already grouped, so option (b) is a layout swap, not a re-model. The
card-contrast pass (light parchment bodies, dark ink, colour reserved for
meaning) is the high-contrast look student/mobile wants — build student mode ON
the light card, don't restyle.

## Memos-as-objects + named decks + skeleton grid (in progress)
Memos are becoming FIRST-CLASS objects: `id`, `kind` (note|calc|trap|tip|cheat),
optional `title`/name, `body`, free `category` tag, and one-or-more attachment
targets via the connection-arrow mechanic. Fully editable after creation
(reopen → change body/kind/category/rename). Shipped so far (Phase 1, part 1):
the object FIELDS (title/memoKind/category) + a full memo editor + edit-after-
creation, on JE-hosted memos. STILL TO DO on memos: standalone memos (not tied
to a JE line — a memo addressable on its own, still visually tied to its target)
and hosting on non-JE targets (List rows, T-accounts) — the clean way is to
promote memos to their own "memo" node so they can live anywhere and be
deck-collected.

DECKS gain a `payload_type` ('cards' | 'memos') and become first-class NAMED
objects (table `canvas_decks`: id, name, payload_type, filter, run_mode
sequence|shuffle, lesson_id nullable, slots_json, timestamps) — reusable across
scenes; the old unnamed deck stays as default loose staging. A CARD deck is the
existing behavior, named+saved. A MEMO deck collects memo objects; dealing a
memo HIGHLIGHTS it (enlarged) over its DIMMED host card. Named memo decks —
"Cheat Codes", "Exam Traps", "Calculations", "Tips & Tricks" — a memo joins by
memoKind/category or manually. These feed a lesson's Check ("recap the cheat
codes → run the CEQs → see them in action") and the Course Wrap-up.

SKELETON GRID: a deck can be assigned a GRID of fixed canvas slots; undealt
items render as a ghosted, on-brand, KIND-shaped skeleton (faint JE silhouette,
faint CEQ shape, faint memo shape) — a student preview + Lee's filming
teleprompter. Deal (space/click) fills the next slot in deck order; RESET
re-skeletons; SHUFFLE (run_mode=shuffle) randomizes which item fills which slot
on reset; per-deck "show skeletons" toggle, default ON. Deal-to-locked-position
and skeleton-preview are ONE feature. A deck attached to a lesson lays its grid
in that lesson's Check region by default (a lesson's Check = a named deck).
Deferred: layout modes beyond grid (a grid-all memorization view).

## Campus-color region theming (World v1 skin)
Lessons now alternate two BRAND tints (warm / navy) so consecutive path
segments read distinctly, and a CHECK lesson wears a red gate tint ("this is
where I get tested"). Campus-color theming is a World-v1 SKIN on top of that
alternating-tint system: a region adopts the school's colors (navy/red as the
house default), so the same lesson bands re-tint per campus without touching
the band mechanic. The Check-gate red is also the visual SEED of the free/paid
gate — the paid boundary reuses the red-gate treatment (ties into Free/paid
territory + Gate rendering, above). Build order: alternating tints (shipped) →
per-campus palette table → gate treatment shares the Check red.

## Path navigation (student side)
The live OUTLINE panel (authoring, "path navigation" run) becomes STUDENT
navigation. A "Take a tour" wizard auto-drives the camera along path_order with
narration stops at each lesson (rides the SAME snake spine the scaffold +
outline already use — path_order is the one source of truth). Each lesson gets a
"⌂ back to menu" affordance that flies to the region overview; you-are-here
(nearest lesson to viewport centre, built this run) orients students as they
pan. Built on this run's outline + path_order + the boustrophedon layout. NB:
ONE whiteboard/scene per course (Region); the multi-course "world view" (courses
as sigils / planets you fly between) is World v1 — separate, later. The tour is
the in-region traversal; the world view is the cross-region map.
