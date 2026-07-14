# CANVAS ROADMAP — parked items

Living list of Present Canvas directions that are decided-enough to park, not
build. Each entry carries just enough context to cold-start later. Appended by
build runs; don't delete entries — strike them through when shipped.

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
