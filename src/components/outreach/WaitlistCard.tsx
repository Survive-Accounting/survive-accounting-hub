// DEMAND / WAITLIST CARD — every unified-intake lead (campus_waitlist), newest first, with one-tap
// contact actions and `contacted_at` that can finally be set (spec §7). Mounted at
// /outreach/demand. Reads through the admin server fns (the table is RLS-closed to anon), filters
// by kind, and deep-links each row so founder alerts can point at `?lead=<id>`.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, FileText, Loader2, MessageSquare, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { listDemand, setContacted, type DemandRow } from "@/lib/comms.functions";
import { INTAKE_KINDS, KIND_LABEL, PRIORITY_KINDS, type IntakeKind } from "@/lib/comms/kinds";

export function WaitlistCard({ focusLeadId }: { focusLeadId?: string | null } = {}) {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [kind, setKind] = useState<IntakeKind | "all">("all");
  const [includeTest, setIncludeTest] = useState(false);
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null)); }, []);
  const { data: rows, isLoading, isError } = useQuery({
    queryKey: ["demand", token, kind, includeTest],
    queryFn: () => listDemand({ data: { accessToken: token!, kind: kind === "all" ? null : kind, includeTest } }),
    enabled: !!token,
    retry: 1,
    refetchInterval: 60_000,
  });
  useEffect(() => { if (focusLeadId) document.getElementById(`lead-${focusLeadId}`)?.scrollIntoView({ block: "center" }); }, [focusLeadId, rows]);

  const pending = useMemo(() => (rows ?? []).filter((r) => !r.contacted_at), [rows]);
  const contacted = useMemo(() => (rows ?? []).filter((r) => r.contacted_at), [rows]);

  const toggle = async (row: DemandRow) => {
    if (!token) return;
    const r = await setContacted({ data: { accessToken: token, id: row.id, contacted: !row.contacted_at } });
    if (!r.ok) { toast.error("Update failed"); return; }
    void qc.invalidateQueries({ queryKey: ["demand"] });
  };
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast.success("Copied"));

  if (!token) return <Card className="p-4 text-xs text-muted-foreground">Sign in as admin to see demand.</Card>;
  if (rows === null) return <Card className="p-4 text-xs text-muted-foreground">Not an admin account.</Card>;

  const Row = ({ r }: { r: DemandRow }) => {
    const priority = !!r.kind && PRIORITY_KINDS.includes(r.kind);
    return (
      <div id={`lead-${r.id}`} className={cn("flex flex-wrap items-center gap-2 px-3 py-2.5", r.contacted_at && "opacity-50", focusLeadId === r.id && "bg-amber-50")}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {r.kind && <Badge className={cn("text-[10px] h-4 px-1.5", priority ? "bg-[#CE1126]" : "bg-[#14213D]")}>{KIND_LABEL[r.kind]}</Badge>}
            {r.is_test && <Badge variant="outline" className="text-[10px] h-4 px-1.5">TEST</Badge>}
            <span className="font-medium">{r.name || "No name"}</span>
            {r.campus_text && <span className="text-muted-foreground">· {r.campus_text}</span>}
            {r.course_code && <Badge variant="outline" className="text-[10px] h-4 px-1 font-mono">{r.course_code}</Badge>}
            {r.exam != null && <Badge variant="outline" className="text-[10px] h-4 px-1">{r.exam === 99 ? "Final" : `Exam ${r.exam}`}</Badge>}
            {r.professor && <span className="text-muted-foreground">· Prof. {r.professor}</span>}
            {r.chapter && <span className="text-muted-foreground">· {r.chapter}</span>}
            {r.file_paths?.length ? <Badge variant="outline" className="text-[10px] h-4 px-1.5"><FileText className="mr-1 h-2.5 w-2.5" />{r.file_paths.length} file{r.file_paths.length === 1 ? "" : "s"}</Badge> : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {r.email && <button onClick={() => copy(r.email!)} className="inline-flex items-center gap-1 hover:text-foreground" title="Copy email">{r.email} <Copy className="h-2.5 w-2.5" /></button>}
            {r.phone && <a href={`sms:${r.phone}`} className="inline-flex items-center gap-1 hover:text-foreground" title="Text them"><MessageSquare className="h-2.5 w-2.5" /> {r.phone}</a>}
            <span>· {new Date(r.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </div>
          {r.note && <div className="mt-1 max-w-xl truncate text-[11px] text-muted-foreground" title={r.note}>“{r.note}”</div>}
        </div>
        <Button size="sm" variant={r.contacted_at ? "ghost" : "outline"} className="ml-auto h-7 text-xs" onClick={() => void toggle(r)}>
          {r.contacted_at ? <><Undo2 className="h-3 w-3" /> Undo</> : <><Check className="h-3 w-3" /> Mark contacted</>}
        </Button>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Demand</h2>
        {pending.length > 0 && <Badge className="bg-[#CE1126] text-[10px] h-4 px-1.5">{pending.length} uncontacted</Badge>}
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <select value={kind} onChange={(e) => setKind(e.target.value as IntakeKind | "all")} className="ml-auto rounded-md border border-border bg-transparent px-2 py-1 text-xs">
          <option value="all">All kinds</option>
          {INTAKE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground"><input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} /> show tests</label>
      </div>
      {isError ? (
        <div className="p-4 text-xs text-muted-foreground">Couldn't load — is migration 20260821_0900 applied?</div>
      ) : (rows ?? []).length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">No signups yet. Every capture on the site lands here; priority kinds also text you the moment they arrive.</div>
      ) : (
        <div className="divide-y divide-border">
          {pending.map((r) => <Row key={r.id} r={r} />)}
          {contacted.slice(0, 25).map((r) => <Row key={r.id} r={r} />)}
        </div>
      )}
    </Card>
  );
}

export default WaitlistCard;
