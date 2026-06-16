ALTER TABLE public.campus_lead_suggestions
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text,
  ADD COLUMN IF NOT EXISTS archived_by text,
  ADD COLUMN IF NOT EXISTS archive_label text;

CREATE INDEX IF NOT EXISTS campus_lead_suggestions_archived_at_idx
  ON public.campus_lead_suggestions (archived_at);
CREATE INDEX IF NOT EXISTS campus_lead_suggestions_archive_label_idx
  ON public.campus_lead_suggestions (archive_label);