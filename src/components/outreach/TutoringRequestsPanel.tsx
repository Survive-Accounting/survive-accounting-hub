// Admin review panel for syllabus-first /start tutoring requests.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, FileText, GraduationCap, Mail, Phone, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Status =
  | "new"
  | "reviewing"
  | "booking_link_sent"
  | "needs_more_info"
  | "not_a_fit"
  | "archived";

interface RequestRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  syllabus_file_url: string | null;
  course_notes: string | null;
  status: Status;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

type Filter = "active" | "all" | Status;

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  reviewing: { label: "Reviewing", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  booking_link_sent: { label: "Booking sent", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  needs_more_info: { label: "Needs info", cls: "bg-orange-100 text-orange-800 border-orange-300" },
  not_a_fit: { label: "Not a fit", cls: "bg-red-100 text-red-800 border-red-300" },
  archived: { label: "Archived", cls: "bg-slate-100 text-slate-600 border-slate-300" },
};

async function fetchRequests(filter: Filter): Promise<RequestRow[]> {
  let q = (supabase.from("tutoring_requests" as never) as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "active") {
    q = q.in("status", ["new", "reviewing", "needs_more_info"]);
  } else if (filter !== "all") {
    q = q.eq("status", filter);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RequestRow[];
}

async function syllabusSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("student-syllabi")
    .createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}

export function TutoringRequestsPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("active");
  const [editing, setEditing] = useState<RequestRow | null>(null);

  const q = useQuery({
    queryKey: ["tutoring-requests", filter],
    queryFn: () => fetchRequests(filter),
    staleTime: 15_000,
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);

  const updateStatus = async (id: string, status: Status) => {
    const { error } = await (supabase.from("tutoring_requests" as never) as any)
      .update({ status })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked ${STATUS_META[status].label}`);
    qc.invalidateQueries({ queryKey: ["tutoring-requests"] });
  };

  const openSyllabus = async (path: string) => {
    const url = await syllabusSignedUrl(path);
    if (!url) {
      toast.error("Couldn't open syllabus");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const FILTERS: { value: Filter; label: string }[] = [
    { value: "active", label: "Active" },
    { value: "new", label: "New" },
    { value: "reviewing", label: "Reviewing" },
    { value: "booking_link_sent", label: "Booking sent" },
    { value: "needs_more_info", label: "Needs info" },
    { value: "not_a_fit", label: "Not a fit" },
    { value: "archived", label: "Archived" },
    { value: "all", label: "All" },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <GraduationCap className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Tutoring requests</h2>
        <div className="ml-auto flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              className="h-7 px-2 text-[11px]"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {q.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No requests.</div>
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <div key={r.id} className="p-4 flex flex-wrap items-start gap-4">
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{r.name}</div>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_META[r.status].cls}`}>
                      {STATUS_META[r.status].label}
                    </Badge>
                  </div>
                  <div className="mt-1 text-[12px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.phone}</span>
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{r.email}</span>
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  {r.course_notes && (
                    <div className="mt-1.5 text-[12px] text-foreground/80 whitespace-pre-wrap">
                      {r.course_notes}
                    </div>
                  )}
                  {r.admin_notes && (
                    <div className="mt-1.5 text-[11px] italic text-muted-foreground">
                      Note: {r.admin_notes}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {r.syllabus_file_url ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => openSyllabus(r.syllabus_file_url!)}
                    >
                      <FileText className="h-3 w-3 mr-1" /> Syllabus <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">No syllabus</span>
                  )}
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => updateStatus(r.id, "booking_link_sent")}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Send Booking Link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => updateStatus(r.id, "needs_more_info")}
                  >
                    Needs More Info
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => updateStatus(r.id, "not_a_fit")}
                  >
                    Not a Fit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => updateStatus(r.id, "archived")}
                  >
                    Archive
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setEditing(r)}
                  >
                    Note
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <NoteDialog
        row={editing}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["tutoring-requests"] })}
      />
    </div>
  );
}

function NoteDialog({
  row,
  onClose,
  onSaved,
}: {
  row: RequestRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset note when opening a different row.
  const rowId = row?.id ?? null;
  useEffect(() => {
    setNote(row?.admin_notes ?? "");
  }, [rowId]);

  if (!row) return null;
  const save = async () => {
    setSaving(true);
    const { error } = await (supabase.from("tutoring_requests" as never) as any)
      .update({ admin_notes: note || null })
      .eq("id", row.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved note");
    onSaved();
    onClose();
  };
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Note for {row.name}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          placeholder="Private note (only admins see this)"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TutoringRequestsPanel;
