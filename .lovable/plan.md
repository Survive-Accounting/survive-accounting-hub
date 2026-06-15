## Goal

Replace the daily/weekly campus assignment calendar with a single **priority queue** sorted by highest annual tuition (out-of-state, falling back to in-state). Lee and King work the queue in parallel without overlap via a **claim** mechanic — no per-day caps.

## How it behaves

- **Queue view** shows every campus that still needs approval, ordered by `annual_tuition_out_state_cents` desc (nulls last). Approved campuses are hidden. Campuses claimed by the *other* person are visible but locked (greyed, "Claimed by king@…, 47m left").
- **Claim flow:** click **Claim** on the top item (or any unclaimed row) → row becomes yours → **Approve / Research** opens the existing `ApproveCampusModal`. Approving releases the claim and removes the row from the queue.
- **Auto-release:** claim expires 2 hours after the last activity. Any save/edit inside the modal, or the explicit **Release** button, refreshes/clears it.
- **No daily quota, no calendar, no week navigator.** Existing `AssignCampusPopover`, `AssignToKingModal`, `WeekNavigator`, `TodayChecklist` come off the outreach page.

## Data model

Repurpose `outreach_va_campus_assignments` as the claims table (it's already wired through `outreach-api.ts` and types). Migration:

- Add `claimed_at timestamptz`, `claim_expires_at timestamptz`, `released_at timestamptz`, `status text check in ('claimed','approved','released')`.
- Drop the per-day uniqueness assumption by making `assigned_for_date` nullable; add a **partial unique index** on `campus_id` where `status = 'claimed'` so only one active claim per campus exists.
- Index `(status, claim_expires_at)` for the sweeper.
- Keep RLS as-is (already 5 policies); add policy that a user can only `UPDATE` rows where `assigned_by_email = auth.email()` OR the claim has expired.

Sweeper: pg_cron every 5 min sets `status='released', released_at=now()` where `status='claimed' AND claim_expires_at < now()`. Pure SQL, no edge function.

## Server functions (`src/lib/outreach-queue.functions.ts`, new)

- `listQueue()` — returns campuses needing approval joined with active claim (if any), ordered by tuition desc. Used by the queue panel.
- `claimCampus({ campusId })` — inserts a claim row with `claim_expires_at = now() + 2h`; relies on the partial unique index to reject if someone else has it. Returns the claim.
- `refreshClaim({ campusId })` — bumps `claim_expires_at` (called from modal save/edit).
- `releaseClaim({ campusId })` — sets `status='released'`.
- `approveCampus({ campusId, … })` — wraps the existing approval write + marks claim `status='approved'`.

All four use `requireSupabaseAuth` so claims are attributed to the signed-in admin.

## UI changes

- New `src/components/outreach/CampusQueuePanel.tsx`: virtualized list (or simple table) with columns *Rank · Campus · State · Tuition · Status · Action*. Top of list highlighted as "Next up". "Mine" filter chip. Auto-refreshes every 60s + on focus.
- `src/routes/outreach.tsx`: swap the calendar/checklist section for `<CampusQueuePanel />`. Leave Broadcasts, Leads, Templates, Texts panels alone.
- `ApproveCampusModal.tsx`: on open, call `refreshClaim`; on close without approval, leave claim intact (still expires in 2h); add a small "Release claim" link in the footer.
- Delete (or unmount) `WeekNavigator`, `TodayChecklist`, `AssignCampusPopover`, `AssignToKingModal` from the outreach route. Files can stay on disk for now to keep the diff small.

## Out of scope

- Recomputing tuition values. Rows missing `annual_tuition_out_state_cents` will sort last; if many are null we can address in a follow-up.
- Changing the AI research flow itself (already fixed last turn).
