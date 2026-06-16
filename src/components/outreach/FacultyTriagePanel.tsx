import { useCallback, useEffect, useState } from "react";
import { Check, X, ExternalLink, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  fetchTriageRows, importKeptLeads, setTriageFlag, setTriageStatus, type TriageRow,
} from "@/lib/faculty-triage";

export function FacultyTriagePanel({
  campusId,
  campusName,
  refreshToken,
}: {
  campusId: string;
  campusName: string;
  /** Bumped after a scrape completes to force a reload. */
  refreshToken?: number;
}) {
  const [rows, setRows] = useState<TriageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const qc = useQueryClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchTriageRows(campusId));
    } catch (e) {
      toast.error(`Could not load candidates: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setLoading(false);
    }
  }, [campusId]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const update = (id: string, patch: Partial<TriageRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const onFlag = async (id: string, field: "is_phd" | "is_cpa", value: boolean) => {
    update(id, { [field]: value } as Partial<TriageRow>);
    try { await setTriageFlag(id, { [field]: value }); }
    catch (e) { toast.error(`Save failed: ${e instanceof Error ? e.message : "unknown"}`); void load(); }
  };

  const onStatus = async (id: string, status: "kept" | "skipped" | "pending_triage") => {
    update(id, { status });
    try { await setTriageStatus(id, status); }
    catch (e) { toast.error(`Save failed: ${e instanceof Error ? e.message : "unknown"}`); void load(); }
  };

  const onImport = async () => {
    setImporting(true);
    try {
      const result = await importKeptLeads(campusId);
      toast.success(`Imported ${result.inserted} leads into the email queue.${result.skipped ? ` Skipped ${result.skipped} (duplicate or missing email).` : ""}`);
      qc.invalidateQueries({ queryKey: ["outreach-leads"] });
      await load();
    } catch (e) {
      toast.error(`Import failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setImporting(false);
    }
  };

  const keptCount = rows.filter((r) => r.status === "kept").length;
  const pendingCount = rows.filter((r) => !r.status || r.status === "pending_triage").length;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div>
          <div className="text-sm font-semibold">Faculty triage — {campusName}</div>
          <div className="text-[11px] text-muted-foreground">
            {loading ? "Loading…" : `${rows.length} candidate${rows.length === 1 ? "" : "s"} · ${pendingCount} pending · ${keptCount} kept`}
          </div>
        </div>
        <Button
          size="sm"
          onClick={onImport}
          disabled={importing || keptCount === 0}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {importing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…</> : <>Import {keptCount} kept lead{keptCount === 1 ? "" : "s"}</>}
        </Button>
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">Loading candidates…</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-muted-foreground">
          <Inbox className="h-6 w-6" />
          <div className="text-sm">No candidates yet.</div>
          <div className="text-[11px]">Click <strong>Scrape faculty</strong> above to pull names from the school's directory page(s).</div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[20%]">Name</TableHead>
              <TableHead className="w-[18%]">Title</TableHead>
              <TableHead className="w-[22%]">Email</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-[60px] text-center">PhD</TableHead>
              <TableHead className="w-[60px] text-center">CPA</TableHead>
              <TableHead className="w-[150px] text-center">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const status = r.status ?? "pending_triage";
              return (
                <TableRow key={r.id} className={status === "skipped" ? "opacity-50" : status === "kept" ? "bg-emerald-50/40" : ""}>
                  <TableCell className="font-medium">
                    {(r.first_name ?? "") + " " + (r.last_name ?? "")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.title ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {r.email ? (
                      <a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a>
                    ) : (
                      <span className="text-amber-700">no email found</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.source_url ? (
                      <a href={r.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3 w-3" /> source
                      </a>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox checked={!!r.is_phd} onCheckedChange={(v) => onFlag(r.id, "is_phd", !!v)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox checked={!!r.is_cpa} onCheckedChange={(v) => onFlag(r.id, "is_cpa", !!v)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        size="sm"
                        variant={status === "kept" ? "default" : "outline"}
                        className={status === "kept" ? "h-7 bg-emerald-600 hover:bg-emerald-700 px-2 text-xs" : "h-7 px-2 text-xs"}
                        onClick={() => onStatus(r.id, status === "kept" ? "pending_triage" : "kept")}
                      >
                        <Check className="h-3 w-3" /> Keep
                      </Button>
                      <Button
                        size="sm"
                        variant={status === "skipped" ? "default" : "outline"}
                        className={status === "skipped" ? "h-7 bg-muted-foreground hover:bg-muted-foreground/90 px-2 text-xs" : "h-7 px-2 text-xs"}
                        onClick={() => onStatus(r.id, status === "skipped" ? "pending_triage" : "skipped")}
                      >
                        <X className="h-3 w-3" /> Skip
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
