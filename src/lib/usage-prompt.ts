// COPY ACTIVITY LOG PROMPT — assembles the report from local + synced events for a
// chosen range and copies the ready-to-paste Claude Code prompt to the clipboard.
import { buildUsageReport, renderActivityPrompt, type EventLite, type SessionLite } from "@/lib/usage-report";
import { elementsFor, PROTECTED_ELEMENTS, CURRENT_LAYOUT_VERSION, type UsageSurface } from "@/lib/usage-elements";
import { allLocalEvents, localSession, type UsageEvent } from "@/lib/usage-telemetry";

export type UsageRange = "session" | "7d" | "30d";
const RANGE_LABEL: Record<UsageRange, string> = { session: "this session", "7d": "last 7 days", "30d": "last 30 days" };

const toLite = (e: { element_id: string; element_label: string | null; event_type: string; session_id: string; occurred_at: string; parent_panel: string | null }): EventLite =>
  ({ element_id: e.element_id, element_label: e.element_label, event_type: e.event_type as EventLite["event_type"], session_id: e.session_id, occurred_at: e.occurred_at, parent_panel: e.parent_panel });

/** Build the prompt string for a surface+range. Merges LOCAL events (instant, includes
 *  unsynced) with the SERVER store for 7d/30d, deduped by event id. */
export async function buildActivityLogPrompt(surface: UsageSurface, range: UsageRange, userId: string | null): Promise<string> {
  const sinceMs = range === "session" ? 0 : range === "7d" ? 7 * 864e5 : 30 * 864e5;
  const sinceIso = new Date(Date.now() - sinceMs).toISOString();

  const local = allLocalEvents() as UsageEvent[];
  const sess = localSession();
  let events: EventLite[] = [];
  let sessions: SessionLite[] = [];

  if (range === "session") {
    const sid = sess?.id;
    events = local.filter((e) => e.session_id === sid).map(toLite);
    sessions = sess ? [{ id: sess.id, started_at: sess.started_at, ended_at: sess.ended_at, active_ms: sess.active_ms }] : [];
  } else {
    const byId = new Map<string, EventLite>();
    for (const e of local.filter((e) => e.occurred_at >= sinceIso)) byId.set(e.id, toLite(e));
    const sById = new Map<string, SessionLite>();
    if (sess) sById.set(sess.id, { id: sess.id, started_at: sess.started_at, ended_at: sess.ended_at, active_ms: sess.active_ms });
    try {
      const { listUsageEvents, listUsageSessions } = await import("@/lib/admin-usage.functions");
      const [srvE, srvS] = await Promise.all([
        listUsageEvents({ data: { surface, sinceIso, userId: userId ?? undefined } }),
        listUsageSessions({ data: { surface, sinceIso, userId: userId ?? undefined } }),
      ]);
      for (const e of srvE) if (!byId.has(e.id)) byId.set(e.id, toLite(e));
      for (const s of srvS) if (!sById.has(s.id)) sById.set(s.id, { id: s.id, started_at: s.started_at, ended_at: s.ended_at, active_ms: s.active_ms });
    } catch { /* table unapplied / offline — degrade to local-only, still useful */ }
    events = [...byId.values()]; sessions = [...sById.values()];
  }

  const report = buildUsageReport({
    surface, layoutVersion: CURRENT_LAYOUT_VERSION[surface], rangeLabel: RANGE_LABEL[range],
    events, sessions, manifest: elementsFor(surface), protectedIds: PROTECTED_ELEMENTS[surface],
  });
  return renderActivityPrompt(report);
}

/** Build + copy to clipboard. Returns the text (so the caller can offer a fallback). */
export async function copyActivityLogPrompt(surface: UsageSurface, range: UsageRange, userId: string | null): Promise<{ text: string; copied: boolean }> {
  const text = await buildActivityLogPrompt(surface, range, userId);
  let copied = false;
  try { await navigator.clipboard.writeText(text); copied = true; } catch { copied = false; }
  return { text, copied };
}
