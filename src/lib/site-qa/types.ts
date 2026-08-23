// Public shapes returned by the Site QA server functions and consumed by the
// /admin/site-qa UI. Pure types — safe to import anywhere.
import type { TemplateCategory } from "./manifest";
import type { QaStatus } from "./status";

export interface QaExample {
  label: string;
  url: string;
}

export interface TemplateView {
  id: string;
  label: string;
  category: TemplateCategory;
  description: string;
  routePattern: string;
  internal: boolean;
  testMode: boolean;
  status: QaStatus;
  /** Live count of routable pages for this template (dynamic templates), or the
   *  number of fixed routes (static templates). */
  pages: number;
  /** Human label for `pages`, e.g. "2,317 pages" / "1 page". */
  pagesLabel: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verifiedSha: string | null;
  note: string | null;
  /** When the template's source last changed (build-time git), or null. */
  changedAt: string | null;
  /** Recent errors attributed to this template (Sentry), or null if unavailable. */
  recentErrors: number | null;
  /** 30-day pageviews for this template (PostHog roll-up), or null if unavailable. */
  views: number | null;
  examples: QaExample[];
  /** True when one or more examples are admin-pinned. */
  hasPins: boolean;
}

export interface SiteQaSummary {
  templates: number;
  changed: number;
  needsAttention: number; // error + never + changed
  campus: number;
  greekChapter: number;
  council: number;
  nationalOrg: number;
  campusesCovered: number;
  foundationsScenario: number;
  /** Total 30-day pageviews across the site (PostHog), or null if unavailable. */
  visits: number | null;
}

export interface DeployInfo {
  available: boolean;
  reason?: string;
  state?: string;
  createdAt?: number;
  sha?: string;
  inspectorUrl?: string;
}

export interface IntegrationStatus {
  posthog: boolean;
  sentry: boolean;
  vercel: boolean;
}

export interface SiteQaOverview {
  generatedAt: string;
  builtAt: string;
  summary: SiteQaSummary;
  deploy: DeployInfo;
  integrations: IntegrationStatus;
  sentryIssuesUrl: string | null;
  sentryUnmapped: number;
  templates: TemplateView[];
}

export interface TrafficPageRow {
  path: string;
  views: number;
  templateId: string | null;
  label: string;
}
export interface TemplateTraffic {
  templateId: string;
  label: string;
  views: number;
}
export interface TrafficView {
  available: boolean;
  reason?: string;
  days: number;
  pages: TrafficPageRow[];
  templates: TemplateTraffic[];
  appUrls?: { insights: string; replays: string; webAnalytics: string };
}
