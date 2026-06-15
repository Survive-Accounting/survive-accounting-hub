// Phase 4C — Class Schedule Intelligence
// Read-only panel: invokes research-campus-sections and lists any sections
// found on public registrar / business-school class schedule pages.
import { useEffect, useState } from "react";
import { CalendarClock, ChevronDown, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getCampusSections,
  runCampusSectionsResearch,
  type CampusCourseSection,
} from "@/lib/outreach-api";

const ACCT_FAMILIES = new Set(["intro_1", "intro_2", "intermediate_1", "intermediate_2"]);

export default function ClassScheduleIntelligencePanel({
  campusId,
  onLeadsChanged,
}: {
  campusId: string | null;
  onLeadsChanged?: () => void;
}) {
  const [rows, setRows] = useState<CampusCourseSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(true);

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

  useEffect(() => { refresh(campusId); /* eslint-disable-next-line */ }, [campusId]);

  async function run() {
    if (!campusId) { toast.error("Pick a campus first."); return; }
    setRunning(true);
    try {
      const res = await runCampusSectionsResearch(campusId);
      const parts: string[] = [`${res.sections_inserted} section(s)`];
      if (res.leads_updated) parts.push(`${res.leads_updated} lead(s) enriched`);
      if (res.leads_created) parts.push(`${res.leads_created} lead(s) added`);
      if (!res.sections_inserted && !res.leads_updated && !res.leads_created) {
        toast.message("No public class schedule data found for this campus.");
      } else {
        toast.success(parts.join(" · "));
      }
      await refresh();
      if (res.leads_updated || res.leads_created) onLeadsChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Class schedule research failed");
    } finally {
      setRunning(false);
    }
  }

  const introCount = rows.filter((r) => r.course_family && ACCT_FAMILIES.has(r.course_family)).length;
  const instructors = new Set(rows.map((r) => r.instructor_name).filter(Boolean) as string[]);
  const sources = Array.from(new Set(rows.map((r) => r.source_url).filter(Boolean) as string[]));

  return (
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
          onClick={run}
          disabled={!campusId || running}
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
          {running ? "Searching schedules…" : "Find class sections"}
        </Button>
      </div>

      {open && (
        <>
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
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20 align-top">
                    <td className="px-2 py-1">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {r.course_family}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">
                      <div className="font-medium">{r.course_code ?? "—"}</div>
                      {r.course_title && <div className="text-[10px] text-muted-foreground">{r.course_title}</div>}
                    </td>
                    <td className="px-2 py-1 font-mono">{r.section_number ?? ""}</td>
                    <td className="px-2 py-1">
                      <div>{r.instructor_name ?? "—"}</div>
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
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
