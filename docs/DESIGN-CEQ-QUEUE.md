# Design — the CEQ queue: brainstorm a video, get its cards while you work on the next one

Written 2026-09-10 for a future session. Design only; nothing here is built.

## 0. In one paragraph

Lee talks an offshoot through in the Booth. A background job turns that talk into a **starting
set of CEQs** — tricky ones, teaching examples, the WHAT IF INSTEAD twins his slides already use —
and they land on the deck as **draft** cards he reviews in the Editor. The queue is always stacked:
he brainstorms the next video while the last one generates. It gets smarter by learning from what
he keeps, edits, and throws away.

## 1. The goal, in Lee's words

> "I'd also like to have a tool for making new CEQ's quickly. Preferably, I want it to follow the
> same structure as we're building for everything else... I brainstorm the idea... it generates in
> background... while that's happening, i'm tweaking something else... we want to have a generation
> queue that is stacked at all times... working in the background and over time I want to keep
> getting it smarter, where it takes my brainstorms and gives me at least the starting points (not
> always the finished products, unless we're confident it can get it right. When it's wrong, we just
> lose time anyway)."

> "Let me discuss each video brainstorming wise and have the AI generate its own title and
> description maybe? Maybe we have a 'suggested slides' portion too? ... Same thing with suggested
> CEQ's... I can talk them out better than write them out. We want tricky ones, good teaching
> examples, etc..."

> "The offshoots will be easy once a cram video it offshoots from exists. It's just a few additional
> slides, maybe a new example, etc."

## 2. What exists today (verified 2026-09-10, tip after the map build)

| Piece | Where | Status |
|---|---|---|
| Brainstorm on a zero-card deck | `/v3/$topic/$set/blast-off/talkthrough` (the Booth) | **Works.** Strategy shorts prove it; every minted offshoot has a "Brainstorm it" door on `/v3/map`. |
| Talk → suggested slides | `src/components/blastoff/idea-to-slide.ts` `buildDraftFromIdeas`, the Suggestions step | **Works** for slides. The board's ideas become frames on one click. |
| Talk → CEQs | — | **Does not exist.** Nothing turns a brainstorm into cards. |
| A background generation queue | `src/components/canvas/transcript-client.ts` (localStorage queue, drains on timer/focus/online) · the illustration queue (`/admin/illustrations`, sequential with cost estimate) | **Two precedents**, both browser-driven, neither for CEQs. |
| Card creation with feedback | `talkthrough.functions.ts` `duplicateCeqCard`, `applyCeqEdit`; `scripts/curriculum/standardize-choices.ts` | Card shape is known and written from scripts already. |
| The house CEQ voice | `lib/caption-brief.ts` CAPTION_SYSTEM (no emoji, Lee's register) · `ceq-set.ts` CEQ_OPTIONS incl. "None of these" · the *tricky* / *found* callout kinds | The register and the trap-answer convention exist. |
| Cost ledger | `lib/cost-ledger.functions.ts` `logCostEvent({kind:"ai", label})` | Every generation must log here. |
| Vercel cron | daily only on this plan | **Cannot** drive a queue. The browser drains it, like transcripts. |

## 3. Decisions

1. **The unit of work is a deck, not a topic.** One brainstorm → one job → cards on that deck. An
   offshoot is a deck (the map mints it), so "brainstorm the offshoot, get its cards" is the same
   path as any set.
2. **Output is DRAFT cards, never live.** `data.draft = true` on every generated node; the Editor
   already hides drafts from the film and `/learn` already excludes them (`student.functions.ts`).
   Lee promotes by clearing the flag — the existing "draft" chip. No new state.
3. **Starting points, not finished products.** The prompt asks for 6–10 candidates with a
   `confidence` and a `why` each; the UI shows confidence, and low-confidence cards say so on their
   face. Lee said the cost of a wrong finished card is the same as no card; the cost of a wrong
   *draft* he can see through is ten seconds.
4. **The queue is a table, not a browser array.** `ceq_jobs(id, deck_id, source, status, cost_usd,
   result_json, error, created_at, started_at, finished_at)`. A browser tab drains one job at a time
   (the transcript-queue shape) and writes every transition, so a reload or a second tab never
   double-runs or loses one. Migration numbered after the current high-water mark, listed as SQL LEE
   MUST RUN, gated loudly when missing.
5. **The source is the Booth transcript + the parent's cards.** For an offshoot, the job reads the
   deck's own talkthrough segments AND the parent cram set's live cards (`branchFrom`), so it
   proposes "the same kind of question, one level deeper" rather than a random set. That is the
   "smarter" lever — the parent is the style guide.
6. **Tricky by construction.** The prompt is told the four trap conventions the bank already uses:
   `"None of these"` as a real answer (Dividends, Accumulated Depreciation, Income Summary), the
   *remains/used* and *expired/unexpired* twins, a distractor that is the right account on the wrong
   side, and one question whose stem is a WHAT IF INSTEAD of the previous one.
7. **Title and blurb come from the same job.** The map's `name` and `blurb` fields are the
   deliverable: the job proposes both; Lee accepts or edits on `/v3/map`. Slides stay
   `buildDraftFromIdeas`'s job — don't build a second slide generator.
8. **Learning is a feedback table, not fine-tuning.** `ceq_job_feedback(job_id, ceq_id, action:
   kept|edited|dropped, edit_diff)` written by the Editor when a draft is promoted, edited, or
   removed. The next job for the same parent reads the last N feedback rows as "here is what he
   kept and what he threw away" few-shot context. Cheap, honest, and visible.

## 4. Data model (additive)

```sql
create table if not exists public.ceq_jobs (
  id uuid primary key default gen_random_uuid(),
  deck_id text not null,
  parent_deck_id text null,
  source jsonb not null,            -- {segments:[...], parentCeqIds:[...], blurb, name}
  status text not null default 'queued',  -- queued | running | done | failed
  result jsonb null,                -- {name?, blurb?, cards:[{stem, choices:[{text,correct,feedback}], kind, confidence, why}]}
  cost_usd numeric(8,4) null,
  error text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null
);
create table if not exists public.ceq_job_feedback (
  job_id uuid references public.ceq_jobs(id),
  ceq_id text not null,
  action text not null,             -- kept | edited | dropped
  edit_diff jsonb null,
  created_at timestamptz not null default now(),
  primary key (job_id, ceq_id)
);
alter table public.ceq_jobs enable row level security;
alter table public.ceq_job_feedback enable row level security;
```
No policies (deny-by-default; service-role server fns only). No change to `canvas_scenes` shape:
generated cards are ordinary `ceq` nodes with `data.draft = true` and `data.provenance = "ceq-queue"`
plus `data.jobId`.

## 5. Server functions (`src/lib/ceq-queue.functions.ts`, all `assertAdmin`)

- `enqueueCeqJob({deckId})` — reads the deck's talkthrough segments (`talkthrough.functions.ts`
  store), the parent's live cards when `branchFrom` is set, `name`, `blurb`; inserts a `queued` row.
  Refuses with a clear message when there are no segments ("Talk it through first — there's nothing
  to generate from").
- `runNextCeqJob()` — claims the oldest `queued` row (compare-and-set to `running`), builds the
  prompt (`lib/ceq-queue-brief.ts`, pure, tested), calls the model through `ai.server` on the
  **default** lane (not micro — this is the one call worth spending on), parses/normalises
  (pure, tested; a card with no correct choice or fewer than 3 choices is dropped and counted),
  writes `result`, logs cost with `label: "ceq-queue"`, flips to `done`. Any throw → `failed` with
  the message; never a silent empty result.
- `applyCeqJob({jobId, keep: string[]})` — writes the kept candidates onto the deck as draft `ceq`
  nodes through the existing scene read-modify-write (same door as `saveBlastPlan`), and writes
  `dropped` feedback for the rest.
- `listCeqJobs({deckId?})` — for the map panel and the Editor.

## 6. UI

- **`/v3/map` panel**: a `Generate cards` button on any set with talkthrough segments. It enqueues
  and shows `queued · running · 8 candidates ready` from `listCeqJobs`. The panel's name/blurb
  fields get a `use suggested` chip when the job proposed them.
- **The Editor**: a `Suggested cards` fold above the deck when a `done` job exists for the set —
  each candidate with its stem, the correct choice highlighted, its `why`, and a confidence chip;
  tick to keep, one `Add N as drafts` button → `applyCeqJob`. Drafts then appear in the deck exactly
  as any draft does.
- **The drain**: `src/components/v3/ceq-queue-client.ts`, mounted by `V3Shell` — every 20 s, and on
  focus/online, calls `runNextCeqJob()` if the last call returned `nothing to do` more than 20 s ago.
  One tab wins the claim; the others see `running`. A small chip in the shell: `⚙ 2 generating`.
- **Ctrl+I**: the SHORTS quick-queue already carries set context; a third keystroke path is not
  needed — brainstorming happens in the Booth, which is one click from the map.

## 7. Build order

- **S1** migration + `ceq_jobs` types + `listCeqJobs`. Verify: table exists, list returns `[]`.
- **S2** `ceq-queue-brief.ts` (pure): prompt builder with the four trap conventions, parser,
  normaliser. Tests: a bank-shaped card round-trips; a card with no correct answer is dropped and
  counted; "None of these" survives normalisation; confidence clamps to 0–1.
- **S3** `enqueueCeqJob` + `runNextCeqJob` + cost logging. Verify on one real offshoot with real
  segments: a `done` row with 6–10 candidates and a cost line in the ledger.
- **S4** the drain client + shell chip. Verify: two tabs open, one job runs once.
- **S5** the Editor fold + `applyCeqJob`. Verify: kept candidates appear as drafts; dropped ones write
  feedback; `/learn` unchanged.
- **S6** the map panel button + `use suggested` for name/blurb.
- **S7** feedback → few-shot in the next job for the same parent. Verify: the prompt contains the
  last kept/dropped stems.

## 8. Do not build

- A cron-driven queue (daily-only crons on this plan).
- Auto-promoting any generated card to live. Draft is the ceiling until Lee clears it.
- A second slide generator. `buildDraftFromIdeas` is the slide path.
- Fine-tuning. The feedback table as few-shot context is the whole "gets smarter" mechanism until
  there are hundreds of rows.
- Generating from nothing. No segments → refuse; the Booth is the input.

## 9. Open questions for Lee

1. How many candidates per job feel right — 6, 10, or "as many as it's confident about"?
2. Should the parent's *feedback text* be used as style input, or only its stems and choices?
3. Should a job also propose the offshoot's first *callout* slide (Memorize this / Cheat code) from
   the talk, or leave slides entirely to `buildDraftFromIdeas`?
