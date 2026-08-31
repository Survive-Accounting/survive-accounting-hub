# Made-to-order flow — closed (2026-08-30)

Short version: `/order` was already dark in the UI, but its **server endpoint was still open and still writing rows**. That is now closed, and the campus-rep signup hook that hung off it is gone.

## What `/order` was

The real-time make-to-order machinery: a student described what they were stuck on, Lee reviewed and quoted, the student paid only after approving the video. Routes `order.tsx` (wizard), `order.$shortRef.tsx` (status tracker), server fn `submitOrder`, tables `orders` + `order_chapters` / `order_stage_events` / `order_media` / `order_access_tokens`.

## What was actually still live

| | Before | Now |
|---|---|---|
| `/order` page | Redirected to `/` since 2026-08-20 | unchanged (still redirects) |
| `submitOrder` **server endpoint** | **Open** — a server function is an HTTP endpoint; a stale tab or a direct POST could still create `orders` rows | **Refuses before any DB write** |
| Referral hook inside it | Recorded a `signup` conversion from the `sa_ref` cookie | **Removed** |
| `reconcileOrderPurchases` ("Sync order purchases") | Live | Kept but **dormant**, documented; will always report 0 |
| Site-QA template | Advertised as "Free intake for a personalized exam-prep video" | Labeled **closed** |

## The evidence

- **One order, ever**: created 2026-07-10, status `new`, `$0`, never paid. Nothing since — seven weeks.
- **The referral hook never fired once**: `select count(*) from referral_conversions where subject_type='order'` → **0**. No rep's numbers, commission, or signing bonus ever touched this path.

## Why this mattered beyond tidiness

My compensation write-up listed "order submit" as one of the places a rep's **free signup** is captured. That was wrong twice over: the flow is closed, and a made-to-order request isn't what a free signup means. Per Lee: *a free signup is someone who used the material through the rep's link and added their email.* Leaving the hook in place would have kept implying otherwise in code.

## What was deliberately NOT touched

- **`/start`** — the syllabus-first **tutoring request** page is a different flow and is still live. (`/t/<slug>` shortlinks still route there.)
- **All read paths** — the admin orders console, weekly digest, entitlements and growth rollups still read `orders`. The one historical order and its tracker link keep working. **No data was deleted.**
- **The `orders` tables** — left in place. Closing an intake shouldn't orphan history.

## Where free-signup capture stands now

The only capture meeting Lee's definition is the **chapter join on `/go`** (`tagChapterMember` → `signup` conversion, attributed by `sa_ref`, idempotent per member). A campus-flyer scan that leads to studying without a chapter join is **not yet counted** — that's the open hook, pending Lee's spec.
