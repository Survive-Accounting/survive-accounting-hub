// AI Suggested Leads — review staging table for campus_lead_suggestions.
// Inserts no rows directly into outreach_leads; "Import Accepted Leads"
// pipes accepted suggestions with valid emails through the existing
// importLeads() path, preserving dedupe / scheduled_send_at / landing_token.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Star, Upload, ExternalLink, BookOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  getLeadSuggestions,
  updateLeadSuggestion,
  bulkUpdateLeadSuggestions,
  importLeads,
  type LeadSuggestion,
  type LeadSuggestionStatus,
  type LeadSuggestionType,
} from "@/lib/outreach-api";

// Status column removed from table; bulk action buttons remain the way to change status.
const TYPE_OPTIONS: LeadSuggestionType[] = [
  "professor",
  "admin_staff",
  "bap_advisor",
  "tutoring_center",
  "other",
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TeachingFilter =
  | "all"
  | "confirmed_intro"
  | "intro_1"
  | "intro_2"
  | "intro_either"
  | "ia_either"
  | "none_found"
  | "admin_advisor";

const TEACHING_FILTER_LABELS: Record<TeachingFilter, string> = {
  all: "All suggested leads",
  confirmed_intro: "⭐ Confirmed Intro 1/2 only",
  intro_1: "Teaches Intro 1",
  intro_2: "Teaches Intro 2",
  intro_either: "Teaches Intro 1 or Intro 2",
  ia_either: "Teaches IA1 or IA2",
  none_found: "No teaching assignment found",
  admin_advisor: "Admin / Advisor only",
};

export type LeadSuggestionsSummary = {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  needs_lee: number;
};

/** "Confirmed" = teaching flag set by class-schedule scraper with an evidence URL. */
function isConfirmedIntro(r: LeadSuggestion): boolean {
  return !!r.teaching_evidence_url && (!!r.teaches_intro_1 || !!r.teaches_intro_2);
}
function isConfirmedIA(r: LeadSuggestion): boolean {
  return !!r.teaching_evidence_url && (!!r.teaches_intermediate_1 || !!r.teaches_intermediate_2);
}

/** Lower number = higher priority. Confirmed Intro 1/2 sits above inferred. */
function priorityRank(r: LeadSuggestion): number {
  if (r.teaches_intro_1 && r.teaching_evidence_url) return 0;
  if (r.teaches_intro_2 && r.teaching_evidence_url) return 1;
  if (r.teaches_intro_1) return 2;
  if (r.teaches_intro_2) return 3;
  if (r.teaches_intermediate_1 && r.teaching_evidence_url) return 4;
  if (r.teaches_intermediate_2 && r.teaching_evidence_url) return 5;
  if (r.teaches_intermediate_1) return 6;
  if (r.teaches_intermediate_2) return 7;
  if (r.lead_type === "bap_advisor") return 8;
  if (r.lead_type === "admin_staff") return 9;
  return 10;
}

function TeachingBadges({ r }: { r: LeadSuggestion }) {
  const items: { key: string; label: string; on: boolean }[] = [
    { key: "i1", label: "Intro 1", on: r.teaches_intro_1 },
    { key: "i2", label: "Intro 2", on: r.teaches_intro_2 },
    { key: "ia1", label: "IA1", on: r.teaches_intermediate_1 },
    { key: "ia2", label: "IA2", on: r.teaches_intermediate_2 },
  ];
  const onItems = items.filter((i) => i.on);
  if (onItems.length === 0) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {onItems.map((i) => (
        <Badge
          key={i.key}
          variant="secondary"
          className="px-1.5 py-0 text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200"
        >
          {i.label}
        </Badge>
      ))}
    </div>
  );
}

export default function LeadSuggestionsPanel({
  campusId,
  onImported,
  compact = false,
  showManualImportHelp = true,
  onSummaryChange,
}: {
  campusId: string | null;
  onImported?: () => void;
  compact?: boolean;
  showManualImportHelp?: boolean;
  onSummaryChange?: (s: LeadSuggestionsSummary) => void;
}) {
  const [rows, setRows] = useState<LeadSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [researching, setResearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [teachingFilter, setTeachingFilter] = useState<TeachingFilter>("all");
  const [sortMode, setSortMode] = useState<"last_name" | "priority">("last_name");

  async function refresh(id = campusId) {
    if (!id) { setRows([]); return; }
    setLoading(true);
    try {
      const data = await getLeadSuggestions(id);
      setRows(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setSelected(new Set()); refresh(campusId); /* eslint-disable-next-line */ }, [campusId]);

  const visibleRows = useMemo(() => {
    let filtered = rows;
    switch (teachingFilter) {
      case "confirmed_intro":
        filtered = rows.filter(isConfirmedIntro); break;
      case "intro_1":
        filtered = rows.filter((r) => r.teaches_intro_1); break;
      case "intro_2":
        filtered = rows.filter((r) => r.teaches_intro_2); break;
      case "intro_either":
        filtered = rows.filter((r) => r.teaches_intro_1 || r.teaches_intro_2); break;
      case "ia_either":
        filtered = rows.filter((r) => r.teaches_intermediate_1 || r.teaches_intermediate_2); break;
      case "none_found":
        filtered = rows.filter((r) =>
          !r.teaches_intro_1 && !r.teaches_intro_2 &&
          !r.teaches_intermediate_1 && !r.teaches_intermediate_2);
        break;
      case "admin_advisor":
        filtered = rows.filter((r) => r.lead_type === "admin_staff" || r.lead_type === "bap_advisor");
        break;
    }
    return [...filtered].sort((a, b) => {
      if (sortMode === "last_name") {
        const al = (a.last_name ?? "").toLowerCase();
        const bl = (b.last_name ?? "").toLowerCase();
        if (!al && bl) return 1;
        if (al && !bl) return -1;
        if (al !== bl) return al < bl ? -1 : 1;
        const af = (a.first_name ?? "").toLowerCase();
        const bf = (b.first_name ?? "").toLowerCase();
        return af < bf ? -1 : af > bf ? 1 : 0;
      }
      const pr = priorityRank(a) - priorityRank(b);
      if (pr !== 0) return pr;
      return (b.confidence ?? 0) - (a.confidence ?? 0);
    });
  }, [rows, teachingFilter, sortMode]);

  const allChecked = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(visibleRows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  async function runResearch() {
    if (!campusId) { toast.error("Pick a campus first."); return; }
    setResearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("research-campus-leads", {
        body: { campus_id: campusId },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      toast.success(`Added ${d?.inserted_count ?? 0} suggestion(s)${d?.skipped_duplicate_count ? ` · ${d.skipped_duplicate_count} duplicate(s) skipped` : ""}`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Research failed");
    } finally {
      setResearching(false);
    }
  }

  async function patchRow(id: string, patch: Partial<LeadSuggestion>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } as LeadSuggestion : r)));
    try {
      await updateLeadSuggestion(id, patch as any);
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
      await refresh();
    }
  }

  async function bulkSetStatus(status: LeadSuggestionStatus) {
    const ids = Array.from(selected);
    if (ids.length === 0) { toast.error("Select rows first."); return; }
    try {
      await bulkUpdateLeadSuggestions(ids, status);
      setRows((prev) => prev.map((r) => (selected.has(r.id) ? { ...r, status } : r)));
      toast.success(`Marked ${ids.length} as ${status}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Bulk update failed");
    }
  }

  async function importAccepted() {
    if (!campusId) { toast.error("Pick a campus first."); return; }
    const accepted = rows.filter((r) => r.status === "accepted");
    if (accepted.length === 0) { toast.error("No accepted suggestions to import."); return; }
    const importable = accepted.filter((r) => r.email && EMAIL_RE.test(r.email));
    const missingEmail = accepted.length - importable.length;
    if (importable.length === 0) {
      toast.error(`${accepted.length} accepted but none have a valid email. Mark them as "Needs Lee".`);
      return;
    }
    setImporting(true);
    try {
      const payload = importable.map((r) => ({
        email: r.email!,
        first_name: r.first_name ?? "",
        last_name: r.last_name ?? "",
        is_phd: !!r.is_phd,
      }));
      const { imported, duplicates, autoScheduled } = await importLeads(campusId, payload);
      const parts: string[] = [`${imported} imported`];
      if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped`);
      if (missingEmail) parts.push(`${missingEmail} missing email`);
      toast.success(`${parts.join(" · ")}${autoScheduled ? " · auto-scheduled" : ""} 🎉`);
      onImported?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const counts = useMemo(() => {
    const c = { pending: 0, accepted: 0, rejected: 0, needs_lee: 0 };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const teachingCounts = useMemo(() => ({
    intro_1: rows.filter((r) => r.teaches_intro_1).length,
    intro_2: rows.filter((r) => r.teaches_intro_2).length,
    ia_1: rows.filter((r) => r.teaches_intermediate_1).length,
    ia_2: rows.filter((r) => r.teaches_intermediate_2).length,
    confirmed_intro: rows.filter(isConfirmedIntro).length,
    confirmed_ia: rows.filter(isConfirmedIA).length,
  }), [rows]);

  useEffect(() => {
    onSummaryChange?.({
      total: rows.length,
      pending: counts.pending,
      accepted: counts.accepted,
      rejected: counts.rejected,
      needs_lee: counts.needs_lee,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, counts.pending, counts.accepted, counts.rejected, counts.needs_lee]);

  return (
    <TooltipProvider delayDuration={150}>
    <Card className={compact ? "p-3" : "p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-violet-500" /> AI Suggested Leads
          </div>
          {showManualImportHelp && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              AI suggestions must be reviewed before they become real outreach leads.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={runResearch}
            disabled={!campusId || researching}
          >
            {researching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {researching ? "Researching accounting faculty, staff, and advisors..." : "Auto-Research Leads with AI"}
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {rows.length} total · {counts.pending} pending · {counts.accepted} accepted · {counts.rejected} rejected · {counts.needs_lee} needs Lee
            </span>
            <span className="text-[11px] text-muted-foreground">
              · Intro 1: {teachingCounts.intro_1} · Intro 2: {teachingCounts.intro_2} · IA1: {teachingCounts.ia_1} · IA2: {teachingCounts.ia_2}
            </span>
            {teachingCounts.confirmed_intro > 0 && (
              <span className="text-[11px] font-semibold text-amber-700 inline-flex items-center gap-1">
                · <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {teachingCounts.confirmed_intro} CONFIRMED Intro 1/2
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as "last_name" | "priority")}>
                <SelectTrigger className="h-7 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_name">Sort: Last name (A→Z)</SelectItem>
                  <SelectItem value="priority">Sort: Teaching priority</SelectItem>
                </SelectContent>
              </Select>
              <Select value={teachingFilter} onValueChange={(v) => setTeachingFilter(v as TeachingFilter)}>
                <SelectTrigger className="h-7 w-[200px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TEACHING_FILTER_LABELS) as TeachingFilter[]).map((k) => (
                    <SelectItem key={k} value={k}>{TEACHING_FILTER_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" type="button" onClick={() => bulkSetStatus("accepted")} disabled={selected.size === 0}>Accept selected</Button>
              <Button size="sm" variant="outline" type="button" onClick={() => bulkSetStatus("rejected")} disabled={selected.size === 0}>Reject selected</Button>
              <Button size="sm" variant="outline" type="button" onClick={() => bulkSetStatus("needs_lee")} disabled={selected.size === 0}>Mark Needs Lee</Button>
              <Button size="sm" type="button" onClick={importAccepted} disabled={importing || counts.accepted === 0}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Import Accepted Leads
              </Button>
            </div>
          </div>
        </>
      )}

      <div className={`mt-3 ${compact ? "max-h-[32vh]" : "max-h-[40vh]"} overflow-auto rounded border border-border`}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-2 py-2 w-[28px]">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-3.5 w-3.5" />
              </th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left">First</th>
              <th className="px-2 py-2 text-left">Last</th>
              <th className="px-2 py-2 text-left">Title</th>
              <th className="px-2 py-2 text-left">Teaches</th>
              <th className="px-2 py-2 w-[42px]">PhD</th>
              <th className="px-2 py-2 w-[42px]">CPA</th>
              <th className="px-2 py-2 text-left w-[72px]">Conf.</th>
              <th className="px-2 py-2 text-left">Source</th>
              <th className="px-2 py-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                  {loading
                    ? "Loading suggestions…"
                    : !campusId
                      ? "Pick a campus to see suggestions."
                      : rows.length === 0
                        ? "No suggestions yet. Click Auto-Research Leads with AI."
                        : "No suggestions match this filter."}
                </td>
              </tr>
            )}
            {visibleRows.map((r) => {
              const confirmed = isConfirmedIntro(r);
              return (
              <tr key={r.id} className={`hover:bg-muted/20 align-top ${confirmed ? "bg-amber-50/70 border-l-2 border-l-amber-400" : ""}`}>
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                    className="h-3.5 w-3.5"
                  />
                </td>
                <td className="px-1 py-1">
                  <Select value={r.lead_type} onValueChange={(v) => patchRow(r.id, { lead_type: v as LeadSuggestionType })}>
                    <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1 font-mono">
                  {r.email ?? <span className="text-amber-600">— missing —</span>}
                </td>
                <td className="px-2 py-1">{r.first_name ?? ""}</td>
                <td className="px-2 py-1">{r.last_name ?? ""}</td>
                <td className="px-2 py-1">{r.title ?? ""}</td>
                <td className="px-2 py-1">
                  <div className="flex items-center gap-1">
                    {confirmed && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500 shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-xs">
                          CONFIRMED Intro instructor — verified via the public class schedule.
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <TeachingBadges r={r} />
                    {(r.teaching_evidence_url || r.teaching_evidence_notes || (r.courses_found && r.courses_found.length)) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <BookOpen className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          {r.teaching_evidence_notes && <div className="mb-1">{r.teaching_evidence_notes}</div>}
                          {r.courses_found && r.courses_found.length > 0 && (
                            <ul className="mb-1 list-disc pl-4">
                              {r.courses_found.map((c, i) => (
                                <li key={i}>
                                  {c.course_code ?? ""} {c.course_title ?? ""}
                                  {c.term ? ` · ${c.term}` : ""}
                                  {" · "}<span className="italic">{c.course_family}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {r.teaching_evidence_url && (
                            <a
                              href={r.teaching_evidence_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-300 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" /> Teaching source
                            </a>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {r.teaching_evidence_url && (
                    <a
                      href={r.teaching_evidence_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-2.5 w-2.5" /> Teaching source
                    </a>
                  )}
                </td>
                <td className="px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={!!r.is_phd}
                    onChange={(e) => patchRow(r.id, { is_phd: e.target.checked })}
                    className="h-3.5 w-3.5"
                  />
                </td>
                <td className="px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={!!r.is_cpa}
                    onChange={(e) => patchRow(r.id, { is_cpa: e.target.checked })}
                    className="h-3.5 w-3.5"
                  />
                </td>
                <td className="px-2 py-1">{r.confidence ?? ""}</td>
                <td className="px-2 py-1">
                  {r.source_url ? (
                    <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                      <ExternalLink className="h-3 w-3" /> link
                    </a>
                  ) : ""}
                </td>
                <td className="px-2 py-1 max-w-[260px] text-muted-foreground">{r.notes ?? ""}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
    </TooltipProvider>
  );
}
