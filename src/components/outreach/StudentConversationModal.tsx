// Single-student conversation modal opened from the Student Requests log.
// Shows the full SMS thread (if any) for a given phone, with a reply composer.
// For syllabus uploads with no matching SMS conversation, shows intake details
// and a link to start a new text via the device's SMS handler.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, FileText, ExternalLink, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchSmsMessages,
  sendSmsReply,
  formatPhonePretty,
  type SmsConversation,
} from "@/lib/outreach-api";

export interface StudentConversationTarget {
  phone: string | null;
  email?: string | null;
  studentName?: string | null;
  syllabusUrl?: string | null;
  syllabusBucket?: string | null;
  intakeId?: string | null;
  conversationIdHint?: string | null;
}

async function findConversationByPhone(phone: string): Promise<SmsConversation | null> {
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) return null;
  const e164 = digits.length === 10 ? `+1${digits}` : digits.startsWith("+") ? digits : `+${digits}`;
  const { data } = await (supabase.from("sms_conversations" as never) as any)
    .select("id,short_ref,student_phone,campus_number,campus_id,course,exam_date,struggles,major,sentiment,status,last_message_at,is_tester")
    .eq("student_phone", e164)
    .order("last_message_at", { ascending: false })
    .limit(1);
  return ((data ?? [])[0] ?? null) as SmsConversation | null;
}

async function fetchConversationById(id: string): Promise<SmsConversation | null> {
  const { data } = await (supabase.from("sms_conversations" as never) as any)
    .select("id,short_ref,student_phone,campus_number,campus_id,course,exam_date,struggles,major,sentiment,status,last_message_at,is_tester")
    .eq("id", id)
    .maybeSingle();
  return (data ?? null) as SmsConversation | null;
}

async function signedSyllabusUrl(bucket: string, path: string): Promise<string | null> {
  // path may already be a full URL; if so, just return it.
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 30);
  return data?.signedUrl ?? null;
}

export function StudentConversationModal({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: StudentConversationTarget | null;
}) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);

  const convoQuery = useQuery({
    queryKey: ["student-conversation", target?.conversationIdHint, target?.phone],
    queryFn: async () => {
      if (!target) return null;
      if (target.conversationIdHint) {
        const c = await fetchConversationById(target.conversationIdHint);
        if (c) return c;
      }
      if (target.phone) return findConversationByPhone(target.phone);
      return null;
    },
    enabled: open && !!target,
  });

  const conversation = convoQuery.data ?? null;

  const messagesQuery = useQuery({
    queryKey: ["sms-messages", conversation?.id],
    queryFn: () => fetchSmsMessages(conversation!.id),
    enabled: open && !!conversation?.id,
    refetchInterval: open && !!conversation?.id ? 15_000 : false,
  });

  useEffect(() => {
    if (!open) {
      setReply("");
      setSigned(null);
      return;
    }
    if (target?.syllabusUrl) {
      const bucket = target.syllabusBucket ?? "student-syllabi";
      signedSyllabusUrl(bucket, target.syllabusUrl).then(setSigned);
    }
  }, [open, target]);

  const smsHref = useMemo(() => {
    if (!target?.phone) return null;
    const digits = target.phone.replace(/[^\d]/g, "");
    const num = digits.length === 10 ? `+1${digits}` : digits.startsWith("+") ? digits : `+${digits}`;
    const body = encodeURIComponent(
      `Hi ${target.studentName ?? "there"}, this is Lee — thanks for reaching out!`,
    );
    return `sms:${num}?&body=${body}`;
  }, [target]);

  const doSend = async () => {
    if (!conversation || !reply.trim()) return;
    setSending(true);
    const res = await sendSmsReply(conversation.id, reply.trim());
    setSending(false);
    if (res.ok) {
      setReply("");
      toast.success("Sent");
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["sms-messages", conversation.id] });
        qc.invalidateQueries({ queryKey: ["sms-conversations"] });
        qc.invalidateQueries({ queryKey: ["student-requests"] });
      }, 1200);
    } else {
      toast.error(res.error ?? "Send failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {target?.studentName ?? "Student conversation"}
            {conversation?.status === "opted_out" && (
              <Badge variant="outline" className="text-[10px]">opted out</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {target?.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {formatPhonePretty(target.phone)}
              </span>
            )}
            {target?.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> {target.email}
              </span>
            )}
            {conversation && (
              <span>via {formatPhonePretty(conversation.campus_number)}</span>
            )}
          </div>

          {target?.syllabusUrl && (
            <a
              href={signed ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs hover:bg-muted"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Syllabus uploaded</span>
              <ExternalLink className="ml-auto h-3.5 w-3.5" />
            </a>
          )}

          <div className="rounded-md border border-border bg-muted/10">
            {convoQuery.isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              </div>
            ) : !conversation ? (
              <div className="p-6 text-center text-sm text-muted-foreground space-y-2">
                <div>No SMS thread yet for this student.</div>
                {smsHref && (
                  <Button asChild size="sm" variant="outline">
                    <a href={smsHref}>Open SMS on this device</a>
                  </Button>
                )}
              </div>
            ) : (
              <div className="max-h-[45vh] min-h-[180px] space-y-2 overflow-auto p-3">
                {(messagesQuery.data ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                        m.direction === "out"
                          ? "bg-[#14213D] text-white"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {m.body}
                      <div
                        className={cn(
                          "mt-1 text-[9px]",
                          m.direction === "out" ? "text-white/60" : "text-muted-foreground",
                        )}
                      >
                        {m.direction === "out"
                          ? m.author === "auto" || m.author === "auto-ack"
                            ? "auto"
                            : "you"
                          : "student"}
                        {" · "}
                        {new Date(m.created_at).toLocaleString([], {
                          month: "numeric",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                ))}
                {(messagesQuery.data ?? []).length === 0 && !messagesQuery.isLoading && (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    No messages yet.
                  </div>
                )}
              </div>
            )}
          </div>

          {conversation && (
            <div className="flex items-end gap-2">
              <Textarea
                rows={2}
                placeholder={
                  conversation.status === "opted_out"
                    ? "Student opted out — sending disabled"
                    : "Text back as Lee…"
                }
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                disabled={conversation.status === "opted_out"}
                className="text-sm"
              />
              <Button
                onClick={doSend}
                disabled={sending || !reply.trim() || conversation.status === "opted_out"}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default StudentConversationModal;
