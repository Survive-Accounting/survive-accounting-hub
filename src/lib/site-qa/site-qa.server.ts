// SERVER-ONLY orchestrator for /admin/site-qa. Assembles the overview (templates
// + status + counts + errors + deploy + traffic ranking) and the traffic view,
// combining Survive's own QA store with PostHog / Sentry / Vercel. Imported only
// by site-qa.functions.ts (inside handlers). Fails soft everywhere.

import versionData from "virtual:site-qa-versions";

import { TEMPLATES, TEMPLATES_BY_ID, type CountKey } from "./manifest";
import { deriveStatus, statusUrgency, type QaStatus } from "./status";
import {
  getCountsAndExamples,
  markVerified as storeMarkVerified,
  readVerifications,
  setNote as storeSetNote,
  setPins as storeSetPins,
  type PageCounts,
} from "./data.server";
import {
  currentDeployedSha,
  getLatestVercelDeploy,
  getPostHogTraffic,
  getSentryErrors,
  posthogConfigured,
  sentryConfigured,
  vercelConfigured,
} from "./integrations.server";
import type {
  QaExample,
  SiteQaOverview,
  TemplateTraffic,
  TemplateView,
  TrafficPageRow,
  TrafficView,
} from "./types";

// ── admin gate (server-enforced) ───────────────────────────────────────────

const ADMIN_EMAILS = ["lee@surviveaccounting.com", "king@surviveaccounting.com"];

export interface AdminIdentity {
  email: string;
}

/** Verify the caller is an admin by resolving their Supabase access token to an
 *  email on the allow-list. Throws on failure — the /admin/site-qa route is also
 *  behind the client AdminGate, but this is the real server-side check that
 *  guards every data read/write (spec §28). */
export async function assertAdmin(accessToken: string): Promise<AdminIdentity> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.getUser(accessToken);
  const email = (data?.user?.email ?? "").toLowerCase();
  if (!email || !ADMIN_EMAILS.includes(email)) throw new Error("Not authorized");
  return { email };
}

// ── helpers ────────────────────────────────────────────────────────────────

function pageCountFor(key: CountKey, counts: PageCounts, staticRoutes: number): number {
  switch (key) {
    case "campus":
      return counts.campus;
    case "greekChapter":
      return counts.greekChapter;
    case "council":
      return counts.council;
    case "nationalOrg":
      return counts.nationalOrg;
    case "foundationsScenario":
      return counts.foundationsScenario || staticRoutes;
    case "static":
      return staticRoutes;
  }
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function mergeExamples(pins: QaExample[], derived: QaExample[]): QaExample[] {
  const seen = new Set<string>();
  const out: QaExample[] = [];
  for (const e of [...pins, ...derived]) {
    if (!e?.url || seen.has(e.url)) continue;
    seen.add(e.url);
    out.push(e);
    if (out.length >= 4) break;
  }
  return out;
}

// ── overview ────────────────────────────────────────────────────────────────

export async function buildOverview(): Promise<SiteQaOverview> {
  // Fan out the independent reads; each is already fail-soft.
  const [verifications, countsAndExamples, sentry, deploy, traffic] = await Promise.all([
    readVerifications(),
    getCountsAndExamples(),
    getSentryErrors("24h"),
    getLatestVercelDeploy(),
    getPostHogTraffic(30),
  ]);
  const { counts, examplesByTemplate } = countsAndExamples;

  // Roll 30-day pageviews up to templates for ranking + the header total.
  const viewsByTemplate: Record<string, number> = {};
  let visits: number | null = null;
  if (traffic.available) {
    visits = 0;
    for (const row of traffic.rows) {
      visits += row.views;
      if (row.templateId)
        viewsByTemplate[row.templateId] = (viewsByTemplate[row.templateId] ?? 0) + row.views;
    }
  }

  const templates: TemplateView[] = TEMPLATES.map((t) => {
    const v = verifications[t.id];
    const ver = versionData.templates[t.id];
    const currentVersion = ver?.hash ?? null;
    const recentErrors = sentry.available ? (sentry.byTemplate[t.id] ?? 0) : null;
    const status: QaStatus = deriveStatus({
      currentVersion,
      verifiedVersion: v?.verified_version ?? null,
      verifiedAt: v?.verified_at ?? null,
      recentErrors,
    });
    const pages = pageCountFor(t.countKey, counts, t.routes.length);
    const pins = v?.pinned_examples ?? [];
    return {
      id: t.id,
      label: t.label,
      category: t.category,
      description: t.description,
      routePattern: t.routePattern,
      internal: Boolean(t.internal),
      testMode: Boolean(t.testMode),
      status,
      pages,
      pagesLabel: `${fmt(pages)} ${pages === 1 ? "page" : "pages"}`,
      verifiedAt: v?.verified_at ?? null,
      verifiedBy: v?.verified_by ?? null,
      verifiedSha: v?.verified_sha ?? null,
      note: v?.note ?? null,
      changedAt: ver?.changedAt ?? versionData.builtAt,
      recentErrors,
      views: traffic.available ? (viewsByTemplate[t.id] ?? 0) : null,
      examples: mergeExamples(pins, examplesByTemplate[t.id] ?? []),
      hasPins: pins.length > 0,
    };
  });

  // Default order = the "Needs review" priority: urgency, then traffic, then label.
  templates.sort(
    (a, b) =>
      statusUrgency(a.status) - statusUrgency(b.status) ||
      (b.views ?? 0) - (a.views ?? 0) ||
      a.label.localeCompare(b.label),
  );

  const changed = templates.filter((t) => t.status === "changed").length;
  const errors = templates.filter((t) => t.status === "error").length;

  return {
    generatedAt: new Date().toISOString(),
    builtAt: versionData.builtAt,
    summary: {
      templates: templates.length,
      changed,
      needsAttention: errors,
      campus: counts.campus,
      greekChapter: counts.greekChapter,
      council: counts.council,
      nationalOrg: counts.nationalOrg,
      campusesCovered: counts.campusesCovered,
      foundationsScenario: counts.foundationsScenario,
      visits,
    },
    deploy,
    integrations: {
      posthog: posthogConfigured(),
      sentry: sentryConfigured(),
      vercel: vercelConfigured(),
    },
    sentryIssuesUrl: sentry.available ? (sentry.issuesUrl ?? null) : null,
    sentryUnmapped: sentry.available ? sentry.unmapped : 0,
    templates,
  };
}

// ── traffic view ─────────────────────────────────────────────────────────────

export async function buildTraffic(days: number): Promise<TrafficView> {
  const t = await getPostHogTraffic(days);
  if (!t.available) return { available: false, reason: t.reason, days, pages: [], templates: [] };

  const labelFor = (id: string | null) => (id && TEMPLATES_BY_ID[id]?.label) || "Other";
  const pages: TrafficPageRow[] = t.rows.slice(0, 100).map((r) => ({
    path: r.path,
    views: r.views,
    templateId: r.templateId,
    label: labelFor(r.templateId),
  }));

  const rollup = new Map<string, number>();
  for (const r of t.rows) {
    const id = r.templateId ?? "__other__";
    rollup.set(id, (rollup.get(id) ?? 0) + r.views);
  }
  const templates: TemplateTraffic[] = [...rollup.entries()]
    .map(([id, views]) => ({
      templateId: id,
      label: id === "__other__" ? "Other / untracked" : labelFor(id),
      views,
    }))
    .sort((a, b) => b.views - a.views);

  return { available: true, days, pages, templates, appUrls: t.appUrls };
}

// ── mutations ────────────────────────────────────────────────────────────────

export function currentVersionHash(templateId: string): string | null {
  return versionData.templates[templateId]?.hash ?? null;
}

/** Mark a template verified against the CURRENT build (records its content hash
 *  + deployed sha), so a later source change flips it to "changed since verified". */
export function verifyTemplate(templateId: string, verifiedBy: string, note?: string | null) {
  return storeMarkVerified(templateId, {
    verifiedBy,
    verifiedVersion: currentVersionHash(templateId),
    verifiedSha: currentDeployedSha(),
    note: note ?? undefined,
  });
}

export { storeSetNote as setNote, storeSetPins as setPins };
