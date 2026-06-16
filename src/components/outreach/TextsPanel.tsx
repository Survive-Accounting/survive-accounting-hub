// Texts — SMS intake inbox. Conversation list + thread + reply (sends from
// the campus number). Lee can also reply from his phone to the summary texts.
// Includes a Tester panel (simulate inbound), per-conversation Reset, and a
// live health badge sourced from the sms_inbound_raw landing table.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Copy, FlaskConical, Link2, Loader2,
  MessageSquare, Phone, RefreshCw, RotateCcw, Send,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Campus } from "@/lib/outreach-mock";
import {
  fetchCampusPhones, fetchSmsConversations, fetchSmsInboundRaw, fetchSmsMessages,
  formatPhonePretty, provisionCampusNumber, resetSmsConversation, sendSmsReply,
  simulateInboundSms,
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

function relTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Public site origin for links pasted to students. If the new app isn't live
// on this domain yet, tell Claude where it's published and this updates.
const SITE_ORIGIN = "https://surviveaccounting.com";

function HealthBadge() {
  const rawQuery = useQuery({
    queryKey: ["sms-inbound-raw"],
    queryFn: () => fetchSmsInboundRaw(25),
    refetchInterval: 30_000,
    retry: 1,
  });
  const rows = rawQuery.data ?? [];
  const lastInbound = rows[0]?.received_at ?? null;
  const lastError = rows.find((r) => r.parse_status === "error") ?? null;
  const ok = !lastError || (lastInbound && new Date(lastInbound).getTime() > new Date(lastError.received_at).getTime());

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
      )}
      <span><span className="text-muted-foreground">Last inbound:</span> <span className="font-medium">{relTime(lastInbound)}</span></span>
      <span><span className="text-muted-foreground">Last webhook error:</span> <span className={cn("font-medium", lastError && "text-amber-700")}>{lastError ? `${relTime(lastError.received_at)} — ${lastError.error ?? "unknown"}` : "never"}</span></span>
      <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-[11px]" onClick={() => rawQuery.refetch()}>
        <RefreshCw className="h-3 w-3" /> refresh
      </Button>
    </div>
  );
}

function TesterPanel({
  campusNumbers,
  onAfter,
}: {
  campusNumbers: { phone: string; label: string }[];
  onAfter: () => void;
}) {
  const [toPhone, setToPhone] = useState<string>(campusNumbers[0]?.phone ?? "");
  const [fromPhone, setFromPhone] = useState<string>("+15550000001");
  const [body, setBody] = useState<string>("Hey I need a tutor for ACCT 2010, exam next Thursday and I'm lost on adjusting entries.");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!toPhone || !fromPhone || !body.trim()) {
      toast.error("Need a campus number, a student phone, and a message body");
      return;
    }
    setSending(true);
    const res = await simulateInboundSms({ fromPhone, toPhone, body: body.trim() });
    setSending(false);
    if (res.ok) {
      toast.success("Simulated inbound — webhook accepted it");
      setTimeout(onAfter, 800);
    } else {
      toast.error(res.error ?? "Simulate failed");
    }
  };

  return (
    <Card className="p-3 gap-2">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-semibold">Tester — simulate an inbound text</h3>
        <Badge variant="outline" className="text-[10px] h-4 px-1">$0 webhook call</Badge>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Auto-replies still go through Twilio (~$0.008 each) unless the "from" is a phone you own
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto] items-end">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Campus number (to)</label>
          <Select value={toPhone} onValueChange={setToPhone}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick a campus number" /></SelectTrigger>
            <SelectContent>
              {campusNumbers.map((c) => (
                <SelectItem key={c.phone} value={c.phone} className="text-xs">
                  {formatPhonePretty(c.phone)} — {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Student phone (from)</label>
          <Input value={fromPhone} onChange={(e) => setFromPhone(e.target.value)} className="h-8 text-xs" placeholder="+15550000001" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Message body</label>
          <Input value={body} onChange={(e) => setBody(e.target.value)} className="h-8 text-xs" />
        </div>
        <Button onClick={send} disabled={sending} size="sm">
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Simulate
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Use a tester phone listed in <code>SMS_TESTER_PHONES</code> (e.g. +19018713321) to bypass the one-shot booking-link guard and re-run the full auto flow on every send.
      </p>
    </Card>
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
  const phonesQuery = useQuery({ queryKey: ["campus-phones"], queryFn: fetchCampusPhones, retry: 1 });
  const mainLine = phonesQuery.data?.get("__main__");
  const [provisioning, setProvisioning] = useState(false);
  const getMainLine = async () => {
    setProvisioning(true);
    const res = await provisionCampusNumber(null);
    setProvisioning(false);
    if (res.ok) {
      toast.success(`Main line ready: ${res.phone}`);
      qc.invalidateQueries({ queryKey: ["campus-phones"] });
    } else toast.error(res.error ?? "Provisioning failed");
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);

  const convos = convosQuery.data ?? [];
  const selected: SmsConversation | undefined = convos.find((c) => c.id === selectedId) ?? convos[0];
  const campusById = useMemo(() => new Map(campuses.map((c) => [c.id, c])), [campuses]);

  const messagesQuery = useQuery({
    queryKey: ["sms-messages", selected?.id],
    queryFn: () => fetchSmsMessages(selected!.id),
    enabled: !!selected,
    refetchInterval: 15_000,
  });

  const campusNumberOptions = useMemo(() => {
    const list: { phone: string; label: string }[] = [];
    const phoneMap = phonesQuery.data ?? new Map<string, string>();
    const main = phoneMap.get("__main__");
    if (main) list.push({ phone: main, label: "Main line" });
    for (const [campusId, phone] of phoneMap.entries()) {
      if (campusId === "__main__") continue;
      const c = campusById.get(campusId);
      list.push({ phone, label: c?.school_name ?? campusId.slice(0, 6) });
    }
    return list;
  }, [phonesQuery.data, campusById]);

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

  const doReset = async () => {
    if (!selected) return;
    const ok = window.confirm(
      `Reset this thread? This deletes the conversation, all messages, and queued outbox so the next inbound from ${formatPhonePretty(selected.student_phone)} runs the first-message flow again.`,
    );
    if (!ok) return;
    setResetting(true);
    const res = await resetSmsConversation(selected.id);
    setResetting(false);
    if (res.ok) {
      toast.success("Thread reset — re-text the campus number to start fresh");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["sms-conversations"] });
    } else toast.error(res.error ?? "Reset failed");
  };

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["sms-conversations"] });
    qc.invalidateQueries({ queryKey: ["sms-inbound-raw"] });
    if (selected) qc.invalidateQueries({ queryKey: ["sms-messages", selected.id] });
  };

  if (convosQuery.isLoading) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading conversations…
      </Card>
    );
  }

  // Show tester + health even when there are no conversations yet.
  const headerStack = (
    <div className="space-y-3">
      {mainLine && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">Main line:</span>
          <span className="tabular-nums font-semibold">{formatPhonePretty(mainLine)}</span>
          <span className="text-muted-foreground">— on every campus page · texted students get the /start selector</span>
        </div>
      )}
      <HealthBadge />
      {campusNumberOptions.length > 0 && (
        <TesterPanel campusNumbers={campusNumberOptions} onAfter={refreshAll} />
      )}
    </div>
  );

  if (convos.length === 0) {
    return (
      <div className="space-y-3">
        {headerStack}
        <Card className="p-10 text-center">
          <MessageSquare className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-medium">No texts yet</div>
          {mainLine ? (
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Your main line is <span className="font-semibold text-foreground">{formatPhonePretty(mainLine)}</span> — it's
              on every campus landing page. Student texts will appear here, and you'll get a summary text for each one.
              Use the Tester above to simulate an inbound without paying for Twilio.
            </p>
          ) : (
            <>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Set up your main texting line — one number shared across all campuses. It goes on every landing page,
                and texted students get sent to the campus selector at /start.
              </p>
              <Button size="sm" className="mt-3" onClick={getMainLine} disabled={provisioning}>
                {provisioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                Get main line number
              </Button>
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {headerStack}
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
                  {c.is_tester && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-violet-400 text-violet-700">tester</Badge>
                  )}
                  {c.status === "opted_out" && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">opted out</Badge>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {new Date(c.last_message_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{campus?.school_name ?? "Main line"}</div>
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
              <div className="ml-auto flex flex-wrap items-center gap-1">
                <FactChip label="Course" value={selected.course} />
                <FactChip label="Exam" value={selected.exam_date} />
                <FactChip label="Struggles" value={selected.struggles} />
                <FactChip label="Major" value={selected.major} />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={doReset}
                  disabled={resetting}
                  title="Delete this thread so the next inbound runs the first-message flow"
                >
                  {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  Reset thread
                </Button>
              </div>
            </div>
            <div className="max-h-[48vh] min-h-[200px] space-y-2 overflow-auto p-4">
              {(messagesQuery.data ?? []).map((m) => (
                <div key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                      m.direction === "out"
                        ? m.author === "auto" || m.author === "auto-ack"
                          ? "bg-[#14213D]/80 text-white"
                          : "bg-[#14213D] text-white"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {m.body}
                    <div className={cn("mt-1 text-[9px]", m.direction === "out" ? "text-white/60" : "text-muted-foreground")}>
                      {m.direction === "out"
                        ? (m.author === "auto" ? "auto" : m.author === "auto-ack" ? "auto · ack" : "you")
                        : "student"} ·{" "}
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground inline-flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> Quick links:
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => navigator.clipboard.writeText(`${SITE_ORIGIN}/start`).then(() => toast.success("Copied /start link"))}
                >
                  <Copy className="h-3 w-3" /> Campus selector
                </Button>
                <Select
                  value=""
                  onValueChange={(slug) => {
                    navigator.clipboard
                      .writeText(`${SITE_ORIGIN}/outreach/school/${slug}`)
                      .then(() => toast.success("Campus page link copied"));
                  }}
                >
                  <SelectTrigger className="h-7 w-[230px] text-xs">
                    <SelectValue placeholder="Copy a campus page link…" />
                  </SelectTrigger>
                  <SelectContent>
                    {campuses
                      .filter((c) => c.approval_status === "approved" && !c.archived && c.slug)
                      .sort((a, b) => a.school_name.localeCompare(b.school_name))
                      .map((c) => (
                        <SelectItem key={c.id} value={c.slug} className="text-xs">{c.school_name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
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
    </div>
  );
}

export default TextsPanel;
