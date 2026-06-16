
ALTER TABLE public.supported_textbook_families
  ADD COLUMN IF NOT EXISTS isbn13_prefixes text[] NOT NULL DEFAULT '{}';

-- Seed ISBN-13 prefixes per publisher. These are the leading digits typically
-- assigned to each publisher's accounting titles; a prefix match is treated as
-- a weak but useful signal (confidence ~0.6) only when title/authors/publisher
-- are all blank in the campus research.
UPDATE public.supported_textbook_families
SET isbn13_prefixes = CASE
  -- McGraw-Hill (Wild/Shaw, Libby/Hodge, Spiceland, Garrison)
  WHEN 'mcgraw' = ANY (publisher_keywords)
    THEN ARRAY['9780077','9780078','9781259','9781260','9781264','9781265','9781266','9781307','9781308','9781309']
  -- Wiley (Weygandt/Kimmel/Kieso, Kieso/Warfield)
  WHEN 'wiley' = ANY (publisher_keywords)
    THEN ARRAY['9780470','9780471','9781118','9781119','9781394']
  -- Cambridge Business Publishers (Hanlon/Magee/Pfeiffer, Hartgraves/Morse, Hanlon/Hodder/Nelson)
  WHEN 'cambridge' = ANY (publisher_keywords)
    THEN ARRAY['9781618','9781619','9781323','9781934','9781950','9781618534','9781618532']
  ELSE isbn13_prefixes
END
WHERE active = true;
