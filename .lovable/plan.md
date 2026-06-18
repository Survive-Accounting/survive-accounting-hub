# Cold Emails Campaign Builder

A new sub-tab inside **Campaigns → Email Queue** called **Cold Emails** that lets you spin up a 50/day, M–F, 5-per-campus cold campaign across all 170 campuses in priority order, then approve & launch.

## UI

Inside `EmailQueueShell.tsx` add a second tab strip above the existing professors content:

```text
[ Cold Emails ]  [ Standard Campaigns ]
```

Default to **Cold Emails**. The existing CampaignBuilder/CampaignsList/Templates/Broadcasts stays under "Standard Campaigns" untouched.

### Cold Emails panel — single card, top→bottom

1. **Goals form** (compact, one row each)
   - Campaign name (text)
   - Daily send cap (number, default 50)
   - Max emails per campus (number, default 5)
   - Send window: start time + end time (default 9:00–15:00, campus-local)
   - Send days: M T W T F chips (default all five)
   - Start date (date picker, default next weekday)

2. **Priority criteria** (checkbox + weight slider 0–10 each)
   - SEC / Power conference boost
   - Tuition × enrollment combo
   - Lead-tag priority: adjunct / instructor / lecturer (multi-select)

3. **Generate Queue** button → ranks all non-archived campuses with a deterministic score and renders the table below.

4. **Priority queue table** (drag-to-reorder rows)
   | # | Campus | SEC | Tuition×Enroll | Imported Leads | Est. Send Day |
   |---|--------|-----|----------------|----------------|---------------|
   | 1 | Univ. of Alabama | ● | $219M | – | Mon Jun 22 |
   | 2 | LSU | ● | $401M | 12 | Mon Jun 22 |
   | … | … | | | | |

   - **Imported Leads** column: shows `–` if 0, count if >0 (placeholder — reads from `outreach_leads` count grouped by campus)
   - Drag handle on left to manually reorder
   - "Est. Send Day" computed from daily cap ÷ per-campus cap rolling forward M–F

5. **Summary strip** (sticky bottom of card)
   `170 campuses · 850 emails · ~17 send days · finishes ≈ Fri Jul 11`

6. **Actions**
   - **Save Draft** — persists the plan to `outreach_campaigns` (campaign_type='cold_sequence', status='draft')
   - **Approve & Launch** — flips status to 'scheduled', enrolls the ranked queue into `outreach_campaign_leads` in order

## Technical details

- **New file**: `src/components/outreach/ColdEmailsPanel.tsx` — the panel above.
- **New file**: `src/lib/cold-campaign.ts` — pure ranking + scheduling helpers:
  - `rankCampuses(campuses, criteria) → Campus[]`
  - `buildSchedule(rankedCampuses, { dailyCap, perCampusCap, sendDays, startDate }) → { campusId, sendDate }[]`
  - Score formula: `(SEC ? secWeight*100 : 0) + tuitionEnrollNorm*tuitionWeight*100 + leadTagBonus`
- **Edit**: `src/components/outreach/EmailQueueShell.tsx` — wrap the existing professors content + new ColdEmailsPanel in a Tabs with Cold Emails first.
- **Reuse existing infra**: `outreach_campaigns` + `outreach_campaign_leads` tables already exist with `campaign_type='cold_sequence'`. `enforce_single_active_cold_campaign` trigger already prevents lead double-enrollment. Save uses the existing API surface in `src/lib/outreach-api.ts` around line 2607.
- **Imported leads count**: one query — `select campus_id, count(*) from outreach_leads where archived_at is null group by campus_id` — cached via React Query.
- **Drag-to-reorder**: use `@dnd-kit/core` if already installed; otherwise simple ↑/↓ buttons in v1 (avoids new dep).
- **No new tables/migrations**. No AI calls (deterministic ranking only, per your "Just the priority queue + schedule math" choice).

## Out of scope tonight

- Email copy generation (you'll author the template in the existing Templates panel and reference it by name)
- Actual send-time orchestration (handled by the existing scheduler that already processes `cold_sequence` campaigns)
- Realtime "what shipped today" view — visible in the existing CampaignsListPanel after launch
