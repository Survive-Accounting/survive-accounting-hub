// FAIL-LOUD for un-applied migrations. When a dark feature's table is absent
// (placements 0091, decks 0090, principles 0093, …) the old code silently
// no-op'd — which hid four whole features. Instead: LOUD console.error AND a
// visible toast naming the migration, so Lee knows exactly what to run.
//
// Pub-sub so a data-layer module (je-api, canvas.functions client callers) can
// report without importing React/toast; the canvas route subscribes and toasts.
const listeners = new Set<(migration: string) => void>();
const reportedThisSession = new Set<string>(); // don't spam the same toast

export function onMissingMigration(cb: (migration: string) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** `migration` = the file name, e.g. "0091_scenario_placements.sql". */
export function reportMissingMigration(migration: string): void {
  // eslint-disable-next-line no-console
  console.error(`[canvas] MISSING MIGRATION: run migration/supabase-migrations/${migration} in the Supabase SQL editor — the feature is disabled until it's applied.`);
  if (reportedThisSession.has(migration)) return;
  reportedThisSession.add(migration);
  listeners.forEach((l) => l(migration));
}
