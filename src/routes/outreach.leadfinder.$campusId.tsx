// /outreach/leadfinder/$campusId — minimal, focused page for scraping faculty
// and triaging leads on a single campus. Replaces the legacy ApproveCampusModal.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
// AdminGate + Toaster are provided by the /outreach layout.
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { ScrapeFacultyButton } from "@/components/outreach/ScrapeFacultyButton";
import { FacultyTriagePanel, type TriageStats } from "@/components/outreach/FacultyTriagePanel";
import { fetchCampuses } from "@/lib/outreach-api";
import { importKeptLeads } from "@/lib/faculty-triage";
import { supabase } from "@/integrations/supabase/client";
import { enqueueAllPendingCampuses, getFacultyBatchStatus, testAutoScrapeCampus } from "@/lib/faculty-overnight.functions";
import type { Campus } from "@/lib/outreach-mock";

const LOGO_URL =
  "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";

type NextFilter = "all" | "with_leads" | "without_leads" | "sec_only" | "highest_value";
const FILTER_LABELS: Record<NextFilter, string> = {
  all: "All",
  with_leads: "With leads",
  without_leads: "Without leads",
  sec_only: "SEC only 🏈",
  highest_value: "Highest value 💰",
};

const HISTORY_KEY = "sa-leadfinder-history";
const FILTER_KEY = "sa-leadfinder-filter";

function readHistory(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.sessionStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}
function writeHistory(ids: string[]) {
  try { window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(ids)); }
  catch { /* ignore */ }
}

function LeadOdometer({ value }: { value: number }) {
  const digits = String(Math.max(0, Math.min(999999, value))).padStart(6, "0").split("");
  return (
    <span className="inline-flex overflow-hidden rounded-sm border border-zinc-700/80 shadow-inner">
      {digits.map((d, i) => (
        <span
          key={i}
          className="inline-flex h-5 w-3.5 items-center justify-center bg-zinc-900 font-mono text-[11px] font-bold leading-none text-amber-300"
          style={{ borderRight: i < digits.length - 1 ? "1px solid #3f3f46" : undefined }}
        >
          {d}
        </span>
      ))}
    </span>
  );
}

export const Route = createFileRoute("/outreach/leadfinder/$campusId")({
  head: () => ({
    meta: [
      { title: "Lead Finder — Survive Accounting" },
      { name: "description", content: "Scrape faculty pages and triage campus leads." },
    ],
  }),
  component: LeadFinderPage,
});

function LeadFinderPage() {
  const { campusId } = Route.useParams();
  const navigate = useNavigate();
  const campusQuery = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: 1 });
  const campus: Campus | null = useMemo(
    () => campusQuery.data?.find((c) => c.id === campusId) ?? null,
    [campusQuery.data, campusId],
  );

  const [refreshKey, setRefreshKey] = useState(0);
  const [triageStats, setTriageStats] = useState<TriageStats>({ leads: 0, kept: 0, pending: 0, tagged: 0 });

  // Total leads imported to date (all-time count of outreach_leads rows).
  const totalLeadsQuery = useQuery({
    queryKey: ["outreach-leads-total", refreshKey],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("outreach_leads")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const [importing, setImporting] = useState(false);
  const [nextFilter, setNextFilter] = useState<NextFilter>(() => {
    if (typeof window === "undefined") return "all";
    const v = window.localStorage.getItem(FILTER_KEY);
    return (v === "with_leads" || v === "without_leads" || v === "sec_only" || v === "highest_value" || v === "all")
      ? v : "all";
  });
  const updateFilter = (v: NextFilter) => {
    setNextFilter(v);
    try { window.localStorage.setItem(FILTER_KEY, v); } catch { /* ignore */ }
  };

  const [history, setHistory] = useState<string[]>(readHistory);
  useEffect(() => { writeHistory(history); }, [history]);
  const canGoBack = history.length > 0;
  const [showManualSteps, setShowManualSteps] = useState(false);

  // Flame focus state machine: 1 = Copy Faculty Link, 2 = Scrape URL,
  // 3 = Import Leads, null = done. Resets when the campus changes.
  const [flameStep, setFlameStep] = useState<1 | 2 | 3 | null>(1);
  useEffect(() => { setFlameStep(1); }, [campusId]);
  // After a scrape finishes (refreshKey bumps), advance flame to Step #3.
  useEffect(() => {
    if (refreshKey > 0) setFlameStep(3);
  }, [refreshKey]);

  const handleImport = async () => {
    if (!campus || triageStats.tagged === 0) return;
    setImporting(true);
    try {
      const r = await importKeptLeads(campus.id);
      const parts = [`🔥 Imported ${r.inserted} lead${r.inserted === 1 ? "" : "s"} from ${campus.school_name}`];
      if (r.mergedTags) parts.push(`merged tags onto ${r.mergedTags} existing`);
      if (r.skipped) parts.push(`skipped ${r.skipped} duplicate`);
      toast.success(parts.join(" · "), { duration: 3500 });
      setFlameStep(null);
      // Auto-advance to the next campus.
      void handleNext();

    } catch (e) {
      toast.error(`Import failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setImporting(false);
    }
  };


  const handleBack = () => {
    if (history.length === 0) return;
    const next = [...history];
    const prevId = next.pop()!;
    setHistory(next);
    navigate({ to: "/outreach/leadfinder/$campusId", params: { campusId: prevId } });
  };

  const handleNext = async () => {
    if (!campus || !campusQuery.data) return;
    const visited = new Set([...history, campus.id]);
    let pool = campusQuery.data.filter(
      (c) => !c.archived && c.approval_status !== "approved" && !visited.has(c.id),
    );
    if (nextFilter === "sec_only") pool = pool.filter((c) => c.is_sec);
    if (nextFilter === "with_leads" || nextFilter === "without_leads") {
      try {
        const ids = pool.map((c) => c.id);
        if (ids.length > 0) {
          const { data } = await supabase
            .from("campus_lead_suggestions")
            .select("campus_id")
            .eq("research_mode", "faculty_scrape")
            .is("archived_at", null)
            .in("campus_id", ids);
          const withLeads = new Set(
            ((data ?? []) as Array<{ campus_id: string | null }>)
              .map((r) => r.campus_id).filter((x): x is string => !!x),
          );
          pool = pool.filter((c) =>
            nextFilter === "with_leads" ? withLeads.has(c.id) : !withLeads.has(c.id),
          );
        }
      } catch { /* ignore */ }
    }
    if (nextFilter === "highest_value") {
      pool = [...pool].sort((a, b) => {
        const ta = a.tuition_out_state ?? a.tuition_in_state ?? 0;
        const tb = b.tuition_out_state ?? b.tuition_in_state ?? 0;
        const ea = a.total_enrollment ?? 0;
        const eb = b.total_enrollment ?? 0;
        return (tb * eb) - (ta * ea);
      });
    }
    const nextCampus = pool[0];
    if (!nextCampus) {
      toast.info(`No more campuses matching "${FILTER_LABELS[nextFilter]}".`);
      return;
    }
    setHistory((h) => [...h, campus.id]);
    navigate({ to: "/outreach/leadfinder/$campusId", params: { campusId: nextCampus.id } });
  };

  const handleClose = () => {
    setHistory([]);
    writeHistory([]);
    navigate({ to: "/outreach" });
  };

  return (
    <>
      <Toaster richColors position="top-center" />
      <div className="relative flex flex-1 flex-col bg-background pb-20">

        {/* Navy top bar — centered brand */}
        <header
          className="text-white"
          style={{ background: "linear-gradient(180deg, #0b1f3a 0%, #0a1830 100%)" }}
        >
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-1.5 px-4 py-4 text-center">
            <img
              src={LOGO_URL}
              alt="Survive Accounting"
              className="h-5 w-auto object-contain brightness-0 invert"
              draggable={false}
            />
            <div className="font-serif text-base font-semibold tracking-tight">
              USA College Campus Lead Finder
              <sup className="ml-0.5 text-[8px] align-super">™</sup>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/70">
                Lead Count
              </span>
              <LeadOdometer value={totalLeadsQuery.data ?? 0} />

            </div>
          </div>
        </header>

        {/* Overnight auto-import panel */}
        <div className="mx-auto mt-4 w-full max-w-3xl px-4">
          <OvernightAutoImportCard />
        </div>

        {/* Campus name + Test Automated Scrape */}
        <div className="mx-auto max-w-6xl px-4 pt-6 text-center">
          <h1 className="truncate text-3xl font-bold tracking-tight text-foreground">
            {campus?.school_name ?? (campusQuery.isLoading ? "Loading…" : "Campus not found")}
          </h1>
          {campus && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px]">
              <TestAutoScrapeButton
                campusId={campus.id}
                onDone={() => setRefreshKey((k) => k + 1)}
              />
              <button
                type="button"
                onClick={() => setShowManualSteps((v) => !v)}
                className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {showManualSteps ? "Hide manual steps" : "Show manual steps"}
              </button>
            </div>
          )}
        </div>

        {/* Steps strip — Step #1, Step #2 (scrape), Step #3 lives in bottom bar */}
        {campus && showManualSteps && (
          <div className="mx-auto mt-4 w-full max-w-3xl px-4">
            <div className="rounded-xl border border-border bg-card/60 px-4 py-3 shadow-sm">
              <ScrapeFacultyButton
                campusId={campus.id}
                campusName={campus.school_name}
                onScraped={() => setRefreshKey((k) => k + 1)}
                onStep1Click={() => setFlameStep((s) => (s === 1 ? 2 : s))}
                flameStep={flameStep}
                hideAutoDiscover
                layout="stacked"
              />
            </div>
          </div>
        )}

        {/* Table (compact text) */}
        <div className="mx-auto max-w-6xl px-4 pt-4 text-xs">
          {campus ? (
            <FacultyTriagePanel
              key={`triage-${campus.id}-${refreshKey}`}
              campusId={campus.id}
              campusName={campus.school_name}
              refreshToken={refreshKey}
              hideHeader
              onStatsChange={setTriageStats}
            />
          ) : campusQuery.isError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              Could not load campus.
            </div>
          ) : null}

        </div>

        {/* Sticky bottom action bar — stays inside the SidebarInset */}
        <div className="sticky bottom-0 z-20 mt-auto border-t border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">

          <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-4 py-3">
            <Button
              size="sm"
              variant="outline"
              onClick={handleBack}
              disabled={!canGoBack}
              className="gap-1.5"
              title={canGoBack ? "Previous campus" : "No previous campus in this session"}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importing || triageStats.tagged === 0}
              className={`gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 ${flameStep === 3 ? "flame-focus flame-focus-strong" : ""}`}
              title="Step #3 — Import every selected faculty member as a lead"
            >
              {importing
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                : <><CheckCircle2 className="h-4 w-4" /> Step #3 · Import Leads ({triageStats.tagged})</>}
            </Button>

            <div className="inline-flex overflow-hidden rounded-md border bg-secondary">
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium hover:bg-secondary/80"
                title={`Next campus · ${FILTER_LABELS[nextFilter]}`}
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <Select value={nextFilter} onValueChange={(v) => updateFilter(v as NextFilter)}>
                <SelectTrigger
                  className="h-auto rounded-none border-0 border-l border-border/60 bg-transparent px-2 text-[11px] focus:ring-0"
                  aria-label="Choose which campuses to advance through"
                >
                  <span className="text-muted-foreground">{FILTER_LABELS[nextFilter]}</span>
                </SelectTrigger>
                <SelectContent align="end">
                  {(Object.keys(FILTER_LABELS) as NextFilter[]).map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {FILTER_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function OvernightAutoImportCard() {
  const [queueing, setQueueing] = useState(false);
  const statusQuery = useQuery({
    queryKey: ["faculty-batch-status"],
    queryFn: () => getFacultyBatchStatus(),
    refetchInterval: 15_000,
  });
  const q = statusQuery.data?.queue ?? { pending: 0, running: 0, done: 0, failed: 0 };
  const r = statusQuery.data?.last12h ?? { imported: 0, skipped: 0, failed: 0 };
  const active = (q.pending ?? 0) + (q.running ?? 0);

  const handleQueue = async () => {
    setQueueing(true);
    try {
      const res = await enqueueAllPendingCampuses() as { queued: number; scanned: number };
      toast.success(`Queued ${res.queued} campus${res.queued === 1 ? "" : "es"} for overnight auto-import`);
      void statusQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to queue");
    } finally {
      setQueueing(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <div className="text-sm font-semibold text-foreground">Overnight auto-import 🌙</div>
          <div className="text-[11px] text-muted-foreground">
            Scrape faculty + auto-import matching titles across all eligible campuses. Runs every 2 min.
          </div>
        </div>
        <Button size="sm" onClick={handleQueue} disabled={queueing}>
          {queueing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Queue all pending campuses
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span><strong className="text-foreground">{q.pending}</strong> pending</span>
        <span><strong className="text-foreground">{q.running}</strong> running</span>
        <span><strong className="text-foreground">{q.done}</strong> done</span>
        <span><strong className="text-foreground">{q.failed}</strong> failed</span>
        <span className="ml-auto">
          Last 12h: <strong className="text-foreground">{r.imported}</strong> imported
          {r.failed > 0 ? <> · <strong className="text-destructive">{r.failed}</strong> errors</> : null}
        </span>
      </div>
      {active === 0 && (q.done > 0 || q.failed > 0) ? (
        <div className="mt-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
          Queue idle — all campuses processed.
        </div>
      ) : null}
    </div>
  );
}

