// Professor leads table — modeled on the original AllLeadsPanel
// (send/notes actions arrive with the Resend integration).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Copy, Loader2, RefreshCw, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Campus } from "@/lib/outreach-mock";
import { fetchLeads, sendOutreachEmail, setLeadStopped } from "@/lib/outreach-api";
import { useQueryClient } from "@tanstack/react-query";

export function LeadsPanel({ campuses }: { campuses: Campus[] }) {
  const { data: leads = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["outreach-leads"],
    queryFn: fetchLeads,
    retry: 1,
  });
  const [search, setSearch] = useState("");
  const [campusFilter, setCampusFilter] = useState("_all");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const qc = useQueryClient();

  const handleSend = async (leadId: string, email: string) => {
    if (!window.confirm(`Send the initial outreach email to ${email}?`)) return;
    setSendingId(leadId);
    const res = await sendOutreachEmail(leadId, 0);
    setSendingId(null);
    if (res.ok) {
      toast.success(`Sent (${res.variant ?? "default"} template)`);
      qc.invalidateQueries({ queryKey: ["outreach-leads"] });
    } else {
      toast.error(res.error ?? "Send failed");
    }
  };

  const campusById = useMemo(() => new Map(campuses.map((c) => [c.id, c])), [campuses]);
  const campusesWithLeads = useMemo(() => {
    const ids = new Set(leads.map((l) => l.campus_id).filter(Boolean) as string[]);
    return campuses.filter((c) => ids.has(c.id));
  }, [leads, campuses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (campusFilter !== "_all" && l.campus_id !== campusFilter) return false;
      if (!q) return true;
      const name = [l.first_name, l.last_name].filter(Boolean).join(" ").toLowerCase();
      const campus = (l.campus_id && campusById.get(l.campus_id)?.school_name.toLowerCase()) || "";
      return l.email.toLowerCase().includes(q) || name.includes(q) || campus.includes(q);
    });
  }, [leads, search, campusFilter, campusById]);

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <h2 className="text-sm font-semibold">Professor Leads</h2>
        <span className="text-xs text-muted-foreground">{leads.length}</span>
        <Input
          placeholder="Search…"
          className="h-9 max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={campusFilter} onValueChange={setCampusFilter}>
          <SelectTrigger className="h-9 w-52"><SelectValue placeholder="By campus" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All campuses</SelectItem>
            {campusesWithLeads.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.school_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching} className="ml-auto">
          {isRefetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : isError ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          Couldn't load leads — database unreachable.
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          {leads.length === 0
            ? "No professor leads yet. Approve a campus, then use Import Leads."
            : "No leads match."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="px-2.5 py-2">Campus</th>
                <th className="px-2.5 py-2">Name</th>
                <th className="px-2.5 py-2">Email</th>
                <th className="px-2.5 py-2">PhD</th>
                <th className="px-2.5 py-2">Status</th>
                <th className="px-2.5 py-2">Landing Link</th>
                <th className="px-2.5 py-2 text-right">Opens</th>
                <th className="px-2.5 py-2 text-right">Clicks</th>
                <th className="px-2.5 py-2 text-right">Added</th>
                <th className="px-2.5 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((l) => {
                const c = l.campus_id ? campusById.get(l.campus_id) : undefined;
                return (
                  <tr key={l.id} className="hover:bg-muted/30">
                    <td className="px-2.5 py-1.5">
                      <div className="font-medium">{c?.school_name ?? "—"}</div>
                    </td>
                    <td className="px-2.5 py-1.5">
                      {l.is_phd ? "Dr. " : ""}
                      {[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-2.5 py-1.5 font-mono text-[11px]">{l.email}</td>
                    <td className="px-2.5 py-1.5">
                      {l.is_phd && <Badge variant="outline" className="text-[10px] h-4 px-1">PhD</Badge>}
                    </td>
                    <td className="px-2.5 py-1.5">
                      {l.sequence_stopped_at ? (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 border-red-300 text-red-700">stopped</Badge>
                      ) : l.sent_at ? (
                        <span className="capitalize">{l.status ?? "sent"}</span>
                      ) : l.scheduled_send_at ? (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-400 text-amber-700" title={new Date(l.scheduled_send_at).toLocaleString()}>
                          queued · {new Date(l.scheduled_send_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </Badge>
                      ) : (
                        <span className="capitalize">{l.status ?? "pending"}</span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5">
                      {c?.slug && l.landing_token ? (
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}/outreach/school/${c.slug}?p=${l.landing_token}`;
                            navigator.clipboard.writeText(url).then(() => toast.success("Professor link copied"));
                          }}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          title="Copy this professor's personalized landing link"
                        >
                          <Copy className="h-3 w-3" />
                          <span className="text-[11px]">Copy link</span>
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{l.opens_count || "—"}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{l.clicks_count || "—"}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">
                      {l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant={l.sent_at ? "outline" : "default"}
                          className="h-7 text-xs"
                          disabled={sendingId === l.id || !!l.sequence_stopped_at}
                          onClick={() => handleSend(l.id, l.email)}
                          title={l.sent_at ? `Initial sent ${new Date(l.sent_at).toLocaleDateString()} — send again` : "Send the initial email now (skips the queue)"}
                        >
                          {sendingId === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          {l.sent_at ? "Resend" : "Send now"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-1.5"
                          title={l.sequence_stopped_at ? "Resume emails to this professor" : "Stop all emails to this professor (e.g. they replied asking to stop)"}
                          onClick={async () => {
                            try {
                              await setLeadStopped(l.id, !l.sequence_stopped_at);
                              toast.success(l.sequence_stopped_at ? "Resumed" : "Stopped — no more emails to them");
                              qc.invalidateQueries({ queryKey: ["outreach-leads"] });
                            } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                          }}
                        >
                          {l.sequence_stopped_at ? <Undo2 className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default LeadsPanel;
