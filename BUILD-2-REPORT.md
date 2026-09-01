# Build 2 — chair experience, claim, chapter kit

Branch `feature/greek-build-2`, off `main`. Additive; no migrations, no new dependencies
(JSZip / pdf-lib were already here). **Not merged** — see "Deploy" at the bottom.

## What shipped

**1 · Chair lands on the product, behind a flag.**
- One-line switch `CHAIR_LANDS_ON_PLATFORM` in `src/lib/site-config.ts`, default **OFF**.
- OFF: a `/s/<campus>/<chapter>` or `/s/<campus>/council` link renders the current share screen —
  unchanged, byte for byte.
- ON: the same routes `redirect` (in `beforeLoad`, before the loader runs) to
  `/learn?chair=…`, which mounts the floating share panel over the real platform.
- Both paths are built. Flipping the flag is genuinely one edit — the redirect is the only thing
  gated on it (verified: see "Flag wiring" below).

**2 · Share first, explore second.**
- `ChairPanel` (`src/components/site/chair/ChairPanel.tsx`) — a bottom-anchored card, **not** a
  full-screen gate: the platform stays visible and tappable behind it, so "explore" reads as a
  real choice.
- First ask is the share: one **Copy it** button, the whole pasteable message behind it.
- One testimonial (`ChairTestimonial`) directly beneath the copy button — the self-hosted
  testimonial data + brand colors, the lead outcome (Nic Ripson, 45% → 84.5%).
- Dismissing the card leaves a **persistent floating button** ("Share with your chapter/chapters")
  that reopens it from anywhere on the platform.

**3 · The quick tour.**
- `ChairTour` — the five points in the brief's order (what this is · who makes it · what you'll
  see · the deal · I'm interested) as **one skippable card with a stepper**, not a modal chain.
  Skip is always one tap away.
- "The deal" is the **only** place a price appears in the whole Greek flow, and only to a chair:
  Exam 1 free for everyone; the rest at $100/member, 10-seat minimum; "a member never pays and
  never sees a price."
- "I'm interested" is a single low-commitment action — an SMS deep link to Lee, prefilled with the
  chapter/council name. No account, no charge, no form. (See placeholders — this is intentionally
  not yet a tracked lead.)

**4 · Claim the page — an admin view, not another site.**
- Offered right after copy: "Want to see who signs up? Claim your page →".
- The claim form is the existing `ChapterAccessForm` in **`bare` mode** — hero cut, form above the
  fold at 375px (verified on a 375-wide viewport), reusing `submitChapterClaim` (no new backend).
- The claimed view is the existing `/chapters/dashboard` (magic-link, same platform), now with:
  - **Member names visible when claimed** — reverses the earlier K4.1 rule that hid the roster
    behind sponsorship. See "Reversed decision" below.
  - **The sponsorship-box count** — "N members asked the chapter to sponsor their seat", from the
    real `greek_sponsor_interest` rows (best-effort; see caveat).
  - No progress bar, no threshold, no milestones (there were none to remove; the "Who signed up"
    locked row was dropped since names are ungated now).

**5 · Council entry.**
- Same panel, branded to the council: an IFC link shows the fraternities, Panhellenic the
  sororities (via `councilMatches`). Verified: "Share with your Panhellenic chapters", 18 chapters
  counted for Alabama.
- Claiming is explicitly deferrable — a council exec sees "Getting the link shared matters most.
  You can claim the page later — no rush." (no council-claim form, by design; there is no
  council-claim backend and inventing one is out of scope).
- The missing-chapters line ("18 chapters listed. Missing one? Text Lee…") is council-only.

**6 · Scholarship chair kit.**
- One branded ZIP per chapter at `/api/chapter-kit/<school>/<chapter>` (`chapterKitZip` in
  `partner-kit.server.ts`, reusing its PDF machinery). Verified: 1.26 MB, folder
  `Survive-Alpha-Epsilon-Pi-Kit/`, four pieces:
  - `Flyer.pdf`, `Meeting-Slide.pdf` (the flyer + projector slide, chapter-branded)
  - `About-Survive-Accounting.pdf` — the one-pager on what Survive is (product-first)
  - `How-to-Fund-Seats.pdf` — the how-to-buy walkthrough, deliberately **not** the council kit's
    sample invoice; structured so a cart/invoice link drops into step 1 later.
- Reachable from the chapter page ("Download the whole kit (ZIP) →") and the share panel
  ("Download the chapter kit"). Council mode reuses the existing `/api/partner-kit` ZIP.

## Flag wiring (section 1 asked specifically)

Clean enough to flip in one line. `CHAIR_LANDS_ON_PLATFORM = false → true` in `site-config.ts` is
the whole switch. It is read in exactly two places — the two `/s/` routes' `beforeLoad`. The panel
itself does **not** gate on the flag: it renders whenever `/learn?chair=…` params are present, so
it can be (and was) reviewed live before the flag is ever flipped.

## Placeholders (nothing invented)

- **`CHAPTER_SEATS_BUY_URL`** (`site-config.ts`, empty): the checkout destination. While empty,
  `How-to-Fund-Seats.pdf` step 1 and the chair flow fall back to "text Lee and he sends the
  invoice" instead of a dead link. The ZIP endpoint sets an `x-sa-kit-placeholders` header when it
  falls back. Paste a URL when there is one — nothing breaks at "".
- **"One-slide PowerPoint" ships as a print/projector-ready PDF**, exactly as the council kit does.
  A real `.pptx` would need a new dependency for a slide that exists to be projected; flagged
  rather than silently substituted.
- **"I'm interested" is an SMS-to-Lee tap, not a tracked lead.** There is no clean existing intake
  kind for "a chair is interested," and I did not add a migration to make one. Upgrade later if you
  want it in the funnel.

## Reversed decision (flagging loudly, as with the /go pricing in Build 1)

Section 4 says a **claimed** chair sees "a list of members who signed up — names as they arrive."
The dashboard's earlier K4.1 rule deliberately hid member **names** behind sponsorship (paying),
showing `LockedPanels` instead. Build 2 reverses that specific gate: a claimed chair now sees who
signed up, by name, with join dates. The paying chapter's richer tools stay gated — per-member
study **activity** (sets completed) and the **seat toggle** still require an active seat pool. If
you'd rather keep names behind sponsorship, it's a one-line revert in `chapters_.dashboard.tsx`.

## Caveats

- **Sponsorship-box count is best-effort.** Build 1 keys `greek_sponsor_interest` to the
  `campus_greek_chapters` identity; the dashboard is the `greek_chapters` one, and no column joins
  them. I match on campus_id + chapter name (`ilike`). Any mismatch or lookup failure reads as
  **0** — it under-counts, never over-counts. Worth confirming against live data before you lean on
  the number.
- **Concurrent session in this worktree.** While I worked, another session edited `SiteHeader.tsx`,
  `TwoDoorHome.tsx`, `HomeFold.tsx`, and `analytics.ts` (a "homepage fold" task) in the same
  directory. Those are **not** part of Build 2 and I left them unstaged — my commits contain only
  the Build 2 files.

## Dead-end walk (section 6 asked for every place a chair could get stuck)

- **Copy fails in an in-app browser** (blocked clipboard — the common case for a GroupMe/IG DM):
  fixed. The panel now advances the flow anyway (claim CTA still appears) **and** shows the message
  in a selectable box with a "copy it by hand" note — the same guard the council share screen makes.
  Verified by forcing the clipboard to reject.
- **Explore is not a trap:** the platform is visible behind the panel, the floating button always
  returns her to sharing, and the tour's Skip/× is always reachable.
- **Claim form dead ends:** reuses `ChapterAccessForm`, which already handles its own submit,
  validation, SMS-truth phone check, and success card; the × closes back to the share card.
- **Unknown chapter / empty roster:** `getGoChapter` → the panel simply doesn't mount for a bad
  slug (plain `/learn`); the council panel states an empty roster rather than promising "0 links."
- **Council with no `?c=`:** falls back to campus-wide chapters and says so (no silent wrong list).

## Verification

- `bunx tsc --noEmit` — clean.
- `bun test` — 2229 pass, 1 fail (the pre-existing `bolt-palette › distinct accents`, unrelated).
  New: `chair-landing.test.ts`, 13 pass (URL round-trip contract).
- Live on the running dev server (port 8093), at 375px: council panel (branded to Panhellenic),
  chapter panel, the full five-step tour incl. the chair-only pricing, the copy-failure fallback,
  and the claim form above the fold. Chapter-kit ZIP downloaded and inspected (four PDFs).

## Deploy

Build 2's brief says "branch off main, diff before commits" but — unlike Build 1 — does **not** say
"merge and deploy," and repo `CLAUDE.md` says main waits for Lee's explicit word. So the branch is
pushed and **not merged**. Say the word and I'll fast-forward it to main. With the flag OFF the
merge is invisible to every visitor until you flip it.
