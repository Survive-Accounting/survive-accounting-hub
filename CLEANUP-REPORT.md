# CLEANUP REPORT — `cleanup/mobile-pass-01`

Unattended pass, 2026-08-31. Nine sections, one commit each, mobile-first, verified at 390×844
in a real browser rather than by reading the CSS.

Everything below that says "measured" was measured. Where a target was missed, the number I
actually got is here with what it would cost to close the gap.

---

## Summary

| § | What | State |
|---|---|---|
| 1 | Footer rebuild + Gmail email links | Done — 460px → 298px (35%, target ~40%) |
| 2 | Revert the Greek chapter icon | Done |
| 3 | Modal + mobile layout fixes | Done — found a genuine dead end |
| 4 | Global marketing nav | Done — one exception listed |
| 5 | "Share with your chapters" | Done — video slot deliberately not built |
| 6 | /learn phone-app shell | Done — PWA install prompt is platform-limited |
| 7 | /learn study path | Done |
| 8 | House ads scaffold | Done — slider ships flagged off |
| 9 | This report + push | Done. **Not merged.** |

Typecheck clean throughout. Test suite: **2162 pass, 1 fail** — the failure
(`bolt-palette › the whole table produces distinct accents`) is **pre-existing on this branch's
base**, confirmed by stashing my work and re-running. I did not touch it; it is out of scope and
listed under "broken but out of scope" below.

---

## 1. Footer rebuild (global)

**Height: 460px → 298px at 390×844. 35% shorter, against a ~40% target.**

I stopped at 35% deliberately. The last five points would have meant either dropping one of the
four Students links or letting "Become a campus rep" wrap to two lines, and the row heights are
already at 26px — going lower shrinks tap targets on the exact device this pass is about. Say the
word and either trade is one edit.

Built as specified: the standalone `surviveaccounting.com` line is gone (it named the domain the
visitor is already on), `© 2026 Earned Wisdom LLC · Privacy · Terms` on one line, the Ben Ingram
memorial back out of the modal and under the legal row, phone and envelope icons from
`lucide-react` (already the project's set — no new library).

**The third column is a data change.** `gridTemplateColumns` is derived from `columns.length`, so
adding the coming GREEKS column is pushing one object into the `columns` array. Nothing about the
layout is written for two.

### "Learn how" — root cause

The panel opened, but the **sticky navbar painted over it**.

`<footer>` carries `position: relative; z-index: 1` — added earlier so the fixed `FrameBackground`
would stop painting over the footer. That makes the footer a **stacking context**, so the panel's
`z-[300]` was confined to the footer's own rank of 1, while `SiteHeader` is a `z-[200]` sticky
element in the *root* stacking context and outranks it.

Measured with the panel open at 390×844: `elementFromPoint(195, 28)` returned the navbar wordmark,
not the panel's backdrop. The dim never covered the top 55px, the navbar stayed bright and
tappable over the dialog, and on a short viewport (landscape, or an open keyboard) the bar covered
the panel's own close button.

Raising the z-index cannot fix that — the number was never the problem. The panel now portals to
`document.body`. Re-measured: `elementFromPoint(195, 28)` returns the backdrop.

Two more defects found while in there and fixed: no max-height and no internal scroll (clipped and
unrecoverable on any short viewport — verified fixed at 390×380), and a scroll lock that was
`overflow: hidden` on `<html>`, which iOS Safari ignores.

### Email links → Gmail

`mailto:` does not open an email app; it opens whatever the device registered for the scheme,
which on your phone was inDrive. One helper (`src/lib/email-link.ts`, 9 tests) now builds every
visitor-facing "reach Lee" link as `https://mail.google.com/mail/?view=cm&fs=1&…` with a
context-specific subject, opening in a new tab with `noopener`.

Converted: footer · nav Contact dropdown · landing help menu · `/privacy` · `/terms` · the legacy
landing footer.

**Deliberately not converted, and why:** the outreach admin and the council `CampaignBuilder`
compose mail **to someone else** — a chapter president, a prospect. That is a different job, and
routing your own outbound workflow through one specific webmail client is not what was asked.
`src/components/growth/va-mode.tsx` is an internal VA tool and is outside "marketing surfaces".
All three still use `mailto:`. Say if you want them switched.

---

## 2. Revert the Greek chapter icon

Replaced with lucide's `Building2`. No flag, no bolts, no new dependency. Verified at 390px: the
door renders `lucide lucide-building2` and no `.sa-flag` element exists in the document.

The `chapter` variant keeps a small climbing arrow (lucide `TrendingUp`) beside the building. That
is *information* — it is the only thing on the chapter door that says which direction the GPA
moves — and it is neither a flag nor a bolt. If it should also go, it is four lines.

`GREEK_HOUSE_CSS` is now an empty exported string rather than deleted, so the two stylesheets that
inject it (`Marketing.tsx`, `TwoDoorHome.tsx`) did not need editing in a pass with no other reason
to open them. **One-line cleanup for whoever touches those files next.**

### Custom-icon audit — every one-off mark on the marketing surfaces

You asked for this before commissioning a set. There are **eight**, all hand-drawn SVG in the
bolt's language:

| Component | File | Where it shows |
|---|---|---|
| `FlyerMark` | `src/components/site/chapter/ChapterDoors.tsx:105` | Chapter page — the flyer door |
| `SendMark` | `src/components/site/ChapterAccess.tsx:360` | Share kit tier 1 |
| `PostMark` | `src/components/site/ChapterAccess.tsx:371` | Share kit tier 2 |
| `ExecMark` | `src/components/site/ChapterAccess.tsx:383` | Share kit tier 3 |
| `PlayMark` | `src/components/site/council/CouncilDoors.tsx:112` | Council page door |
| `GlobeMark` | `src/routes/offer.mckenzie.tsx:462` | The offer page |
| `VConnector` | `src/routes/study.tsx:1392` | Study flow connector |
| `GreekHouseMark` | `src/components/site/chapter/GreekHouseMark.tsx` | **Retired this pass** |

Plus three that are *brand*, not iconography, and should not be in a commissioned set:
`AnimatedCampusBolt`, `BoltBoil`/`SurviveWordmark` (`brand-cards/bolt-boil.tsx`), and `ModeBolt`
(`components/learn/ModeBolt.tsx`).

So: **seven live one-off icons** to commission, and a house style that is already consistent
between them. Everything else on the marketing pages is lucide.

---

## 3. Modal and mobile layout fixes

### The claim flow was a dead end on a phone

Walked end to end at 390×844, as asked. Three defects, and together they meant a scholarship chair
halfway through the form **had no way out but the back button**:

1. The panel rendered **854px tall in an 844px viewport**, so no backdrop was tappable anywhere.
2. The × sat at **(353, 27)** — under the sticky navbar. `elementFromPoint` returned the navbar, so
   the tap never reached the button. Same stacking bug as §1: a `z-[240]` overlay declared inside
   `<main>` (`position: relative; z-index: 1`) cannot outrank a `z-200` sticky header in the root
   context.
3. `items-end` + `overflow-y-auto` sends overflow past the container's **start** edge — the one
   direction scrolling cannot reach — so the heading was gone too.

Escape closed it. There is no Escape key on a phone.

Re-measured after the fix: panel 743px inside 844 (top 101 / bottom 844), close hit-test lands on
the button, first field at y=293 (above the fold), body pinned, panel scrolls internally.

### One overlay shape, decided once

Every overlay on the site was hand-rolled with a different subset of the same four bugs. There is
now `src/components/site/Sheet.tsx` — bottom sheet under 640px, centred dialog above — which
portals to `document.body`, caps at `88dvh` and scrolls inside, keeps a sticky header with a 40px
close target, and pins the page behind it.

Moved onto it: the claim sheet, `GreekWaitlistSheet` (the homepage's "Find your chapter"), and
`ChapterFinderModal`. The footer's Learn-How panel follows the same four rules inline — it was
fixed and verified first, and converting it afterwards would have meant re-proving work that was
already proven.

`src/lib/use-scroll-lock.ts` is the scroll lock, depth-counted so nested overlays cannot unlock
early. `overflow: hidden` on `<html>` is a no-op in iOS Safari; the body is pinned at its offset
and the offset restored on close, because without the restore, closing a sheet teleports the
visitor to the top of the page.

### Chapter hero

**1135px → 966px at 390×844.** 15% shorter, 1.34 → 1.14 screens. Door cards now carry CSS vars for
every vertical value and step down below 640px; the marks are scaled (112 × 0.68 = 76) rather than
given a second size prop, so nothing else moves.

**It is still over one screen, and here is exactly what is left** (390×844, measured):

```
headline (3 lines)      101px
promise line             52px  + 16 margin
campus line              20px  + 16 margin
trust chips (2 rows)     74px  + 20 margin
the two doors           596px  + 24 margin
padding                  24 + 24
                       ──────
                        966px   (viewport 844)
```

To get under one screen you have to cut about 120px, and every candidate is content: the chips row
(74px), the promise line (52px), or ~60px off each door. Your call — I did not want to delete copy
unasked.

### /learn waitlist card

Dismissible and the dismissal sticks. "Not now" was the third item in a mobile stack below a
full-width button; it is now a corner ×. Persisted per device in
`src/lib/device-prefs.ts` (localStorage, read in an effect — reading it during render would put
the server and client out of step, and a hydration mismatch on this app means every button on the
page silently stops working).

A dismissed pitch does **not** come back when a locked tab is tapped; that shows a one-line
"Email me when the Final is up →" which restores the panel. Persistence a single tap undoes is
decorative, and a dismissal with no way back is a dead end. Four-step flow verified in the browser.

---

## 4. Global marketing nav

### The Greek item is back, and it is always visible

A bordered accent pill in the bar itself, at every width, on every marketing page — not in the
hamburger. The duplicate hamburger row is gone; one door should not have two entries.

**This is the one place I went smaller than the brief.** "For Fraternities & Sororities · ⚡ Boost
chapter GPAs" is ~290px of type. A 390px bar already carrying a ~150px wordmark and a 44px
hamburger has about 180px left. Showing it whole there means truncating a proposition into "For
Fraternities & Sor…" or wrapping the bar to two rows. So the pill says the shortest *true* version
of itself at each width:

- `< 480px` — **⚡ Greeks**
- `< 1024px` — **⚡ For Greeks**
- `≥ 1024px` — **For Fraternities & Sororities** / **⚡ Boost chapter GPAs**

One element, one href, three labels. Verified at 390px: renders at x 234–326 in a 390px bar, no
horizontal scroll, links to `/chapters?school=<the campus the page already resolved>`.

Chapter pages (`/go/…`) are the deliberate exception — the visitor is already standing inside a
chapter, so a link out to "find a chapter" is a door out of the funnel they are in.

### Wordmark audit — asked to confirm it is top-left everywhere

It is, but it was **not the same wordmark**. `/privacy`, `/terms`, `/start`, `/beyond`,
`/outreach/school/*` and the two `/study` pages render the legacy `SiteNavbar`, which loaded a
raster PNG from `lwfiles.mycourse.app` — a different mark, on a host we do not control, on exactly
the pages someone opens when checking whether this is a real company. Swapped for the same
`CompactLockup` the main header uses.

**Remaining exception: `/waitlist`** has its own red-band header with the same PNG. Left alone —
that is a different design, not just a different logo, and changing it is more than a logo swap.

### Share pages

`ShareScreen` had the lockup inside the centred column, directly above the headline: two brand
elements on one vertical axis reading as one three-line block. The lockup is now absolutely
positioned top-left (out of the column, so the column stays centred in the viewport rather than in
what is left beside a logo) and the hero carries a centred `BoltBoil`. Verified on
`/s/university-of-alabama/council`.

---

## 5. "Share with your chapters"

### The message

Your draft, with three changes:

- **The first line carries the offer and the catch together** — "no cost, nothing to buy". A group
  chat shows about one line before anyone opens it, and the first question the chat asks the exec
  who pasted it is what this costs. Answering it before it is asked is what makes the post
  pasteable at all.
- **The credential moved up** into the opening block. It used to be the last line, on the theory
  that a chat's eye lands last — but that was written when the post ended in prose. It now ends in
  a wall of links, so a closing line sits below everything anyone reads.
- **Blank line between every chapter**, name on its own line, link beneath. Verified against a real
  18-chapter Panhellenic roster.

The full council page builds the same post from the same function, so the DM front door and the
email destination cannot hand out two different messages.

### Proof above the button

The "What's actually on AC 210 Exam 1" topic card — the course's own six topics with minute counts,
plus one worked question. It is the only thing on the screen an exec can *check*.

**I did not build the video slot.** The brief offered "the topic card OR a video slot, with a
placeholder if no asset exists". A placeholder video box is an empty rectangle where the proof
should be, on the one surface that most needs proof. When a real video asset lands it replaces this
block — it is one component swap in `src/routes/s.$campus.council.tsx`.

### Preview, materials, and a bug found in passing

The preview is inline under the button, collapsed, and **auto-expands on copy** — the riskiest
second on this page is the one after the tap, when the exec has something invisible on her
clipboard and is about to paste it under her own name into a chat full of chapter presidents.

**A failed copy used to do nothing at all.** `copyToClipboard` correctly refuses to claim a success
it did not have — and both its paths fail in the in-app browsers GroupMe and Instagram open links
in, which is exactly where these links get opened — but the caller swallowed the "no": no state
change, no message, a button that visibly ignored the tap. It now opens the preview so the message
is on screen and selectable, says the browser blocked it, and leaves the button un-confirmed. This
is the path that actually ran in testing, because the browser pane blocks clipboard writes.

"Need flyers and slides? Open the full page →" is now a 54px bordered secondary button, not grey
footnote type.

**Cost:** the page is 1461px at 390×844 rather than one screen. The proof block did that. It was
asked for, so I built it and am flagging the trade rather than quietly making it.

### What a council exec still cannot answer from this page

Asked for, not fixed:

1. **Who are you?** No name, no face, no "I'm Lee". The credential is "a tutor who's worked with
   1,000+ students" — an anonymous one.
2. **Why is it free? What is the catch?** The message says "nothing to buy". The page never says
   what the business model is, so the exec has to guess.
3. **What happens after Exam 1?** The post promises the first exam free. Nothing says whether
   Exams 2–4 exist, cost money, or are coming.
4. **Does my council owe anything?** Never stated. The full council page answers it in an FAQ; this
   page does not.
5. **What do my chapters have to do?** Is there a sign-up? An account? A download? Unanswered.
6. **Is my campus's course actually covered?** The topic card now implies it, but nothing says
   "yes, AC 210 at Alabama specifically" in words.
7. **What data do you get about my chapters?** An exec pasting tracked links is handing over
   attribution she has not been told about.
8. **Is this affiliated with the university or my national?** No disclaimer either way.
9. **What if a chapter is missing from the list?** The empty-roster case is handled; a *partially*
   wrong list is not.
10. **How do I get back to this page?** No "email me this link", and the URL came from a DM she
    will scroll past.
11. **When do my chapters need this by?** No exam date, no urgency, no deadline.
12. **Has any other council done this?** No social proof from a peer council anywhere on the page.

My read: **2, 3 and 11** are the ones costing conversions. Free-with-no-catch is the least
believable thing on the page, and there is no date to act by.

---

## 6. /learn — phone-app shell

The marketing navbar is gone from `/learn` entirely. It was the Study Canvas shell — brand strip,
campus `<select>`, sign-in button — which is chrome for a tool, and offering "Reviews" and "Meet
your tutor" to a student cramming at 11pm is an invitation to leave.

What replaced it, all verified at 390×844:

- Animated `survive` + bolt wordmark, **"Welcome, Mckenzie"**, "Start studying below."
- Current exam + topic selector top-left; **Help** and the house menu top-right.
- **Bottom tab bar** — CRAM · PRACTICE · REVIEW · ACCOUNT — fixed, safe-area-aware, with a count
  badge on Account.
- Help opens a sheet with two rows: text Lee, or email Lee (Gmail URL from the §1 helper). Verified
  the links are `sms:+16625658818` and the Gmail composer.
- Account holds the setup checklist; checking a row animates, persists, and drops the badge
  (verified 4 → 3 with `{"school":true}` in storage). The campus selector moved here from the old
  navbar — it is setup, and setup belongs on the setup screen.

**The name.** `TODO(name)` is in the code. There is no display-name column, so a signed-in student
is greeted by the capitalised local part of their email and `Mckenzie` is the fallback, exactly as
asked. Both branches replace with one line when a profile name lands.

**Why the tab bar does not jump when the keyboard opens:** `position: fixed; bottom: 0` measures
against the *layout* viewport, which stays full-height when the keyboard appears, so the bar sits
under the keyboard rather than riding on top of it. `position: sticky` inside the scroller and any
`100vh` arithmetic both produce the jump. The safe-area inset is padding, not margin, so the bar's
background still reaches the bottom of the screen on a device with a home indicator.

**A bug this created and I fixed:** on a wide screen the spine and the up-next rail are their own
scrollers running to the bottom of the viewport, so their last ~57px sat underneath the fixed bar.
Measured at 1280×860: asides ended at 860, the bar started at 803. The spacer now comes off the
whole row; re-measured, asides end at 804.

I also **removed the mode chip row** (CRAM / PRACTICE / REVIEW pills) from the scroll. The tab bar
is the mode switcher now, and two controls for one choice twelve pixels apart on a phone is how a
student ends up unsure which one they are looking at.

### PWA — and the honest limit

`public/learn.webmanifest` ships (`display: standalone`, `start_url: /learn`, three icon entries),
linked from the route head along with `apple-mobile-web-app-capable`. Verified: the manifest serves
200, the link tag is present, visits are counted.

`InstallPrompt` appears from the **second** visit — asking someone to install an app they have used
for four seconds is asking them to say no.

**The limit you should know about:** Chrome only fires `beforeinstallprompt` — the event that
produces a real one-tap install button — for a site with a **service worker that has a fetch
handler**. There is no service worker on this app. So today the Android/Chrome button path will
never trigger, and only the iOS instruction path ("Share → Add to Home Screen") will show.

I did not add a service worker. A caching SW on a live product is a genuinely risky thing to ship
unattended — get the cache strategy wrong and students are served stale JS with no way to clear it
— and it is a decision rather than a cleanup. It is a small, contained follow-up: a no-op fetch
handler is enough to satisfy Chrome's requirement without caching anything.

Your note about Safari is correct and is in the code: Safari will not let a site hide its own
address bar; installing to the home screen is the only route, and standalone mode does drop the
browser chrome entirely.

---

## 7. /learn — the study path

Three steps, then the plan. Verified end to end in the browser.

**The estimate is the product.** "42 min" is a decision a student can make; "start studying" is
not. It is the biggest thing on screen and updates live: measured 42 min (Cram) → 1 hr 32 min
(+ Practice) → 1 hr 48 min (+ Review), and the caption flips from "Measured from the actual video
lengths" to "An estimate — practice time is a guess until the question player ships" the moment
anything guessed enters the total.

Every number comes from `src/lib/study-plan.ts` (**21 tests**), which is pure and DOM-free so the
arithmetic is testable. It reports `measured: true|false` per mode and the total is only as honest
as its least honest part. Specifically:

- Cram sums real `runtimeSec` and **excludes sets with no published video** — counting a
  "coming soon" row promises time against a video the student cannot open.
- A published set with an unknown runtime is filled from the **average of its siblings** and the
  total is flagged as an estimate.
- Practice is **never** claimed as measured: 45s/question is a stated guess, because no practice
  player has shipped and nothing has ever been timed.

**"Skip — just show me the videos"** is on step 1 and is not styled as a decline. A student texted
this link the night before an exam is the highest-intent visitor on the surface and skipping is the
*right* answer for them. The path also never shows over a deep link (`?set=…`) — someone handed a
link to a specific video is not asking to be onboarded.

**Committed vs completed are stored separately**, as asked (`sa-learn-plan-commit` /
`sa-learn-plan-progress`), so the comparison you want later is possible. The commitment freezes the
estimate *as it was when they agreed to it* — re-deriving it later would compare their effort
against a promise nobody made them. `planAdherence()` does the comparison and only credits modes
the student actually committed to.

**The plan view is the layout you wanted to test**, and the old one is behind a flag:

- `rail` (default) — collapsible topics down the page like a syllabus, each topic's videos
  scrolling sideways. Vertical = further through the course; horizontal = further through a topic.
- `?layout=grid` — the two-column card grid, where scrolling down means both at once, which is why
  a student cannot tell how far through they are.

Verified: 3 topic rows render, each scrolls horizontally, the page never scrolls sideways, and
snap + `overscroll-behavior-x: contain` stop a flick at the end of a row from triggering the
browser's back-swipe.

**Caveat:** the rail/grid switch is **narrow-screen only**. Wide screens keep the existing
spine-left / rail-right layout, which is the same information in the space that affords it. The
comparison you asked for is a phone comparison, and that is where it lives.

---

## 8. House ads — scaffold only

- **Hamburger** at the top right of `/learn` with the three destinations. Verified: "Set up your
  Greek chapter", "Become a campus rep", "Get full access".
- **`PromoSlider`** — a horizontal strip mountable at the bottom of the scroll on `/learn` and on
  marketing pages. **Flagged off** (`HOUSE_ADS_SLIDER_ENABLED = false` in
  `src/components/learn/HouseAds.tsx`). Verified it renders nothing at all — not hidden, *nothing*
  — because a `display: none` element still sits in the DOM waiting to surprise someone.
- **Interspersing promos into the study path is not built**, as instructed. I also did not stub it:
  putting ad-insertion logic inside the component that decides what a student studies next is a
  seam worth not opening early.

One line flips the slider on. A module constant rather than an env var on purpose — the question
is not "on in preview, off in prod", it is "has Lee decided yet".

---

## Ambiguities I resolved, and how

1. **Two footers exist.** `components/site/SiteFooter.tsx` (the one your spec describes) and the
   legacy `components/landing/SiteFooter.tsx` used by `/privacy`, `/terms`, `/start`, `/beyond` and
   the study pages. I rebuilt the first and only fixed the second's `mailto:`. Rebuilding both was
   not asked for and they are genuinely different designs.
2. **"Make the form the first thing above the fold on mobile"** — the claim form is a sheet over
   the chapter page, not a page of its own. Making it literally first on `/go/…` would put an exec
   form above the student funnel that page exists for. I read it as "the form must be above the
   fold *when the sheet opens*", which it now is (first field at y=293).
3. **The claim page's "hero"** — the `/go` page's marketing hero is the only hero in that flow, so
   that is the one I cut.
4. **Waitlist dismissal semantics** — "dismissible, persists per device" left open what a later tap
   on the locked tab should do. I chose: the panel stays dismissed, a one-line link replaces it,
   and the link restores it. Auto-restoring on tap would make the persisted flag decorative.
5. **Which proof block** on the share page — took the topic card over a placeholder video slot;
   reasoning in §5.
6. **`ChapterFinderModal` has no callers.** It is dead code — the homepage's "Find your chapter"
   opens `GreekWaitlistSheet`. I converted it to the shared Sheet anyway (it is now 40 lines) rather
   than deleting a file the brief did not mention. **Worth deleting next pass.**
7. **Nav pill label truncation** — §4.
8. **Commit order for §§6–8.** They land in one file (`src/routes/learn.tsx`) together, so a
   strict 6→7→8 order would produce commits that do not compile. History is 7, 8, 6 — each one
   builds, and §6 is the commit that wires the other two in.
9. **Typecheck/build cadence.** The brief says typecheck + build after each section. `tsc --noEmit`
   takes 3–7 minutes on this machine and a full build longer, so I ran **typecheck + the full test
   suite after every section** and the full build at the end. Running a 10-minute build nine times
   would have consumed the session.

---

## Tests changed (not weakened)

Two files. Both changed because the *specified behaviour* changed, and both kept or gained strength:

- **`door-geometry.test.ts`** — §3 made `DOOR_CARD`'s padding and minHeight `var(…, 28px)` so the
  phone can shrink them. The parser now reads a var's px fallback. The assertions are unchanged and
  the invariant (a tier card measures less than a door card in every visible dimension) still holds
  against the same numbers. A value that is neither a number nor a resolvable fallback still yields
  `NaN` and still fails.
- **`council-share.test.ts`** — pinned "ends on the credential", which §5 deliberately reverses.
  Replaced with an assertion that the credential appears *before* the first link — same claim,
  aimed where the copy now lives — plus three new tests for the cost line, the blank-line separator,
  and the trimmed tail. **Net +4 assertions.**

New test files: `email-link.test.ts` (9), `study-plan.test.ts` (21).

---

## Found broken, out of scope, not touched

1. **`bolt-palette › the whole table produces distinct accents, campus by campus` fails on this
   branch's base.** Confirmed by stashing all my work and re-running. Two campuses derive the same
   accent colour. Pre-existing; not mine; worth a look because it means two schools wear the same
   colourway.
2. **No service worker**, so Chrome's install prompt can never fire — §6.
3. **`ChapterFinderModal` is dead code** — no callers.
4. **`GREEK_HOUSE_CSS` is now an empty string** with two live import sites — §2.
5. **Dev-server instability during this pass.** The Vite dev server returned intermittent 500s and
   `net::ERR_INSUFFICIENT_RESOURCES` on `/go/…` loader fetches under memory pressure, and several
   route modules log `Could not Fast Refresh ("X" export is incompatible)` because route files
   export non-component values (`openClaimStep`, `SCHOOLS`, `readVia`). Dev-only, but it makes HMR
   unreliable and cost real time here.
6. **`/learn` still has no practice player.** The "Practice questions — coming soon" card and the
   45s/question estimate both depend on it. The PRACTICE tab currently shows the same surface as
   CRAM in a different skin.
7. **The syllabus checklist row records an intention, not an upload.** There is nowhere to put a
   file — no table, and this pass may not write a migration. The UI says so in its own copy rather
   than implying Lee has a document he has never seen.

---

## Not done

Nothing in the nine sections was skipped. Three things were deliberately built smaller than the
brief, each flagged above with the reason and the cost to close:

- Footer 35% shorter, not ~40% (§1)
- Nav pill label shortens under 1024px (§4)
- No placeholder video slot on the share page (§5)

And one platform limit that is not a choice: the Chrome install prompt needs a service worker (§6).

---

## Branch

`cleanup/mobile-pass-01`, nine commits, **pushed and not merged** as instructed.
