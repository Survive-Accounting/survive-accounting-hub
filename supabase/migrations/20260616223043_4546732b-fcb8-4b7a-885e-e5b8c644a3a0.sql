UPDATE public.campus_lead_suggestions
SET archived_at = NULL,
    archived_reason = NULL,
    archive_label = NULL
WHERE research_mode = 'faculty_scrape'
  AND status = 'pending'
  AND archived_reason = 'manual_reset'
  AND archive_label = 'reset';