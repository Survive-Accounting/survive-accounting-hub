# Prompt — set up the marketing video production line

Paste this into a build session. Written 2026-09-08 from Lee's brief. Everything it
references exists today; the point is to reuse the Blast Off line, not clone it.

---

Build a THIRD production line for marketing videos, alongside the two that exist.

## What already exists — read before writing anything

- **Blast Offs** (cram shorts): `/v3` → Brainstorm · Editor · Rehearse & Film · Cross-post ·
  Iterate. The plan is `BlastPlan` on the deck (`lib/blastoff.functions.ts`), the frames are
  `components/blastoff/plan.ts`, the surfaces are `ReviewDeck.tsx` (Editor) and
  `BlastOffCapture.tsx` (film). Rehearsal rounds, the teleprompter with timing marks, the
  production run/checklist pill (`components/v3/ProductionTimer.tsx`, `lib/production-run.ts`)
  and the cost ledger (`lib/cost-ledger.functions.ts`) are all generic — they key off a set id.
- **Strategy shorts** already ride the Blast Off line: `lib/strategy.ts` +
  `lib/strategy.functions.ts` mint a zero-CEQ deck under `/v3/strategy` from an idea on
  `/admin/ideas/strategy`, with slides and prompter lines pre-laid-out. `blastOffStrategyShort`
  is the function that does it. **This is the pattern to extend — a marketing video is a
  zero-CEQ deck with a different brief, not a new pipeline.**
- **Rep onboarding videos**: `/admin/reps/onboarding-videos` uploads a filmed short to Mux and
  drops the playback id into `site_settings.settings.repOnboardingVideos.{step1..4}`. That is
  the publish-to-a-slot pattern for a video that lives at a fixed place in the product.

## The job

### 1. The marketing lane and its audiences

Marketing videos are the ones that SELL rather than teach. The audiences, each with its own
register and its own home in the product:

| Audience | Where it lives | The job |
|---|---|---|
| Greek chapter / scholarship chair | the chapter and chair pages | why a chapter should bring Survive in |
| Campus rep | `/rep/join`, and the four onboarding steps | already partly built — reuse, don't duplicate |
| Homepage visitor | `/` | what Survive is, in 30 seconds |
| Review-video request | wherever "go deeper" lands | pitch the request system itself |

Add these as a lane in `lib/strategy.ts`'s `SHORT_LANES` (or a sibling registry if that file is
getting long), each with the category it files under and whether it posts now or banks.

### 2. The brief — a marketing video is not a cram video

New pure module `src/lib/marketing-brief.ts` (+ tests), same shape as `rehearsal-brief.ts`:
`buildMarketingMessages(req)` → `parseMarketing(text)`, called through `runMicro`, cost logged
with `logCostEvent`.

The system prompt must carry these, which are Lee's and are not negotiable:

- **The line, verbatim, in or near every marketing video:** "I'm building the YouTube Shorts of
  exam prep."
- **The credibility beat:** "I've spent the past six months building a production system to
  crank these out fast — I want to test its limits."
- **Sales register, his words:** "I want to take you from a B to an A." Speed and specificity,
  never hype. No emoji. A real person talking (see `lee-copy-and-brand-taste`).
- **Expansion, kept brief and unspecific:** expanding to schools across the country, starting in
  the SEC — pointing at a page that shows Survive is a platform, not one tutor.
- **One ask per video.** A marketing video that asks for two things asks for nothing.

Output: `{ hook, beats: [{ title, lines[] }], cta: { label, href }, prompterLines[] }` — the same
shape the strategy seeds already use, so it can mint a deck with no new frame kinds.

### 3. Minting and filming

`mintMarketingVideo({ ideaId | audience, title })` — modelled on `blastOffStrategyShort`: create
the zero-CEQ deck under a `Marketing` topic, lay the beats out as slides with prompter lines,
return the `/v3/<topic>/<set>/blast-off` path. From there it is the SAME line: Editor,
Rehearse & Film, Cross-post, Iterate. Do not build a second film surface.

### 4. Publishing to a slot

Extend the onboarding-videos pattern into one admin page that covers every marketing slot:
`/admin/videos` (or extend `/admin/reps/onboarding-videos` and rename it). One card per slot —
homepage, chapter, chair, rep step 1–4, request-system pitch — each with the Mux upload or a
pasted playback id, writing to `site_settings.settings.marketingVideos.<slot>`. A slot with no
id renders its existing placeholder; nothing 404s.

### 5. The "go deeper" button slot (do this even if the rest waits)

Cram videos end by pointing somewhere. Add to the Blast Off plan a per-video CTA that publishes
DIFFERENTLY per destination:

- the **YouTube** cut: a call to action to come to the site
- the **on-site** cut: a baked-in link straight to the review video, or, when that video does
  not exist yet, to the request form

Store it on the plan (additive optional field, same treatment as `prompterMarks`), surface it in
the Editor, and let Cross-post read it when it writes captions (`lib/caption-brief.ts` already
composes per-destination copy).

## Verify + hand off

`bunx tsc --noEmit` clean; `bun test src/lib src/components src/routes` green; commit with a
repo-style message. Do not push without Lee's word. Report: what was reused vs. new, the SQL if
any (there should be none — `site_settings` and the deck JSON already exist), and what was left
out.
