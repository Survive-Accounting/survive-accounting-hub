// CSV IN AND OUT — the same control for one school and for all of them.
//
// Export downloads every stored contact in the agreed shape; import reads that shape back. The
// file is identical either way (School is always column one), so a single-school export can be
// pasted straight into the all-schools import without editing.
//
// Import REPORTS rather than guesses: a school or council it cannot recognise comes back with its
// line number instead of being filed somewhere plausible. A contact under the wrong campus is
// worse than one that failed to import, because nobody finds it again.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Download, FileUp, Loader2, Upload, X } from "lucide-react";

import { CSV_HEADERS, parseContactsCsv } from "@/lib/outreach-csv";
import { outreachExportCsv, outreachImportCsv, type CsvImportResult } from "@/lib/outreach-csv.functions";
import { cn } from "@/lib/utils";

export function ContactsCsvBar({ campusId, campusName, className }: {
  /** Omit (or null) for the all-schools file. */
  campusId?: string | null;
  campusName?: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scope = campusId ? (campusName ?? "this school") : "all schools";

  const exportCsv = useMutation({
    mutationFn: () => outreachExportCsv({ data: { campusId: campusId ?? null } }),
    onSuccess: (r) => {
      if (!r.rows) { toast.info("Nothing to export yet."); return; }
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Exported ${r.rows} contact${r.rows === 1 ? "" : "s"}${campusId ? "" : ` across ${r.schools} school${r.schools === 1 ? "" : "s"}`}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importCsv = useMutation({
    mutationFn: (rows: Parameters<typeof outreachImportCsv>[0] extends never ? never : ReturnType<typeof parseContactsCsv>["rows"]) =>
      outreachImportCsv({ data: { campusId: campusId ?? null, rows } }),
    onSuccess: (r) => {
      setResult(r);
      const bits = [r.added ? `${r.added} added` : "", r.updated ? `${r.updated} updated` : ""].filter(Boolean).join(", ");
      if (r.added || r.updated) toast.success(`${bits}${r.skipped ? ` · ${r.skipped} skipped` : ""}.`);
      else toast.warning(r.skipped ? `Nothing imported — ${r.skipped} row${r.skipped === 1 ? "" : "s"} had a problem.` : "Nothing to import.");
      setText("");
      for (const key of ["co-board", "dm-board", "dm-roster", "dm-plan", "ig-campus"]) void qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (raw: string) => {
    const { rows, skipped, headerFound } = parseContactsCsv(raw);
    if (!headerFound) {
      toast.error(`No header row found. The first line must name the columns: ${CSV_HEADERS.join(", ")}.`);
      return;
    }
    if (!rows.length) { toast.error(skipped ? `No usable rows — ${skipped} had neither a handle nor an email.` : "No rows found."); return; }
    importCsv.mutate(rows as never);
  };

  const onFile = async (file: File) => {
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        submit(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));
      } else {
        submit(await file.text());
      }
    } catch (e) { toast.error(`Couldn't read that file: ${(e as Error).message}`); }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => exportCsv.mutate()}
          disabled={exportCsv.isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted disabled:opacity-40"
          title={`Download every contact for ${scope}`}
        >
          {exportCsv.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          Export CSV{campusId ? "" : " (all schools)"}
        </button>
        <button
          onClick={() => { setOpen((v) => !v); setResult(null); }}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted"
        >
          {open ? <><X className="size-3.5" /> Close</> : <><Upload className="size-3.5" /> Import CSV</>}
        </button>
      </div>

      {open && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-[11.5px] text-muted-foreground">
            Columns: <span className="font-medium">{CSV_HEADERS.join(" · ")}</span>. A header row is required; order does not matter and extra columns are ignored.
            {campusId
              ? " School may be left out — every row goes to this school, and a row naming a different one is refused."
              : " Every row must name its School so it lands on the right campus."}
            {" "}Councils: IFC, Panhellenic, NPHC, MGC, Women in Business, Other.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={`${CSV_HEADERS.join(",")}\n${campusName ?? "Ole Miss"},IFC,Scholarship Chair,Maddie Carter,@maddiec,Sigma Chi,maddie@go.olemiss.edu`}
            className="w-full rounded-lg border border-border bg-background p-2 font-mono text-[11.5px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => submit(text)}
              disabled={importCsv.isPending || !text.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
            >
              {importCsv.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Import pasted
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={importCsv.isPending} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted disabled:opacity-40">
              <FileUp className="size-3.5" /> Upload .csv / .xlsx
            </button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          </div>

          {result && (
            <div className="rounded-lg bg-muted/40 p-2 text-[11.5px]">
              <div className="font-medium">
                {result.added} added · {result.updated} updated · {result.skipped} skipped
                {result.schoolsTouched.length > 0 && ` · ${result.schoolsTouched.slice(0, 6).join(", ")}${result.schoolsTouched.length > 6 ? ` +${result.schoolsTouched.length - 6}` : ""}`}
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
