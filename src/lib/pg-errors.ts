// Missing-schema detection for Supabase/PostgREST errors — the backbone of the
// canvas fail-loud contract (banners that NAME the unapplied migration file).
//
// PostgREST reports a missing table/column TWO different ways:
//   - raw PG codes when the query text reaches Postgres:
//       42P01  relation "…" does not exist
//       42703  column "…" does not exist        (e.g. SELECT of a missing column)
//   - its OWN codes when the SCHEMA CACHE can't resolve the name first:
//       PGRST205  Could not find the table 'public.x' in the schema cache
//       PGRST204  Could not find the 'x' column of 'y' in the schema cache
// Matching only the PG codes silently misses the (more common) PGRST pair —
// that exact bug shipped in the 0087/0088 helpers and turned fail-loud into
// fail-silent. `ident` scopes the match to the table/column the caller owns.
/** True when an error is one of our fail-loud migration hints (deterministic —
 *  the table won't appear between retries). Queries should NOT retry these:
 *  react-query pauses retries while the tab is hidden/unfocused, which would
 *  delay the banner; rejecting immediately shows it on the first failure. */
export function isMigrationHint(e: unknown): boolean {
  return /migration\/supabase-migrations\//.test(e instanceof Error ? e.message : String(e));
}

/** Standard retry policy for canvas queries: never retry a migration hint,
 *  retry everything else once. */
export function retryUnlessMigrationHint(failureCount: number, error: unknown): boolean {
  return !isMigrationHint(error) && failureCount < 1;
}

export function isMissingSchema(error: { code?: string; message: string }, ident: RegExp): boolean {
  const codeHit =
    error.code === "42P01" || error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST205";
  const msgHit =
    /does not exist/i.test(error.message) || /could not find the .* in the schema cache/i.test(error.message);
  return (codeHit || msgHit) && ident.test(error.message);
}
