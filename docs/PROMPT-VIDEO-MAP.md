# Prompt — the video map (cram path, pitch branches, review branches)

Paste into a fresh session. Written 2026-09-08 from Lee's brief. This is a NEW admin surface; it
reuses the bank and the publish tables and adds one small table of its own.

---

Build a **video map**: one screen that shows how our videos connect, so we can see the decision
trees we are setting up rather than holding them in our heads.

## Lee's picture, verbatim

"We need a map that lets us view how videos are connected… there's the main cram path in the
center of the screen. On left side, there's pitch videos branching off. On right side, there's
review videos branching off. Later, when students start requesting stuff, we can see where they
branched off of. Or, we can see on the pitch branch which ones are performing/converting."

The model underneath, in his words: "We keep videos incredibly crammable, but leave seeds of
curiosity laying around." The map is how we see where the seeds are.

## Read first

- `src/lib/talkthrough.functions.ts` `loadBoothBank` — topics → sets → questions; a set IS a
  video. `BoothTopic.kind === "strategy"` marks the non-exam decks.
- `src/lib/blastoff.functions.ts` — a set's plan (`blastOff` on the deck). `listBlastPlanSetIds`
  tells you which sets have one.
- `src/lib/publish-queue.functions.ts` + `set_publish_status` — where each set is posted, its
  URLs, `filmed_at`, and (since 2026-09-07) `captions`.
- `src/components/v3/set-stage.ts` — the per-set stage chip (talked → reviewed → filmed →
  posted). The map should use the same vocabulary, not invent a second one.
- `src/components/blastoff/cluster/` — **the Map (a "cluster")**: `cluster-spec.ts` is a
  playfield of typed nodes + edges + camera shots, and `MapSchematic.tsx` already draws a
  bird's-eye of one in SVG. Read both before choosing a rendering approach; the schematic is the
  closest existing thing to what this page needs and may be worth generalising rather than
  duplicating.
- `docs/SURVIVE_STRATEGY_CULTURE_2026-09.md` §"Pitch Slides" and §"Review Videos on Demand" for
  what the two branch kinds mean.

## The job

### 1. The link model — a small table

A video's connections are editorial, not derivable, so they need storing. New migration
(check the high-water mark in `migration/supabase-migrations/` first — 20260907_0600 exists):

```
create table if not exists public.video_links (
  id uuid primary key default gen_random_uuid(),
  from_set_id text not null,      -- the cram video the seed is planted in
  to_set_id text null,            -- the video it points at, when one exists
  kind text not null,             -- 'pitch' | 'review' | 'next'
  label text null,                -- the CTA words on the slide
  request_topic text null,        -- when to_set_id is null: what was asked for
  created_by text null,
  created_at timestamptz not null default now(),
  constraint video_links_kind_ck check (kind in ('pitch','review','next'))
);
```
RLS deny-by-default, service-role server fns only (copy the pattern in
`lib/cost-ledger.functions.ts`). A link with `to_set_id` null is a **seed with no video yet** —
that is the request backlog, and the map must show it as a stub, not hide it.

### 2. The page — `/admin/videos/map` (register in `lib/site-qa/manifest.ts`)

Three columns, as Lee described:

- **Centre: the cram path.** The Easy Points sets in teaching order, top to bottom, each a card
  with its stage chip, whether it is posted, and its title.
- **Left: pitch videos**, branching off the cram video whose outro plants them.
- **Right: review videos**, branching off the cram video that says "go deeper".

Edges drawn as SVG curves from the cram card to the branch. A branch with no video yet renders
as a dashed stub labelled with `request_topic` and a count of how many people asked. Clicking a
card opens its set (`blastOffPath`); clicking an edge lets you edit or delete the link.

Adding a link should be possible from the map itself — pick a from-set, a kind, and either a
to-set or a topic string.

### 3. What it shows later (build the shape now, fill it when data exists)

- **Requests**, once the request form is live: group them by the cram video they branched off,
  so the map answers "which video makes people ask questions?"
- **Pitch performance**: per pitch branch, whatever conversion signal exists — for now the
  publish status and any link click data the site already records; leave a clearly-named seam
  for real numbers rather than inventing a metric.
- Do NOT fabricate conversion numbers. An empty state that says "no data yet" is correct.

### 4. Ordering the cram path

There is no explicit ordering column. Derive it from the topic's set order in the bank (the same
order `/v3/$topic` shows, which `lib/v3-topic-groups.ts` may already govern), and let the map
override it with a stored order only if that turns out to be necessary.

## Verify + hand off

`bunx tsc --noEmit` clean; `bun test src/lib src/routes src/components` green including the
manifest coverage test. Commit with a repo-style message; do not push without Lee's word.
Report: the SQL he must run, what the map shows with today's data (it will be sparse), and what
you left as a seam.
