// SERVER-ONLY. Read-side integrations for /admin/site-qa: PostHog (traffic),
// Sentry (errors), Vercel (deploys). Every function is defensive — a missing env
// var or a failed fetch returns { available: false, reason } instead of throwing,
// so the cockpit shows "Analytics unavailable" and keeps working (spec §29).
//
// Secret tokens are read from process.env INSIDE the functions and never
// returned to the client. This module must only be imported from server
// handlers (it is a *.server.ts; the *.functions.ts wrapper dynamic-imports it).

import { classifyPath } from "./classify";

// ── PostHog (product traffic) ──────────────────────────────────────────────

export interface TrafficRow {
  path: string;
  views: number;
  templateId: string | null;
}
export interface PostHogTraffic {
  available: boolean;
  reason?: string;
  rows: TrafficRow[];
  appUrls?: { insights: string; replays: string; webAnalytics: string };
}

/** Host for the PostHog QUERY api + app links (us.posthog.com), distinct from
 *  the ingestion host (us.i.posthog.com) the browser SDK uses. */
function posthogApiHost(): string {
  return process.env.POSTHOG_API_HOST || "https://us.posthog.com";
}

export function posthogConfigured(): boolean {
  return Boolean(process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID);
}

/** Top pages by pageviews over the last `days`, classified to templates. */
export async function getPostHogTraffic(days: number): Promise<PostHogTraffic> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!key || !projectId) return { available: false, reason: "not configured", rows: [] };
  const host = posthogApiHost();
  const windowDays = Math.max(1, Math.min(365, Math.floor(days)));
  // HogQL: pageviews grouped by pathname. Interval is interpolated as an integer
  // (validated above) — no user input reaches the query string.
  const query = `SELECT properties.$pathname AS path, count() AS views
    FROM events
    WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${windowDays} DAY
    GROUP BY path ORDER BY views DESC LIMIT 500`;
  try {
    const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    });
    if (!res.ok) return { available: false, reason: `PostHog ${res.status}`, rows: [] };
    const json = (await res.json()) as { results?: [string, number][] };
    const rows: TrafficRow[] = (json.results ?? [])
      .filter((r) => Array.isArray(r) && typeof r[0] === "string")
      .map(([path, views]) => ({
        path,
        views: Number(views) || 0,
        templateId: classifyPath(path),
      }));
    return {
      available: true,
      rows,
      appUrls: {
        insights: `${host}/project/${projectId}/insights`,
        replays: `${host}/project/${projectId}/replay`,
        webAnalytics: `${host}/project/${projectId}/web`,
      },
    };
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : "fetch failed", rows: [] };
  }
}

// ── Sentry (errors) ────────────────────────────────────────────────────────

export interface SentryErrors {
  available: boolean;
  reason?: string;
  /** template id → recent error event count (best-effort mapping). */
  byTemplate: Record<string, number>;
  /** Errors that couldn't be mapped to a template. */
  unmapped: number;
  total: number;
  issuesUrl?: string;
}

export function sentryConfigured(): boolean {
  return Boolean(
    process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
  );
}

/** Extract a candidate URL path from an issue and classify it. Front-end errors
 *  usually carry the route in `culprit`/`title`/`metadata`; we scan for the
 *  first "/…" token. Best-effort — unmapped errors are still surfaced as a
 *  total. To get exact per-template counts, tag Sentry events with the route. */
function templateForIssue(issue: Record<string, unknown>): string | null {
  const md = (issue.metadata ?? {}) as Record<string, unknown>;
  const candidates = [issue.culprit, issue.title, md.value, md.filename].filter(
    (v): v is string => typeof v === "string",
  );
  for (const c of candidates) {
    const m = c.match(/\/[A-Za-z0-9\-_/$.]+/);
    if (m) {
      const id = classifyPath(m[0]);
      if (id) return id;
    }
  }
  return null;
}

/** Recent unresolved issues, bucketed to templates where possible. */
export async function getSentryErrors(statsPeriod = "24h"): Promise<SentryErrors> {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  const host = process.env.SENTRY_HOST || "https://sentry.io";
  if (!token || !org || !project) {
    return { available: false, reason: "not configured", byTemplate: {}, unmapped: 0, total: 0 };
  }
  const period = /^\d+[hd]$/.test(statsPeriod) ? statsPeriod : "24h";
  try {
    const url = `${host}/api/0/projects/${org}/${project}/issues/?statsPeriod=${period}&query=is:unresolved&limit=100`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok)
      return {
        available: false,
        reason: `Sentry ${res.status}`,
        byTemplate: {},
        unmapped: 0,
        total: 0,
      };
    const issues = (await res.json()) as Record<string, unknown>[];
    const byTemplate: Record<string, number> = {};
    let unmapped = 0;
    let total = 0;
    for (const issue of issues) {
      const count = Number(issue.count) || 0;
      total += count;
      const id = templateForIssue(issue);
      if (id) byTemplate[id] = (byTemplate[id] ?? 0) + count;
      else unmapped += count;
    }
    return {
      available: true,
      byTemplate,
      unmapped,
      total,
      issuesUrl: `${host}/organizations/${org}/issues/?project=&query=is%3Aunresolved&statsPeriod=${period}`,
    };
  } catch (e) {
    return {
      available: false,
      reason: e instanceof Error ? e.message : "fetch failed",
      byTemplate: {},
      unmapped: 0,
      total: 0,
    };
  }
}

// ── Vercel (deploys) ───────────────────────────────────────────────────────

export interface VercelDeploy {
  available: boolean;
  reason?: string;
  state?: string; // READY | BUILDING | ERROR | ...
  createdAt?: number; // epoch ms
  url?: string;
  sha?: string;
  inspectorUrl?: string;
}

/** The commit this running build was built from. Vercel injects this at build
 *  time; available without any API token. Used as the "deployed sha" fallback. */
export function currentDeployedSha(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA || null;
}

export function vercelConfigured(): boolean {
  return Boolean(process.env.VERCEL_API_TOKEN);
}

/** Latest production deployment via the Vercel REST API. */
export async function getLatestVercelDeploy(): Promise<VercelDeploy> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) {
    // No token: still surface the build sha from env, if present.
    const sha = currentDeployedSha();
    return sha
      ? { available: true, sha, reason: "sha from build env (no API token)" }
      : { available: false, reason: "not configured" };
  }
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  const params = new URLSearchParams({ limit: "1", target: "production" });
  if (projectId) params.set("projectId", projectId);
  if (teamId) params.set("teamId", teamId);
  try {
    const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { available: false, reason: `Vercel ${res.status}` };
    const json = (await res.json()) as { deployments?: Record<string, unknown>[] };
    const d = json.deployments?.[0];
    if (!d) return { available: false, reason: "no deployments" };
    const meta = (d.meta ?? {}) as Record<string, unknown>;
    return {
      available: true,
      state: (d.state as string) || (d.readyState as string) || undefined,
      createdAt: Number(d.created) || Number(d.createdAt) || undefined,
      url: (d.url as string) || undefined,
      sha: (meta.githubCommitSha as string) || currentDeployedSha() || undefined,
      inspectorUrl: (d.inspectorUrl as string) || undefined,
    };
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : "fetch failed" };
  }
}
