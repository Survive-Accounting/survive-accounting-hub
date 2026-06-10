// Texts — SMS intake inbox. Conversation list + thread + reply (sends from
// the campus number). Lee can also reply from his phone to the summary texts.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, Phone, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Campus } from "@/lib/outreach-mock";
import {
  fetchSmsConversations, fetchSmsMessages, formatPhonePretty, sendSmsReply,
  type SmsConversation,
} from "@/lib/outreach-api";

function FactChip({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px]">
      <span className="font-semibold text-muted-foreground">{label}</span> {value}
    </span>
  );
}

export function TextsPanel({ campuses }: { campuses: Campus[] }) {
  const qc = useQueryClient();
  const convosQuery = useQuery({
    queryKey: ["sms-conversations"],
    queryFn: fetchSmsConversations,
    retry: 1,
    refetchInterval: 30_000,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const convos = convosQuery.data ?? [];
  const selected: SmsConversation | undefined = convos.find((c) => c.id === selectedId) ?? convos[0];
  const campusById = useMemo(() => new Map(campuses.map((c) => [c.id, c])), [campuses]);

  const messagesQuery = useQuery({
    queryKey: ["sms-messages", selected?.id],
    queryFn: () => fetchSmsMessages(selected!.id),
    enabled: !!selected,
    refetchInterval: 15_000,
  });

  const doSend = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    const res = await sendSmsReply(selected.id, reply.trim());
    setSending(false);
    if (res.ok) {
      setReply("");
      toast.success("Sent");
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["sms-messages", selected.id] });
        qc.invalidateQueries({ queryKey: ["sms-conversations"] });
      }, 1200);
    } else toast.error(res.error ?? "Send failed");
  };

  if (convosQuery.isLoading) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading conversations…
      </Card>
    );
  }

  if (convos.length === 0) {
    return (
      <Card className="p-10 text-center">
        <MessageSquare className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <div className="text-sm font-medium">No texts yet</div>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Provision a number for an approved campus (Campuses tab), put it on the landing page,
          and student texts will appear here. You'll also get a summary text on your phone for every message.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Conversation list */}
      <Card className="overflow-hidden py-0 gap-0">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <h2 className="text-sm font-semibold">Conversations</h2>
          <span className="text-xs text-muted-foreground">{convos.length}</span>
          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" onClick={() => convosQuery.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-auto divide-y divide-border">
          {convos.map((c) => {
            const campus = c.campus_id ? campusById.get(c.campus_id) : undefined;
            const active = selected?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn("block w-full p-3 text-left transition hover:bg-muted/40", active && "bg-muted/60")}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formatPhonePretty(c.student_phone)}</span>
                  <span className="text-[10px] text-muted-foreground">#{c.short_ref}</span>
                  {c.status === "opted_out" && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">opted out</Badge>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {new Date(c.last_message_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{campus?.school_name ?? c.campus_number}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <FactChip label="Course" value={c.course} />
                  <FactChip label="Exam" value={c.exam_date} />
                  <FactChip label="Major" value={c.major} />
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Thread */}
      <Card className="overflow-hidden py-0 gap-0">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold">{formatPhonePretty(selected.student_phone)}</span>
              <span className="text-xs text-muted-foreground">
                via {formatPhonePretty(selected.campus_number)}
                {selected.campus_id && campusById.get(selected.campus_id)
                  ? ` · ${campusById.get(selected.campus_id)!.school_name}`
                  : ""}
              </span>
              <div className="ml-auto flex flex-wrap gap-1">
                <FactChip label="Course" value={selected.course} />
                <FactChip label="Exam" value={selected.exam_date} />
                <FactChip label="Struggles" value={selected.struggles} />
                <FactChip label="Major" value={selected.major} />
              </div>
            </div>
            <div className="max-h-[48vh] min-h-[200px] space-y-2 overflow-auto p-4">
              {(messagesQuery.data ?? []).map((m) => (
                <div key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                      m.direction === "out"
                        ? m.author === "auto"
                          ? "bg-[#14213D]/80 text-white"
                          : "bg-[#14213D] text-white"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {m.body}
                    <div className={cn("mt-1 text-[9px]", m.direction === "out" ? "text-white/60" : "text-muted-foreground")}>
                      {m.direction === "out" ? (m.author === "auto" ? "auto" : "you") : "student"} ·{" "}
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  rows={2}
                  placeholder={selected.status === "opted_out" ? "Student opted out — sending disabled" : "Text back as Lee…"}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  disabled={selected.status === "opted_out"}
                  className="text-sm"
                />
                <Button onClick={doSend} disabled={sending || !reply.trim() || selected.status === "opted_out"}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </Button>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Sends from the campus number. You can also reply from your phone to the summary texts — start with #{selected.short_ref} if multiple students are active.
              </p>
            </div>
          </>
        ) : (
          <div className="p-10 text-center text-sm text-muted-foreground">Select a conversation</div>
        )}
      </Card>
    </div>
  );
}

export default TextsPanel;
