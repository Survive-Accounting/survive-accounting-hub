CREATE TABLE IF NOT EXISTS public.supported_textbook_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_family text NOT NULL,
  label text NOT NULL,
  publisher_keywords text[] NOT NULL DEFAULT '{}',
  title_keywords text[] NOT NULL DEFAULT '{}',
  author_keywords text[] NOT NULL DEFAULT '{}',
  edition_sensitive boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.supported_textbook_families TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supported_textbook_families TO authenticated;
GRANT ALL ON public.supported_textbook_families TO service_role;

ALTER TABLE public.supported_textbook_families ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stf_read_all" ON public.supported_textbook_families
  FOR SELECT USING (true);
CREATE POLICY "stf_write_authenticated" ON public.supported_textbook_families
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS supported_textbook_families_family_idx
  ON public.supported_textbook_families (course_family) WHERE active;

CREATE TRIGGER set_updated_at_supported_textbook_families
  BEFORE UPDATE ON public.supported_textbook_families
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed with the major accounting textbook families
INSERT INTO public.supported_textbook_families
  (course_family, label, publisher_keywords, title_keywords, author_keywords, notes)
VALUES
  ('intro_1', 'Wild / Shaw — Financial & Managerial (McGraw-Hill)',
    ARRAY['mcgraw'], ARRAY['financial','managerial','accounting'], ARRAY['wild','shaw','chiappetta'],
    'Common combined Intro 1+2 text.'),
  ('intro_2', 'Wild / Shaw — Financial & Managerial (McGraw-Hill)',
    ARRAY['mcgraw'], ARRAY['financial','managerial','accounting'], ARRAY['wild','shaw','chiappetta'], NULL),
  ('intro_1', 'Hanlon / Magee / Pfeiffer — Financial Accounting (Cambridge)',
    ARRAY['cambridge'], ARRAY['financial','accounting'], ARRAY['hanlon','magee','pfeiffer','dyckman'], NULL),
  ('intro_2', 'Garrison / Noreen / Brewer — Managerial Accounting (McGraw-Hill)',
    ARRAY['mcgraw'], ARRAY['managerial','accounting'], ARRAY['garrison','noreen','brewer'], NULL),
  ('intro_2', 'Hartgraves / Morse — Managerial Accounting (Cambridge)',
    ARRAY['cambridge'], ARRAY['managerial','accounting'], ARRAY['hartgraves','morse'], NULL),
  ('intro_1', 'Weygandt / Kimmel / Kieso — Financial Accounting (Wiley)',
    ARRAY['wiley'], ARRAY['financial','accounting'], ARRAY['weygandt','kimmel','kieso'], NULL),
  ('intro_2', 'Weygandt / Kimmel / Kieso — Managerial Accounting (Wiley)',
    ARRAY['wiley'], ARRAY['managerial','accounting'], ARRAY['weygandt','kimmel','kieso'], NULL),
  ('intro_1', 'Libby / Libby / Hodge — Financial Accounting (McGraw-Hill)',
    ARRAY['mcgraw'], ARRAY['financial','accounting'], ARRAY['libby','hodge'], NULL),
  ('intermediate_1', 'Spiceland / Nelson / Thomas — Intermediate Accounting (McGraw-Hill)',
    ARRAY['mcgraw'], ARRAY['intermediate','accounting'], ARRAY['spiceland','nelson','thomas','winchel'], NULL),
  ('intermediate_2', 'Spiceland / Nelson / Thomas — Intermediate Accounting (McGraw-Hill)',
    ARRAY['mcgraw'], ARRAY['intermediate','accounting'], ARRAY['spiceland','nelson','thomas','winchel'], NULL),
  ('intermediate_1', 'Kieso / Weygandt / Warfield — Intermediate Accounting (Wiley)',
    ARRAY['wiley'], ARRAY['intermediate','accounting'], ARRAY['kieso','weygandt','warfield'], NULL),
  ('intermediate_2', 'Kieso / Weygandt / Warfield — Intermediate Accounting (Wiley)',
    ARRAY['wiley'], ARRAY['intermediate','accounting'], ARRAY['kieso','weygandt','warfield'], NULL),
  ('intermediate_1', 'Hanlon / Hodder / Nelson — Intermediate Accounting (Cambridge)',
    ARRAY['cambridge'], ARRAY['intermediate','accounting'], ARRAY['hanlon','hodder','nelson','roulstone','warfield'], NULL),
  ('intermediate_2', 'Hanlon / Hodder / Nelson — Intermediate Accounting (Cambridge)',
    ARRAY['cambridge'], ARRAY['intermediate','accounting'], ARRAY['hanlon','hodder','nelson','roulstone','warfield'], NULL);