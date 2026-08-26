# STUDENT EXAM 1 POLISH V1 — REPORT

**Branch:** `feature/student-exam1-polish-v1` (worktree `C:\Users\lee\Documents\sa-exam1-polish`)
**Base:** `ac58efbe` (main at session start, 08-25)
**Commits:** 4 — see below for the final hash.
**NOT DEPLOYED. NOT MERGED.** Preview server config: `exam1-polish` → http://localhost:5262.

---

## Commits

1. `09552df9` — marketing: Start Exam 1 Free CTA, plain navbar lockup, page order, slim bio, launch value cards, floating Text-Lee pill
2. `cd87df8c` — onboarding: welcome overlay on a blurred live player, personalized reveal, all-collapsed topics + Start Here, topic intro cards, remind-me-later
3. `4ff8b744` — delayed personalisation prompts + Get help
4. (this commit) — report + screenshots

## Files changed

| File | What |
|---|---|
| `src/components/site/Marketing.tsx` | Hero supporting line + CTA, value cards, TutorCard, TutorBioModal, `FloatingContact` (new), `StickyFooterBar` retained but unused by landing |
| `src/components/site/SiteHeader.tsx` | `CompactLockup` → plain horizontal "survive ACCOUNTING"; navbar CTA label |
| `src/routes/landing.tsx` | Entry gate + WelcomeCard, Theater v2, default-preview selection, TopicRow hierarchy + RecommendBolt + Start Here, TopicIntroCard, RemindLaterDialog, prompts, ••• menu + Get help, page order, FloatingContact mount |
| `src/lib/analytics.ts` | 17 new event names appended to `SA_EVENTS` |

## Copy changed

| Old | New |
|---|---|
| Cram videos + practice exams built for Intro Accounting. | Cram videos + practice exams built for crushing your first accounting course. *(generic only — campus pages keep "built for {code}.")* |
| Cram Exam 1 Free ⚡ (hero + navbar) | Start Exam 1 Free ⚡ |
| navbar bolt-as-"i" lockup | plain "survive ACCOUNTING" text (bolt lives on in hero/cards/rail) |
| TutorCard: "…from Ole Miss / Ole Miss adjunct / helped" | Two accounting degrees / Tutor since 2015 / 1,000+ students tutored |
| TutorBioModal 5 paragraphs (adjunct, Ole Miss, $50 pitch) | 3 paragraphs: since 2015 + 1,000 students / why Survive exists / traveling + live music |
| Value card 1 body "Made for exams, not lectures." | "Nothing like your lecture videos." |
| Value card 3 "Built for {code} / Coverage matched…" | "Built around your course / Send your syllabus. I'll match it →" (actionable → syllabus modal) |
| (previous school-picker card) | "Welcome to Survive Accounting / First, pick your school. / I use it to match this to your accounting course." + "My school isn't listed" — standalone "Skip →" removed (not-listed IS the alternate path) |
| Loading "Loading ACCY 201…" | exactly: "Finding the easy points on your exam..." → "Prepping the hard stuff too..." → "Almost ready..." |

## Onboarding flow (implemented)

LAND → hero → player visibly waiting **blurred + dimmed + inert** behind the Welcome card → pick school (or "My school isn't listed") → **~2s reveal** (boiling bolt in the school's colors, 3 lines, waits for the resolved map if slower) → player: **all six topics collapsed**, first topic ("Easy Points" on the Starter Map) highlighted with a school-color bolt + **← START HERE**, right pane = Easy Points intro card → **Start Easy Points →** expands the topic, selects its first set, launches the first CEQ.

- No professor question during onboarding — `profDone` starts `true`; the chooser opens only on demand.
- No account, email, or syllabus asked before value.
- Greek chapter pages and the chapter video gate never see the entry gate.

## Topic preview architecture

- `defaultSel` = `{firstTopic, setId:null}` → preview state (recomputed per render; tracks async campus-map reordering; nothing hardcoded).
- Topic header click = `previewTopic(key)`: highlight + one-open accordion expand + right-pane `TopicIntroCard`; second click collapses.
- `TopicIntroCard` renders from live data: set shorthand labels ("You'll cover:"), summed question count, `~lo–hi min` estimate (0.65–0.9 min/question, rounded to 5). Easy Points gets the exact launch copy incl. "Quick wins first. Don't leave points on the table." (used nowhere else).
- Only **Practice** is shown while it's the only real mode — no Cram/Review "coming soon" rows in the card. The data (`playbackId`/`hasReview`) is already present on `StudentSet` for showing Cram/Review durations later.
- Flavor blurbs are an optional `TOPIC_BLURBS` name-keyed map with a neutral default — structure/order/labels all come from Topic Manager data.

## Reminder behavior

"Remind myself to study later →" (Easy Points card only) → tiny dialog: *"Send yourself this study link so it's waiting in your inbox."* + email + **Send it to me**. Reuses the save-progress magic-link plumbing: `writeResume(context)` + `signInWithOtp` with redirect to the current page — the sign-in link IS the durable link back to school/course/player context. No scheduler/cron built. Prefills an authenticated email. Events: `study_reminder_opened` / `study_reminder_sent`.

## Professor prompt behavior

- Trigger: ≥5 answered questions (existing `sa-practice-coverage` store totals — no new tracking), school known, no professor, free tab.
- Form: one-line inline card under the practice area — never a modal, never mid-question. "Want a closer match to your class? Choose your professor." / [Choose professor] / "Not now".
- Shows once; dismissal persisted (`sa-prof-prompt`). Events: shown/selected/skipped.

## Syllabus prompt behavior

- Trigger: professor exists AND ≥12 answered questions (deliberately not right after the professor pick), once per browser (`sa-syllabus-prompt`).
- "Want an even closer match? Send your syllabus. I'll match it." / [Send syllabus] → existing syllabus modal / "I'll do this later". Events wired.

## Menu simplification

`•••` = Save my progress (signed-out only) · Reset questions · Change school · Change professor · **Get help**. Get help opens an in-menu submenu — **Text Lee** (`sms:+16625658818`) and **Email Lee** (`mailto:lee@surviveaccounting.com`) — no page scroll. Events: `help_opened` / `help_text_clicked` / `help_email_clicked`.

## Bio / footer / navbar changes

- Navbar: plain horizontal wordmark; restrained nav unchanged otherwise.
- Bio card + modal: see copy table. Photo row structured (comment + flex strip) for future live-music shots.
- **Sticky full-width footer bar removed** from landing. Replaced by `FloatingContact`: "Questions? Text Lee (662) 565-8818" pill, bottom-right, hidden while the hero or the real footer is on screen, `bottom: 84px + safe-area` so it clears the mobile practice Next bar. Greek pages keep their own bottom CTA (no pill). The full marketing footer is untouched.
- Page order now: HERO → PLAYER → VALUE CARDS → REVIEWS → MEET LEE → FAQ → FOOTER.

## Analytics events (all in `SA_EVENTS`, PostHog via existing `track()`)

`school_picker_opened` · `school_selected` (pre-existing name; pick flow) · `school_not_listed` · `personalized_loading_started` · `personalized_loading_completed` · `topic_preview_opened` · `topic_started` · `easy_points_started` · `study_reminder_opened` · `study_reminder_sent` · `professor_prompt_shown/selected/skipped` · `syllabus_prompt_shown/selected/skipped` · `help_opened` · `help_text_clicked` · `help_email_clicked`. No new analytics service.

## Mobile behavior

- Welcome gate covers both panes; blur teases the rail; card is thumb-sized; no horizontal overflow (verified 390px).
- Topic rail remains the existing drawer; Start-Here treatment renders in it.
- Floating pill: compact "Text Lee", offset 84px above the fixed Next bar.
- Prompts are one-line inline cards, not modals.

## Accessibility

- `prefers-reduced-motion`: loading reveal → static bolt + single line; RecommendBolt → static bolt (no boil, no hover re-trigger).
- Blurred background is `aria-hidden` + `pointer-events:none` + `user-select:none` (visible tease, never readable-but-inaccessible).
- Welcome card `role="group"` with label; picker is the existing labelled PickerSheet; dialogs (Remind/Save/Notify) keep ESC-close + focus.
- Loading line is `aria-live="polite"`.

## Tests / build

- `bunx tsc --noEmit` — clean.
- `bun test` — 1,646 tests, **1 pre-existing failure** (`bolt-palette.test.ts` "distinct accents" — fails on pristine main too; owned by the bolt session).
- `bun run build` — see build output note in the final commit message (client + SSR + nitro).
- Live QA (headless Chrome, dev server 5262): fresh-anon gate ✓ · remembered school skips gate ✓ · campus page overrides stale remembered school ✓ · Ole Miss ACCY 201 ✓ · LSU ACCT 2001 ✓ · not-listed → generic map ✓ · Easy Points intro exact copy ✓ · Start → Q1/10 ✓ · topic preview (Recording Journal Entries card, no auto-CEQ) ✓ · reduced motion ✓ · menu order + Get help submenu ✓ · mobile 390px no overflow ✓.

## Screenshots

`docs/screenshots/exam1-polish/`: 01 welcome gate (blurred player) · 02 picker open · 03 loading reveal · 04 Easy Points intro + Start Here rail · 05 first CEQ · 06 topic preview · 07 mobile welcome · 08 LSU · 09 not-listed · 10 Get help · 11 floating pill.

## Known deferred items

- Cram/Review durations in the topic intro card (data plumbed, display deferred until real content exists — by spec).
- Professor-prompt "after question 5" fires on the coverage event, which updates on answer; it can appear during the end-of-set screen rather than strictly between questions — acceptable per "after feedback / advancing".
- The bolt "brief animate after player reveal" is per-mount (2.6s boil then settle); it does not re-fire on tab return.
- StickyFooterBar component still exists (unused by landing) — safe to delete in a later cleanup once no other surface wants it.
- `system_prompt`-level polish of the mobile topic drawer (sheet with Start-Here pinned) — current drawer works; a dedicated sheet is a later nicety.

## SCHOOL-COLOR ACCENT SYSTEM: **DEFERRED**

Existing behavior preserved: school colors drive ONLY the bolts (`COLOR_BY_ID` → `schoolColors()`/`boltFor()` in `landing.tsx`, sourced from `SEC_SCHOOLS` + seeded campuses; campus pages also set `--sa-bolt-1/--sa-bolt-2` page vars). Semantic colors (correct/incorrect, Practice accent, text) untouched.

**Future extension point:** `frameThemeVars(theme)` on the landing root already injects page-level CSS variables; the cleanest path is to have `boltFor(school.id)` also emit `--school-accent` / `--school-secondary` on that same root style object (one line in the root `<div style={{…}}>`), then let individual components opt in var-by-var after contrast checks. Nothing else needs restructuring — every candidate consumer already reads CSS vars.

---

STUDENT EXAM 1 POLISH READY TO TEST: **YES**
