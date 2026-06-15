// Phase 4C — Class Schedule Intelligence
// Read-only panel: invokes research-campus-sections and lists any sections
// found on public registrar / business-school class schedule pages.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getCampusSections,
  runCampusSectionsResearch,
  type CampusCourseSection,
  type SectionsResearchDebug,
} from "@/lib/outreach-api";

const ACCT_FAMILIES = new Set(["intro_1", "intro_2", "intermediate_1", "intermediate_2"]);
const ALL_FAMILIES = [
  "intro_1", "intro_2", "intermediate_1", "intermediate_2",
  "finance", "business_stats", "business_analytics",
  "microeconomics", "macroeconomics",
] as const;
const FAMILY_SHORT: Record<string, string> = {
  intro_1: "Intro 1",
  intro_2: "Intro 2",
  intermediate_1: "IA1",
  intermediate_2: "IA2",
  finance: "Finance",
  business_stats: "B-Stats",
  business_analytics: "B-Analytics",
  microeconomics: "Micro",
  macroeconomics: "Macro",
  other: "Other",
};

export default function ClassScheduleIntelligencePanel({
  campusId,
  onLeadsChanged,
}: {
  campusId: string | null;
  onLeadsChanged?: () => void;
}) {
  const [rows, setRows] = useState<CampusCourseSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<"all" | string | null>(null);
  const [open, setOpen] = useState(true);
  const [debug, setDebug] = useState<SectionsResearchDebug | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  async function refresh(id = campusId) {
    if (!id) { setRows([]); return; }
    setLoading(true);
    try {
      setRows(await getCampusSections(id));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load class sections");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(campusId); setDebug(null); /* eslint-disable-next-line */ }, [campusId]);

  async function run(families?: string[]) {
    if (!campusId) { toast.error("Pick a campus first."); return; }
    setRunning(families?.length === 1 ? families[0] : "all");
    try {
      const res = await runCampusSectionsResearch(campusId, families);
      setDebug(res.debug ?? null);
      const parts: string[] = [`${res.sections_inserted} section(s)`];
      if (res.leads_updated) parts.push(`${res.leads_updated} lead(s) enriched`);
      if (res.leads_created) parts.push(`${res.leads_created} lead(s) added`);
      if (!res.sections_inserted && !res.leads_updated && !res.leads_created) {
        toast.message("No public class schedule data found for this run.");
      } else {
        toast.success(parts.join(" · "));
      }
      await refresh();
      if (res.leads_updated || res.leads_created) onLeadsChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Class schedule research failed");
    } finally {
      setRunning(null);
    }
  }

  const familyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const f = r.course_family ?? "other";
      counts[f] = (counts[f] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const introCount = rows.filter((r) => r.course_family && ACCT_FAMILIES.has(r.course_family)).length;
  const instructors = new Set(rows.map((r) => r.instructor_name).filter(Boolean) as string[]);
  const sources = Array.from(new Set(rows.map((r) => r.source_url).filter(Boolean) as string[]));

  return (
    <TooltipProvider delayDuration={150}>
    <Card className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <CalendarClock className="h-4 w-4 text-sky-600" />
          Class Schedule Intelligence
          <Badge variant="outline" className="font-normal text-[11px]">
            {rows.length} section{rows.length === 1 ? "" : "s"} · {introCount} intro accounting · {instructors.size} instructor{instructors.size === 1 ? "" : "s"}
          </Badge>
        </button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => run()}
          disabled={!campusId || running !== null}
        >
          {running === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
          {running === "all" ? "Searching schedules…" : "Find class sections (all families)"}
        </Button>
      </div>

      {open && (
        <>
          {/* Per-family count chips with low-count warnings + per-family re-run */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ALL_FAMILIES.map((f) => {
              const c = familyCounts[f] ?? 0;
              const low = c < 2;
              const intro = f === "intro_1" || f === "intro_2";
              return (
                <div
                  key={f}
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
                    intro
                      ? "border-amber-300 bg-amber-50"
                      : low
                        ? "border-orange-200 bg-orange-50"
                        : "border-border bg-muted/30"
                  }`}
                >
                  <span className="font-medium">{FAMILY_SHORT[f]}</span>
                  <span className={low ? "text-orange-700 font-mono" : "font-mono"}>{c}</span>
                  {low && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertTriangle className="h-3 w-3 text-orange-600" />
                      </TooltipTrigger>
                      <TooltipContent className="text-xs max-w-xs">
                        Suspiciously low. Re-run this family — the AI may have summarized instead of enumerating.
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <button
                    type="button"
                    title={`Re-run ${FAMILY_SHORT[f]} only`}
                    className="ml-0.5 inline-flex items-center text-muted-foreground hover:text-foreground disabled:opacity-50"
                    disabled={!campusId || running !== null}
                    onClick={() => run([f])}
                  >
                    {running === f ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  </button>
                </div>
              );
            })}
          </div>

          {sources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              {sources.slice(0, 6).map((s) => (
                <a key={s} href={s} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline truncate max-w-[220px]">
                  <ExternalLink className="h-3 w-3" /> {new URL(s).hostname}
                </a>
              ))}
            </div>
          )}

          <div className="mt-2 max-h-[32vh] overflow-auto rounded border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">Family</th>
                  <th className="px-2 py-1.5 text-left">Course</th>
                  <th className="px-2 py-1.5 text-left">Section</th>
                  <th className="px-2 py-1.5 text-left">Instructor</th>
                  <th className="px-2 py-1.5 text-left">Term</th>
                  <th className="px-2 py-1.5 text-left">Meeting</th>
                  <th className="px-2 py-1.5 text-left">Enroll/Cap</th>
                  <th className="px-2 py-1.5 text-left">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    {loading
                      ? "Loading sections…"
                      : !campusId
                        ? "Pick a campus."
                        : "No class sections recorded yet. Click \"Find class sections\" — missing schedule data is OK."}
                  </td></tr>
                )}
                {rows.map((r) => {
                  const isIntro = r.course_family === "intro_1" || r.course_family === "intro_2";
                  return (
                    <tr key={r.id} className={`hover:bg-muted/20 align-top ${isIntro ? "bg-amber-50/60" : ""}`}>
                      <td className="px-2 py-1">
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${isIntro ? "bg-amber-200 text-amber-900 border-amber-300" : ""}`}>
                          {r.course_family}
                        </Badge>
                      </td>
                      <td className="px-2 py-1">
                        <div className="font-medium">{r.course_code ?? "—"}</div>
                        {r.course_title && <div className="text-[10px] text-muted-foreground">{r.course_title}</div>}
                      </td>
                      <td className="px-2 py-1 font-mono">{r.section_number ?? ""}</td>
                      <td className="px-2 py-1">
                        <div className={isIntro ? "font-semibold" : ""}>{r.instructor_name ?? "—"}</div>
                        {r.instructor_email && <div className="text-[10px] text-muted-foreground font-mono">{r.instructor_email}</div>}
                      </td>
                      <td className="px-2 py-1">{r.term ?? ""}</td>
                      <td className="px-2 py-1">
                        {[r.meeting_days, r.meeting_time].filter(Boolean).join(" ") || ""}
                        {r.location && <div className="text-[10px] text-muted-foreground">{r.location}</div>}
                      </td>
                      <td className="px-2 py-1">
                        {r.enrollment_current != null || r.enrollment_capacity != null
                          ? `${r.enrollment_current ?? "?"}/${r.enrollment_capacity ?? "?"}`
                          : ""}
                        {r.waitlist_count ? <div className="text-[10px] text-amber-700">wl: {r.waitlist_count}</div> : null}
                      </td>
                      <td className="px-2 py-1">
                        {r.source_url ? (
                          <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                            <ExternalLink className="h-3 w-3" /> link
                          </a>
                        ) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {debug?.per_family && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setDebugOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {debugOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Why these results? (last run debug)
              </button>
              {debugOpen && (
                <div className="mt-1 rounded border border-border bg-muted/20 p-2 text-[11px] space-y-1.5">
                  {Object.entries(debug.per_family).map(([fam, info]) => (
                    <div key={fam} className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono font-semibold">{FAMILY_SHORT[fam] ?? fam}</span>
                      <span>final: {info.final_count}</span>
                      <span className="text-muted-foreground">
                        attempts: {info.attempts.map((a, i) => {
                          const tag = a.error ?? a.note ?? a.parse_error ?? `${a.returned ?? 0} returned${a.rejected_count ? `, ${a.rejected_count} rejected` : ""}`;
                          return `[${i + 1}${a.strict ? "·strict" : ""}: ${tag}]`;
                        }).join(" ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
    </TooltipProvider>
  );
}
