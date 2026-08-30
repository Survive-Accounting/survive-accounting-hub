// USAGE REPORT (PURE) — turns raw events + sessions + the element manifest into the
// evidence sections and the ready-to-paste Claude Code prompt. No DOM, no DB, no
// clock: deterministic and unit-testable. The half that matters is what was SEEN
// and never touched, and what was never rendered at all.
import type { UsageElement } from "./usage-elements";

export interface EventLite {
  element_id: string;
  element_label: string | null;
  event_type: "interaction" | "impression" | "rage_click";
  session_id: string;
  occurred_at: string; // ISO
  parent_panel: string | null;
}
export interface SessionLite { id: string; started_at: string; ended_at: string | null; active_ms: number }

export interface UsageReport {
  surface: string;
  layoutVersion: string;
  rangeLabel: string;
  sessionCount: number;
  totalActiveMs: number;
  lowConfidence: boolean; // sessionCount < minSessions
  minSessions: number;
  used: { id: string; label: string; panel: string; interactions: number; lastUsedIso: string }[];
  seenNotTouched: { id: string; label: string; panel: string; impressions: number }[];
  neverRendered: { id: string; label: string; panel: string }[];
  deadEnds: { id: string; label: string }[];
  rageClicks: { id: string; label: string; count: number }[];
  timeToFirstMs: { medianMs: number | null; sessions: number };
  protectedIds: string[];
}

const fmtDur = (ms: number): string => {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const median = (xs: number[]): number | null => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const labelOf = (id: string, evLabel: string | null, man: Map<string, UsageElement>) => man.get(id)?.label ?? evLabel ?? id;
const panelOf = (id: string, man: Map<string, UsageElement>) => man.get(id)?.panel ?? "—";

export function buildUsageReport(input: {
  surface: string; layoutVersion: string; rangeLabel: string;
  events: EventLite[]; sessions: SessionLite[]; manifest: UsageElement[];
  protectedIds?: string[]; minSessions?: number;
}): UsageReport {
  const man = new Map(input.manifest.map((e) => [e.id, e]));
  const minSessions = input.minSessions ?? 20;
  const protectedIds = input.protectedIds ?? [];
  const sessionIds = new Set(input.sessions.map((s) => s.id));

  // per-element rollups
  type Roll = { interactions: number; impressions: number; rage: number; lastUsed: string };
  const roll = new Map<string, Roll>();
  const get = (id: string) => { let r = roll.get(id); if (!r) { r = { interactions: 0, impressions: 0, rage: 0, lastUsed: "" }; roll.set(id, r); } return r; };
  for (const e of input.events) {
    const r = get(e.element_id);
    if (e.event_type === "interaction") { r.interactions++; if (e.occurred_at > r.lastUsed) r.lastUsed = e.occurred_at; }
    else if (e.event_type === "impression") r.impressions++;
    else if (e.event_type === "rage_click") r.rage++;
  }

  // the universe = manifest ∪ anything seen in events (so ad-hoc ids still surface)
  const ids = new Set<string>([...man.keys(), ...roll.keys()]);

  const used: UsageReport["used"] = [];
  const seenNotTouched: UsageReport["seenNotTouched"] = [];
  const neverRendered: UsageReport["neverRendered"] = [];
  const deadEnds: UsageReport["deadEnds"] = [];
  const rageClicks: UsageReport["rageClicks"] = [];
  for (const id of ids) {
    const r = roll.get(id) ?? { interactions: 0, impressions: 0, rage: 0, lastUsed: "" };
    const label = labelOf(id, input.events.find((e) => e.element_id === id)?.element_label ?? null, man);
    const panel = panelOf(id, man);
    if (r.interactions > 0) used.push({ id, label, panel, interactions: r.interactions, lastUsedIso: r.lastUsed });
    else if (r.impressions > 0) seenNotTouched.push({ id, label, panel, impressions: r.impressions });
    else if (man.has(id)) neverRendered.push({ id, label, panel }); // instrumented but never on screen
    if (r.interactions === 1) deadEnds.push({ id, label });
    if (r.rage > 0) rageClicks.push({ id, label, count: r.rage });
  }
  used.sort((a, b) => b.interactions - a.interactions);
  seenNotTouched.sort((a, b) => b.impressions - a.impressions);
  rageClicks.sort((a, b) => b.count - a.count);

  // time-to-first-interaction per session
  const firsts: number[] = [];
  for (const s of input.sessions) {
    const start = Date.parse(s.started_at);
    const evs = input.events.filter((e) => e.session_id === s.id && e.event_type === "interaction").map((e) => Date.parse(e.occurred_at)).filter((t) => Number.isFinite(t) && t >= start);
    if (evs.length) firsts.push(Math.min(...evs) - start);
  }

  return {
    surface: input.surface, layoutVersion: input.layoutVersion, rangeLabel: input.rangeLabel,
    sessionCount: input.sessions.length, totalActiveMs: input.sessions.reduce((a, s) => a + (s.active_ms || 0), 0),
    lowConfidence: sessionIds.size < minSessions, minSessions,
    used, seenNotTouched, neverRendered, deadEnds, rageClicks,
    timeToFirstMs: { medianMs: median(firsts), sessions: firsts.length }, protectedIds,
  };
}

const isProt = (id: string, prot: string[]) => prot.includes(id);

export function renderActivityPrompt(r: UsageReport): string {
  const L: string[] = [];
  const prot = (id: string) => (isProt(id, r.protectedIds) ? " 🔒protected" : "");
  L.push(`# Simplify the ${r.surface} dashboard — usage evidence`);
  L.push("");
  L.push(`Surface: ${r.surface} · layout ${r.layoutVersion} · range: ${r.rangeLabel}`);
  L.push(`Sessions: ${r.sessionCount} · total active time: ${fmtDur(r.totalActiveMs)}${r.lowConfidence ? `  ⚠ LOW CONFIDENCE (< ${r.minSessions} sessions — treat as a hint, not a verdict)` : ""}`);
  if (r.timeToFirstMs.medianMs != null) L.push(`Median time-to-first-interaction: ${Math.round(r.timeToFirstMs.medianMs / 1000)}s (${r.timeToFirstMs.sessions} sessions)`);
  L.push("");
  L.push(`## ⚠ Read this before proposing anything`);
  L.push(`Low usage is NOT the same as low value. Rare-but-critical tools (launch checklist, refund handling, attribution overrides) look idle and must NOT be removed. Anything marked 🔒protected below is off-limits as a removal candidate regardless of usage.`);
  L.push("");
  L.push(`## Used — ranked by interactions`);
  if (r.used.length) for (const u of r.used) L.push(`- ${u.label} (${u.panel}) — ${u.interactions}× · last ${u.lastUsedIso.slice(0, 10)}${prot(u.id)}`);
  else L.push(`- (nothing interacted with in range)`);
  L.push("");
  L.push(`## Seen but never touched — the section that matters`);
  L.push(`On screen ≥1s, zero interactions. Prime simplification candidates:`);
  if (r.seenNotTouched.length) for (const s of r.seenNotTouched) L.push(`- ${s.label} (${s.panel}) — seen ${s.impressions}×, never used${prot(s.id)}`);
  else L.push(`- (none)`);
  L.push("");
  L.push(`## Never rendered — instrumented but never on screen`);
  L.push(`Usually buried behind a collapsed panel or a filter nobody sets:`);
  if (r.neverRendered.length) for (const n of r.neverRendered) L.push(`- ${n.label} (${n.panel})${prot(n.id)}`);
  else L.push(`- (none)`);
  L.push("");
  L.push(`## Dead ends — used once, never again`);
  if (r.deadEnds.length) for (const d of r.deadEnds) L.push(`- ${d.label}${prot(d.id)}`);
  else L.push(`- (none)`);
  if (r.rageClicks.length) { L.push(""); L.push(`## Rage clicks — UI that lies about what's clickable`); for (const rc of r.rageClicks) L.push(`- ${rc.label} — ${rc.count}× rapid clicks on a non-interactive target`); }
  L.push("");
  L.push(`## Your task`);
  L.push(`Propose a SIMPLIFIED layout for ${r.surface} as a DIFF against layout ${r.layoutVersion}, with a one-line rationale per change. Prefer collapsing/hiding over deleting; nothing on the protected list is a candidate. Make NO code changes until I approve the diff.`);
  return L.join("\n");
}
