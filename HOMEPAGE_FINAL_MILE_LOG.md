# HOMEPAGE FINAL MILE v2 — OVERNIGHT BUILD LOG (2026-08-28)

**Branch:** `feature/player-v2-tonights-plan` (per standing rule "no branches" — continued on the
current branch; **not merged to main, not deployed** — an unattended session doesn't change what
students see without you). Checkpoint `f1bc58cb`, work `8894a662..68e9b58d`.

All six sections (H1–H6) are built, committed per-section with explicit paths, and QA'd.

## Decisions made where the spec met reality (each one small, logged as instructed)

1. **"Course code from the existing config constant" — no such constant existed.** Codes come
   from the DB per campus. Created `HOME_CAMPUS` in `src/lib/launch.ts` (same file as the
   waitlist date): id `ole-miss`, name, `courseCode: "ACCY 201"`, school colors. The hero
   button/support/campus line use the visitor's RESOLVED code when known and fall back to the
   config — campus #2 is a data change.
2. **Returning-student "Continue Exam 1 →" variant removed.** H1 sets the button text
   unconditionally ("Survive ACCY 201 →"); the Continue variant from the 08-27 spec had no
   place in the new copy. The `returning` flag still rides on analytics.
3. **Left button's amber glow removed.** It was part of the old accent styling; a crimson
   fill with an amber glow reads wrong, and H2's "three changes only" implies solid token
   fills. Hover scale + focus ring (the actual behaviors) are shared by both buttons.
4. **Temple SVG's `#F5EFE2`/`#F97316` → tokens.** H3 says "stroke color from the existing cream
   token", so strokes use `var(--brand-cream)` and the orange dot uses `var(--accent)`
   (#FCA311, visually adjacent to the spec's #F97316). Stroke width kept at 4.5 (renders ~1:1).
5. **The "campus line from homepage v1"** was the bolt's plate ("for ACCY 201 · OLE MISS") —
   restored with the plate's exact type treatment as `CampusLine` under the hero promise; the
   campus NAME wears the school color from config/`boltFor`. Note: when a visitor's campus is
   known, the headline also names the course — mild redundancy, restored as specified.
6. **Card-bolt campus-color cycling replaced** by the footer's `BoltBoil` (spec's explicit ask:
   same implementation, same speed — verified identical `sa-boil 0.5s` animation on both).
   School color now lives in the campus line instead.
7. **Greek waitlist `source` field:** the shared intake has no source column; the tag rides in
   `topic` ("Greek waitlist · ΑΤΩ") and `note` ("source:greek_waitlist · org:… · campus:…"),
   the same pattern the demo-page claim tags use. Same store (`campus_waitlist`), no parallel
   table. Resubmit guard is client-side (localStorage `sa-greek-waitlist`).
8. **Learn How panel kept its email capture.** The existing panel was a working one-field
   capture; H5 replaced title + copy and added the memorial but didn't order the field removed.
   It sits between the story and the memorial.
9. **Right-card support line** ("Get Survive through your fraternity or sorority.") set in the
   same 13px muted support treatment as the left card's first sentence, for slot symmetry.
10. **Archived `/waitlist` page's own footer still carries its Ben memorial** — a different
    component (`components/landing/SiteFooter.tsx`) on a noindexed archived page the spec
    didn't name. Left alone per the style guardrail; flag if you want it scrubbed too.
11. **Ticker font landed at 18px** (~5–5.5 codes across the strip; hard fade leaves ~5 readable).

## QA gauntlet results

1. **375 / 768 / 1280:** course code never wraps (range-rect check over every "ACCY 201" text
   node: zero multi-line hits at all three widths); support lines ≤2 balanced lines; no
   horizontal overflow; cards stack at 375 with 24px air, side-by-side with 36px gap (~1.8x)
   at 768/1280; title/button rows at 0px vertical delta.
2. **Buttons:** identical computed font/size/weight/padding/radius/minHeight; fills
   rgb(206,17,38)/white and rgb(168,212,240)/navy from the tokens; zero borders; hover
   (scale 1.02) + focus ring classes identical on both.
3. **Bolts:** hero + footer both render 4 `sa-boil-f` frames with the same `sa-boil 0.5s`
   animation from the one shared BoltBoil/BOIL_CSS implementation. Reduced-motion: the shared
   media rule freezes both to the static first frame, the ticker collapses to a static line
   (CSS + SSR-safe JS), the card lift disables — code-verified; the automation tool cannot
   emulate `prefers-reduced-motion`, so one human check with the OS setting is worthwhile.
4. **Greek waitlist (mobile 375, end-to-end):** Ole Miss → ΚΚΓ → email → row landed in
   `campus_waitlist` with campus_id + topic "Greek waitlist · ΚΚΓ" + note tags (verified by
   read-only select). Confirmation copy exact. Resubmit (via the footer chip path) showed the
   confirmation without inserting a duplicate (row count stayed 1). **One QA row exists under
   `lee+greek-waitlist-qa@surviveaccounting.com` — yours to delete/ignore.**
5. **Learn How:** opens/closes on mobile (button + Escape), title "How I built this", new copy,
   memorial only there (footer block clean); 12 badge chips wrap to 2 rows on mobile; "Add
   your Greek org →" chip opens the H4 flow (exercised end-to-end in QA4's resubmit pass).
6. **Greps:** "No account required" / "Study on your own" (any casing) — zero hits, comments
   included.
7. **Diff review:** shared surfaces (Marketing, bolt plate, landing player) changed by
   nbsp-wrapping only; all styling deltas confined to the named items.

Suite: 1,870 pass / 7 locked-copy tests updated to the new spec strings / only the known
pre-existing bolt-palette failure. `tsc` clean. Production build clean (see final report line).

## Not done (deliberately)

- No merge to main, no deploy — say the word and it ships (same merge flow as yesterday).
- `/preview/home` inherits every change automatically (same component); its solo door still
  routes into Player V2.
- `ChapterFinderModal` is now unused by the homepage (the sheet replaced it) but was not
  deleted — not ordered, and /go pages' finder in `components/site/ChapterFinder` is untouched.
