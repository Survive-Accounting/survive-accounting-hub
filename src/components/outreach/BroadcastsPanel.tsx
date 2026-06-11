// Custom batch emails ("broadcasts") — pick campuses, draft with merge tags,
// test-send, then schedule. The 15-min scheduler delivers, suppression-aware.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Megaphone, Send, X } from "lucide-react";
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

export function BroadcastsPanel({ campuses }: { campuses: Campus[] }) {
  const qc = useQueryClient();
  const { data: broadcasts = [], isError } = useQuery({
    queryKey: ["outreach-broadcasts"], queryFn: fetchBroadcasts, retry: 1, refetchInterval: 60_000,
  });
  const [open, setOpen] = useState(false);

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Megaphone className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Custom Emails</h2>
        <span className="text-[11px] text-muted-foreground">— pick campuses, write once, send in batch</span>
        <Button size="sm" className="ml-auto h-8" onClick={() => setOpen(true)} disabled={isError}>
          <Send className="h-3.5 w-3.5" /> New custom email
        </Button>
      </div>
      {isError ? (
        <div className="p-4 text-xs text-muted-foreground">Run migration 0012 to enable custom emails.</div>
      ) : broadcasts.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">
          Nothing scheduled. Use these for warm campuses (like Ole Miss) or seasonal pushes — they skip the cold sequence entirely.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {broadcasts.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
              <span className="font-medium">{b.name}</span>
              <Badge variant="outline" className={`text-[10px] h-4 px-1 ${STATUS_BADGE[b.status] ?? ""}`}>{b.status}</Badge>
              <span className="text-[11px] text-muted-foreground">
                {b.campus_ids?.length ? `${b.campus_ids.length} campus${b.campus_ids.length === 1 ? "" : "es"}` : "all campuses"}
                {" · "}{new Date(b.send_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {b.status !== "scheduled" && ` · ${b.sent_count} sent${b.skipped_count ? `, ${b.skipped_count} skipped` : ""}`}
              </span>
              {b.status === "scheduled" && (
                <Button
                  size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs"
                  onClick={async () => {
                    await cancelBroadcast(b.id);
                    qc.invalidateQueries({ queryKey: ["outreach-broadcasts"] });
                    toast.success("Canceled");
                  }}
                >
                  <X className="h-3 w-3" /> Cancel
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <BroadcastDialog open={open} onClose={() => setOpen(false)} campuses={campuses} onSaved={() => {
        setOpen(false);
        qc.invalidateQueries({ queryKey: ["outreach-broadcasts"] });
      }} />
    </Card>
  );
}

function BroadcastDialog({ open, onClose, campuses, onSaved }: {
  open: boolean; onClose: () => void; campuses: Campus[]; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [campusSearch, setCampusSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeReplied, setIncludeReplied] = useState(true);
  const [when, setWhen] = useState<"now" | "pick">("now");
  const [sendAtLocal, setSendAtLocal] = useState("");
  const [testTo, setTestTo] = useState<string>(TEST_RECIPIENTS[0]);
  const [busy, setBusy] = useState<"" | "test" | "save">("");

  const selectable = useMemo(
    () => campuses.filter((c) => !c.archived).sort((a, b) => a.school_name.localeCompare(b.school_name)),
    [campuses],
  );
  const filtered = useMemo(() => {
    const q = campusSearch.trim().toLowerCase();
    return q ? selectable.filter((c) => c.school_name.toLowerCase().includes(q)) : selectable;
  }, [selectable, campusSearch]);

  const toggle = (id: string) =>
    setSelected((prev) => {
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
      });
      toast.success(when === "now" ? "Queued — the scheduler sends within ~15 minutes" : "Scheduled");
      onSaved();
      setName(""); setSubject(""); setBody(""); setSelected(new Set());
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
          <DialogTitle>New custom email</DialogTitle>
          <DialogDescription>
            Goes only to professors you've already emailed (suppressing bounces, spam complaints, and stops).
            Merge tags work: <code>{"{first name}"}</code> <code>{"{program}"}</code> <code>{"{courses}"}</code>{" "}
            <code>{"{phone}"}</code> <code>{"{surviveaccounting.com}"}</code>. The opt-out line is added automatically if you forget it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Internal name (only you see this)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "Ole Miss warm push — fall slots"' className="h-9" />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Campuses ({selected.size === 0 ? "all" : `${selected.size} selected`})</Label>
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
            <Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
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
            {when === "now" ? "Queue it" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BroadcastsPanel;
