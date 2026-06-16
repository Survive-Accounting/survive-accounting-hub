## Goal

Add reusable, named **Audiences** — saved campus selections plus the filter rules that produced them — that can be picked from the Campaign Builder, edited later, and reused for future campaigns.

## What an Audience is

An Audience captures two things:

1. **Filter rules** — the same filter shape used on the Campuses tab (search, tuition min/max, status, assignment, state, batch, SEC-only, high-tuition, include-archived), plus the textbook-audit filters we just added (course families multi-select, authors/publisher contains).
2. **Pinned campus IDs** — an optional explicit list. When set, the audience resolves to *exactly* those campuses (filter is just a description). When empty, the audience resolves to *whatever currently matches the filters* (dynamic).

This dual mode mirrors how the Campaign Builder already works: it has filters + an optional explicit campus selection.

## UI

### New "Audiences" tab on the Outreach page

Lives next to Campaigns. Lists saved audiences with: name, mode (Pinned N campuses / Dynamic), last used, owner, shared flag, row actions (Edit, Duplicate, Delete, "New campaign from this").

### Audience editor modal

Reuses the existing `CampusFilterBar` (Campuses tab filters) **and** a compact textbook-family / authors / publisher block (lifted out of `TextbookMatchAuditModal`). Below the filters: the same campus checklist UI the Campaign Builder uses, showing the live match count. Two save modes:

- **Save as dynamic** — store filter JSON only.
- **Pin current selection** — store filter JSON + the explicit campus IDs that are checked right now.

Header: name input, "Share with team" toggle.

### Campaign Builder integration

Top of the builder gets an "Audience" dropdown: *None* / list of saved audiences / "Save current as new audience…". Picking one loads its filters and (if pinned) its campus IDs into the existing builder state. A small "Edit audience" link opens the editor in a side modal. The builder still works exactly as today when no audience is selected.

## Data model

New table `outreach_audiences`:

- `name` (text, not null)
- `description` (text, nullable)
- `filters_json` (jsonb, not null) — full `CampusFilters` + audit filter extension
- `pinned_campus_ids` (uuid[], nullable) — null/empty = dynamic
- `is_shared` (bool, default false)
- `created_by` (uuid, FK auth.users)
- `last_used_at` (timestamptz, nullable)
- standard `id`, `created_at`, `updated_at`

Plus a join column on `outreach_campaigns`: `audience_id uuid references outreach_audiences(id)` so we can later see "which audience launched this campaign" without breaking existing campaigns.

RLS: authenticated users can read all shared rows + their own private rows; insert/update/delete their own; admins can manage all.

## Technical changes

### Migration
- `CREATE TABLE public.outreach_audiences (...)` + GRANTs (`authenticated`, `service_role`) + RLS policies + `updated_at` trigger using `public.set_updated_at`.
- `ALTER TABLE public.outreach_campaigns ADD COLUMN audience_id uuid REFERENCES public.outreach_audiences(id) ON DELETE SET NULL`.

### API (`src/lib/outreach-api.ts`)
- `listAudiences()`, `getAudience(id)`, `createAudience(payload)`, `updateAudience(id, patch)`, `deleteAudience(id)`, `touchAudienceUsed(id)`.

### New files
- `src/components/outreach/AudiencesPanel.tsx` — list + row actions.
- `src/components/outreach/AudienceEditorModal.tsx` — name, share, filter editor (reuses `CampusFilterBar`), audit-filter block, campus checklist, save modes.
- `src/lib/audience-filters.ts` — shared `applyAudienceFilters(campuses, audienceFilters)` so the editor preview and any future campaign-launch resolver use identical logic. Extracts/shares the existing `applyFilters` (campuses) + the family/author/publisher predicates.

### Edited files
- `src/components/outreach/CampaignBuilder.tsx` — "Audience" dropdown at top, "Save as audience" button, prefill filters + selected campus IDs when an audience is picked.
- `src/routes/outreach.tsx` (or wherever the tab list lives) — add **Audiences** tab.
- `src/components/outreach/TextbookMatchAuditModal.tsx` — minor: export the family/authors/publisher predicate so the editor can reuse it.

### Out of scope (this turn)
- Auto-syncing pinned audiences when new campuses appear.
- Audience analytics (open/reply rates rolled up across campaigns).
- Cross-audience deduping in the scheduler.

## Files touched

**New**
- `supabase/migrations/<ts>_outreach_audiences.sql`
- `src/components/outreach/AudiencesPanel.tsx`
- `src/components/outreach/AudienceEditorModal.tsx`
- `src/lib/audience-filters.ts`

**Edited**
- `src/lib/outreach-api.ts`
- `src/components/outreach/CampaignBuilder.tsx`
- `src/routes/outreach.tsx`
- `src/components/outreach/TextbookMatchAuditModal.tsx` (export helper only)
