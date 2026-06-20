// Batch Scrape (V2) — the product experience in one screen:
//   pick campuses → choose a target vertical → see a quote + margin →
//   run the batch → watch progress → preview results.
//
// The RUN is orchestrated here on the client by reusing the exact
// discover → faculty → rmp sequence the single-campus auto-scrape uses, with a
// small concurrency pool. No new orchestration backend. Keep this tab open
// while a batch runs (same as the single-campus auto-scrape).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft, Play, RotateCcw, Download, Loader2, CheckCircle2, XCircle,
  Circle, Search, DollarSign,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchCampuses } from "@/lib/outreach-api";
import type { Campus } from "@/lib/outreach-mock";
import { autoDiscoverCampusUrls } from "@/lib/auto-scrape.functions";
import { scrapeCampusFaculty } from "@/lib/faculty-scrape.functions";
import { scrapeCampusRmp } from "@/lib/rmp-scrape.functions";
import { resetAllScrapedLeads } from "@/lib/batch-scrape.functions";
import { listVerticals, getVertical, DEFAULT_VERTICAL_ID } from "@/lib/verticals";
import {
  EST_COST_PER_CAMPUS_USD, estimateBatchQuoteUsd, estimateRunCostUsd, formatUsd,
} from "@/lib/scrape-cost";
import { supabase } from "@/integrations/supabase/client";
import { V2Badge } from "@/components/outreach/V2Badge";
import scraperContextMd from "@/content/SCRAPER_CONTEXT.md?raw";

type RunStatus = "pending" | "running" | "done" | "error";
type CampusProgress = {
  status: RunStatus;
  leads?: number;
  emails?: number;
  costUsd?: number;
  error?: string;
};

// Loose shapes for the server-fn return values (kept permissive on purpose).
type DiscoverResult = { facultyUrls?: string[]; rmpUrl?: string | null };
type FacultyResult = {
  inserted?: number;
  perPage?: Array<{ withEmail?: number; enrichOutcomes?: Array<{ result: string }>; pagination?: { pagesWalked?: number } }>;
};

export function BatchScrapePanel() {
  const campusQuery = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: 1 });

  const discover = useServerFn(autoDiscoverCampusUrls);
  const facultyFn = useServerFn(scrapeCampusFaculty);
  const rmpFn = useServerFn(scrapeCampusRmp);
  const resetFn = useServerFn(resetAllScrapedLeads);

  const [vertical, setVertical] = useState<string>(DEFAULT_VERTICAL_ID);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sellPrice, setSellPrice] = useState<number>(5);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Record<string, CampusProgress>>({});
  const [summary, setSummary] = useState<
    { campuses: number; leads: number; emails: number; costUsd: number; errors: number } | null
  >(null);

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const activeVertical = getVertical(vertical);

  // Only non-archived campuses are scrapeable; filter by the search box.
  const campuses = useMemo(() => {
    const all = (campusQuery.data ?? []) as Campus[];
    const live = all.filter((c) => !c.archived);
    const q = search.trim().toLowerCase();
    if (!q) return live;
    return live.filter(
      (c) =>
        c.school_name.toLowerCase().includes(q) ||
        (c.state ?? "").toLowerCase().includes(q),
    );
  }, [campusQuery.data, search]);

  const campusById = useMemo(() => {
    const m = new Map<string, Campus>();
    for (const c of (campusQuery.data ?? []) as Campus[]) m.set(c.id, c);
    return m;
  }, [campusQuery.data]);

  const count = selected.size;
  const estCost = estimateBatchQuoteUsd(count);
  const revenue = count * (Number.isFinite(sellPrice) ? sellPrice : 0);
  const margin = revenue - estCost;
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
  const canRun = activeVertical.status === "live" && count > 0 && !running;

  const allFilteredSelected =
    campuses.length > 0 && campuses.every((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const c of campuses) next.delete(c.id);
      } else {
        for (const c of campuses) next.add(c.id);
      }
      return next;
    });
  }

  async function runOne(campusId: string): Promise<CampusProgress> {
    setProgress((p) => ({ ...p, [campusId]: { status: "running" } }));
    try {
      const found = (await discover({ data: { campusId } })) as DiscoverResult;
      let leads = 0;
      let emails = 0;
      let costUsd = 0;
      if (found.facultyUrls && found.facultyUrls.length > 0) {
        const r = (await facultyFn({
          data: { campusId, urls: found.facultyUrls, allowNoContact: true },
        })) as FacultyResult;
        leads += r.inserted ?? 0;
        emails += (r.perPage ?? []).reduce((s, p) => s + (p.withEmail ?? 0), 0);
        costUsd += estimateRunCostUsd(r.perPage ?? []);
      }
      if (found.rmpUrl) {
        try {
          await rmpFn({ data: { campusId, urls: [found.rmpUrl] } });
        } catch {
          /* RMP is best-effort; never fail the campus on it */
        }
      }
      const done: CampusProgress = { status: "done", leads, emails, costUsd };
      setProgress((p) => ({ ...p, [campusId]: done }));
      return done;
    } catch (e) {
      const err: CampusProgress = {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      };
      setProgress((p) => ({ ...p, [campusId]: err }));
      return err;
    }
  }

  async function runBatch() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (activeVertical.status !== "live") {
      toast.error(`${activeVertical.label} isn't tuned yet — assign it as a project first.`);
      return;
    }
    setRunning(true);
    setSummary(null);
    setProgress(Object.fromEntries(ids.map((id) => [id, { status: "pending" as RunStatus }])));

    const queue = [...ids];
    let leads = 0;
    let emails = 0;
    let costUsd = 0;
    let errors = 0;

    const CONCURRENCY = 2;
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) break;
        const res = await runOne(id);
        leads += res.leads ?? 0;
        emails += res.emails ?? 0;
        costUsd += res.costUsd ?? 0;
        if (res.status === "error") errors++;
      }
    });
    await Promise.all(workers);

    const result = { campuses: ids.length, leads, emails, costUsd, errors };
    setSummary(result);
    setRunning(false);

    // Best-effort: persist the batch as an "order" record. Silently no-ops if
    // the scrape_batches table hasn't been created yet (apply the migration).
    try {
      await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
        .from("scrape_batches")
        .insert({
          vertical,
          campus_ids: ids,
          campus_count: ids.length,
          est_cost_usd: estimateBatchQuoteUsd(ids.length),
          actual_cost_usd: costUsd,
          leads_inserted: leads,
          status: errors > 0 ? "completed_with_errors" : "completed",
        });
    } catch {
      /* table not present yet — fine */
    }

    toast.success(
      `Batch done · ${leads} leads · ${emails} emails${errors ? ` · ${errors} error(s)` : ""}`,
    );
  }

  async function doReset() {
    setResetting(true);
    try {
      const r = (await (resetFn as unknown as () => Promise<{ deletedLeads: number; deletedSuggestions: number }>)());
      toast.success(`Reset complete — removed ${r.deletedSuggestions} suggestions, ${r.deletedLeads} leads.`);
      setSelected(new Set());
      setProgress({});
      setSummary(null);
    } catch (e) {
      toast.error(`Reset failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setResetting(false);
      setConfirmingReset(false);
    }
  }

  function downloadContext() {
    const blob = new Blob([scraperContextMd], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "SCRAPER_CONTEXT.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Downloaded SCRAPER_CONTEXT.md");
  }

  const doneCount = Object.values(progress).filter((p) => p.status === "done" || p.status === "error").length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <Link to="/outreach/leadfinder" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold">Batch Scrape</h1>
        <V2Badge />
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5 text-xs"
          onClick={downloadContext}
        >
          <Download className="h-3.5 w-3.5" />
          Download context (.md)
        </Button>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Pick the campuses to scrape, choose what you're targeting, and you'll get an instant cost
        quote + margin before you run. This is the same flow you'd sell to a customer.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* LEFT: target + campus selection */}
        <div className="space-y-5">
          {/* Vertical / target picker */}
          <section className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-medium">1. What are you targeting?</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {listVerticals().map((v) => {
                const isActive = v.id === vertical;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVertical(v.id)}
                    className={`flex-1 min-w-[200px] rounded-md border p-3 text-left transition ${
                      isActive ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{v.label}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                          v.status === "live"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {v.status === "live" ? "Live" : "In dev"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{v.description}</p>
                    <p className="mt-1 text-[11px] italic text-muted-foreground/80">{v.deliveryNote}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Campus selection */}
          <section className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-medium">2. Pick campuses</h2>
              <span className="text-xs text-muted-foreground">({count} selected)</span>
              <button
                type="button"
                onClick={toggleAllFiltered}
                disabled={campuses.length === 0}
                className="ml-auto text-xs text-primary hover:underline disabled:opacity-50"
              >
                {allFilteredSelected ? "Clear filtered" : "Select all filtered"}
              </button>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name or state…"
                className="w-full rounded-md border bg-background py-1.5 pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border">
              {campusQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading campuses…
                </div>
              ) : campuses.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No campuses match.</div>
              ) : (
                campuses.map((c) => {
                  const p = progress[c.id];
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-sm last:border-b-0 hover:bg-accent/50"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        disabled={running}
                        className="h-3.5 w-3.5"
                      />
                      <span className="flex-1 truncate">{c.school_name}</span>
                      {c.state ? <span className="text-xs text-muted-foreground">{c.state}</span> : null}
                      {p ? <StatusDot status={p.status} leads={p.leads} /> : null}
                    </label>
                  );
                })
              )}
            </div>
          </section>

          {/* Progress / results */}
          {(running || summary) && (
            <section className="rounded-lg border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-medium">Run progress</h2>
                <span className="text-xs text-muted-foreground">
                  {doneCount}/{Object.keys(progress).length} done
                </span>
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : null}
              </div>
              {summary && (
                <div className="mb-3 grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-3 text-center text-sm">
                  <Stat label="Leads" value={summary.leads.toLocaleString()} />
                  <Stat label="With email" value={summary.emails.toLocaleString()} />
                  <Stat label="Actual cost" value={formatUsd(summary.costUsd, 2)} />
                </div>
              )}
              {summary && (
                <div className="flex items-center gap-3">
                  <Link
                    to="/outreach/leadfinder"
                    className="text-sm text-primary hover:underline"
                  >
                    → Review &amp; import leads in Lead Finder
                  </Link>
                  {summary.errors > 0 ? (
                    <span className="text-xs text-red-600">{summary.errors} campus error(s)</span>
                  ) : null}
                </div>
              )}
            </section>
          )}
        </div>

        {/* RIGHT: quote + actions */}
        <div className="space-y-4">
          <section className="sticky top-4 rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-medium">3. Quote</h2>
            </div>
            <dl className="space-y-1.5 text-sm">
              <QuoteRow k="Campuses" v={String(count)} />
              <QuoteRow k={`Your cost (~${formatUsd(EST_COST_PER_CAMPUS_USD)}/ea)`} v={formatUsd(estCost, 2)} />
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">Sell price / campus</span>
                <div className="flex items-center">
                  <span className="text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={sellPrice}
                    onChange={(e) => setSellPrice(parseFloat(e.target.value))}
                    className="w-16 rounded border bg-background px-1 py-0.5 text-right text-sm outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="my-1 border-t" />
              <QuoteRow k="Revenue" v={formatUsd(revenue, 2)} />
              <QuoteRow
                k="Margin"
                v={`${formatUsd(margin, 2)} (${revenue > 0 ? marginPct.toFixed(0) : "—"}%)`}
                strong
                positive={margin >= 0}
              />
            </dl>
            <div className="mt-2 rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">
              Delivery: {activeVertical.deliveryNote}
            </div>

            <Button onClick={runBatch} disabled={!canRun} className="mt-4 w-full gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? "Running…" : `Run scrape (${count})`}
            </Button>
            {activeVertical.status !== "live" && (
              <p className="mt-2 text-center text-[11px] text-amber-600">
                This vertical needs tuning before it can run. Assign it as a project.
              </p>
            )}
          </section>

          {/* Utilities */}
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
              Utilities <V2Badge />
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Wipe all scraped leads (faculty + RMP) across every campus for a clean re-attempt.
              Does not touch manually-added leads.
            </p>
            {!confirmingReset ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-red-600 hover:text-red-700"
                onClick={() => setConfirmingReset(true)}
                disabled={running || resetting}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset all scraped leads
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={doReset}
                  disabled={resetting}
                >
                  {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Yes, delete all"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingReset(false)} disabled={resetting}>
                  Cancel
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status, leads }: { status: RunStatus; leads?: number }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  if (status === "done")
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {typeof leads === "number" ? leads : ""}
      </span>
    );
  if (status === "error") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />;
}

function QuoteRow({
  k, v, strong = false, positive = true,
}: { k: string; v: string; strong?: boolean; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span
        className={`font-mono tabular-nums ${strong ? "font-semibold" : ""} ${
          strong ? (positive ? "text-green-600" : "text-red-600") : ""
        }`}
      >
        {v}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-base font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export default BatchScrapePanel;
