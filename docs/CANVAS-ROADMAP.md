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
