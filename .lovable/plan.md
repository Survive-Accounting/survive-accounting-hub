
# Simplify the Outreach dashboard

## 1. Sidebar cleanup (`src/routes/outreach.tsx`)

- Drop the `SidebarGroupLabel` ("Outreach") above Home.
- Keep `Sidebar collapsible="icon"` and the header `SidebarTrigger` so the sidebar can collapse to a narrow icon strip and re-open from the trigger.
- Add a footer (`SidebarFooter`) in the bottom-left with a single **Admin settings** button (gear icon). Clicking it opens `BatchResearchSettingsModal` (today's "AI Research Settings").
- Keep Home / Campaigns (collapsible group) / Students items unchanged.

## 2. Home dashboard simplification (`src/components/outreach/HomeDashboard.tsx`)

Strip the page down to two sections:

- **Student requests** (new unified panel — replaces `StudentIntakesPanel`).
- **Active campaigns** (kept, with a new "View metrics" button per card).

Remove from the home view:
- Outreach Snapshot stat grid
- Student Funnel stat grid
- Quick-action buttons: Import Accepted Leads, AI Research Settings (moved to sidebar footer), View Texts
- "Campus approval queue" `<details>` block in `outreach.tsx` and the `CampusQueuePanel` import/usage
- "Create Campaign" quick-action stays at the top of the home view (only remaining action)

## 3. New Student Requests panel (`src/components/outreach/StudentRequestsPanel.tsx`)

A single chronological log fed by two sources:

- **Inbound SMS messages** — `sms_messages` joined to `sms_conversations` (filter `direction = 'inbound'`).
- **Syllabus uploads** — `student_intake_submissions` rows where `syllabus_file_url is not null`, surfaced as a "Syllabus uploaded" event.

Columns: Type icon · Student (name / phone / email) · Preview (text body or filename) · When · Replied? (checkbox) · open button.

Behavior:
- Sorted by event time desc; default 50, "Load more".
- Filter chips: All / Texts / Syllabi / Unreplied.
- Clicking a row opens a **Conversation modal** (see §4).
- Replied checkbox toggles persisted state (see §5) optimistically with React Query mutation.

## 4. Conversation modal (`src/components/outreach/StudentConversationModal.tsx`)

Reuses logic from `TextsPanel`/SMS components to show a single student thread:

- Resolves the SMS conversation by phone (text events) or by intake.phone/email (syllabus events).
- Shows full inbound/outbound message history with timestamps.
- Composer at the bottom: textarea + Send → existing send pathway (`sms-process-outbox` / outbound insert pattern used by `TextsPanel`).
- For syllabus events: includes a link to view the uploaded file (signed URL from `student-syllabi` bucket) at the top.

## 5. Reply tracking (DB)

A new migration adds persistent "replied" flags:

- `sms_messages.replied_by_lee boolean not null default false` (for inbound SMS rows)
- `student_intake_submissions.replied_by_lee boolean not null default false` (for syllabus-upload rows)

Both default false, indexed for fast unreplied filtering. Toggled via `createServerFn` mutations gated by `requireSupabaseAuth` + admin role check, then invalidating the `["student-requests"]` query.

## 6. Active Campaigns — View Metrics modal

Per card in `HomeDashboard`, add a **View Metrics** button.

New `CampaignMetricsModal` (`src/components/outreach/CampaignMetricsModal.tsx`) shows two big cards in a 2-column grid:

- **Audience** card — focused stats: total leads, by status (queued / sent / replied / bounced / unsubscribed), eligible remaining, daily cap, est. days to finish. Built from `outreach_campaign_leads` aggregates for this campaign id.
- **Emails** card — focused stats per step: sent, opens, open rate, replies, reply rate, bounces, complaints. Aggregated from `outreach_email_events` for this campaign.

Both are slim, read-only stat blocks (no panel reuse) so the modal stays focused on "how is this campaign performing".

## 7. Cleanup

- Remove unused imports (`CampusQueuePanel`) and unused dashboard props (`onImportLeads`, `onOpenAISettings`, `onViewTexts`) from `HomeDashboard`.
- Delete `StudentIntakesPanel` usage; file can stay until next pass.

## Technical notes

- Query keys: `["student-requests", filter]`, `["campaign-metrics-detail", campaignId]`.
- All Supabase access through the existing browser `supabase` client for reads (admin-gated route) and `createServerFn` for the reply-flag mutations.
- No changes to existing campaign list fetching; metrics modal does its own query on demand.
- Sidebar uses the existing shadcn `Sidebar` + `SidebarFooter` primitives.
