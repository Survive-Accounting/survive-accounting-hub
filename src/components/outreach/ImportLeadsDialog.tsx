// Ported from the original app (ProfessorOutreach.tsx — ImportLeadsDialog + ManualEntryPanel).
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, GraduationCap, HelpCircle, Loader2, Search, Upload } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Campus } from "@/lib/outreach-mock";
import { importLeads, importSendTime } from "@/lib/outreach-api";
import LeadSuggestionsPanel from "./LeadSuggestionsPanel";

type LeadType = "professors" | "bap_advisors" | "accounting_depts" | "cpa_alumni";

const LEAD_TYPE_META: Record<LeadType, { label: string; dot: string; text: string; bg: string; disabled?: boolean }> = {
  professors:       { label: "Professors",              dot: "bg-blue-500",    text: "text-blue-700 dark:text-blue-300",     bg: "bg-blue-500/10" },
  bap_advisors:     { label: "BAP Advisors",            dot: "bg-purple-500",  text: "text-purple-700 dark:text-purple-300", bg: "bg-purple-500/10", disabled: true },
  accounting_depts: { label: "Accounting Departments",  dot: "bg-amber-500",   text: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-500/10",  disabled: true },
  cpa_alumni:       { label: "CPA Alumni",              dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500/10", disabled: true },
};

function LeadTypePill({ type }: { type: LeadType }) {
  const m = LEAD_TYPE_META[type];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium ${m.bg} ${m.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

type EntryRow = { email: string; first_name: string; last_name: string; is_phd: boolean };
const EMPTY_ROW = (): EntryRow => ({ email: "", first_name: "", last_name: "", is_phd: false });

function parsePhdValue(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1" || s === "phd" || s === "dr";
}

export default function ImportLeadsDialog({
  open, onClose, campuses, defaultCampusId, onImported, usingMock,
}: {
  open: boolean;
  onClose: () => void;
  campuses: Campus[];
  defaultCampusId?: string | null;
  onImported?: () => void;
  usingMock?: boolean;
}) {
  const [leadType, setLeadType] = useState<LeadType>("professors");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add Leads</DialogTitle>
          <DialogDescription>
            Type or paste directly into the table. One campus at a time — switch campuses with the dropdown.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">Accounting only</span> — professors, lecturers, instructors, or TAs. Quality over quantity. Other lead types come later.
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Label className="text-xs">Lead type</Label>
            <Select value={leadType} onValueChange={(v) => setLeadType(v as LeadType)}>
              <SelectTrigger className="h-9 w-[280px]">
                <SelectValue>
                  <LeadTypePill type={leadType} />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LEAD_TYPE_META) as LeadType[]).map((k) => {
                  const m = LEAD_TYPE_META[k];
                  return (
                    <SelectItem key={k} value={k} disabled={m.disabled}>
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                        <span className={m.text}>{m.label}</span>
                        {m.disabled && <span className="ml-1 text-[10px] text-muted-foreground">(coming soon)</span>}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          {leadType === "professors" ? (
            <ManualEntryPanel
              campuses={campuses}
              defaultCampusId={defaultCampusId ?? null}
              onImported={onImported}
              usingMock={usingMock}
            />
          ) : (
            <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              This lead type isn't available yet. We're focusing on Professors first.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualEntryPanel({
  campuses, defaultCampusId, onImported, usingMock,
}: {
  campuses: Campus[];
  defaultCampusId: string | null;
  onImported?: () => void;
  usingMock?: boolean;
}) {
  // Same rule as the original: only approved campuses can take leads.
  const approvedCampuses = useMemo(
    () => campuses.filter((c) => c.approval_status === "approved" && !c.archived),
    [campuses],
  );
  const [rows, setRows] = useState<EntryRow[]>(() => Array.from({ length: 5 }, EMPTY_ROW));
  const [summary, setSummary] = useState<{ imported: number; duplicates: number; autoScheduled: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedCampusId, setSelectedCampusId] = useState<string>("");

  useEffect(() => {
    if (selectedCampusId) return;
    if (defaultCampusId && approvedCampuses.some((c) => c.id === defaultCampusId)) {
      setSelectedCampusId(defaultCampusId);
    } else if (approvedCampuses.length === 1) {
      setSelectedCampusId(approvedCampuses[0].id);
    }
  }, [defaultCampusId, approvedCampuses, selectedCampusId]);

  const validRows = useMemo(() => rows.filter((r) => r.email.trim()), [rows]);
  const noCampuses = approvedCampuses.length === 0;
  const selectedCampusName = approvedCampuses.find((c) => c.id === selectedCampusId)?.school_name ?? "";

  const updateCell = (idx: number, key: keyof EntryRow, value: string | boolean) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  const addRow = () => setRows((p) => [...p, EMPTY_ROW()]);
  const removeRow = (idx: number) => setRows((p) => (p.length === 1 ? [EMPTY_ROW()] : p.filter((_, i) => i !== idx)));
  const clearAll = () => setRows(Array.from({ length: 5 }, EMPTY_ROW));

  // Paste handler: supports pasting tab/comma-separated data from spreadsheets into any cell.
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData("text");
    if (!text || !/[\n\t]/.test(text)) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
    const COLS: (keyof EntryRow)[] = ["email", "first_name", "last_name", "is_phd"];
    setRows((prev) => {
      const next = [...prev];
      lines.forEach((line, li) => {
        const cells = line.split(/\t|,/);
        const targetIdx = rowIdx + li;
        while (next.length <= targetIdx) next.push(EMPTY_ROW());
        const cur = { ...next[targetIdx] };
        cells.forEach((raw, ci) => {
          const colKey = COLS[colIdx + ci];
          if (!colKey) return;
          const val = raw.trim();
          if (colKey === "is_phd") cur.is_phd = parsePhdValue(val);
          else if (colKey === "email") cur.email = val.toLowerCase();
          else cur[colKey] = val;
        });
        next[targetIdx] = cur;
      });
      return next;
    });
  };

  async function runImport() {
    if (!selectedCampusId) { toast.error("Pick a campus first."); return; }
    if (validRows.length === 0) { toast.error("Add at least one email."); return; }
    if (usingMock) { toast.error("Database unreachable — can't save leads right now."); return; }
    setImporting(true);
    try {
      const { imported, duplicates, autoScheduled } = await importLeads(selectedCampusId, validRows);
      setSummary({ imported, duplicates, autoScheduled });
      toast.success(`Nice work! ${imported} professor${imported === 1 ? "" : "s"} imported 🎉`);
      setRows(Array.from({ length: 5 }, EMPTY_ROW));
      onImported?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1.5 min-w-[280px]">
            <Label className="text-xs">Campus</Label>
            <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
              <SelectTrigger className="h-9 w-[320px]">
                <SelectValue placeholder="Select approved campus…" />
              </SelectTrigger>
              <SelectContent>
                {approvedCampuses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.school_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground max-w-[320px] text-right">
            Tip: copy a block of cells from Google Sheets / Excel and paste into the Email column — rows fill automatically.
          </div>
        </div>

        {(() => {
          const disabled = !selectedCampusName;
          const g = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
          const links: Array<{ label: string; href: string }> = selectedCampusName
            ? [
                { label: "Faculty directory", href: g(`"${selectedCampusName}" accounting faculty directory`) },
                { label: "Department page", href: g(`"${selectedCampusName}" accounting department professors site:.edu`) },
                { label: "LinkedIn", href: g(`site:linkedin.com/in "${selectedCampusName}" accounting professor`) },
              ]
            : [];
          return (
            <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold">
                  <Search className="h-3.5 w-3.5" /> Research
                </div>
                {disabled ? (
                  <span className="text-xs text-muted-foreground">Select a campus to enable quick searches.</span>
                ) : (
                  links.map((l) => (
                    <Button key={l.label} type="button" variant="outline" size="sm" className="h-7 text-xs" asChild>
                      <a href={l.href} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-1 h-3 w-3" /> {l.label}
                      </a>
                    </Button>
                  ))
                )}
              </div>
              {!disabled && (
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  Open the school's faculty list, then paste names + emails below.
                </div>
              )}
            </div>
          );
        })()}

        {noCampuses && (
          <div className="mt-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
            No approved campuses yet. Approve a campus from the Campuses tab first.
          </div>
        )}

        <div className="mt-4 max-h-[55vh] overflow-auto rounded border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left w-[40px]">#</th>
                <th className="px-2 py-2 text-left">Email *</th>
                <th className="px-2 py-2 text-left">First name</th>
                <th className="px-2 py-2 text-left">Last name</th>
                <th className="px-2 py-2 text-left w-[80px]">
                  <span className="inline-flex items-center gap-1">
                    PhD
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Why PhD matters">
                          <HelpCircle className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[260px] text-xs">
                        Mark anyone with a PhD. We must address them as <strong>"Dr. [Last name]"</strong> — never their first name.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </th>
                <th className="px-2 py-2 w-[40px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-2 py-1 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-1 py-1">
                    <Input
                      value={r.email}
                      onChange={(e) => updateCell(i, "email", e.target.value)}
                      onPaste={(e) => handlePaste(e, i, 0)}
                      placeholder="name@school.edu"
                      className="h-8 font-mono text-xs"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={r.first_name}
                      onChange={(e) => updateCell(i, "first_name", e.target.value)}
                      onPaste={(e) => handlePaste(e, i, 1)}
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={r.last_name}
                      onChange={(e) => updateCell(i, "last_name", e.target.value)}
                      onPaste={(e) => handlePaste(e, i, 2)}
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={r.is_phd}
                      onChange={(e) => updateCell(i, "is_phd", e.target.checked)}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-1 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-muted-foreground hover:text-red-600 text-xs"
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" type="button" onClick={addRow}>+ Add row</Button>
          <Button size="sm" variant="ghost" type="button" onClick={clearAll}>Clear</Button>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {validRows.length} lead{validRows.length === 1 ? "" : "s"} ready
            </span>
            <Button onClick={runImport} disabled={importing || validRows.length === 0 || !selectedCampusId}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Save {validRows.length || ""}
            </Button>
          </div>
        </div>

        {summary && (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <div className="text-base font-bold">Nice work! 🎉</div>
            <div className="mt-1">
              <strong>{summary.imported}</strong> professor{summary.imported === 1 ? "" : "s"} imported
              {summary.duplicates > 0 && <> · {summary.duplicates} duplicate{summary.duplicates === 1 ? "" : "s"} skipped</>}
            </div>
            {summary.imported > 0 && (
              <div className="mt-1 text-xs text-muted-foreground">
                {summary.autoScheduled ? (
                  <>
                    Their intro emails are queued — going out{" "}
                    <strong className="text-foreground">
                      {importSendTime().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} around 9:30 AM
                    </strong>{" "}
                    (2 business days). No extra steps needed.
                  </>
                ) : (
                  <>
                    They're marked <strong className="text-foreground">ready</strong> — head to the Email Queue tab to batch-schedule when you're set.
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    </TooltipProvider>
  );
}
