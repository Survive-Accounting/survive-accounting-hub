// Unified log of incoming student events on the Home dashboard.
// Sources: inbound SMS messages + syllabus uploads from /start intakes.
// - Click a row to open the per-student conversation modal.
// - Toggle "Replied?" to persist that flag in the underlying row.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronDown,
  FileText,
  GraduationCap,
  Loader2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatPhonePretty } from "@/lib/outreach-api";
import {
  StudentConversationModal,
  type StudentConversationTarget,
} from "./StudentConversationModal";

type Filter = "all" | "texts" | "syllabi" | "unreplied" | "archived";

interface RequestRow {
  key: string;
  kind: "text" | "syllabus";
  at: string;
  studentName: string | null;
  phone: string | null;
  email: string | null;
  preview: string;
  replied: boolean;
  archived: boolean;
  // For mutations:
  smsMessageId?: string;
  intakeId?: string;
  // For the conversation modal:
  conversationId?: string | null;
  syllabusUrl?: string | null;
}

interface InboundSmsRow {
  id: string;
  body: string;
  created_at: string;
  replied_by_lee: boolean;
  archived_by_lee: boolean;
  conversation_id: string;
  conversation: {
    id: string;
    student_phone: string;
    short_ref: number;
  } | null;
}

interface SyllabusIntakeRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  syllabus_file_url: string;
  syllabus_uploaded_at: string | null;
  created_at: string;
  replied_by_lee: boolean;
  archived_by_lee: boolean;
}

async function fetchInboundTexts(limit = 100): Promise<InboundSmsRow[]> {
  const { data, error } = await (supabase.from("sms_messages" as never) as any)
    .select(
      "id,body,created_at,replied_by_lee,archived_by_lee,conversation_id,conversation:sms_conversations(id,student_phone,short_ref)",
    )
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as InboundSmsRow[];
}

async function fetchSyllabusUploads(limit = 100): Promise<SyllabusIntakeRow[]> {
  const { data, error } = await (supabase.from("student_intake_submissions" as never) as any)
    .select(
      "id,first_name,last_name,email,phone,syllabus_file_url,syllabus_uploaded_at,created_at,replied_by_lee,archived_by_lee",
    )
    .not("syllabus_file_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SyllabusIntakeRow[];
}

async function fetchStudentRequests(): Promise<RequestRow[]> {
  const [texts, sylls] = await Promise.all([fetchInboundTexts(100), fetchSyllabusUploads(100)]);

  const textRows: RequestRow[] = texts.map((t) => ({
    key: `t:${t.id}`,
    kind: "text",
    at: t.created_at,
    studentName: t.conversation
      ? `${formatPhonePretty(t.conversation.student_phone)} · #${t.conversation.short_ref}`
      : "Unknown",
    phone: t.conversation?.student_phone ?? null,
    email: null,
    preview: t.body,
    replied: !!t.replied_by_lee,
    archived: !!t.archived_by_lee,
    smsMessageId: t.id,
    conversationId: t.conversation_id,
  }));

  const syllRows: RequestRow[] = sylls.map((s) => {
    const name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
    return {
      key: `s:${s.id}`,
      kind: "syllabus",
      at: s.syllabus_uploaded_at ?? s.created_at,
      studentName: name || s.email || "Student",
      phone: s.phone,
      email: s.email,
      preview: "Syllabus uploaded",
      replied: !!s.replied_by_lee,
      archived: !!s.archived_by_lee,
      intakeId: s.id,
      syllabusUrl: s.syllabus_file_url,
    };
  });

  return [...textRows, ...syllRows].sort((a, b) => (a.at < b.at ? 1 : -1));
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function StudentRequestsPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<StudentConversationTarget | null>(null);
  const [open, setOpen] = useState(false);

  const COLLAPSED_COUNT = 3;

  const q = useQuery({
    queryKey: ["student-requests"],
    queryFn: fetchStudentRequests,
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const all = q.data ?? [];
    if (filter === "archived") return all.filter((r) => r.archived);
    const visible = all.filter((r) => !r.archived);
    if (filter === "texts") return visible.filter((r) => r.kind === "text");
    if (filter === "syllabi") return visible.filter((r) => r.kind === "syllabus");
    if (filter === "unreplied") return visible.filter((r) => !r.replied);
    return visible;
  }, [q.data, filter]);

  const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_COUNT);
  const hiddenCount = Math.max(rows.length - COLLAPSED_COUNT, 0);

  const counts = useMemo(() => {
    const all = q.data ?? [];
    const active = all.filter((r) => !r.archived);
    return {
      all: active.length,
      texts: active.filter((r) => r.kind === "text").length,
      syllabi: active.filter((r) => r.kind === "syllabus").length,
      unreplied: active.filter((r) => !r.replied).length,
      archived: all.filter((r) => r.archived).length,
    };
  }, [q.data]);

  const toggleReplied = async (row: RequestRow, next: boolean) => {
    qc.setQueryData<RequestRow[] | undefined>(["student-requests"], (prev) =>
      prev?.map((r) => (r.key === row.key ? { ...r, replied: next } : r)),
    );
    try {
      if (row.kind === "text" && row.smsMessageId) {
        const { error } = await (supabase.from("sms_messages" as never) as any)
          .update({ replied_by_lee: next })
          .eq("id", row.smsMessageId);
        if (error) throw error;
      } else if (row.kind === "syllabus" && row.intakeId) {
        const { error } = await (supabase.from("student_intake_submissions" as never) as any)
          .update({ replied_by_lee: next })
          .eq("id", row.intakeId);
        if (error) throw error;
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save");
      qc.invalidateQueries({ queryKey: ["student-requests"] });
    }
  };

  const setArchived = async (row: RequestRow, next: boolean) => {
    qc.setQueryData<RequestRow[] | undefined>(["student-requests"], (prev) =>
      prev?.map((r) => (r.key === row.key ? { ...r, archived: next } : r)),
    );
    try {
      if (row.kind === "text" && row.smsMessageId) {
        const { error } = await (supabase.from("sms_messages" as never) as any)
          .update({ archived_by_lee: next })
          .eq("id", row.smsMessageId);
        if (error) throw error;
      } else if (row.kind === "syllabus" && row.intakeId) {
        const { error } = await (supabase.from("student_intake_submissions" as never) as any)
          .update({ archived_by_lee: next })
          .eq("id", row.intakeId);
        if (error) throw error;
      }
      toast.success(next ? "Archived" : "Restored");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save");
      qc.invalidateQueries({ queryKey: ["student-requests"] });
    }
  };

  const openConversation = (row: RequestRow) => {
    setTarget({
      phone: row.phone,
      email: row.email,
      studentName: row.studentName,
      syllabusUrl: row.syllabusUrl ?? null,
      syllabusBucket: "student-syllabi",
      intakeId: row.intakeId ?? null,
      conversationIdHint: row.conversationId ?? null,
    });
    setOpen(true);
  };

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Student requests</h2>
        <Button
          size="icon"
          variant="ghost"
          className="ml-1 h-6 w-6"
          onClick={() => q.refetch()}
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <div className="ml-auto flex flex-wrap gap-1">
          <Chip active={filter === "all"} onClick={() => { setFilter("all"); setExpanded(false); }}>
            All · {counts.all}
          </Chip>
          <Chip active={filter === "texts"} onClick={() => { setFilter("texts"); setExpanded(false); }}>
            Texts · {counts.texts}
          </Chip>
          <Chip active={filter === "syllabi"} onClick={() => { setFilter("syllabi"); setExpanded(false); }}>
            Syllabi · {counts.syllabi}
          </Chip>
          <Chip active={filter === "unreplied"} onClick={() => { setFilter("unreplied"); setExpanded(false); }}>
            Unreplied · {counts.unreplied}
          </Chip>
          <Chip active={filter === "archived"} onClick={() => { setFilter("archived"); setExpanded(false); }}>
            Archived · {counts.archived}
          </Chip>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {q.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {filter === "archived" ? "Nothing archived yet." : "No student requests yet."}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {visibleRows.map((row) => (
                <li
                  key={row.key}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30",
                    row.replied && "opacity-60",
                  )}
                >
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={row.replied}
                      onCheckedChange={(v) => toggleReplied(row, !!v)}
                      aria-label="Mark replied"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => openConversation(row)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 place-content-center rounded-full",
                        row.kind === "text"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-800",
                      )}
                      title={row.kind === "text" ? "Incoming text" : "Syllabus uploaded"}
                    >
                      {row.kind === "text" ? (
                        <MessageSquare className="h-3.5 w-3.5" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{row.studentName}</span>
                        {row.kind === "syllabus" && (
                          <Badge variant="outline" className="h-4 border-amber-300 px-1 text-[9px] text-amber-800">
                            syllabus
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{row.preview}</div>
                    </div>
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                      {relTime(row.at)}
                    </span>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setArchived(row, !row.archived);
                    }}
                    title={row.archived ? "Restore" : "Archive"}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>

            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-center gap-1.5 border-t border-border bg-muted/20 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
                />
                {expanded ? "Show less" : `Show ${hiddenCount} more`}
              </button>
            )}
          </>
        )}
      </Card>

      <StudentConversationModal open={open} onOpenChange={setOpen} target={target} />
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export default StudentRequestsPanel;
