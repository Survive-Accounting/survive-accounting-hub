# Prompt — the posting tool and the YouTube integration

Paste into a fresh session. Written 2026-09-08 from Lee's brief. This turns Cross-post from a
checklist into something that actually posts and reports back.

---

Build the posting tool: publish a finished Short everywhere at once, with **YouTube Shorts
scheduled one per day**, and record per-destination performance so we can analyse it later.

## Lee's brief, verbatim

"We will literally just share this exact sequence of videos in a shorts playlist on YouTube. So I
want to go ahead and hook up YouTube Studio API soon. We want to have the data for each location
tracked so we can analyze in the future. And, where each is posted at the same time, except YT
shorts is posted 1 per day max. I think we can automate that in the software, no? Site is
instantly on. YouTube shorts is scheduled automatically for the last post + 1."

## Read first

- `src/routes/v3.post.tsx` — Cross-post today: every set in one queue, four destination chips
  (site / youtube / instagram / tiktok) that Lee ticks by hand, an optional pasted URL, the
  stage chip, and the **caption sheet** (`lib/caption-brief.ts`) that already writes a title,
  caption and hashtags per destination and stores them in `set_publish_status.captions`.
- `src/lib/publish-queue.functions.ts` + migrations `20260906_0200`, `20260906_0500`,
  `20260907_0600` — the `set_publish_status` table (per-destination `posted_at` + `url`,
  `filmed_at`, `captions` jsonb).
- `src/lib/mux.server.ts`, `src/lib/shipped.functions.ts` — the existing Mux direct-upload →
  asset → playback-id flow, and `/admin/reps/onboarding-videos` for the upload UI pattern.
- `src/lib/cost-ledger.functions.ts` — log any paid API call here (`kind: "mux" | "other"`).
- `vercel.json` + `src/routes/api.cron.*.tsx` — how a cron endpoint is registered and gated
  (`CRON_SECRET`, fails closed). **Note the hard constraint learned 2026-09-07: this Vercel plan
  allows a cron ONCE PER DAY. An hourly schedule breaks every deploy.** Schedule daily, and do
  the finer-grained timing inside the handler.

## The job

### 1. The upload — one file, every destination

On a Cross-post row, "Upload the take" takes the MP4 once (Mux direct upload, same path as the
/shipped recorder) and holds the asset + playback id on `set_publish_status`. Everything below
publishes from that one upload. The site destination flips on the moment the asset is ready —
Lee: "Site is instantly on."

### 2. YouTube, properly

- OAuth against the YouTube Data API v3 with `youtube.upload` + `youtube.readonly`, refresh
  token stored server-side only (`site_settings.settings.youtube`, never in the client bundle;
  follow the rep-review HMAC/secret handling for how secrets are kept out of reach).
- `POST videos.insert` with `status.privacyStatus: "private"` + `status.publishAt` for
  scheduling, `snippet.title/description/tags` from the stored captions, and add the video to
  the **Shorts playlist** (`playlistItems.insert`) so the sequence Lee wants is the playlist.
- **The one-per-day rule, in code:** a pure, tested `nextYouTubeSlot(scheduled: Date[], now)` →
  the day after the latest already-scheduled post (Lee: "scheduled automatically for the last
  post + 1"), at a fixed time of day held in settings. Queueing five videos schedules them on
  five consecutive days without Lee choosing dates. Show the resulting date on each row before
  he commits.
- Instagram and TikTok stay manual for now: keep the tick and the pasted URL, and prefill the
  caption for copy-paste. Say so on the page rather than implying they post themselves.

### 3. Stats per destination

New table (check the migration high-water mark first):

```
create table if not exists public.video_stats (
  id uuid primary key default gen_random_uuid(),
  set_id text not null,
  destination text not null,          -- site | youtube | instagram | tiktok
  external_id text null,              -- the YouTube video id, etc.
  views integer null,
  likes integer null,
  comments integer null,
  avg_view_pct numeric null,          -- retention, when the platform gives it
  fetched_at timestamptz not null default now()
);
create index if not exists video_stats_set_idx on public.video_stats (set_id, fetched_at desc);
```
RLS deny-by-default. A **daily** cron (`/api/cron/video-stats`, registered in `vercel.json`,
`CRON_SECRET`-gated) pulls YouTube Analytics for every posted video and appends a row — append,
never update, so we keep the curve rather than a single number. Site views come from whatever
the app already records; Instagram and TikTok are manual entry until their APIs are worth it.

### 4. The page

Extend `/v3/post` rather than building a second surface: per row, the upload state, the four
destinations with their scheduled or posted time, the YouTube date the rule picked, and a small
stats strip once numbers exist. Keep the existing filters, the stage chip and the optimistic
toggle with its revert-on-failure.

## Guardrails

- Nothing publishes without an explicit press. No "auto-post everything" button.
- A failed upload or a rejected API call surfaces the provider's own message; never a generic
  "try again" that hides a quota or auth problem.
- Test mode / test sets must never publish anywhere real.

## Verify + hand off

`bunx tsc --noEmit` clean; `bun test` green; pure scheduling logic unit-tested without network.
Do not call the YouTube API during verification. Commit with a repo-style message; do not push
without Lee's word. Report: the SQL he must run, the Google Cloud setup he has to do by hand
(project, OAuth consent screen, client id/secret, the redirect URI, and the fact that an
unverified app caps at 100 users), and exactly which destinations post automatically vs. by hand.
