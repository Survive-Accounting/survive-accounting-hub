# HOMEPAGE TWO-DOOR HERO REDESIGN — V1 REPORT

**Date:** 2026-08-27 · **Branch:** `feature/homepage-two-door-v1` · **Worktree:** `sa-homepage-two-door`
**Spec:** "Two-door hero redesign V1" (Speechnotes information architecture, Survive's visual world).

---

## What shipped

`/` no longer renders the full LandingPage + live player. It renders a new composition,
`TwoDoorHome` (`src/components/site/home-two-door/TwoDoorHome.tsx`): centered hero → three proof
points → two structurally identical doors → course-scope line → reviews + Meet Lee → value strip
→ FAQ → footer. The public Exam 1 CTA enters a **waitlist state (FREE · SEPTEMBER 1)** instead of
the player, because the new player is being rebuilt privately.

**Campus pages (`/$school`), chapter pages (`/go/…`), `/preview/home` and `/go/demo` are
untouched** — LandingPage and the player still serve all of them exactly as before.

## Files changed

| File | Change |
|---|---|
| `src/components/site/home-two-door/TwoDoorHome.tsx` | **NEW** — the whole two-door homepage: hero, DoorCard frame, cycling-bolt left door, chapter-house right door, Greek ticker, Exam 1 launch modal, course-scope modal, page CSS. |
| `src/components/site/home-two-door/two-door-copy.ts` | **NEW** — the locked copy as pure functions (door description, CTA flip, ticker stream derived from `GREEK_PORTAL_ORGS`). |
| `src/components/site/home-two-door/two-door-copy.test.ts` | **NEW** — 6 tests locking the spec copy + ticker derivation. |
| `src/routes/index.tsx` | `/` renders `TwoDoorHome` (loader/OG/JSON-LD unchanged; still passes cookie campus + server-resolved course code so the personalized hero SSRs). |
| `src/routes/landing.tsx` | Additive only: exported `boltFor`, `Faq`, `SectionDivider`, `SyllabusModal`, `PHONE`, `TEL` for reuse. No behavior change. |
| `src/components/site/SiteHeader.tsx` | New `homeNav` prop: homepage bar = Reviews + Meet your tutor, **no "For Greeks", no orange Start-Exam-1 CTA**. Every other page keeps the full bar (spec §4). |
| `src/components/site/portal-home/PortalCards.tsx` | Exported `ChapterFinderModal` (the right door reuses the existing finder). |
| `src/lib/analytics.ts` | Added `homepage_study_solo_clicked`, `homepage_chapter_clicked`, `homepage_course_scope_opened`. |
| `src/lib/launch.ts` | Added `EXAM1_LAUNCH_LABEL = "September 1"` (one constant; the doc comment explains why a named day is back for this surface). |
| `src/lib/site-qa/manifest.ts` | Homepage template `extraFiles` += `home-two-door`, `portal-home`; description updated. |
| `C:\Users\lee\Documents\.claude\launch.json` | Added `homepage-two-door-dev` (port 8093) for preview QA. |

## Before / after hierarchy

**Before:** left-hero + giant cycling bolt right · 2 hero CTAs + nav CTA + bolt-as-CTA ·
embedded live player with school picker · value strip · reviews+Lee · FAQ · footer.

**After:** centered headline + promise · 3 proof chips · **two equal doors** · "Intro Financial
Accounting only · Why?" · reviews+Lee · value strip ("how Survive works", pre-existing) · FAQ ·
footer. Removed from the first viewport: giant decorative bolt (now the left door's icon),
hero Start-Exam-1 button, duplicate CTA copy, "Start Cramming"/"Greek Portal" language,
"free, no account, no card" duplicates, the embedded player.

## Exact locked copy (verified rendering in browser)

- Hero known-campus: **"ACCY 201 at Ole Miss is where GPAs quietly slip."** (code in amber);
  generic: **"Intro accounting is where GPAs quietly slip."** Promise: **"Practice what gets
  tested. Score higher."** No extra paragraph. Proof: ✓ Created by a pro tutor · ✓ 1,000+
  students helped · ✓ Built for exam week.
- Left door: **STUDY ON YOUR OWN** · "Cram videos + practice built for ACCY 201." (verified code
  only; generic: "…built around your course.") · **Start Exam 1 Free →** / **Continue Exam 1 →**
  · "No account required."
- Right door: **STUDY WITH YOUR CHAPTER** · "Get Survive through your fraternity or sorority." ·
  **Find your chapter →** · Greek-letter ticker.
- Waitlist modal: **Exam 1 / FREE · SEPTEMBER 1 / New Exam 1 prep is almost ready. / Cram videos +
  practice built around what actually gets tested. / [email] / Notify me →**
- Course scope modal: the three spec sentences, verbatim.

## Behavior notes

- **Known campus:** cookie → route loader → `CampusProvider` (same SSR path the old homepage
  used): hero + left door personalize server-side, bolt pins to the campus colourway.
  Codes come only from `campuses.course_family_codes_json.intro_1` — never invented.
- **Returning student:** `pathStarted()` (`sa-path-started`, the guided path's own flag — the one
  trustworthy local signal) flips the primary CTA to **Continue Exam 1 →** after mount. Both
  Start and Continue enter the waitlist state, per spec §10. No dashboard link added (no
  natural auth surface exists on the homepage today — deliberately not built).
- **Waitlist routing:** the modal reuses the existing capture end-to-end — `examRequest(examNum 1,
  launchWindow "September 1")` → `submitNotify` → unified intake → `campus_waitlist`, with silent
  campus/course context, `rememberStudentEmail` bridge, and Test-Mode tagging. **No new backend,
  no parallel email system.** Exams 2/3/Final surfaces are unchanged (they live in the player,
  which is no longer on this page).
- **Greek ticker:** derived from `GREEK_PORTAL_ORGS` (the canonical client-side org list, which is
  also Lee's outreach priority order) — not a second hardcoded list. One clipped line, 70s loop,
  edge-fade mask, pauses on hover/focus, click = Find your chapter. Reduced motion → static line
  (CSS media rule + SSR-safe JS check). No per-letter navigation in V1.
- **Right door visual:** a generic Greek-revival chapter-house SVG in the brand line style with
  one amber accent dot. No org's letters as default branding (no ΑΤΩ icon).
- **Chapter referral personalization:** deliberately NOT built. The only chapter attribution that
  exists (`sa_ref`) is an HttpOnly server-side cookie the homepage can't read, and building a
  client-readable channel would be a new attribution system (spec §8 forbids that). Documented
  as the future opportunity; V1 is generic.
- **Legacy anchors:** other pages' navbars still link `/#exam1` — that anchor now sits on the
  doors section, so those links land at the doors.

## Analytics

`homepage_study_solo_clicked {campus_id, course_code, returning}` ·
`homepage_chapter_clicked {campus_id, course_code, source: button|ticker}` ·
`homepage_course_scope_opened {campus_id, course_code}` — all through the existing PostHog
`track()` layer, no new system.

## Accessibility

Semantic buttons everywhere; modals use the shared `useDismiss` (Esc + outside-press) with
`role="dialog"`/`aria-modal`; ticker letters are `aria-hidden` behind an `aria-label="Find your
chapter"` button (the ticker is never required information); reduced motion stops the ticker
(CSS + JS), the card hover lift (CSS), and the bolt (its own built-in reduced-motion mode);
focus rings preserved on chips, doors, ticker, and modal controls.

## Tests / QA

- `bun test`: **1784 pass**, 6 new copy tests green. The one failure is the pre-existing
  `bolt-palette.test.ts` "distinct accents" (fails on pristine origin/main — unowned, untouched).
- `tsc --noEmit`: clean.
- Browser QA on the dev server (port 8093), generic + Ole Miss + returning states:
  - Generic: generic hero/description, both doors matched, two obvious actions. ✓
  - Ole Miss: "ACCY 201 at Ole Miss…" hero; "Cram videos + practice built for ACCY 201." ✓
  - Returning (`sa-path-started=1`): "Continue Exam 1 →". ✓
  - Waitlist modal: locked copy, Notify disabled until valid contact, Esc closes. (No live
    submission — avoided writing a QA row into the real `campus_waitlist`.)
  - Finder: button AND ticker open the existing ChapterFinder modal. ✓
  - Course scope modal: verbatim copy. ✓
  - Nav: Reviews + Meet your tutor only, no For Greeks, no orange CTA, hamburger intact. ✓
  - **Symmetry (desktop 1280):** cards 430×353 both, title tops Δ0px, buttons 380×54 both at
    Δ0px Y, support slots Δ0px — measured, not eyeballed. Mobile 375: stacked, solo first,
    full-width 54px buttons, document horizontal overflow 0px (ticker clips inside its card). ✓
- **Screenshot caveat:** the browser pane was not visibly open during this session, so pixel
  screenshots could not be captured (known compositing limitation). Every visual claim above was
  verified by DOM/computed-style measurement instead. Worth one human glance at `/` post-deploy.

## Deferred (intentionally)

- Chapter-referral personalization of the right door (needs a client-readable attribution channel).
- Per-letter ticker navigation; ticker letters from live `greek_orgs` data (would need a public
  endpoint; the canonical client list is the correct V1 source).
- A designed "How Survive Works" product teaser (value strip fills the slot for now).
- Secondary dashboard link for returning students.
- `/preview/home` retirement/cleanup — the experiment this design supersedes still exists,
  noindexed; remove or repoint after Lee confirms the new "/".
