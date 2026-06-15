// AI Suggested Leads — review staging table for campus_lead_suggestions.
// Inserts no rows directly into outreach_leads; "Import Accepted Leads"
// pipes accepted suggestions with valid emails through the existing
// importLeads() path, preserving dedupe / scheduled_send_at / landing_token.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

const STATUS_OPTIONS: LeadSuggestionStatus[] = ["pending", "accepted", "rejected", "needs_lee"];
const TYPE_OPTIONS: LeadSuggestionType[] = [
  "professor",
  "admin_staff",
  "bap_advisor",
  "tutoring_center",
  "other",
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LeadSuggestionsPanel({
  campusId,
  onImported,
}: {
  campusId: string | null;
  onImported?: () => void;
}) {
  const [rows, setRows] = useState<LeadSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [researching, setResearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
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
    // optimistic
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

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-violet-500" /> AI Suggested Leads
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            AI suggestions must be reviewed before they become real outreach leads.
          </div>
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {rows.length} total · {counts.pending} pending · {counts.accepted} accepted · {counts.rejected} rejected · {counts.needs_lee} needs Lee
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" type="button" onClick={() => bulkSetStatus("accepted")} disabled={selected.size === 0}>Accept selected</Button>
            <Button size="sm" variant="outline" type="button" onClick={() => bulkSetStatus("rejected")} disabled={selected.size === 0}>Reject selected</Button>
            <Button size="sm" variant="outline" type="button" onClick={() => bulkSetStatus("needs_lee")} disabled={selected.size === 0}>Mark Needs Lee</Button>
            <Button size="sm" type="button" onClick={importAccepted} disabled={importing || counts.accepted === 0}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import Accepted Leads
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 max-h-[40vh] overflow-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-2 py-2 w-[28px]">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-3.5 w-3.5" />
              </th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left">First</th>
              <th className="px-2 py-2 text-left">Last</th>
              <th className="px-2 py-2 text-left">Title</th>
              <th className="px-2 py-2 w-[42px]">PhD</th>
              <th className="px-2 py-2 w-[42px]">CPA</th>
              <th className="px-2 py-2 text-left w-[72px]">Conf.</th>
              <th className="px-2 py-2 text-left">Source</th>
              <th className="px-2 py-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                  {loading
                    ? "Loading suggestions…"
                    : !campusId
                      ? "Pick a campus to see suggestions."
                      : "No suggestions yet. Click Auto-Research Leads with AI."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/20 align-top">
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                    className="h-3.5 w-3.5"
                  />
                </td>
                <td className="px-1 py-1">
                  <Select value={r.status} onValueChange={(v) => patchRow(r.id, { status: v as LeadSuggestionStatus })}>
                    <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
