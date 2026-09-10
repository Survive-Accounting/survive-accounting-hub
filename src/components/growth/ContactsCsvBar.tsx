// CSV IN AND OUT — the same control for one school and for all of them, on the unified 25-column
// schema (CONTACTS-SCHEMA.md).
//
// Import takes either shape. A file already in the schema goes straight in; a raw scrape
// (School,Council,Role,Name,Instagram,Chapter,Email) is CLEANED first — chapters re-matched to the
// handle they actually spell, rows moved to the school their email domain proves, duplicates and
// the scraper's cartesian product merged — and the preview shows exactly what that did before
// anything is written.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, Download, FileUp, Loader2, Upload, X } from "lucide-react";

import { CONTACT_COLUMNS } from "@/lib/growth-contacts-schema";
import {
  contactsCleanForImport, contactsExport, contactsImport, contactsImportPreview,
  type ImportPreview, type ImportResult,
} from "@/lib/growth-contacts-io.functions";
import { cn } from "@/lib/utils";

/** Metrics worth showing from the cleaner, in the order they read as a story. */
const STAT_LABEL: Record<string, string> = {
  input_rows: "rows read",
  dropped_exact_duplicates: "exact duplicates dropped",
  dropped_test_rows: "test rows dropped",
  rows_moved_to_real_school_by_email_domain: "moved to the school their email proves",
  chapter_extracted_from_role_or_name: "chapter names pulled out of Role/Name",
  chapter_ig_reassigned_to_correct_chapter: "handles re-matched to the right chapter",
  chapter_ig_assigned_to_chapter_missing_from_school_list: "handles matched to a chapter the list lacked",
  chapter_ig_moved_to_council: "handles moved to their council",
  chapter_ig_moved_to_campus_club: "handles moved to a campus club",
  chapter_ig_noise_or_unmatched: "school-wide or unmatched handles dropped",
  duplicate_org_rows_collapsed: "duplicate org rows merged",
  duplicate_person_rows_collapsed: "duplicate people merged",
  cartesian_product_people_resolved: "cartesian-product people resolved",
  org_ig_propagated_to_rows: "org handles copied onto their people",
  dropped_rows_with_no_contact_channel: "rows with no channel dropped",
  output_rows: "rows to import",
};

export function ContactsCsvBar({ campusId, campusName, className }: {
  campusId?: string | null;
  campusName?: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sourceTag, setSourceTag] = useState("");
  const scope = campusId ? (campusName ?? "this school") : "all schools";

  const download = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportCsv = useMutation({
    mutationFn: (v: { onlyNeedsReview: boolean }) => contactsExport({ data: { campusId: campusId ?? null, onlyNeedsReview: v.onlyNeedsReview } }),
    onSuccess: (r) => {
      if (!r.rows) { toast.info("Nothing to export yet."); return; }
      download(r.csv, r.filename);
      toast.success(`Exported ${r.rows} contact${r.rows === 1 ? "" : "s"}${campusId ? "" : ` across ${r.schools} school${r.schools === 1 ? "" : "s"}`}${r.needsReview ? ` · ${r.needsReview} need review` : ""}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // The cleaned rows the preview produced, held so Import writes exactly what was previewed —
  // never a second, differently-cleaned pass over the same text.
  const [importRows, setImportRows] = useState<ImportPreview["sample"]>([]);

  const doPreview = useMutation({
    mutationFn: async (raw: string) => {
      const p = await contactsImportPreview({ data: { text: raw, source: sourceTag } });
      const full = await contactsCleanForImport({ data: { text: raw, source: sourceTag } });
      return { p, rows: full.rows };
    },
    onSuccess: ({ p, rows }) => {
      setPreview(p); setResult(null); setImportRows(rows);
      if (!p.cleaned) toast.error("Nothing usable in that file.");
      else if (p.unknownSchools.length) toast.warning(`${p.cleaned} rows ready — ${p.unknownSchools.length} school name${p.unknownSchools.length === 1 ? "" : "s"} not in the campus table will be skipped.`);
      else toast.success(`${p.cleaned} rows ready to import.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doImport = useMutation({
    mutationFn: () => contactsImport({ data: { rows: importRows, legacy: false, source: sourceTag } }),
    onSuccess: (r) => {
      setResult(r);
      toast.success(`${r.inserted} added · ${r.updated} updated${r.skipped ? ` · ${r.skipped} skipped` : ""}.`);
      for (const key of ["co-board", "dm-board", "dm-roster", "dm-plan", "ig-campus"]) void qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runPreview = (raw: string) => doPreview.mutate(raw);

  const onFile = async (file: File) => {
    try {
      let raw: string;
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        raw = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
      } else raw = await file.text();
      setText("");
      if (!sourceTag) setSourceTag(`${file.name} @ ${new Date().toISOString().slice(0, 10)}`);
      await runPreview(raw);
    } catch (e) { toast.error(`Couldn't read that file: ${(e as Error).message}`); }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => exportCsv.mutate({ onlyNeedsReview: false })}
          disabled={exportCsv.isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted disabled:opacity-40"
          title={`Download every contact for ${scope}`}
        >
          {exportCsv.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          Export CSV{campusId ? "" : " (all schools)"}
        </button>
        <button
          onClick={() => exportCsv.mutate({ onlyNeedsReview: true })}
          disabled={exportCsv.isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted disabled:opacity-40"
          title="Only the rows the cleaner could not resolve"
        >
          <AlertTriangle className="size-3.5" /> Needs review
        </button>
        <button
          onClick={() => { setOpen((v) => !v); setPreview(null); setResult(null); }}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted"
        >
          {open ? <><X className="size-3.5" /> Close</> : <><Upload className="size-3.5" /> Import CSV</>}
        </button>
      </div>

      {open && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-[11.5px] text-muted-foreground">
            Takes either shape. A file in the full schema ({CONTACT_COLUMNS.length} columns, starting <span className="font-medium">contact_id, school, council…</span>) imports as-is.
            A raw scrape (<span className="font-medium">School, Council, Role, Name, Instagram, Chapter, Email</span>) is cleaned first — handles re-matched to the right chapter, rows moved to the school their email proves, duplicates merged — and you see what changed before anything is written.
          </p>
          <input
            value={sourceTag}
            onChange={(e) => setSourceTag(e.target.value)}
            placeholder="source tag, e.g. fall-scrape.csv @ 2026-09-10"
            className="w-full rounded-lg border border-border bg-background px-2 py-1 text-[11.5px]"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={"School,Council,Role,Name,Instagram,Chapter,Email\nOle Miss,IFC,Scholarship Chair,Maddie Carter,@maddiec,Sigma Chi,maddie@go.olemiss.edu"}
            className="w-full rounded-lg border border-border bg-background p-2 font-mono text-[11.5px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void runPreview(text)}
              disabled={doPreview.isPending || !text.trim()}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted disabled:opacity-40"
            >
              {doPreview.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Preview pasted
            </button>
            <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted">
              <FileUp className="size-3.5" /> Upload .csv / .xlsx
            </button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          </div>

          {preview && (
            <div className="space-y-2 rounded-lg bg-muted/40 p-2 text-[11.5px]">
              <div className="font-medium">
                {preview.legacy ? "Raw scrape — cleaned" : "Already in schema"} · {preview.cleaned} row{preview.cleaned === 1 ? "" : "s"} to import
                {preview.needsReview ? ` · ${preview.needsReview} flagged for review` : ""}
                {preview.dropped ? ` · ${preview.dropped} dropped` : ""}
              </div>
              {preview.legacy && (
                <ul className="max-h-44 space-y-0.5 overflow-y-auto text-muted-foreground">
                  {Object.entries(STAT_LABEL)
                    .filter(([k]) => (preview.stats[k] ?? 0) > 0)
                    .map(([k, lbl]) => <li key={k}>{preview.stats[k]} {lbl}</li>)}
                </ul>
              )}
              {preview.unknownSchools.length > 0 && (
                <div className="text-amber-600 dark:text-amber-400">
                  Not in the campus table, will be skipped: {preview.unknownSchools.slice(0, 8).join(", ")}
                  {preview.unknownSchools.length > 8 ? ` +${preview.unknownSchools.length - 8} more` : ""}
                </div>
              )}
              <button
                onClick={() => doImport.mutate()}
                disabled={doImport.isPending || !importRows.length}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
              >
                {doImport.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Import {importRows.length} row{importRows.length === 1 ? "" : "s"}
              </button>
            </div>
          )}

          {result && (
            <div className="rounded-lg bg-muted/40 p-2 text-[11.5px]">
              <div className="font-medium">
                {result.inserted} added · {result.updated} updated · {result.skipped} skipped · {result.schoolsTouched} school{result.schoolsTouched === 1 ? "" : "s"}
              </div>
              {result.problems.length > 0 && (
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-muted-foreground">
                  {result.problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

