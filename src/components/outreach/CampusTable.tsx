// Ported from the original app (ProfessorOutreach.tsx — SchoolsPanel table).
import { Fragment, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, BarChart3, Check, CheckCircle2, ChevronDown, Copy, DollarSign,
  Eye, MousePointerClick, Phone, RefreshCw, Upload, Users,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";


import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CampusFilterBar from "@/components/outreach/CampusFilterBar";
import AssignCampusPopover from "@/components/outreach/AssignCampusPopover";
import {
  ASSIGNMENT_STATUS_BADGE,
  ASSIGNMENT_STATUS_LABEL,
  applyFilters,
  exportCampusesCsv,
  type AssignmentStatus,
  type Campus,
  type CampusFilters,
} from "@/lib/outreach-mock";

type SortKey = "name" | "students" | "tuition";

export default function CampusTable({
  campuses,
  filters,
  onFiltersChange,
  onReview,
  onImportLeads,
  onAssignPatch,
  campusPhones,
  onTogglePersonalPhone,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: {
  campuses: Campus[];
  filters: CampusFilters;
  onFiltersChange: (f: CampusFilters) => void;
  onReview: (c: Campus) => void;
  onImportLeads: (c: Campus) => void;
  onAssignPatch: (id: string, patch: { assigned_to: string | null; due_date: string | null; assignment_status: AssignmentStatus }) => void;
  campusPhones?: Map<string, string>;
  onTogglePersonalPhone?: (campusId: string, next: boolean) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, value: boolean) => void;
  onToggleSelectAll: (ids: string[], value: boolean) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");


  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    const rows = applyFilters(campuses, filters);
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (c: Campus) =>
      sortKey === "name" ? c.school_name.toLowerCase()
      : sortKey === "students" ? (c.tam_total ?? -1)
      : (c.tuition_out_state ?? c.tuition_in_state ?? -1);
    return [...rows].sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0));
  }, [campuses, filters, sortKey, sortDir]);

  const states = useMemo(
    () => Array.from(new Set(campuses.map((c) => (c.state ?? "").trim()).filter(Boolean))).sort(),
    [campuses],
  );
  const batches = useMemo(
    () => Array.from(new Set(campuses.map((c) => (c.assignment_batch ?? "").trim()).filter(Boolean))).sort(),
    [campuses],
  );
  const archivedCount = campuses.filter((c) => c.archived).length;

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <CampusFilterBar
        filters={filters}
        onChange={onFiltersChange}
        states={states}
        batches={batches}
        totalCount={campuses.length}
        filteredCount={filtered.length}
        archivedCount={archivedCount}
        rightSlot={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" title="Sync student and tuition data">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sync
                  <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => toast.info("Connect Supabase to sync Government Data")}>
                  <DollarSign className="h-3.5 w-3.5" /> Sync enrollment from Government Data
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("Connect Supabase to estimate with AI")}>
                  <Users className="h-3.5 w-3.5" /> Estimate students with AI
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" onClick={() => exportCampusesCsv(filtered)}>
              <Upload className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </>
        }
      />

      {filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No campuses match.</div>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 text-xs uppercase text-muted-foreground backdrop-blur">
              <tr className="text-left">
                <th className="px-3 py-2 w-8">
                  <Checkbox
                    checked={filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id))}
                    onCheckedChange={(v) => onToggleSelectAll(filtered.map((s) => s.id), !!v)}
                  />
                </th>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Campus {sortKey === "name" && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                </th>
                <th className="px-3 py-2">Landing Page</th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort("students")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Students / yr {sortKey === "students" && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                </th>
                <th className="px-3 py-2 text-right">
                  <button type="button" onClick={() => toggleSort("tuition")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Tuition / yr {sortKey === "tuition" && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                </th>
                <th className="px-3 py-2">Assignment</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => {
                const isApproved = s.approval_status === "approved";
                const isArchived = s.archived;
                const tam = s.tam_total;
                const tuitionDisplay = s.tuition_out_state ?? s.tuition_in_state;
                const tuitionIsOfficial = s.tuition_source === "ipeds";
                return (
                  <Fragment key={s.id}>
                  <tr className={`hover:bg-muted/30 ${isArchived ? "opacity-50" : ""}`}>
                    <td className="px-3 py-3.5 align-top">
                      <Checkbox
                        checked={selectedIds.has(s.id)}
                        onCheckedChange={(v) => onToggleSelect(s.id, !!v)}
                      />
                    </td>
                    <td className="px-3 py-3.5 font-medium align-top">
                      <div className="inline-flex items-center gap-1.5">
                        <span>{s.school_name}</span>
                        {s.is_sec && (
                          <span title="SEC Conference" className="text-base leading-none" aria-label="SEC">🏈</span>
                        )}
                        {isApproved && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1 border-emerald-500/40 text-emerald-700">approved</Badge>
                        )}
                        {isArchived && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">archived</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                        {s.state} · /{s.slug}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-xs align-top">
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}/outreach/school/${s.slug}`;
                            navigator.clipboard.writeText(url).then(() => toast.success("Landing page URL copied"));
                          }}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground w-fit"
                          title="Copy landing page URL"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span className="text-[11px]">Copy link</span>
                        </button>
                        {(() => {
                          const mainNum = campusPhones?.get("__main__") ?? "+16625658818";
                          const personal = "+16012018759";
                          const usingPersonal = !!s.use_personal_phone;
                          const shown = usingPersonal ? personal : mainNum;
                          return (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => navigator.clipboard.writeText(shown).then(() => toast.success("Number copied"))}
                                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                                title={usingPersonal ? "Personal cell (override)" : "Main line"}
                              >
                                <Phone className="h-3.5 w-3.5" />
                                <span className="text-[11px] tabular-nums">{shown}</span>
                              </button>
                              {onTogglePersonalPhone && (
                                <button
                                  type="button"
                                  onClick={() => onTogglePersonalPhone(s.id, !usingPersonal)}
                                  className={`text-[10px] px-1.5 py-0.5 rounded border ${usingPersonal ? "bg-amber-50 border-amber-300 text-amber-800" : "border-border text-muted-foreground hover:text-foreground"}`}
                                  title="Toggle: send from personal cell for this campus"
                                >
                                  {usingPersonal ? "personal" : "main"}
                                </button>
                              )}
                            </div>
                          );
                        })()}
                        <div className="inline-flex items-center gap-3 text-muted-foreground">
                          <span className="inline-flex items-center gap-1" title="Visitors (coming soon)">
                            <Eye className="h-3.5 w-3.5" />
                            <span className="tabular-nums text-[11px]">{s.landing_views}</span>
                          </span>
                          <span className="inline-flex items-center gap-1" title="Clicks (coming soon)">
                            <MousePointerClick className="h-3.5 w-3.5" />
                            <span className="tabular-nums text-[11px]">{s.landing_clicks}</span>
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right text-xs tabular-nums align-top">
                      {tam != null && tam > 0 ? (
                        <span>
                          {tam.toLocaleString()}
                          {s.tam_confidence && (
                            <span className="ml-1 text-[10px] text-muted-foreground">({s.tam_confidence === "med" ? "medium" : s.tam_confidence})</span>
                          )}
                        </span>
                      ) : s.total_enrollment != null ? (
                        <span className="text-muted-foreground">
                          <span className="text-[10px]">enroll</span> {s.total_enrollment.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-right text-xs tabular-nums align-top">
                      {tuitionDisplay != null && tuitionDisplay > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          ${Math.round(tuitionDisplay).toLocaleString()}
                          {tuitionIsOfficial ? (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-500/50 text-emerald-700 dark:text-emerald-400" title="Official IPEDS data via College Scorecard">IPEDS</Badge>
                          ) : s.tuition_source === "ai_estimate" ? (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-500/50 text-amber-700 dark:text-amber-400" title="AI estimate — may be inaccurate">AI</Badge>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 align-top">
                      <AssignCampusPopover
                        campus={{
                          id: s.id,
                          name: s.school_name,
                          assigned_to: s.assigned_to,
                          due_date: s.due_date,
                          assignment_status: s.assignment_status,
                        }}
                        onSave={(patch) => onAssignPatch(s.id, patch)}
                      >
                        <button
                          type="button"
                          className="flex flex-col gap-0.5 text-xs text-left cursor-pointer group"
                          title="Click to assign or edit"
                        >
                          <span
                            className={`inline-flex w-fit items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition group-hover:ring-2 group-hover:ring-[#14213D]/20 ${ASSIGNMENT_STATUS_BADGE[s.assignment_status]}`}
                          >
                            {ASSIGNMENT_STATUS_LABEL[s.assignment_status]}
                          </span>
                          {s.assigned_to && (
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {s.assigned_to}{s.assignment_batch ? ` · ${s.assignment_batch}` : ""}
                            </span>
                          )}
                          {s.due_date && (
                            <span className="text-[10px] text-muted-foreground">Due {s.due_date}</span>
                          )}
                        </button>
                      </AssignCampusPopover>
                    </td>
                    <td className="px-3 py-3.5 align-top min-w-[160px]">
                      <div className="flex flex-col items-stretch gap-1.5 ml-auto w-[160px]">
                        <Button size="sm" onClick={() => onReview(s)} className="justify-center">
                          <Check className="h-3.5 w-3.5" /> Review
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onImportLeads(s)}
                          variant="outline"
                          className="justify-center"
                          title="Scrape & triage leads for this campus"
                        >
                          <Users className="h-3.5 w-3.5" /> Leads
                        </Button>
                        <Button size="sm" variant="outline" disabled className="justify-center" title="Coming soon">
                          <BarChart3 className="h-3.5 w-3.5" /> Metrics
                        </Button>
                      </div>
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
