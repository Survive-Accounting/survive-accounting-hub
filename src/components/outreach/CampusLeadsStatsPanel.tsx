// Collapsible "Analyze Campus Leads" panel: filter bar + stat tiles.
// Aggregates campus_lead_suggestions + campus_course_sections client-side.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronDown, Settings, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchLeadStatsRaw } from "@/lib/outreach-stats";
import {
  LeadFilterBar,
  DEFAULT_LEAD_FILTERS,
  COURSE_FAMILY_LABELS,
  SEASON_LABELS,
  ALL_FAMILIES,
  termToSeason,
  type LeadFilters,
  type CourseFamilyKey,
  type SeasonKey,
} from "./filters/LeadFilterBar";
import type { Campus } from "@/lib/outreach-mock";

const LS_OPEN = "outreach.statsPanel.open";
const HIGH_CONF = 0.8;

function leadFamilyMatches(lead: {
  teaches_intro_1: boolean; teaches_intro_2: boolean;
  teaches_intermediate_1: boolean; teaches_intermediate_2: boolean;
}, families: CourseFamilyKey[]): boolean {
  if (families.length === ALL_FAMILIES.length) return true;
  if (families.length === 0) return false;
  return families.some((f) => (lead as any)[`teaches_${f}`] === true);
}

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

  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_LEAD_FILTERS);

  const statsQ = useQuery({
    queryKey: ["lead-stats-raw"],
    queryFn: fetchLeadStatsRaw,
    staleTime: 60_000,
    enabled: open, // don't fetch until expanded
  });

  const computed = useMemo(() => {
    if (!statsQ.data) return null;
    const { leads, sections } = statsQ.data;
    const campusSet = filters.campusIds.length ? new Set(filters.campusIds) : null;

    // Leads filter
    const fLeads = leads.filter((l) => {
      if (campusSet && !campusSet.has(l.campus_id)) return false;
      if ((l.confidence ?? 0) < filters.minConfidence) return false;
      if (filters.teachingOnly && !(
        l.teaches_intro_1 || l.teaches_intro_2 ||
        l.teaches_intermediate_1 || l.teaches_intermediate_2
      )) return false;
      if (!leadFamilyMatches(l, filters.courseFamilies)) return false;
      return true;
    });

    // Sections filter
    const familyAllowed = (fam: string | null) => {
      if (filters.courseFamilies.length === ALL_FAMILIES.length) return true;
      if (!fam) return false;
      return (filters.courseFamilies as string[]).includes(fam);
    };
    const seasonAllowed = (term: string | null) => {
      if (filters.seasons.length === 4) return true;
      const s = termToSeason(term);
      return s ? filters.seasons.includes(s) : false;
    };
    const fSections = sections.filter((s) => {
      if (campusSet && !campusSet.has(s.campus_id)) return false;
      if (!familyAllowed(s.course_family)) return false;
      if (!seasonAllowed(s.term)) return false;
      return true;
    });

    // Aggregates
    const leadCampuses = new Set(fLeads.map((l) => l.campus_id));
    const sectionCampuses = new Set(fSections.map((s) => s.campus_id));
    const allCovered = new Set([...leadCampuses, ...sectionCampuses]);

    const highConf = fLeads.filter((l) => (l.confidence ?? 0) >= HIGH_CONF).length;
    const phdCount = fLeads.filter((l) => l.is_phd).length;
    const cpaCount = fLeads.filter((l) => l.is_cpa).length;

    const familyCounts: Record<CourseFamilyKey, { all: number; high: number }> = {
      intro_1: { all: 0, high: 0 },
      intro_2: { all: 0, high: 0 },
      intermediate_1: { all: 0, high: 0 },
      intermediate_2: { all: 0, high: 0 },
    };
    for (const l of fLeads) {
      const isHigh = (l.confidence ?? 0) >= HIGH_CONF;
      for (const f of ALL_FAMILIES) {
        if ((l as any)[`teaches_${f}`]) {
          familyCounts[f].all++;
          if (isHigh) familyCounts[f].high++;
        }
      }
    }

    const seasonCounts: Record<SeasonKey, number> = { fall: 0, spring: 0, summer: 0, winter: 0 };
    for (const s of fSections) {
      const sk = termToSeason(s.term);
      if (sk) seasonCounts[sk]++;
    }

    // Top campuses by lead count
    const perCampus = new Map<string, number>();
    for (const l of fLeads) perCampus.set(l.campus_id, (perCampus.get(l.campus_id) ?? 0) + 1);
    const topCampuses = [...perCampus.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({
        id,
        name: campuses.find((c) => c.id === id)?.school_name ?? "Unknown campus",
        count,
      }));

    const now = Date.now();
    const newSinceDay = fLeads.filter((l) =>
      now - new Date(l.created_at).getTime() < 86_400_000
    ).length;

    const totalCampuses = campuses.length || 1;

    return {
      totalLeads: fLeads.length,
      highConf,
      leadCampusCount: leadCampuses.size,
      sectionCount: fSections.length,
      coveredCount: allCovered.size,
      coveragePct: Math.round((allCovered.size / totalCampuses) * 100),
      phdCount, cpaCount,
      familyCounts, seasonCounts,
      topCampuses,
      avgSectionsPerCampus: sectionCampuses.size
        ? Math.round(fSections.length / sectionCampuses.size)
        : 0,
      newSinceDay,
    };
  }, [statsQ.data, filters, campuses]);

  const familyMax = computed
    ? Math.max(1, ...ALL_FAMILIES.map((f) => computed.familyCounts[f].all))
    : 1;
  const seasonMax = computed
    ? Math.max(1, ...(["fall", "spring", "summer", "winter"] as SeasonKey[]).map((s) => computed.seasonCounts[s]))
    : 1;

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
          {open && computed && (
            <span className="text-xs text-muted-foreground hidden md:inline">
              {statsQ.isFetching ? "Refreshing…" : `${computed.totalLeads.toLocaleString()} leads · ${computed.sectionCount.toLocaleString()} sections`}
            </span>
          )}
          <Button variant="ghost" size="sm" className="gap-2 h-9" onClick={onOpenSettings} title="Batch AI Research settings">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Batch AI Research</span>
          </Button>
        </div>
      </div>

      <CollapsibleContent className="mt-3">
        <Card className="p-4 bg-muted/30">
          <LeadFilterBar
            value={filters}
            onChange={setFilters}
            campuses={campuses}
            onReset={() => setFilters(DEFAULT_LEAD_FILTERS)}
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

          {computed && (
            <div className="mt-5 space-y-4">
              {/* Headline */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-2xl font-semibold tracking-tight">
                  {computed.highConf.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">high-confidence leads across</span>
                <span className="text-2xl font-semibold tracking-tight">
                  {computed.leadCampusCount.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">campuses with</span>
                <span className="text-2xl font-semibold tracking-tight">
                  {computed.sectionCount.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">course sections found</span>
                {computed.newSinceDay > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    +{computed.newSinceDay} new in last 24h
                  </Badge>
                )}
              </div>

              {/* Tile grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Tile label="Total leads" value={computed.totalLeads} />
                <Tile label={`High conf. (≥${HIGH_CONF})`} value={computed.highConf} />
                <Tile label="Sections found" value={computed.sectionCount} />
                <Tile label="Avg sections / campus" value={computed.avgSectionsPerCampus} />
                <Tile label="PhDs" value={computed.phdCount} />
                <Tile label="CPAs" value={computed.cpaCount} />
                <Tile label="Campuses with leads" value={computed.leadCampusCount} />
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Coverage</div>
                  <div className="mt-1 text-2xl font-semibold">{computed.coveragePct}%</div>
                  <Progress value={computed.coveragePct} className="mt-2 h-1.5" />
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {computed.coveredCount} / {campuses.length} campuses
                  </div>
                </div>
              </div>

              {/* Bars */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="p-4">
                  <div className="text-xs font-medium text-muted-foreground mb-3">Leads by family (high-conf shown darker)</div>
                  <div className="space-y-2">
                    {ALL_FAMILIES.map((f) => {
                      const { all, high } = computed.familyCounts[f];
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
                  <div className="text-xs font-medium text-muted-foreground mb-3">Sections by season</div>
                  <div className="space-y-2">
                    {(["fall", "spring", "summer", "winter"] as SeasonKey[]).map((s) => {
                      const v = computed.seasonCounts[s];
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
                  <div className="text-xs font-medium text-muted-foreground">Top campuses by lead count</div>
                  <Button
                    variant="ghost" size="sm" className="h-7 text-xs gap-1.5"
                    onClick={() => exportTopCampusesCsv(computed.topCampuses)}
                    disabled={!computed.topCampuses.length}
                  >
                    <Download className="h-3 w-3" /> CSV
                  </Button>
                </div>
                {computed.topCampuses.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No leads match the current filters.</div>
                ) : (
                  <ol className="space-y-1.5">
                    {computed.topCampuses.map((c, i) => (
                      <li key={c.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-muted text-[10px] font-semibold">
                            {i + 1}
                          </span>
                          <button
                            className="hover:underline text-left"
                            onClick={() => setFilters({ ...filters, campusIds: [c.id] })}
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
    </Collapsible>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function exportTopCampusesCsv(rows: { name: string; count: number }[]) {
  const csv = ["Campus,Leads", ...rows.map(r => `"${r.name.replace(/"/g, '""')}",${r.count}`)].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "top-campuses.csv"; a.click();
  URL.revokeObjectURL(url);
}
