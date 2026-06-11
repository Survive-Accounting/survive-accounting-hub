// Custom batch emails — grouped by semester, edit + test + cancel.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Megaphone, Pencil, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Campus } from "@/lib/outreach-mock";
import {
  cancelBroadcast, fetchBroadcasts, saveBroadcast, sendTestEmail, TEST_RECIPIENTS,
  type Broadcast,
} from "@/lib/outreach-api";

const STATUS_BADGE: Record<string, string> = {
  scheduled: "border-amber-400 text-amber-700",
  sending: "border-blue-400 text-blue-700",
  sent: "border-emerald-500 text-emerald-700",
  canceled: "border-border text-muted-foreground",
  failed: "border-red-400 text-red-700",
};

function semesterKey(name: string) {
  return name.match(/^((?:Fall|Spring|Summer) \d{4})/)?.[1] ?? "Other";
}

export function BroadcastsPanel({ campuses }: { campuses: Campus[] }) {
  const qc = useQueryClient();
  const { data: broadcasts = [], isError } = useQuery({
    queryKey: ["outreach-broadcasts"], queryFn: fetchBroadcasts, retry: 1, refetchInterval: 60_000,
  });
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Broadcast | null>(null);

  const grouped = new Map<string, Broadcast[]>();
  for (const b of broadcasts) {
    const k = semesterKey(b.name);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(b);
  }

  const onCancel = async (id: string) => {
    await cancelBroadcast(id);
    qc.invalidateQueries({ queryKey: ["outreach-broadcasts"] });
    toast.success("Canceled");
  };

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <details className="group">
        <summary className="flex cursor-pointer select-none items-center gap-2 border-b border-border p-3 hover:bg-muted/30">
          <Megaphone className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Broadcasts</h2>
          <span className="text-[11px] text-muted-foreground">— pick campuses, write once, send in batch</span>
          <span className="ml-auto text-[11px] text-muted-foreground group-open:hidden">Click to expand</span>
          <span className="ml-auto hidden text-[11px] text-muted-foreground group-open:inline">Click to collapse</span>
        </summary>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button size="sm" className="ml-auto h-8" onClick={() => setNewOpen(true)} disabled={isError}>
            <Send className="h-3.5 w-3.5" /> New Broadcast
          </Button>
        </div>

        {isError ? (
          <div className="p-4 text-xs text-muted-foreground">Run migration 0012 to enable broadcasts.</div>
        ) : broadcasts.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">
            Nothing scheduled. Use these for warm campuses (like Ole Miss) or seasonal pushes.
          </div>
        ) : (
          <div>
            {Array.from(grouped.entries()).map(([sem, items], idx) => (
              <details key={sem} open={idx === 0}>
                <summary className="flex cursor-pointer select-none items-center gap-2 border-b border-border px-3 py-2 hover:bg-muted/30">
                  <span className="text-xs font-semibold">{sem}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {items.length} email{items.length !== 1 ? "s" : ""} · {items.filter(b => b.status === "scheduled").length} scheduled
                  </span>
                </summary>
                {items.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center gap-2 border-b border-border/50 px-3 py-2.5 last:border-0">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {b.name.replace(/^(?:Fall|Spring|Summer) \d{4} — /, "")}
                    </span>
                    <Badge variant="outline" className={`shrink-0 text-[10px] h-4 px-1 ${STATUS_BADGE[b.status] ?? ""}`}>
                      {b.status}
                    </Badge>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {b.campus_ids?.length ? `${b.campus_ids.length} campus${b.campus_ids.length === 1 ? "" : "es"}` : "all campuses"}
                      {" · "}
                      {new Date(b.send_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {b.status !== "scheduled" && ` · ${b.sent_count} sent`}
                    </span>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(b)}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                      {b.status === "scheduled" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onCancel(b.id)}>
                          <X className="h-3 w-3" /> Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </details>
            ))}
          </div>
        )}
      </details>

      <BroadcastDialog
        key="new"
        open={newOpen}
        onClose={() => setNewOpen(false)}
        campuses={campuses}
        onSaved={() => { setNewOpen(false); qc.invalidateQueries({ queryKey: ["outreach-broadcasts"] }); }}
      />
      <BroadcastDialog
        key={editing?.id ?? "editing"}
        open={!!editing}
        onClose={() => setEditing(null)}
        campuses={campuses}
        existing={editing}
        onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["outreach-broadcasts"] }); }}
      />
    </Card>
  );
}

function BroadcastDialog({ open, onClose, campuses, existing, onSaved }: {
  open: boolean; onClose: () => void; campuses: Campus[];
  existing?: Broadcast | null; onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [subject, setSubject] = useState(existing?.subject ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [campusSearch, setCampusSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(existing?.campus_ids ?? []));
  const [includeReplied, setIncludeReplied] = useState(existing?.include_replied ?? true);
  const [when, setWhen] = useState<"now" | "pick">(existing ? "pick" : "now");
  const [sendAtLocal, setSendAtLocal] = useState(
    existing ? new Date(existing.send_at).toISOString().slice(0, 16) : ""
  );
  const [testTo, setTestTo] = useState<string>(TEST_RECIPIENTS[0]);
  const [busy, setBusy] = useState<"" | "test" | "save">("");

  const selectable = [...campuses].filter((c) => !c.archived).sort((a, b) => a.school_name.localeCompare(b.school_name));
  const filtered = campusSearch.trim()
    ? selectable.filter((c) => c.school_name.toLowerCase().includes(campusSearch.trim().toLowerCase()))
    : selectable;

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const test = async () => {
    if (!subject.trim() || !body.trim()) { toast.error("Add a subject and body first"); return; }
    setBusy("test");
    const res = await sendTestEmail(testTo, subject.trim(), body.trim());
    setBusy("");
    if (res.ok) toast.success(`Test sent to ${testTo}`);
    else toast.error(res.error ?? "Test failed");
  };

  const save = async () => {
    if (!subject.trim() || !body.trim()) { toast.error("Subject and body required"); return; }
    const sendAt = when === "now" ? new Date() : sendAtLocal ? new Date(sendAtLocal) : null;
    if (!sendAt || isNaN(sendAt.getTime())) { toast.error("Pick a send time"); return; }
    setBusy("save");
    try {
      await saveBroadcast({
        name: name.trim() || subject.trim().slice(0, 60),
        subject: subject.trim(),
        body: body.trim(),
        campus_ids: selected.size ? Array.from(selected) : null,
        include_replied: includeReplied,
        send_at: sendAt.toISOString(),
      }, existing?.id);
      toast.success(existing ? "Saved" : when === "now" ? "Queued — sends within ~15 min" : "Scheduled");
      if (!existing) { setName(""); setSubject(""); setBody(""); setSelected(new Set()); }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit — ${existing.name.replace(/^(?:Fall|Spring|Summer) \d{4} — /, "")}` : "New Broadcast"}</DialogTitle>
          <DialogDescription>
            Merge tags: <code>{"{recipient name}"}</code> (auto "Dr. Lastname" for PhDs),{" "}
            <code>{"{course prefix}"}</code>, <code>{"{courses}"}</code>, <code>{"{program}"}</code>,{" "}
            <code>{"{phone}"}</code>, <code>{"{surviveaccounting.com}"}</code>.
            The opt-out line is appended automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Internal name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "Fall 2026 — Syllabus week"' className="h-9" />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Campuses ({selected.size === 0 ? "all leads" : `${selected.size} selected`})</Label>
              <button type="button" className="ml-auto text-[11px] underline text-muted-foreground hover:text-foreground"
                onClick={() => setSelected(new Set(filtered.map((c) => c.id)))}>Select all{campusSearch.trim() ? " (filtered)" : ""}</button>
              <button type="button" className="text-[11px] underline text-muted-foreground hover:text-foreground"
                onClick={() => setSelected(new Set())}>Clear</button>
            </div>
            <Input value={campusSearch} onChange={(e) => setCampusSearch(e.target.value)} placeholder="Filter campuses…" className="h-9" />
            <div className="max-h-36 overflow-auto rounded-md border border-border p-1">
              {filtered.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50">
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  <span>{c.school_name}</span>
                  <span className="text-muted-foreground">{c.state}</span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={includeReplied} onCheckedChange={(v) => setIncludeReplied(!!v)} />
              Include professors who replied before (warm contacts)
            </label>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Body</Label>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2.5">
            <span className="text-xs font-medium text-muted-foreground">Send test to</span>
            <Select value={testTo} onValueChange={setTestTo}>
              <SelectTrigger className="h-8 w-[230px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEST_RECIPIENTS.map((e) => <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8" onClick={test} disabled={busy === "test"}>
              {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send test
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Label className="text-xs">When</Label>
            <Select value={when} onValueChange={(v) => setWhen(v as "now" | "pick")}>
              <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="now" className="text-xs">Send now (~15 min)</SelectItem>
                <SelectItem value="pick" className="text-xs">Schedule for later</SelectItem>
              </SelectContent>
            </Select>
            {when === "pick" && (
              <Input type="datetime-local" value={sendAtLocal} onChange={(e) => setSendAtLocal(e.target.value)} className="h-8 w-[220px] text-xs" />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy === "save"}>
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            {existing ? "Save changes" : when === "now" ? "Queue it" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BroadcastsPanel;
