// /outreach/leadfinder/$campusId — minimal, focused page for scraping faculty
// and triaging leads on a single campus. Replaces the legacy ApproveCampusModal.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
// AdminGate + Toaster are provided by the /outreach layout.
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Star, Trash2, X, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { ScrapeFacultyButton } from "@/components/outreach/ScrapeFacultyButton";
import { FacultyTriagePanel, type TriageStats } from "@/components/outreach/FacultyTriagePanel";
import { fetchCampuses } from "@/lib/outreach-api";
import { importKeptLeads } from "@/lib/faculty-triage";
import { supabase } from "@/integrations/supabase/client";
import { scrapeCampusRmp, resetCampusLeads } from "@/lib/rmp-scrape.functions";
import { startScrapeJob } from "@/lib/scrape-jobs";
import type { Campus } from "@/lib/outreach-mock";
import { AutoScrapeButton } from "@/components/outreach/AutoScrapeButton";


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

        {/* Campus name + actions */}
        <div className="mx-auto max-w-6xl px-4 pt-6 text-center">
          <h1 className="truncate text-3xl font-bold tracking-tight text-foreground">
            {campus?.school_name ?? (campusQuery.isLoading ? "Loading…" : "Campus not found")}
          </h1>
          {campus && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px]">
              <AutoScrapeButton
                campusId={campus.id}
                campusName={campus.school_name}
                onScraped={() => setRefreshKey((k) => k + 1)}
              />
              <button
                type="button"
                onClick={() => setShowManualSteps((v) => !v)}
                className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {showManualSteps ? "Hide manual steps" : "Show manual steps"}
              </button>
              <ResetCampusLeadsButton
                campusId={campus.id}
                campusName={campus.school_name}
                onDone={() => setRefreshKey((k) => k + 1)}
              />
            </div>
          )}
        </div>

        {/* Steps strip — Step #1, Step #2 (scrape), Step #3 lives in bottom bar */}
        {campus && showManualSteps && (
          <div className="mx-auto mt-4 w-full max-w-3xl space-y-3 px-4">
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
            <RmpScrapePanel
              campusId={campus.id}
              campusName={campus.school_name}
              onScraped={() => setRefreshKey((k) => k + 1)}
            />
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
              title="Import every tagged faculty member as a lead"
            >
              {importing
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                : <><CheckCircle2 className="h-4 w-4" /> Import Leads ({triageStats.tagged})</>}
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

function ResetCampusLeadsButton({
  campusId, campusName, onDone,
}: { campusId: string; campusName: string; onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const handleClick = async () => {
    const ok = window.confirm(
      `Reset all scraped leads + suggestions for ${campusName}?\n\nThis deletes outreach_leads with source 'faculty_scrape' or 'rmp_scrape' and all unimported suggestions for this campus. Manually-added leads are preserved.`,
    );
    if (!ok) return;
    setRunning(true);
    try {
      const r = await resetCampusLeads({ data: { campusId } }) as {
        leadsDeleted: number; suggestionsDeleted: number;
      };
      toast.success(`Reset ${campusName}: deleted ${r.leadsDeleted} lead(s) and ${r.suggestionsDeleted} suggestion(s).`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setRunning(false);
    }
  };
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handleClick}
      disabled={running}
      className="h-7 gap-1.5 px-2.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
      title="Delete all scraped leads + suggestions for this campus so you can re-scrape from scratch"
    >
      {running
        ? <><Loader2 className="h-3 w-3 animate-spin" /> Resetting…</>
        : <><Trash2 className="h-3 w-3" /> Reset campus leads</>}
    </Button>
  );
}

function RmpScrapePanel({
  campusId, campusName, onScraped,
}: { campusId: string; campusName: string; onScraped: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [urls, setUrls] = useState("");
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Reset per-campus state when switching campuses.
  useEffect(() => {
    setExpanded(false);
    setUrls("");
    setLoaded(false);
  }, [campusId]);

  const loadSavedUrls = async () => {
    if (loaded) return;
    try {
      const { data } = await supabase
        .from("campuses")
        .select("rmp_page_url")
        .eq("id", campusId)
        .maybeSingle();
      const v = ((data as { rmp_page_url?: string | null } | null)?.rmp_page_url ?? "").trim();
      setUrls((prev) => (prev.trim() ? prev : v));
    } catch { /* ignore */ } finally {
      setLoaded(true);
    }
  };

  const copyRmpGoogleLink = async () => {
    const q = `${campusName} accounting site:ratemyprofessors.com`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("RMP search link copied — paste in a new tab.");
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const togglePanel = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    await loadSavedUrls();
  };

  const handleScrape = async () => {
    const list = urls.split(/\r?\n/).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));
    if (list.length === 0) {
      toast.error("Paste at least one RateMyProfessors URL.");
      return;
    }
    setRunning(true);
    setExpanded(false);
    toast.info(`Scraping RMP for ${campusName} in background…`);
    const job = startScrapeJob({ campusId, campusName, kind: "rmp" });
    try {
      const r = await scrapeCampusRmp({ data: { campusId, urls: list } }) as {
        perPage: Array<{ url: string; found: number; matched: number; error?: string }>;
        totalFound: number; totalMatched: number; totalUpdated: number;
      };
      const errs = r.perPage.filter((p) => p.error);
      if (errs.length > 0) {
        const msg = `${r.totalFound} found, ${r.totalUpdated} matched, ${errs.length} URL(s) failed`;
        toast.warning(`RMP: ${msg}.`, {
          description: errs.map((e) => `${e.url}: ${e.error}`).join("\n").slice(0, 300),
        });
        job.succeed(msg);
      } else {
        const msg = `${r.totalFound} found → ${r.totalUpdated} lead(s) updated`;
        toast.success(`RMP: ${msg}.`);
        job.succeed(msg);
      }
      onScraped();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      toast.error(`RMP scrape failed: ${msg}`);
      job.fail(msg);
    } finally {
      setRunning(false);
    }
  };


  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Star className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          RateMyProfessors
        </span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Step #1</span>
          <Button
            size="sm"
            variant="outline"
            onClick={copyRmpGoogleLink}
            title="Copy a Google search link for this school's RateMyProfessors page. Paste it in a new tab."
            className="gap-1.5"
          >
            <Star className="h-3.5 w-3.5 text-amber-500" /> Copy RMP Link
          </Button>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Step #2 · Paste RMP URL</span>
            <Button
              size="sm"
              variant="outline"
              onClick={togglePanel}
              aria-expanded={expanded}
              title="Paste the RateMyProfessors URL(s) and start the scrape"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              {running ? "Scraping…" : "Scrape RMP"}
            </Button>
          </div>
          {expanded && (
            <div className="w-full max-w-md space-y-1.5 rounded-md border border-border bg-background p-2 text-left">
              {!loaded && (
                <div className="text-[11px] text-muted-foreground">Loading saved URLs…</div>
              )}
              <textarea
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="https://www.ratemyprofessors.com/search/professors/XXXX?q=accounting"
                disabled={!loaded}
                rows={3}
                autoFocus
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-[11px]"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] italic text-muted-foreground">
                  One URL per line. Updates rating, # ratings, % take again, difficulty on matched leads.
                </span>
                <Button size="sm" onClick={handleScrape} disabled={running || !loaded} className="h-7 gap-1.5 text-[11px]">
                  <Star className="h-3 w-3" /> Start scrape
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
