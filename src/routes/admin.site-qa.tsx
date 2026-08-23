// /admin/site-qa — Survive Site QA cockpit.
//
// Answers, at a glance: what page templates exist, what changed, what needs
// verifying, what's actually used, and the exact links to open to test. It
// combines Survive's own QA state (verification, examples) with PostHog
// (traffic), Sentry (errors) and Vercel (deploy) — it does NOT re-implement any
// of them; deep dives link out. See SITE_QA_IMPLEMENTATION.md.
//
// Access: wrapped in AdminGate (client deterrent) AND every server call is
// admin-gated server-side (assertAdmin). Analytics/Sentry/Vercel outages degrade
// to "unavailable" — the template QA core keeps working.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast, Toaster } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FlaskConical,
  MoreHorizontal,
  Pin,
  RefreshCw,
  Search,
} from "lucide-react";

import { AdminGate, adminEmailFor, getAdminWho } from "@/components/AdminGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { QA_STATUS_META, type QaStatus } from "@/lib/site-qa/status";
import type { QaExample, SiteQaOverview, TemplateView, TrafficView } from "@/lib/site-qa/types";
import {
  getSiteQaOverview,
  getSiteQaTraffic,
  setTemplatePins,
  verifyTemplate as verifyTemplateFn,
} from "@/lib/site-qa.functions";

export const Route = createFileRoute("/admin/site-qa")({
  head: () => ({
    meta: [{ title: "Site QA — Survive" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: SiteQaPage,
});

// ── small helpers ────────────────────────────────────────────────────────────

function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function nfmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(n);
}

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

function testModeUrl(path: string): string {
  const who = getAdminWho() ?? "lee";
  const email = adminEmailFor(who);
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}feedback=1&t=${who}&email=${encodeURIComponent(email)}&testmode=1`;
}

function copy(path: string) {
  try {
    void navigator.clipboard.writeText(ORIGIN + path);
    toast.success("Link copied", { description: ORIGIN + path });
  } catch {
    toast.error("Couldn't copy");
  }
}

function StatusPill({ status }: { status: QaStatus }) {
  const m = QA_STATUS_META[status];
  const bg =
    status === "error"
      ? "bg-red-50 border-red-200"
      : status === "changed"
        ? "bg-amber-50 border-amber-200"
        : status === "verified"
          ? "bg-emerald-50 border-emerald-200"
          : "bg-slate-50 border-slate-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${bg} ${m.tone}`}
    >
      <span aria-hidden>{m.dot}</span>
      {m.label}
    </span>
  );
}

// ── the page ──────────────────────────────────────────────────────────────────

function SiteQaPage() {
  return (
    <AdminGate>
      <div className="min-h-screen bg-background text-foreground">
        <Toaster position="top-center" richColors />
        <SiteQaInner />
      </div>
    </AdminGate>
  );
}

function SiteQaInner() {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState("needs");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  const overviewQ = useQuery({
    queryKey: ["siteqa", "overview"],
    enabled: !!token,
    queryFn: () => getSiteQaOverview({ data: { accessToken: token! } }),
    staleTime: 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["siteqa", "overview"] });

  if (!token) {
    return <CenterNote>Sign in with an admin account to load Site QA.</CenterNote>;
  }
  if (overviewQ.isLoading) return <CenterNote>Loading Site QA…</CenterNote>;
  if (overviewQ.isError || !overviewQ.data) {
    return (
      <CenterNote tone="error">Couldn't load Site QA. You may not have admin access.</CenterNote>
    );
  }
  const overview = overviewQ.data;
  const byId = Object.fromEntries(overview.templates.map((t) => [t.id, t]));
  const selectedT = selected ? byId[selected] : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Header
        overview={overview}
        onRefresh={() => overviewQ.refetch()}
        refreshing={overviewQ.isFetching}
      />

      <Tabs value={tab} onValueChange={setTab} className="mt-5">
        <TabsList className="grid w-full grid-cols-4 sm:inline-flex sm:w-auto">
          <TabsTrigger value="needs">
            Needs review
            <Count n={overview.templates.filter((t) => t.status !== "verified").length} />
          </TabsTrigger>
          <TabsTrigger value="changed">
            Recently changed
            <Count n={overview.summary.changed} />
          </TabsTrigger>
          <TabsTrigger value="all">All pages</TabsTrigger>
          <TabsTrigger value="traffic">Traffic</TabsTrigger>
        </TabsList>

        <TabsContent value="needs" className="mt-4">
          <TemplateList
            templates={overview.templates.filter((t) => t.status !== "verified")}
            onOpenDetail={setSelected}
            onVerified={invalidate}
            token={token}
            emptyText="Nothing needs review. Every template is verified against the current build. 🎉"
          />
        </TabsContent>

        <TabsContent value="changed" className="mt-4">
          <TemplateList
            templates={[...overview.templates].sort(
              (a, b) => new Date(b.changedAt ?? 0).getTime() - new Date(a.changedAt ?? 0).getTime(),
            )}
            onOpenDetail={setSelected}
            onVerified={invalidate}
            token={token}
            showChanged
          />
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <AllPages
            overview={overview}
            search={search}
            setSearch={setSearch}
            onOpenDetail={setSelected}
          />
        </TabsContent>

        <TabsContent value="traffic" className="mt-4">
          <TrafficTab token={token} active={tab === "traffic"} />
        </TabsContent>
      </Tabs>

      <Sheet open={!!selectedT} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selectedT && (
            <TemplateDetail
              t={selectedT}
              overview={overview}
              token={token}
              onChanged={invalidate}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Count({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] font-bold tabular-nums text-muted-foreground">
      {n}
    </span>
  );
}

function CenterNote({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <p className={`text-sm ${tone === "error" ? "text-red-600" : "text-muted-foreground"}`}>
        {children}
      </p>
    </div>
  );
}

// ── header ────────────────────────────────────────────────────────────────────

function Header({
  overview,
  onRefresh,
  refreshing,
}: {
  overview: SiteQaOverview;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const s = overview.summary;
  const d = overview.deploy;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-black tracking-tight">Site QA</h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
          <b className="text-foreground">{s.templates}</b> templates
          <Dot />
          <b className="text-foreground">{s.changed}</b> changed
          {s.needsAttention > 0 && (
            <>
              <Dot />
              <span className="font-semibold text-red-600">{s.needsAttention} needs attention</span>
            </>
          )}
        </div>
        <button
          onClick={onRefresh}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
        {s.visits != null ? (
          <>
            <b className="text-foreground">{s.visits.toLocaleString()}</b> visits (30d)
            <Dot />
          </>
        ) : null}
        <b className="text-foreground">{s.campus}</b> campuses
        <Dot />
        <b className="text-foreground">{s.greekChapter.toLocaleString()}</b> Greek pages
        <Dot />
        <b className="text-foreground">{s.nationalOrg}</b> national orgs
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {d.available ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
            <span
              className={`h-2 w-2 rounded-full ${d.state === "READY" || !d.state ? "bg-emerald-500" : d.state === "ERROR" ? "bg-red-500" : "bg-amber-500"}`}
            />
            Latest deploy {d.createdAt ? ago(new Date(d.createdAt).toISOString()) : ""}{" "}
            {d.state ? `· ${d.state}` : ""}
            {d.inspectorUrl && (
              <a
                href={d.inspectorUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:underline"
              >
                View <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </span>
        ) : null}
        <IntegrationChip label="PostHog" ok={overview.integrations.posthog} />
        <IntegrationChip label="Sentry" ok={overview.integrations.sentry} />
        <IntegrationChip label="Vercel" ok={overview.integrations.vercel} />
      </div>
    </div>
  );
}

function Dot() {
  return <span className="text-muted-foreground/40">·</span>;
}

function IntegrationChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}
      title={ok ? `${label} connected` : `${label} not configured`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-slate-300"}`} />
      {label}
    </span>
  );
}

// ── template list + row ────────────────────────────────────────────────────────

function TemplateList({
  templates,
  onOpenDetail,
  onVerified,
  token,
  showChanged,
  emptyText,
}: {
  templates: TemplateView[];
  onOpenDetail: (id: string) => void;
  onVerified: () => void;
  token: string;
  showChanged?: boolean;
  emptyText?: string;
}) {
  if (templates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyText ?? "Nothing here."}
      </p>
    );
  }
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {templates.map((t) => (
        <TemplateRow
          key={t.id}
          t={t}
          onOpenDetail={onOpenDetail}
          onVerified={onVerified}
          token={token}
          showChanged={showChanged}
        />
      ))}
    </div>
  );
}

function TemplateRow({
  t,
  onOpenDetail,
  onVerified,
  token,
  showChanged,
}: {
  t: TemplateView;
  onOpenDetail: (id: string) => void;
  onVerified: () => void;
  token: string;
  showChanged?: boolean;
}) {
  const verify = useMutation({
    mutationFn: () => verifyTemplateFn({ data: { accessToken: token, templateId: t.id } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`${t.label} marked verified`);
        onVerified();
      } else toast.error(r.error ?? "Couldn't save");
    },
    onError: () => toast.error("Couldn't save"),
  });
  const primary = t.examples[0];

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 sm:px-4">
      <button className="min-w-0 flex-1 text-left" onClick={() => onOpenDetail(t.id)}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-semibold">{t.label}</span>
          {t.internal && (
            <span className="rounded bg-muted px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              internal
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {showChanged ? `changed ${ago(t.changedAt)}` : `updated ${ago(t.changedAt)}`}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <StatusPill status={t.status} />
          <span className="tabular-nums">{t.pagesLabel}</span>
          {t.views != null && (
            <>
              <Dot />
              <span className="tabular-nums">{nfmt(t.views)} views</span>
            </>
          )}
          {t.recentErrors != null && t.recentErrors > 0 && (
            <>
              <Dot />
              <span className="inline-flex items-center gap-0.5 font-semibold text-red-600">
                <AlertTriangle className="h-3 w-3" /> {t.recentErrors} errors
              </span>
            </>
          )}
          {primary && <span className="truncate text-muted-foreground/80">· {primary.label}</span>}
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {primary && (
          <a
            href={primary.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {t.status !== "verified" && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            disabled={verify.isPending}
            onClick={() => verify.mutate()}
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Verify
          </Button>
        )}
        <RowMenu t={t} />
      </div>
    </div>
  );
}

function RowMenu({ t }: { t: TemplateView }) {
  const primary = t.examples[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="More">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {primary && (
          <DropdownMenuItem onClick={() => copy(primary.url)}>
            <Copy className="mr-2 h-4 w-4" /> Copy link
          </DropdownMenuItem>
        )}
        {t.testMode && primary && (
          <DropdownMenuItem asChild>
            <a href={testModeUrl(primary.url)} target="_blank" rel="noreferrer">
              <FlaskConical className="mr-2 h-4 w-4" /> Open in Test Mode
            </a>
          </DropdownMenuItem>
        )}
        {t.examples.length > 1 && <DropdownMenuSeparator />}
        {t.examples.slice(1).map((e) => (
          <DropdownMenuItem key={e.url} asChild>
            <a href={e.url} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" /> {e.label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── all pages (search) ─────────────────────────────────────────────────────────

interface SearchHit {
  key: string;
  label: string;
  type: string;
  url: string | null;
  templateId: string;
}

function AllPages({
  overview,
  search,
  setSearch,
  onOpenDetail,
}: {
  overview: SiteQaOverview;
  search: string;
  setSearch: (v: string) => void;
  onOpenDetail: (id: string) => void;
}) {
  const hits = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: SearchHit[] = [];
    for (const t of overview.templates) {
      out.push({ key: `t:${t.id}`, label: t.label, type: t.category, url: null, templateId: t.id });
      for (const e of t.examples)
        out.push({
          key: `e:${e.url}`,
          label: e.label,
          type: t.label,
          url: e.url,
          templateId: t.id,
        });
    }
    if (!q) return out;
    return out.filter((h) => `${h.label} ${h.type} ${h.url ?? ""}`.toLowerCase().includes(q));
  }, [overview, search]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pages — campus, chapter, org, route…"
          className="pl-9"
        />
      </div>
      <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {hits.slice(0, 200).map((h) => (
          <div key={h.key} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/40 sm:px-4">
            <button className="min-w-0 flex-1 text-left" onClick={() => onOpenDetail(h.templateId)}>
              <div className="truncate text-sm font-medium">{h.label}</div>
              <div className="truncate text-xs text-muted-foreground">
                {h.type}
                {h.url ? ` · ${h.url}` : ""}
              </div>
            </button>
            {h.url && (
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={h.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  onClick={() => copy(h.url!)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                  aria-label="Copy"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ))}
        {hits.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No pages match "{search}".
          </p>
        )}
      </div>
    </div>
  );
}

// ── traffic tab ────────────────────────────────────────────────────────────────

const WINDOWS: { label: string; days: number }[] = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "Semester", days: 120 },
];

function TrafficTab({ token, active }: { token: string; active: boolean }) {
  const [days, setDays] = useState(7);
  const q = useQuery({
    queryKey: ["siteqa", "traffic", days],
    enabled: active && !!token,
    queryFn: () => getSiteQaTraffic({ data: { accessToken: token, days } }),
    staleTime: 60_000,
  });

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setDays(w.days)}
              className={`px-3 py-1 text-xs font-medium ${days === w.days ? "bg-foreground text-background" : "hover:bg-accent"}`}
            >
              {w.label}
            </button>
          ))}
        </div>
        {q.data?.appUrls && (
          <div className="ml-auto flex items-center gap-2 text-xs">
            <a
              href={q.data.appUrls.webAnalytics}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-medium underline-offset-2 hover:underline"
            >
              View analytics <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={q.data.appUrls.replays}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-medium underline-offset-2 hover:underline"
            >
              Watch replays <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {q.isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading traffic…</p>}
      {q.data && !q.data.available && (
        <p className="mt-6 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Analytics unavailable{q.data.reason ? ` (${q.data.reason})` : ""}. Configure PostHog to
          see traffic — see SITE_QA_IMPLEMENTATION.md.
        </p>
      )}
      {q.data && q.data.available && <TrafficBody data={q.data} />}
    </div>
  );
}

function TrafficBody({ data }: { data: TrafficView }) {
  const maxTpl = Math.max(1, ...data.templates.map((t) => t.views));
  return (
    <div className="mt-4 grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          By page type
        </h3>
        <div className="space-y-1.5">
          {data.templates.slice(0, 14).map((t) => (
            <div key={t.templateId} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-sm">{t.label}</span>
              <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-primary/70"
                  style={{ width: `${(t.views / maxTpl) * 100}%` }}
                />
              </div>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {t.views.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Most visited pages
        </h3>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {data.pages.slice(0, 20).map((p) => (
            <div key={p.path} className="flex items-center gap-2 px-3 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{p.path || "/"}</div>
                <div className="truncate text-[11px] text-muted-foreground">{p.label}</div>
              </div>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {p.views.toLocaleString()}
              </span>
              <a
                href={p.path || "/"}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent"
                aria-label="Open"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── detail drawer ──────────────────────────────────────────────────────────────

function TemplateDetail({
  t,
  overview,
  token,
  onChanged,
}: {
  t: TemplateView;
  overview: SiteQaOverview;
  token: string;
  onChanged: () => void;
}) {
  const [note, setNote] = useState(t.note ?? "");
  const verify = useMutation({
    mutationFn: () =>
      verifyTemplateFn({
        data: { accessToken: token, templateId: t.id, note: note.trim() || null },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`${t.label} marked verified`);
        onChanged();
      } else toast.error(r.error ?? "Couldn't save");
    },
  });
  const pin = useMutation({
    mutationFn: (pins: QaExample[]) =>
      setTemplatePins({ data: { accessToken: token, templateId: t.id, pins } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Examples updated");
        onChanged();
      } else toast.error(r.error ?? "Couldn't save");
    },
  });

  return (
    <>
      <SheetHeader className="px-1">
        <SheetTitle className="flex items-center gap-2">
          {t.label}
          {t.internal && (
            <span className="rounded bg-muted px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              internal
            </span>
          )}
        </SheetTitle>
      </SheetHeader>

      <div className="space-y-5 px-1 py-2 text-sm">
        <p className="text-muted-foreground">{t.description}</p>
        <div className="flex items-center gap-2">
          <StatusPill status={t.status} />
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{t.routePattern}</code>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Live pages" value={t.pagesLabel} />
          <Stat label="30-day views" value={t.views != null ? t.views.toLocaleString() : "—"} />
          <Stat label="Source changed" value={ago(t.changedAt)} />
          <Stat
            label="Last verified"
            value={
              t.verifiedAt
                ? `${ago(t.verifiedAt)}${t.verifiedBy ? ` · ${t.verifiedBy}` : ""}`
                : "Never"
            }
          />
          <Stat
            label="Recent errors"
            value={t.recentErrors == null ? "—" : String(t.recentErrors)}
            tone={t.recentErrors ? "error" : undefined}
          />
          <Stat label="Verified build" value={t.verifiedSha ? t.verifiedSha.slice(0, 7) : "—"} />
        </div>

        {/* Examples */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Test these
            </h4>
            {t.hasPins && (
              <button
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => pin.mutate([])}
              >
                Reset to defaults
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {t.examples.length === 0 && (
              <p className="text-xs text-muted-foreground">No example pages yet.</p>
            )}
            {t.examples.map((e) => (
              <div
                key={e.url}
                className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{e.label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{e.url}</div>
                </div>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
                >
                  Open
                </a>
                <button
                  onClick={() => copy(e.url)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                  aria-label="Copy"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => pin.mutate([e])}
                  title="Pin as the default example"
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                >
                  <Pin className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {t.testMode && t.examples[0] && (
            <a
              href={testModeUrl(t.examples[0].url)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <FlaskConical className="h-4 w-4" /> Open in Test Mode
            </a>
          )}
        </div>

        {/* Deep links */}
        <div className="flex flex-wrap gap-2 text-xs">
          {overview.integrations.posthog && (
            <a
              href={`https://us.posthog.com`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium hover:bg-accent"
            >
              View analytics <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {overview.sentryIssuesUrl && (
            <a
              href={overview.sentryIssuesUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium hover:bg-accent"
            >
              View errors <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Note + verify */}
        <div>
          <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            QA note
          </h4>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Mobile topic rail still feels tight"
            maxLength={280}
          />
        </div>

        <Button className="w-full" disabled={verify.isPending} onClick={() => verify.mutate()}>
          <Check className="mr-1.5 h-4 w-4" /> Mark verified
        </Button>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "error" }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${tone === "error" ? "text-red-600" : ""}`}>
        {value}
      </div>
    </div>
  );
}
