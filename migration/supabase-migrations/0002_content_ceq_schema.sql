-- 0002: Content + CEQ schema
-- Generated from old project's Supabase types (June 2026 branch).
-- All columns nullable except id/created_at/updated_at for maximum import compatibility;
-- tighten constraints after migration if desired.

create table if not exists public.textbooks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  edition text,
  isbn text,
  publisher text,
  title text
);

create table if not exists public.course_textbooks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete set null,
  created_at timestamptz not null default now(),
  textbook_id uuid references public.textbooks(id) on delete set null
);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  chapter_name text,
  chapter_number numeric,
  course_id uuid references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  je_only_mode boolean,
  target_lessons numeric,
  topics_locked boolean,
  topics_locked_at timestamptz,
  topics_locked_count numeric
);

create table if not exists public.chapter_topics (
  id uuid primary key default gen_random_uuid(),
  asset_codes text[],
  chapter_id uuid references public.chapters(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  created_at timestamptz not null default now(),
  display_order numeric,
  generated_by_ai boolean,
  is_active boolean,
  is_supplementary boolean,
  lw_imported boolean,
  lw_imported_at timestamptz,
  lw_imported_by text,
  lw_quiz_link text,
  lw_video_link text,
  merged_into_topic_id uuid references public.chapter_topics(id) on delete set null,
  original_asset_codes text[],
  quiz_status text,
  topic_description text,
  topic_name text,
  topic_number numeric,
  topic_rationale text,
  video_status text
);

create table if not exists public.teaching_assets (
  id uuid primary key default gen_random_uuid(),
  admin_notes jsonb,
  asset_approved_at timestamptz,
  asset_name text,
  asset_type text,
  chapter_id uuid references public.chapters(id) on delete set null,
  concept_notes text,
  core_rank numeric,
  course_id uuid references public.courses(id) on delete set null,
  created_at timestamptz not null default now(),
  difficulty text,
  exam_traps text,
  financial_statements_json jsonb,
  important_formulas text,
  instruction_1 text,
  instruction_2 text,
  instruction_3 text,
  instruction_4 text,
  instruction_5 text,
  instruction_list text,
  journal_entry_block text,
  journal_entry_completed_json jsonb,
  journal_entry_template_json jsonb,
  problem_context text,
  problem_title text,
  problem_type text,
  source_number text,
  source_ref text,
  source_type text,
  supplementary_je_json jsonb,
  survive_problem_text text,
  survive_solution_explanation_cache jsonb,
  survive_solution_json jsonb,
  survive_solution_text text,
  t_accounts_json jsonb,
  tables_json jsonb,
  tags text[],
  topic_id uuid references public.chapter_topics(id) on delete set null,
  updated_at timestamptz not null default now(),
  uses_financial_statements boolean,
  uses_t_accounts boolean,
  uses_tables boolean,
  worked_steps text
);

create table if not exists public.chapter_je_categories (
  id uuid primary key default gen_random_uuid(),
  category_name text,
  chapter_id uuid references public.chapters(id) on delete cascade,
  created_at timestamptz not null default now(),
  sort_order numeric
);

create table if not exists public.chapter_formulas (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters(id) on delete cascade,
  components jsonb,
  created_at timestamptz not null default now(),
  formula_explanation text,
  formula_expression text,
  formula_name text,
  generated_at timestamptz,
  image_url text,
  is_approved boolean,
  is_rejected boolean,
  sort_order numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.chapter_journal_entries (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.chapter_je_categories(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete cascade,
  created_at timestamptz not null default now(),
  generated_at timestamptz,
  is_approved boolean,
  is_rejected boolean,
  je_lines jsonb,
  sort_order numeric,
  source text,
  transaction_label text,
  updated_at timestamptz not null default now()
);

create table if not exists public.chapter_accounts (
  id uuid primary key default gen_random_uuid(),
  account_description text,
  account_name text,
  account_type text,
  balance_tooltip text,
  chapter_id uuid references public.chapters(id) on delete cascade,
  contra_tooltip text,
  created_at timestamptz not null default now(),
  credit_tooltip text,
  debit_tooltip text,
  example_beginning_balance numeric,
  example_credit_amount numeric,
  example_date_label text,
  example_debit_amount numeric,
  example_ending_balance numeric,
  fs_placement_tooltip text,
  generated_at timestamptz,
  is_approved boolean,
  is_rejected boolean,
  normal_balance text,
  sort_order numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.chapter_key_terms (
  id uuid primary key default gen_random_uuid(),
  category text,
  chapter_id uuid references public.chapters(id) on delete cascade,
  created_at timestamptz not null default now(),
  definition text,
  generated_at timestamptz,
  is_approved boolean,
  is_rejected boolean,
  sort_order numeric,
  term text,
  updated_at timestamptz not null default now()
);

create table if not exists public.chapter_exam_mistakes (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters(id) on delete cascade,
  created_at timestamptz not null default now(),
  example_text text,
  explanation text,
  generated_at timestamptz,
  is_approved boolean,
  is_rejected boolean,
  mistake text,
  sort_order numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.chapter_purpose (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters(id) on delete cascade,
  consequence_bullets jsonb,
  created_at timestamptz not null default now(),
  generated_at timestamptz,
  is_approved boolean,
  purpose_bullets jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.banked_questions (
  id uuid primary key default gen_random_uuid(),
  ai_confidence_score numeric,
  answer_a text,
  answer_b text,
  answer_c text,
  answer_d text,
  answer_e text,
  asset_id text,
  correct_answer text,
  created_at timestamptz not null default now(),
  difficulty numeric,
  question_text text,
  question_type text,
  rating numeric,
  rejection_notes text,
  review_status text,
  short_explanation text,
  teaching_asset_id uuid references public.teaching_assets(id) on delete cascade
);

create table if not exists public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters(id) on delete set null,
  chapter_number numeric,
  completions numeric,
  course_code text,
  course_id uuid references public.courses(id) on delete set null,
  created_at timestamptz not null default now(),
  plays numeric,
  status text,
  total_cards numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  back text,
  card_type text,
  created_at timestamptz not null default now(),
  deck_id uuid references public.flashcard_decks(id) on delete cascade,
  deleted boolean,
  front text,
  sort_order numeric,
  source_asset_id uuid references public.teaching_assets(id) on delete set null
);

create table if not exists public.formula_sets (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters(id) on delete set null,
  completions numeric,
  course_id uuid references public.courses(id) on delete set null,
  created_at timestamptz not null default now(),
  plays numeric,
  status text
);

create table if not exists public.formula_items (
  id uuid primary key default gen_random_uuid(),
  deleted boolean,
  formula_name text,
  formula_text text,
  hint text,
  set_id uuid references public.formula_sets(id) on delete cascade,
  sort_order numeric,
  source_asset_id uuid references public.teaching_assets(id) on delete set null
);

create table if not exists public.entry_builder_sets (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters(id) on delete set null,
  completions numeric,
  course_id uuid references public.courses(id) on delete set null,
  created_at timestamptz not null default now(),
  plays numeric,
  status text
);

create table if not exists public.entry_builder_items (
  id uuid primary key default gen_random_uuid(),
  date_label text,
  deleted boolean,
  entries jsonb,
  set_id uuid references public.entry_builder_sets(id) on delete cascade,
  sort_order numeric,
  source_asset_id uuid references public.teaching_assets(id) on delete set null,
  transaction_description text
);

create table if not exists public.entry_builder_accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text,
  account_type text,
  chapter_id uuid references public.chapters(id) on delete set null,
  normal_balance text
);

create table if not exists public.dissector_problems (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters(id) on delete set null,
  completions numeric,
  course_id uuid references public.courses(id) on delete set null,
  created_at timestamptz not null default now(),
  highlights jsonb,
  plays numeric,
  problem_text text,
  status text,
  teaching_asset_id uuid references public.teaching_assets(id) on delete set null
);

create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  account_type text,
  canonical_name text,
  created_at timestamptz not null default now(),
  is_global_default boolean,
  keywords text[],
  normal_balance text
);

create table if not exists public.company_names (
  id uuid primary key default gen_random_uuid(),
  active boolean,
  created_at timestamptz not null default now(),
  name text,
  notes text,
  style text
);

create table if not exists public.account_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_name text,
  course_short text,
  created_at timestamptz not null default now(),
  preferred_display_name text
);

create table if not exists public.ceq_tutoring_notes (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters(id) on delete set null,
  created_at timestamptz not null default now(),
  file_name text,
  ocr_error text,
  ocr_status text,
  ocr_text text,
  page_count numeric,
  storage_path text,
  updated_at timestamptz not null default now()
);

create table if not exists public.ceq_teaching_blocks (
  id uuid primary key default gen_random_uuid(),
  block_type text,
  body text,
  chapter_id uuid references public.chapters(id) on delete set null,
  created_at timestamptz not null default now(),
  sort_order numeric,
  source_asset_id uuid references public.teaching_assets(id) on delete set null,
  source_note_id uuid references public.ceq_tutoring_notes(id) on delete set null,
  title text,
  updated_at timestamptz not null default now()
);

create table if not exists public.ceqs (
  id uuid primary key default gen_random_uuid(),
  admin_notes text,
  answer text,
  ceq_type text,
  common_mistake text,
  created_at timestamptz not null default now(),
  difficulty text,
  draft_instruction text,
  explanation text,
  formula_block text,
  include_common_mistake boolean,
  include_formula boolean,
  include_je boolean,
  include_student_explanation boolean,
  include_t_accounts boolean,
  include_teaching_script boolean,
  je_block text,
  mc_choices jsonb,
  progressive_reveal boolean,
  status text,
  student_explanation text,
  student_prompt text,
  t_account_block text,
  teaching_asset_id uuid references public.teaching_assets(id) on delete cascade,
  teaching_script text,
  thinking jsonb,
  title text,
  updated_at timestamptz not null default now()
);

create table if not exists public.teaching_asset_ceq_flags (
  is_core boolean,
  marked_at timestamptz,
  marked_by text,
  teaching_asset_id uuid references public.teaching_assets(id) on delete cascade
);

create table if not exists public.teaching_asset_ceq_part_focus (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  part_index numeric,
  part_label text,
  teaching_asset_id uuid references public.teaching_assets(id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- Concept layer (new -- per long-term vision)
create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  course_area text,
  parent_concept_id uuid references public.concepts(id) on delete set null,
  description text,
  created_at timestamptz not null default now()
);
create table if not exists public.ceq_concepts (
  id uuid primary key default gen_random_uuid(),
  ceq_id uuid not null references public.ceqs(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (ceq_id, concept_id)
);
create table if not exists public.teaching_asset_concepts (
  id uuid primary key default gen_random_uuid(),
  teaching_asset_id uuid not null references public.teaching_assets(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (teaching_asset_id, concept_id)
);
insert into storage.buckets (id, name, public) values ('ceq-tutoring-notes','ceq-tutoring-notes', false)
on conflict (id) do nothing;

create index if not exists teaching_assets_chapter_idx on public.teaching_assets(chapter_id);
create index if not exists ceqs_asset_idx on public.ceqs(teaching_asset_id);
