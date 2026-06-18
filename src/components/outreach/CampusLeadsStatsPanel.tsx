// Collapsible "Analyze Campus Leads" panel: filter bar + stat tiles.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronDown, Settings, Download, Info, FileSearch, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fetchCampusLeadStats } from "@/lib/outreach-api";
import { CampusLeadsReportModal } from "./CampusLeadsReportModal";
import { TextbookMatchAuditModal } from "./TextbookMatchAuditModal";
import {
  LeadFilterBar,
  useLeadFilters,
  COURSE_FAMILY_LABELS,
  SEASON_LABELS,
  ALL_FAMILIES,
  type SeasonKey,
} from "./filters/LeadFilterBar";
import type { Campus } from "@/lib/outreach-mock";

const LS_OPEN = "outreach.statsPanel.open";

export function CampusLeadsStatsPanel({
  campuses,
  onOpenSettings,
}: { campuses: Campus[]; onOpenSettings: () => void }) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(LS_OPEN) === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_OPEN, open ? "1" : "0");
    }
  }, [open]);

  const { filters, setFilters, reset } = useLeadFilters();
  const [reportOpen, setReportOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const statsQ = useQuery({
    queryKey: ["campus-lead-stats", filters, campuses.length],
    queryFn: () => fetchCampusLeadStats(filters, campuses),
    staleTime: 0,
    enabled: open && campuses.length > 0,
  });


  const stats = statsQ.data ?? null;

  const familyMax = useMemo(() => stats
    ? Math.max(1, ...ALL_FAMILIES.map((f) => stats.courseFamilyCounts[f].all))
    : 1, [stats]);
  const seasonMax = useMemo(() => stats
    ? Math.max(1, ...(["fall", "spring", "summer", "winter"] as SeasonKey[]).map((s) => stats.seasonCounts[s]))
    : 1, [stats]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-3">
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 h-9">
            <BarChart3 className="h-4 w-4" />
            Analyze Campus Leads
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2">
          {open && stats && (
            <span className="text-xs text-muted-foreground hidden md:inline">
              {statsQ.isFetching
                ? "Refreshing…"
                : `${stats.suggestedLeadCount.toLocaleString()} leads · ${stats.sectionCount.toLocaleString()} sections`}
            </span>
          )}
          {open && (
            <Button variant="ghost" size="sm" className="gap-2 h-9" onClick={() => setReportOpen(true)}>
              <FileSearch className="h-4 w-4" />
              <span className="hidden sm:inline">View detailed report</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" className="gap-2 h-9" onClick={() => setAuditOpen(true)}>
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Textbook Match Audit</span>
          </Button>
          <Button variant="ghost" size="sm" className="gap-2 h-9" onClick={onOpenSettings}>
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">AI Research Settings</span>
          </Button>
        </div>
      </div>

      <CollapsibleContent className="mt-3">
        <Card className="p-4 bg-muted/30">
          <LeadFilterBar
            value={filters} onChange={setFilters}
            campuses={campuses} onReset={reset}
          />

          {statsQ.isLoading && (
            <div className="mt-6 py-12 text-center text-sm text-muted-foreground">
              Loading stats…
            </div>
          )}
          {statsQ.isError && (
            <div className="mt-6 py-6 text-center text-sm text-destructive">
              Failed to load stats: {(statsQ.error as Error)?.message}
            </div>
          )}

          {stats && (
            <div className="mt-5 space-y-4">
              {/* Headline */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-2xl font-semibold tracking-tight">
                  {stats.suggestedLeadCount.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">suggested leads across</span>
                <span className="text-2xl font-semibold tracking-tight">
                  {stats.campusCount.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">campuses with</span>
                <span className="text-2xl font-semibold tracking-tight">
                  {stats.sectionCount.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">course sections found</span>
                {stats.newLeadCount24h > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    +{stats.newLeadCount24h} new in last 24h
                  </Badge>
                )}
              </div>

              {/* Tile grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Tile label="Suggested leads" value={stats.suggestedLeadCount}
                  hint="Distinct rows in campus_lead_suggestions matching the filters — people AI research surfaced as likely professors/staff for the four core accounting course families. Not yet imported into the outreach queue." />
                <Tile label="Imported outreach leads" value={stats.importedLeadCount}
                  hint="Suggested leads that have been promoted into outreach_leads and are eligible for campaign enrollment." />
                <Tile label="High-confidence (≥0.8)" value={stats.highConfidenceLeadCount}
                  hint="Suggested leads whose AI-assigned confidence score is 0.80 or higher." />
                <Tile label="Campuses covered" value={stats.campusCount}
                  hint="Unique campuses that have at least one suggested lead matching the current filters." />
                <Tile label="Course sections" value={stats.sectionCount}
                  hint="A course section is one scheduled offering of a class for a specific term (e.g. ACCT 201 Sec 03, Fall 2024). One professor teaching two sections of intro accounting in the same term = 2 sections. Pulled from each campus's class schedule by AI research." />
                <Tile label="Intro 1 instructors" value={stats.intro1InstructorCount} />
                <Tile label="Intro 2 instructors" value={stats.intro2InstructorCount} />
                <Tile label="IA1 instructors" value={stats.ia1InstructorCount} />
                <Tile label="IA2 instructors" value={stats.ia2InstructorCount} />
                <Tile label="CPAs" value={stats.cpaCount} />
                <Tile label="PhDs" value={stats.phdCount} />
                <Tile label="New (24h)" value={stats.newLeadCount24h} />
              </div>

              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span>Coverage (active campuses only — archived excluded)</span>
                  <span className="tabular-nums">
                    {stats.campusCount} / {stats.totalCampusCount} active campuses
                  </span>
                </div>
                <Progress value={stats.coveragePct} className="mt-2 h-1.5" />
              </div>

              {/* Bars */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="p-4">
                  <div className="text-xs font-medium text-muted-foreground mb-3">
                    Leads by family (darker = high-confidence)
                  </div>
                  <div className="space-y-2">
                    {ALL_FAMILIES.map((f) => {
                      const { all, high } = stats.courseFamilyCounts[f];
                      const pct = (all / familyMax) * 100;
                      const highPct = all ? (high / all) * 100 : 0;
                      return (
                        <div key={f} className="text-xs">
                          <div className="flex justify-between mb-1">
                            <span>{COURSE_FAMILY_LABELS[f]}</span>
                            <span className="text-muted-foreground tabular-nums">
                              {high} / {all}
                            </span>
                          </div>
                          <div className="relative h-2 rounded bg-muted overflow-hidden">
                            <div className="absolute inset-y-0 left-0 bg-primary/30" style={{ width: `${pct}%` }} />
                            <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${(pct * highPct) / 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="text-xs font-medium text-muted-foreground mb-3">
                    Sections by season
                  </div>
                  <div className="space-y-2">
                    {(["fall", "spring", "summer", "winter"] as SeasonKey[]).map((s) => {
                      const v = stats.seasonCounts[s];
                      const pct = (v / seasonMax) * 100;
                      return (
                        <div key={s} className="text-xs">
                          <div className="flex justify-between mb-1">
                            <span>{SEASON_LABELS[s]}</span>
                            <span className="text-muted-foreground tabular-nums">{v.toLocaleString()}</span>
                          </div>
                          <div className="h-2 rounded bg-muted overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>

              {/* Top campuses */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-medium text-muted-foreground">
                    Top campuses by lead count
                  </div>
                  <Button
                    variant="ghost" size="sm" className="h-7 text-xs gap-1.5"
                    onClick={() => exportTopCampusesCsv(stats.topCampusesByLeadCount)}
                    disabled={!stats.topCampusesByLeadCount.length}
                  >
                    <Download className="h-3 w-3" /> CSV
                  </Button>
                </div>
                {stats.topCampusesByLeadCount.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No leads match the current filters.</div>
                ) : (
                  <ol className="space-y-1.5">
                    {stats.topCampusesByLeadCount.map((c, i) => (
                      <li key={c.campus_id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-muted text-[10px] font-semibold">
                            {i + 1}
                          </span>
                          <button
                            className="hover:underline text-left"
                            onClick={() => setFilters({ ...filters, campusIds: [c.campus_id] })}
                          >
                            {c.name}
                          </button>
                        </span>
                        <span className="tabular-nums text-muted-foreground">{c.count}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          )}
        </Card>
      </CollapsibleContent>
      <CampusLeadsReportModal
        open={reportOpen}
        onOpenChange={setReportOpen}
        filters={filters}
        campuses={campuses}
        onSelectCampus={(id) => setFilters({ ...filters, campusIds: [id] })}
      />
      <TextbookMatchAuditModal
        open={auditOpen}
        onOpenChange={setAuditOpen}
        campuses={campuses}
      />
    </Collapsible>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        {hint && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground/70 hover:text-foreground" aria-label="What is this?">
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-relaxed">{hint}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function exportTopCampusesCsv(rows: { name: string; count: number }[]) {
  const csv = ["Campus,Leads", ...rows.map((r) => `"${r.name.replace(/"/g, '""')}",${r.count}`)].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "top-campuses.csv"; a.click();
  URL.revokeObjectURL(url);
}
