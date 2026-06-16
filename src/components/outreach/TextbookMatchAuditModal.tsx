// Textbook Match Audit — per-campus / per-family review of how the new
// supported-textbook-family matcher classifies each researched campus,
// compared to the old "has any ISBN" rule.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, BookOpen, Wand2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { runTextbookMatchAudit, type TextbookAuditRow } from "@/lib/textbook-matcher";
import { startTextbookOnlyBatch, runTextbookResearchForCampus } from "@/lib/outreach-api";
import type { Campus } from "@/lib/outreach-mock";

const FAMILY_LABEL: Record<string, string> = {
  intro_1: "Intro 1", intro_2: "Intro 2",
  intermediate_1: "IA1", intermediate_2: "IA2",
};

function statusBadge(s: TextbookAuditRow["new_status"]) {
  const cls =
    s === "matched" ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : s === "unmatched" ? "bg-rose-100 text-rose-800 border-rose-200"
        : "bg-slate-100 text-slate-700 border-slate-200";
  return <Badge variant="outline" className={`text-[10px] ${cls}`}>{s}</Badge>;
}

export function TextbookMatchAuditModal({
  open, onOpenChange, campuses,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campuses: Campus[];
}) {
  const qc = useQueryClient();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const FAMILIES = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"] as const;
  const [familySel, setFamilySel] = useState<Record<string, boolean>>({
    intro_1: true, intro_2: true, intermediate_1: true, intermediate_2: true,
  });
  const [authorQ, setAuthorQ] = useState("");
  const [publisherQ, setPublisherQ] = useState("");
  type SortKey = "campus_name" | "course_family" | "course_code" | "detected_publisher" | "detected_authors" | "old_status" | "new_status" | "match_reason" | "source_url";
  const [sortKey, setSortKey] = useState<SortKey>("new_status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }
  function SortHeader({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}<Icon className="h-3 w-3 opacity-60" />
      </button>
    );
  }

  const q = useQuery({
    queryKey: ["textbook-audit", campuses.length],
    queryFn: () => runTextbookMatchAudit(campuses),
    enabled: open,
    staleTime: 60_000,
  });

  const rows = q.data ?? [];

  const unknownCampusIds = useMemo(() => {
    const has: Record<string, boolean> = {};
    for (const r of rows) {
      const signal = !!(r.detected_title || r.detected_authors || r.detected_publisher || r.detected_isbn13);
      if (signal) has[r.campus_id] = true;
    }
    return campuses.filter((c) => !(c as any).archived_at && !has[c.id]).map((c) => c.id);
  }, [rows, campuses]);

  const isbnOnlyCampusIds = useMemo(() => {
    // Campuses where at least one family has ISBN but no title/authors/publisher.
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.detected_isbn13 && !r.detected_title && !r.detected_authors && !r.detected_publisher) {
        ids.add(r.campus_id);
      }
    }
    return Array.from(ids);
  }, [rows]);

  async function handleBulkResearchUnknown() {
    if (!unknownCampusIds.length) return;
    if (!confirm(`Start textbook-only research for ${unknownCampusIds.length} campuses?\n\nEstimated cost: ~$${(unknownCampusIds.length * 0.03).toFixed(2)}.`)) return;
    setBulkBusy(true);
    try {
      const job = await startTextbookOnlyBatch("unknown");
      toast.success(`Started textbook research job ${job.id.slice(0, 8)} for ${unknownCampusIds.length} campuses.`);
      qc.invalidateQueries({ queryKey: ["campus-batch"] });
    } catch (e) {
      toast.error(`Failed to start: ${(e as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleEnrichIsbnOnly() {
    if (!isbnOnlyCampusIds.length) return;
    setEnrichBusy(true);
    try {
      let ok = 0;
      for (const id of isbnOnlyCampusIds) {
        try {
          await runTextbookResearchForCampus(id, { force: false });
          ok++;
        } catch { /* keep going */ }
      }
      toast.success(`Enriched ${ok}/${isbnOnlyCampusIds.length} ISBN-only campuses via Google Books.`);
      await qc.invalidateQueries({ queryKey: ["textbook-audit"] });
      q.refetch();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setEnrichBusy(false);
    }
  }

  const summary = useMemo(() => {
    const intro1Matched = new Set<string>();
    const intro2Matched = new Set<string>();
    let upgraded = 0;
    let researchedCampuses = new Set<string>();
    for (const r of rows) {
      if (r.detected_title || r.detected_authors || r.detected_publisher || r.detected_isbn13) {
        researchedCampuses.add(r.campus_id);
      }
      if (r.new_status === "matched") {
        if (r.course_family === "intro_1") intro1Matched.add(r.campus_id);
        if (r.course_family === "intro_2") intro2Matched.add(r.campus_id);
        if (r.old_status !== "matched") upgraded++;
      }
    }
    return {
      intro1: intro1Matched.size,
      intro2: intro2Matched.size,
      upgraded,
      researched: researchedCampuses.size,
      totalCampuses: campuses.filter((c) => !(c as any).archived).length,
    };
  }, [rows, campuses]);

  // Sort: matched first, then unmatched, then unknown; within each, by campus name.
  const sorted = useMemo(() => {
    const order = { matched: 0, unmatched: 1, unknown: 2 } as const;
    const filtered = familyFilter === "all" ? rows : rows.filter((r) => r.course_family === familyFilter);
    return [...filtered].sort((a, b) => {
      const s = order[a.new_status] - order[b.new_status];
      if (s !== 0) return s;
      return a.campus_name.localeCompare(b.campus_name)
        || a.course_family.localeCompare(b.course_family);
    });
  }, [rows, familyFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Textbook Match Audit</DialogTitle>
          <DialogDescription>
            Per-campus, per-family comparison of the old "has any ISBN" rule vs. the new
            supported-textbook-family matcher (edition-insensitive, keyword + ISBN-prefix).
          </DialogDescription>
        </DialogHeader>

        <details className="rounded border bg-muted/30 p-3 text-xs">
          <summary className="cursor-pointer font-semibold">How textbook matching works</summary>
          <div className="mt-2 space-y-2 text-muted-foreground">
            <p>
              For each campus + course family (Intro 1, Intro 2, IA1, IA2) we read the
              detected textbook (<code>title</code>, <code>authors</code>, <code>publisher</code>,
              <code>isbn13</code>) from <code>campuses.course_family_textbooks_json</code> and
              score it against every row in <code>supported_textbook_families</code>.
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><strong>Authors</strong>: 2+ keyword hits = 0.7, 1 hit = 0.5</li>
              <li><strong>Title</strong>: 2+ hits = 0.25, 1 hit = 0.15</li>
              <li><strong>Publisher</strong>: any hit = 0.2</li>
              <li><strong>Score ≥ 0.5</strong> → matched. Editions ignored unless flagged.</li>
              <li><strong>ISBN-13 prefix fallback</strong>: if no keywords hit (often because the AI only captured an ISBN), an ISBN that starts with one of the family's known publisher prefixes (e.g. McGraw-Hill <code>9781264</code>, Wiley <code>9781119</code>, Cambridge <code>9781618</code>) is treated as a weak match (0.6).</li>
              <li>If <em>no</em> textbook metadata is on file for that family → <strong>unknown</strong> (not "unmatched"). 166 of 170 campuses are currently in this bucket simply because they haven't been textbook-researched yet.</li>
            </ul>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3 text-xs border-b pb-3">
          <Badge variant="outline" className="text-xs">
            Active campuses: <strong className="ml-1">{summary.totalCampuses}</strong>
          </Badge>
          <Badge variant="outline" className="text-xs">
            With textbook research: <strong className="ml-1">{summary.researched}</strong>
          </Badge>
          <Badge variant="outline" className="text-xs">
            Not yet researched: <strong className="ml-1">{summary.totalCampuses - summary.researched}</strong>
          </Badge>
          <Badge variant="outline" className="text-xs bg-emerald-50">
            Intro 1 matched: <strong className="ml-1">{summary.intro1}</strong>
          </Badge>
          <Badge variant="outline" className="text-xs bg-emerald-50">
            Intro 2 matched: <strong className="ml-1">{summary.intro2}</strong>
          </Badge>
          <Badge variant="outline" className="text-xs bg-amber-50">
            Newly matched (vs. old rule): <strong className="ml-1">{summary.upgraded}</strong>
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-[11px] font-medium text-muted-foreground">Family:</label>
            <select
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value)}
              className="h-8 rounded border bg-background px-2 text-xs"
            >
              <option value="all">All families ({rows.length})</option>
              {(["intro_1", "intro_2", "intermediate_1", "intermediate_2"] as const).map((f) => {
                const n = rows.filter((r) => r.course_family === f).length;
                return <option key={f} value={f}>{FAMILY_LABEL[f]} ({n})</option>;
              })}
            </select>
            <Button
              variant="outline" size="sm" className="h-8"
              disabled={!sorted.length}
              onClick={() => downloadAuditCsv(sorted)}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Download CSV
            </Button>
          </div>
        </div>


        <div className="flex flex-wrap items-center gap-2 rounded border bg-amber-50/40 p-2 text-xs">
          <BookOpen className="h-4 w-4 text-amber-700" />
          <span className="font-medium">Fix the data gap:</span>
          <span className="text-muted-foreground">
            {unknownCampusIds.length} campuses have no textbook research yet · {isbnOnlyCampusIds.length} have ISBN-only entries that can be repaired for free via Google Books.
          </span>
          <Button
            variant="outline" size="sm" className="ml-auto h-8"
            disabled={enrichBusy || !isbnOnlyCampusIds.length}
            onClick={handleEnrichIsbnOnly}
          >
            {enrichBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
            Enrich {isbnOnlyCampusIds.length} ISBN-only via Google Books
          </Button>
          <Button
            size="sm" className="h-8"
            disabled={bulkBusy || !unknownCampusIds.length}
            onClick={handleBulkResearchUnknown}
          >
            {bulkBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <BookOpen className="h-3.5 w-3.5 mr-1" />}
            Research textbooks for {unknownCampusIds.length} unknown campuses
          </Button>
        </div>

        <div className="flex-1 overflow-auto rounded border">

          {q.isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running audit…
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/70 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Campus</th>
                  <th className="px-2 py-2 text-left">Family</th>
                  <th className="px-2 py-2 text-left">Course code</th>
                  <th className="px-2 py-2 text-left">Detected textbook</th>
                  <th className="px-2 py-2 text-left">Publisher</th>
                  <th className="px-2 py-2 text-left">Authors</th>
                  <th className="px-2 py-2 text-left">Old</th>
                  <th className="px-2 py-2 text-left">New</th>
                  <th className="px-2 py-2 text-left">Match reason</th>
                  <th className="px-2 py-2 text-left">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((r, i) => (
                  <tr key={i} className="align-top hover:bg-muted/20">
                    <td className="px-2 py-1 font-medium">{r.campus_name}</td>
                    <td className="px-2 py-1">{FAMILY_LABEL[r.course_family] ?? r.course_family}</td>
                    <td className="px-2 py-1 font-mono">{r.course_code ?? "—"}</td>
                    <td className="px-2 py-1">
                      {r.detected_title ?? <span className="text-muted-foreground">—</span>}
                      {r.matched_label && (
                        <div className="text-[10px] text-emerald-700 mt-0.5">→ {r.matched_label}</div>
                      )}
                    </td>
                    <td className="px-2 py-1">{r.detected_publisher ?? "—"}</td>
                    <td className="px-2 py-1">{r.detected_authors ?? "—"}</td>
                    <td className="px-2 py-1">{statusBadge(r.old_status)}</td>
                    <td className="px-2 py-1">{statusBadge(r.new_status)}</td>
                    <td className="px-2 py-1 text-[11px] text-muted-foreground max-w-[260px]">
                      {r.match_reason ?? "—"}
                    </td>
                    <td className="px-2 py-1">
                      {r.source_url ? (
                        <a href={r.source_url} target="_blank" rel="noreferrer"
                          className="text-primary underline truncate inline-block max-w-[160px]">
                          link
                        </a>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && !q.isLoading && (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                    No audit rows.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function downloadAuditCsv(rows: TextbookAuditRow[]) {
  const header = [
    "Campus", "Course family", "Course code", "Detected title", "Detected publisher",
    "Detected authors", "Detected ISBN13", "Old status", "New status",
    "Matched family", "Match reason", "Match confidence", "Source URL",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((r) => [
    r.campus_name, r.course_family, r.course_code, r.detected_title, r.detected_publisher,
    r.detected_authors, r.detected_isbn13, r.old_status, r.new_status,
    r.matched_label, r.match_reason, r.match_confidence.toFixed(2), r.source_url,
  ].map(esc).join(","));
  const csv = [header.map(esc).join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "textbook-match-audit.csv"; a.click();
  URL.revokeObjectURL(url);
}
