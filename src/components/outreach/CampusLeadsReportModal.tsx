// Drill-down report modal for the Campus Leads stats panel.
// Three tabs: Campuses · Leads · Course sections. CSV / Excel / PDF export.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, FileSpreadsheet, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { fetchCampusLeadReport, type CampusLeadReport } from "@/lib/outreach-api";
import {
  COURSE_FAMILY_LABELS, SEASON_LABELS,
  type LeadFilters,
} from "./filters/LeadFilterBar";
import type { Campus } from "@/lib/outreach-mock";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: LeadFilters;
  campuses: Campus[];
  onSelectCampus?: (campusId: string) => void;
}

const PAGE_SIZE = 50;

export function CampusLeadsReportModal({
  open, onOpenChange, filters, campuses, onSelectCampus,
}: Props) {
  const q = useQuery({
    queryKey: ["campus-lead-report", filters, campuses.length],
    queryFn: () => fetchCampusLeadReport(filters, campuses),
    enabled: open && campuses.length > 0,
    staleTime: 60_000,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Campus Leads Report</DialogTitle>
        </DialogHeader>

        <FilterSummary filters={filters} report={q.data} />

        {q.isLoading && (
          <div className="flex-1 flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading report…
          </div>
        )}
        {q.isError && (
          <div className="py-12 text-center text-sm text-destructive">
            Failed to load: {(q.error as Error)?.message}
          </div>
        )}

        {q.data && (
          <Tabs defaultValue="campuses" className="flex-1 overflow-hidden flex flex-col">
            <TabsList>
              <TabsTrigger value="campuses">Campuses · {q.data.campuses.length}</TabsTrigger>
              <TabsTrigger value="leads">Leads · {q.data.leads.length}</TabsTrigger>
              <TabsTrigger value="sections">Course sections · {q.data.sections.length}</TabsTrigger>
            </TabsList>

            <TabsContent value="campuses" className="flex-1 overflow-auto mt-3">
              <CampusesTab
                rows={q.data.campuses}
                onSelectCampus={(id) => { onSelectCampus?.(id); onOpenChange(false); }}
              />
            </TabsContent>
            <TabsContent value="leads" className="flex-1 overflow-auto mt-3">
              <LeadsTab rows={q.data.leads} />
            </TabsContent>
            <TabsContent value="sections" className="flex-1 overflow-auto mt-3">
              <SectionsTab rows={q.data.sections} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FilterSummary({ filters, report }: { filters: LeadFilters; report?: CampusLeadReport }) {
  const chips: string[] = [];
  if (filters.courseFamilies.length < 4) {
    chips.push(`Families: ${filters.courseFamilies.map((f) => COURSE_FAMILY_LABELS[f]).join(", ") || "none"}`);
  } else chips.push("All 4 families");
  if (filters.seasons.length < 4) {
    chips.push(`Seasons: ${filters.seasons.map((s) => SEASON_LABELS[s]).join(", ") || "none"}`);
  } else chips.push("All seasons");
  if (filters.campusIds.length) chips.push(`${filters.campusIds.length} campus filter`);
  if (filters.minConfidence > 0) chips.push(`Min confidence ≥ ${filters.minConfidence.toFixed(2)}`);
  if (filters.teachingOnly) chips.push("Teaching evidence only");
  if (filters.textbookMatchOnly) chips.push("Textbook match only");

  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {chips.map((c) => (
        <Badge key={c} variant="secondary" className="font-normal">{c}</Badge>
      ))}
      {report && (
        <span className="ml-auto text-muted-foreground">
          {report.campuses.length} campuses · {report.leads.length} leads · {report.sections.length} sections
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────

function CampusesTab({
  rows, onSelectCampus,
}: {
  rows: CampusLeadReport["campuses"];
  onSelectCampus: (id: string) => void;
}) {
  const [sort, setSort] = useState<"leads" | "sections" | "name">("leads");
  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "leads") copy.sort((a, b) => b.suggestedLeadCount - a.suggestedLeadCount);
    if (sort === "sections") copy.sort((a, b) => b.sectionCount - a.sectionCount);
    if (sort === "name") copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  }, [rows, sort]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 text-xs">
          <SortBtn active={sort === "leads"} onClick={() => setSort("leads")}>By leads</SortBtn>
          <SortBtn active={sort === "sections"} onClick={() => setSort("sections")}>By sections</SortBtn>
          <SortBtn active={sort === "name"} onClick={() => setSort("name")}>By name</SortBtn>
        </div>
        <CsvButton
          filename="campuses-report.csv"
          rows={sorted.map((r) => ({
            Campus: r.name, State: r.state ?? "",
            "Suggested leads": r.suggestedLeadCount,
            "Imported leads": r.importedLeadCount,
            Sections: r.sectionCount,
            "Has textbook ISBN": r.hasTextbookIsbn ? "Y" : "N",
            "Last researched": r.lastResearchedAt ?? "",
          }))}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campus</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Imported</TableHead>
            <TableHead className="text-right">Sections</TableHead>
            <TableHead>Textbook ISBN</TableHead>
            <TableHead>Last researched</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => (
            <TableRow key={r.campus_id}>
              <TableCell>
                <button
                  className="text-left hover:underline font-medium"
                  onClick={() => onSelectCampus(r.campus_id)}
                >
                  {r.name}
                </button>
              </TableCell>
              <TableCell>{r.state ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{r.suggestedLeadCount}</TableCell>
              <TableCell className="text-right tabular-nums">{r.importedLeadCount}</TableCell>
              <TableCell className="text-right tabular-nums">{r.sectionCount}</TableCell>
              <TableCell>
                {r.hasTextbookIsbn
                  ? <Badge variant="default" className="text-[10px]">Yes</Badge>
                  : <span className="text-xs text-muted-foreground">No</span>}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.lastResearchedAt ? new Date(r.lastResearchedAt).toLocaleDateString() : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LeadsTab({ rows }: { rows: CampusLeadReport["leads"] }) {
  const [page, setPage] = useState(0);
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Pager page={page} totalPages={totalPages} total={rows.length} onChange={setPage} />
        <CsvButton
          filename="leads-report.csv"
          rows={rows.map((r) => ({
            First: r.first_name ?? "", Last: r.last_name ?? "",
            Title: r.title ?? "", Email: r.email ?? "", Campus: r.campusName,
            Confidence: r.confidence ?? "", PhD: r.is_phd ? "Y" : "",
            CPA: r.is_cpa ? "Y" : "",
            I1: r.teaches_intro_1 ? "Y" : "", I2: r.teaches_intro_2 ? "Y" : "",
            IA1: r.teaches_intermediate_1 ? "Y" : "", IA2: r.teaches_intermediate_2 ? "Y" : "",
            Imported: r.imported ? "Y" : "",
            "Source URL": r.source_url ?? "",
          }))}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Campus</TableHead>
            <TableHead className="text-right">Conf.</TableHead>
            <TableHead>Creds</TableHead>
            <TableHead>Teaches</TableHead>
            <TableHead>Src</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">
                {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
              </TableCell>
              <TableCell className="text-xs">{r.title ?? "—"}</TableCell>
              <TableCell className="text-xs">{r.email ?? "—"}</TableCell>
              <TableCell className="text-xs">{r.campusName}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">
                {r.confidence != null ? r.confidence.toFixed(2) : "—"}
              </TableCell>
              <TableCell className="text-[10px]">
                {r.is_phd && <Badge variant="outline" className="mr-1">PhD</Badge>}
                {r.is_cpa && <Badge variant="outline">CPA</Badge>}
              </TableCell>
              <TableCell className="text-[10px] space-x-0.5">
                {r.teaches_intro_1 && <Badge variant="secondary">I1</Badge>}
                {r.teaches_intro_2 && <Badge variant="secondary">I2</Badge>}
                {r.teaches_intermediate_1 && <Badge variant="secondary">IA1</Badge>}
                {r.teaches_intermediate_2 && <Badge variant="secondary">IA2</Badge>}
              </TableCell>
              <TableCell>
                {r.source_url && (
                  <a href={r.source_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SectionsTab({ rows }: { rows: CampusLeadReport["sections"] }) {
  const [page, setPage] = useState(0);
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Pager page={page} totalPages={totalPages} total={rows.length} onChange={setPage} />
        <CsvButton
          filename="sections-report.csv"
          rows={rows.map((r) => ({
            Campus: r.campusName, Family: r.course_family ?? "",
            Code: r.course_code ?? "", Title: r.course_title ?? "",
            Term: r.term ?? "", Section: r.section_number ?? "",
            Instructor: r.instructor_name ?? "",
            Enrolled: r.enrollment_current ?? "",
            Capacity: r.enrollment_capacity ?? "",
            "Source URL": r.source_url ?? "",
          }))}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campus</TableHead>
            <TableHead>Family</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Term</TableHead>
            <TableHead>Sec</TableHead>
            <TableHead>Instructor</TableHead>
            <TableHead className="text-right">Enroll</TableHead>
            <TableHead>Src</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{r.campusName}</TableCell>
              <TableCell className="text-xs">{r.course_family ?? "—"}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{r.course_code ?? "—"}</TableCell>
              <TableCell className="text-xs">{r.course_title ?? "—"}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{r.term ?? "—"}</TableCell>
              <TableCell className="text-xs">{r.section_number ?? "—"}</TableCell>
              <TableCell className="text-xs">{r.instructor_name ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">
                {r.enrollment_current ?? "—"}{r.enrollment_capacity ? ` / ${r.enrollment_capacity}` : ""}
              </TableCell>
              <TableCell>
                {r.source_url && (
                  <a href={r.source_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

function SortBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
    >
      {children}
    </button>
  );
}

function Pager({
  page, totalPages, total, onChange,
}: { page: number; totalPages: number; total: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}>
        Prev
      </Button>
      <span className="tabular-nums">
        Page {page + 1} of {totalPages} · {total.toLocaleString()} rows
      </span>
      <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </div>
  );
}

function CsvButton({ filename, rows }: { filename: string; rows: Record<string, string | number>[] }) {
  return (
    <Button
      variant="ghost" size="sm" className="gap-1.5 h-7 text-xs"
      disabled={!rows.length}
      onClick={() => downloadCsv(filename, rows)}
    >
      <Download className="h-3 w-3" /> CSV
    </Button>
  );
}

function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
