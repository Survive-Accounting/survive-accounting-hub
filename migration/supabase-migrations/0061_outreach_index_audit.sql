-- 0061_outreach_index_audit — indexes for confirmed seq-scans on hot filter cols.
--
-- Audited the list queries (EXPLAIN ANALYZE) for the outreach/intel tables. Most
-- hot filters were ALREADY indexed and need nothing:
--   reddit_mentions   → campus_id, status, posted_at DESC, starred (partial) ✓
--   parent_groups     → campus_id, membership_status ✓  (0 rows)
--   orders            → campus_id, status, created_at DESC ✓
--   greek_org_filings → chapter_id, (chapter_id,tax_year), org_id ✓
--   greek_org_people  → chapter_id, (chapter_id,person_name), org_id, years_count ✓
--   greek_firm_leads  → firm_name unique (27 rows; source/status filtered client-side)
--   greek_orgs        → 150 rows, list is unfiltered order-by-name (seq scan optimal)
--   hasselback_faculty→ matched_campus_id (Index Scan) ✓   [backs "professor_scoring"/roster]
--   rmp_ratings       → campus_id (Index Scan) ✓
-- Named-but-nonexistent tables: parent_group_mentions, active_roster,
-- professor_scoring (the roster + scoring surfaces read from campuses +
-- hasselback_faculty, both already indexed on the filter columns).
--
-- The full campus_greek_chapters list ("archived_at is null order by created_at
-- desc") seq-scans by design — it reads the whole table — so no index is added
-- for it; a 1107-row quicksort is ~0.1ms.
--
-- Two real gaps:

-- (1) campus_greek_chapters (1107 rows, >1k): filtering by greek_org_id
--     ("chapters of org X" — importCharteredYears, per-org lookups) Seq-Scanned
--     all 1107 rows, removing 1016, to return ~91. The composite
--     (campus_id, greek_org_id) can't serve a greek_org_id-leading predicate.
create index if not exists campus_greek_chapters_greek_org_idx
  on public.campus_greek_chapters (greek_org_id);

-- (2) vendor_lists: listVendorLists filters national_org on every call and orders
--     by found_at desc; only the pkey existed. Small today but 1:1 with the
--     access pattern and grows per captured list. Composite = index-only order.
create index if not exists vendor_lists_national_org_idx
  on public.vendor_lists (national_org, found_at desc);

-- Noted but NOT added (outside the >1k / every-filter criteria): orders has an
-- unindexed FK orders.professor_lead_id (7 rows). Worth an index once orders
-- grows or if the professor-join becomes a hot path:
--   create index if not exists orders_professor_lead_idx on public.orders (professor_lead_id);
