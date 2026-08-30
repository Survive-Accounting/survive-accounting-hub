// USAGE TELEMETRY (client runtime) — local-first interaction/impression logging for
// admin surfaces, same never-lose rules as edit-telemetry.ts / the Idea Bank:
//   • logEvent commits to localStorage and RETURNS — never awaited on an interaction.
//   • the sync queue is DERIVED (!syncedAt) so it can't drift.
//   • a failed sync never drops an event — retries on reconnect + a slow heartbeat.
//   • pruning only ever removes SYNCED events, oldest first.
// Events are ALSO mirrored to PostHog track() (product analytics keeps its copy).
import { track } from "@/lib/analytics";
import type { UsageSurface } from "@/lib/usage-elements";

export interface UsageEvent {
  id: string; session_id: string; user_id: string | null; surface: string;
  element_id: string; element_label: string | null;
  event_type: "interaction" | "impression" | "rage_click";
  screen_region: string | null; parent_panel: string | null; occurred_at: string;
  syncedAt?: string;
}
export interface UsageSession { id: string; user_id: string | null; surface: string; started_at: string; ended_at: string | null; active_ms: number; lastActivity: number; note?: string | null; syncedAt?: string }

const EV_KEY = "sa-usage-events-v1";
const SES_KEY = "sa-usage-session-v1";
const IMP_KEY = (sid: string) => `sa-usage-imp-${sid}`;
const IDLE_MS = 20 * 60 * 1000; // session ends after 20 min idle
const PRUNE_AT = 5000, PRUNE_TO = 3500, MAX_BATCH = 500, FLUSH_MS = 15000;

let events: UsageEvent[] = [];
let session: UsageSession | null = null;
let surface: UsageSurface = "study-canvas";
let userId: string | null = null;
let started = false, syncing = false;
let timer: ReturnType<typeof setInterval> | undefined;

const now = () => Date.now();
const iso = () => new Date().toISOString();
const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);
const mint = () => `${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const ls = (): Storage | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

function load() {
  const s = ls(); if (!s) return;
  try { events = JSON.parse(s.getItem(EV_KEY) || "[]"); } catch { events = []; }
  try { session = JSON.parse(s.getItem(SES_KEY) || "null"); } catch { session = null; }
}
function saveEvents() { const s = ls(); if (s) try { s.setItem(EV_KEY, JSON.stringify(events)); } catch { /* quota — drop silently, never throw on the hot path */ } }
function saveSession() { const s = ls(); if (s && session) try { s.setItem(SES_KEY, JSON.stringify(session)); } catch { /* */ } }

// ---- sessions --------------------------------------------------------------
function freshSession(): UsageSession {
  const t = iso();
  return { id: mint(), user_id: userId, surface, started_at: t, ended_at: null, active_ms: 0, lastActivity: now() };
}
/** Return the live session, rolling over to a new one after 20 min idle. */
function currentSession(): UsageSession {
  const t = now();
  if (!session) { session = freshSession(); saveSession(); return session; }
  if (t - session.lastActivity > IDLE_MS) {
    // finalize the idle session, sync it, start a new one
    session.ended_at = new Date(session.lastActivity).toISOString();
    void syncSessions([session]);
    session = freshSession(); saveSession();
  }
  return session;
}
/** Count active time: add the gap since last activity, capping idle. */
function markActive() {
  const s = currentSession(); const t = now();
  const gap = t - s.lastActivity;
  if (gap > 0 && gap < IDLE_MS) s.active_ms += gap;
  s.lastActivity = t; s.ended_at = null; saveSession();
}

// ---- logging ---------------------------------------------------------------
function alreadyImpressed(sid: string, elId: string): boolean {
  const s = ls(); if (!s) return false;
  try { const set = new Set<string>(JSON.parse(s.getItem(IMP_KEY(sid)) || "[]")); if (set.has(elId)) return true; set.add(elId); s.setItem(IMP_KEY(sid), JSON.stringify([...set])); return false; } catch { return false; }
}

export function logInteraction(elementId: string, label: string | null, region: string | null, panel: string | null, kind: "interaction" | "rage_click" = "interaction") {
  markActive(); const s = currentSession();
  const ev: UsageEvent = { id: mint(), session_id: s.id, user_id: userId, surface, element_id: elementId, element_label: label, event_type: kind, screen_region: region, parent_panel: panel, occurred_at: iso() };
  events.push(ev); saveEvents();
  try { track(kind === "rage_click" ? "admin_rage_click" as never : "admin_interaction" as never, { surface, element_id: elementId, parent_panel: panel }); } catch { /* analytics never throws the hot path */ }
}
/** One impression per element per session (deduped). */
export function logImpression(elementId: string, label: string | null, region: string | null, panel: string | null) {
  const s = currentSession();
  if (alreadyImpressed(s.id, elementId)) return;
  const ev: UsageEvent = { id: mint(), session_id: s.id, user_id: userId, surface, element_id: elementId, element_label: label, event_type: "impression", screen_region: region, parent_panel: panel, occurred_at: iso() };
  events.push(ev); saveEvents();
  try { track("admin_impression" as never, { surface, element_id: elementId, parent_panel: panel }); } catch { /* */ }
}

// ---- sync ------------------------------------------------------------------
async function syncSessions(list: UsageSession[]) {
  if (!online() || !list.length) return;
  try {
    const { upsertUsageSessions } = await import("@/lib/admin-usage.functions");
    await upsertUsageSessions({ data: { sessions: list.map((s) => ({ id: s.id, user_id: s.user_id, surface: s.surface, started_at: s.started_at, ended_at: s.ended_at, active_ms: Math.round(s.active_ms), note: s.note ?? null })) } });
  } catch { /* deny/missing-table/offline — retried by the heartbeat; never blocks */ }
}
async function flush() {
  if (syncing || !online()) return;
  const pending = events.filter((e) => !e.syncedAt);
  if (session) void syncSessions([session]);
  if (!pending.length) return;
  syncing = true;
  try {
    const { upsertUsageEvents } = await import("@/lib/admin-usage.functions");
    for (let i = 0; i < pending.length; i += MAX_BATCH) {
      const batch = pending.slice(i, i + MAX_BATCH);
      await upsertUsageEvents({ data: { events: batch.map(({ syncedAt, ...e }) => { void syncedAt; return e; }) } });
      const at = iso(); const ids = new Set(batch.map((e) => e.id));
      for (const e of events) if (ids.has(e.id)) e.syncedAt = at;
    }
    // prune synced, oldest first
    if (events.length > PRUNE_AT) { const synced = events.filter((e) => e.syncedAt), rest = events.filter((e) => !e.syncedAt); events = [...synced.slice(-(PRUNE_TO - rest.length)), ...rest].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)); }
    saveEvents();
  } catch { /* surfaced nowhere in V1; retried next heartbeat */ } finally { syncing = false; }
}

// ---- lifecycle -------------------------------------------------------------
export function initUsageTelemetry(s: UsageSurface, uid: string | null) {
  if (started) { surface = s; userId = uid; return; }
  started = true; surface = s; userId = uid; load();
  markActive(); // opens/rolls the session on load
  timer = setInterval(() => void flush(), FLUSH_MS);
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void flush());
    window.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void flush(); else { markActive(); void flush(); } });
    window.addEventListener("beforeunload", () => { markActive(); if (session) { session.ended_at = iso(); void syncSessions([session]); } saveEvents(); });
  }
}
export function stopUsageTelemetry() { if (timer) clearInterval(timer); started = false; }

// ---- read for the prompt (this session, from LOCAL — no round trip) --------
export function localEventsThisSession(): UsageEvent[] { const sid = session?.id; return sid ? events.filter((e) => e.session_id === sid) : []; }
export function localSession(): UsageSession | null { return session; }
export function allLocalEvents(): UsageEvent[] { return events.slice(); }
