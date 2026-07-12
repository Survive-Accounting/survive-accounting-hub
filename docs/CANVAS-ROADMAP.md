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
