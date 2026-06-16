// Texts — SMS intake inbox. Three tabs:
//   • Conversations — student threads and replies (default view, the workhorse)
//   • Templates    — edit the copy of every automated text
//   • Setup        — health/config + simulator + main line provisioning
// Lee can also reply from his phone to the summary texts (#ref prefix).
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Copy, FlaskConical, Link2, Loader2,
  MessageSquare, Phone, RefreshCw, RotateCcw, Send, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Campus } from "@/lib/outreach-mock";
import {
  fetchCampusPhones, fetchSmsConfig, fetchSmsConversations, fetchSmsInboundRaw,
  fetchSmsMessages, formatPhonePretty, provisionCampusNumber, resetSmsConversation,
  sendSmsReply, simulateInboundSms,
  type SmsConversation,
} from "@/lib/outreach-api";
import { SmsTemplatesEditor } from "./SmsTemplatesEditor";

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
  return `${Math.floor(h / 24)}d ago`;
}

const SITE_ORIGIN = "https://surviveaccounting.com";

export function TextsPanel({ campuses }: { campuses: Campus[] }) {
  const qc = useQueryClient();
  const convosQuery = useQuery({
    queryKey: ["sms-conversations"],
    queryFn: fetchSmsConversations,
    retry: 1,
    refetchInterval: 30_000,
  });
  const phonesQuery = useQuery({ queryKey: ["campus-phones"], queryFn: fetchCampusPhones, retry: 1 });
  const rawQuery = useQuery({
    queryKey: ["sms-inbound-raw"],
    queryFn: () => fetchSmsInboundRaw(25),
    refetchInterval: 30_000,
    retry: 1,
  });
  const configQuery = useQuery({ queryKey: ["sms-config"], queryFn: fetchSmsConfig, retry: 1 });

  const mainLine = phonesQuery.data?.get("__main__");
  const convos = convosQuery.data ?? [];
  const rawRows = rawQuery.data ?? [];
  const lastInbound = rawRows[0]?.received_at ?? null;
  const lastError = rawRows.find((r) => r.parse_status === "error") ?? null;
  const healthOk = !lastError || (lastInbound && new Date(lastInbound).getTime() > new Date(lastError.received_at).getTime());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected: SmsConversation | undefined = convos.find((c) => c.id === selectedId) ?? convos[0];
  const campusById = useMemo(() => new Map(campuses.map((c) => [c.id, c])), [campuses]);

  const messagesQuery = useQuery({
    queryKey: ["sms-messages", selected?.id],
    queryFn: () => fetchSmsMessages(selected!.id),
    enabled: !!selected,
    refetchInterval: 15_000,
  });

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);

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

  // Phase 3: canned snippets so Lee can fire off the standard replies fast.
  const QUICK_REPLIES: { label: string; body: string }[] = [
    {
      label: "Send /start link",
      body: "Hey! I'd love to help you prep.\n\nBook tutoring with me at this link:\nSurviveAccounting.com/start\n\nReply with any questions!\n\nLee",
    },
    { label: "Start here", body: "Start here: SurviveAccounting.com/start" },
    { label: "I'll review your course", body: "Thanks! I'll review your course and get back to you within 2 business days." },
    { label: "Please upload your syllabus", body: "Could you upload your syllabus at SurviveAccounting.com/start? I need it to prep before our session." },
    { label: "Here's the booking link", body: "Here's the booking link: SurviveAccounting.com/start" },
  ];

  const sendQuick = async (body: string) => {
    if (!selected) return;
    setSending(true);
    const res = await sendSmsReply(selected.id, body);
    setSending(false);
    if (res.ok) {
      toast.success("Sent");
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["sms-messages", selected.id] });
        qc.invalidateQueries({ queryKey: ["sms-conversations"] });
      }, 1200);
    } else toast.error(res.error ?? "Send failed");
  };

  const doReset = async () => {
    if (!selected) return;
    if (!window.confirm(`Reset this thread? Deletes the conversation, all messages, and queued outbox so the next inbound from ${formatPhonePretty(selected.student_phone)} runs the first-message flow again.`)) return;
    setResetting(true);
    const res = await resetSmsConversation(selected.id);
    setResetting(false);
    if (res.ok) {
      toast.success("Thread reset");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["sms-conversations"] });
    } else toast.error(res.error ?? "Reset failed");
  };

  // Compact header — one strip with main line + health + tab nav (tabs themselves below).
  const headerStrip = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
      <div className="inline-flex items-center gap-1.5">
        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Main line:</span>
        <span className="tabular-nums font-semibold">{mainLine ? formatPhonePretty(mainLine) : "not provisioned"}</span>
      </div>
      <div className="inline-flex items-center gap-1.5">
        {healthOk ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
        <span className="text-muted-foreground">Last inbound:</span>
        <span className="font-medium">{relTime(lastInbound)}</span>
      </div>
      {lastError && (
        <div className="inline-flex items-center gap-1.5 text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Last error {relTime(lastError.received_at)}: {lastError.error ?? "unknown"}</span>
        </div>
      )}
      <div className="inline-flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Summary texts → </span>
        <span className="font-semibold tabular-nums">
          {configQuery.data?.lee_phone ? formatPhonePretty(configQuery.data.lee_phone) : "not configured"}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {headerStrip}
      <Tabs defaultValue="conversations">
        <TabsList>
          <TabsTrigger value="conversations">Conversations {convos.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">{convos.length}</span>}</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="setup">Setup &amp; tester</TabsTrigger>
        </TabsList>

        <TabsContent value="conversations" className="mt-3">
          {convosQuery.isLoading ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading conversations…
            </Card>
          ) : convos.length === 0 ? (
            <Card className="p-10 text-center">
              <MessageSquare className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <div className="text-sm font-medium">No texts yet</div>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Student texts will appear here. Use <strong>Setup &amp; tester</strong> to simulate an inbound without paying for Twilio.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
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
                          {c.is_tester && <Badge variant="outline" className="text-[9px] h-4 px-1 border-violet-400 text-violet-700">tester</Badge>}
                          {c.status === "opted_out" && <Badge variant="outline" className="text-[9px] h-4 px-1">opted out</Badge>}
                          <span className="ml-auto text-[10px] text-muted-foreground">{new Date(c.last_message_at).toLocaleDateString()}</span>
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

              <Card className="overflow-hidden py-0 gap-0">
                {selected ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-semibold">{formatPhonePretty(selected.student_phone)}</span>
                      <span className="text-xs text-muted-foreground">
                        via {formatPhonePretty(selected.campus_number)}
                        {selected.campus_id && campusById.get(selected.campus_id) ? ` · ${campusById.get(selected.campus_id)!.school_name}` : ""}
                      </span>
                      <div className="ml-auto flex flex-wrap items-center gap-1">
                        <FactChip label="Course" value={selected.course} />
                        <FactChip label="Exam" value={selected.exam_date} />
                        <FactChip label="Struggles" value={selected.struggles} />
                        <FactChip label="Major" value={selected.major} />
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={doReset} disabled={resetting} title="Delete this thread so the next inbound runs the first-message flow">
                          {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                          Reset
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-[48vh] min-h-[200px] space-y-2 overflow-auto p-4">
                      {(messagesQuery.data ?? []).map((m) => (
                        <div key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                            m.direction === "out"
                              ? m.author === "auto" || m.author === "auto-ack" ? "bg-[#14213D]/80 text-white" : "bg-[#14213D] text-white"
                              : "bg-muted text-foreground",
                          )}>
                            {m.body}
                            <div className={cn("mt-1 text-[9px]", m.direction === "out" ? "text-white/60" : "text-muted-foreground")}>
                              {m.direction === "out" ? (m.author === "auto" ? "auto" : m.author === "auto-ack" ? "auto · ack" : "you") : "student"} ·{" "}
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
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigator.clipboard.writeText(`${SITE_ORIGIN}/start`).then(() => toast.success("Copied /start link"))}>
                          <Copy className="h-3 w-3" /> Campus selector
                        </Button>
                        <Select value="" onValueChange={(slug) => { navigator.clipboard.writeText(`${SITE_ORIGIN}/outreach/school/${slug}`).then(() => toast.success("Campus page link copied")); }}>
                          <SelectTrigger className="h-7 w-[230px] text-xs"><SelectValue placeholder="Copy a campus page link…" /></SelectTrigger>
                          <SelectContent>
                            {campuses.filter((c) => c.approval_status === "approved" && !c.archived && c.slug).sort((a, b) => a.school_name.localeCompare(b.school_name)).map((c) => (
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
          )}
        </TabsContent>

        <TabsContent value="templates" className="mt-3">
          <Card className="p-3 gap-2 bg-muted/20">
            <div className="text-xs text-muted-foreground">
              These are every automated message the SMS bot sends. Edits take effect immediately — the next text uses the new copy.
              Tokens like <code className="rounded bg-muted px-1">{"{ref}"}</code> are filled in per-conversation.
            </div>
          </Card>
          <div className="mt-3">
            <SmsTemplatesEditor />
          </div>
        </TabsContent>

        <TabsContent value="setup" className="mt-3 space-y-3">
          <SetupAndTesterTab
            mainLine={mainLine}
            campuses={campuses}
            campusById={campusById}
            phoneMap={phonesQuery.data ?? new Map()}
            config={configQuery.data}
            onAfter={() => {
              qc.invalidateQueries({ queryKey: ["sms-conversations"] });
              qc.invalidateQueries({ queryKey: ["sms-inbound-raw"] });
            }}
            onProvisioned={() => qc.invalidateQueries({ queryKey: ["campus-phones"] })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SetupAndTesterTab({
  mainLine, campuses, campusById, phoneMap, config, onAfter, onProvisioned,
}: {
  mainLine: string | undefined;
  campuses: Campus[];
  campusById: Map<string, Campus>;
  phoneMap: Map<string, string>;
  config: { lee_phone: string | null; tester_phones: string[]; twilio_configured: boolean; anthropic_configured: boolean } | undefined;
  onAfter: () => void;
  onProvisioned: () => void;
}) {
  const [provisioning, setProvisioning] = useState(false);
  const campusNumberOptions = useMemo(() => {
    const list: { phone: string; label: string }[] = [];
    if (mainLine) list.push({ phone: mainLine, label: "Main line" });
    for (const [campusId, phone] of phoneMap.entries()) {
      if (campusId === "__main__") continue;
      const c = campusById.get(campusId);
      list.push({ phone, label: c?.school_name ?? campusId.slice(0, 6) });
    }
    return list;
  }, [phoneMap, campusById, mainLine]);

  const [toPhone, setToPhone] = useState<string>("");
  const [fromPhone, setFromPhone] = useState<string>("+15550000001");
  const [body, setBody] = useState<string>("Hey I need a tutor for ACCT 2010, exam next Thursday and I'm lost on adjusting entries.");
  const [sending, setSending] = useState(false);

  // default to main line once it loads
  useMemo(() => { if (!toPhone && campusNumberOptions[0]) setToPhone(campusNumberOptions[0].phone); }, [campusNumberOptions, toPhone]);

  const simulate = async () => {
    if (!toPhone || !fromPhone || !body.trim()) { toast.error("Need campus number, student phone, and message body"); return; }
    setSending(true);
    const res = await simulateInboundSms({ fromPhone, toPhone, body: body.trim() });
    setSending(false);
    if (res.ok) { toast.success("Simulated — webhook accepted it"); setTimeout(onAfter, 800); }
    else toast.error(res.error ?? "Simulate failed");
  };

  const getMainLine = async () => {
    setProvisioning(true);
    const res = await provisionCampusNumber(null);
    setProvisioning(false);
    if (res.ok) { toast.success(`Main line ready: ${res.phone}`); onProvisioned(); }
    else toast.error(res.error ?? "Provisioning failed");
  };

  return (
    <>
      <Card className="p-3 gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold">Routing &amp; integrations</h3>
        </div>
        <dl className="grid gap-1 text-xs sm:grid-cols-2">
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Main line</dt><dd className="font-medium tabular-nums">{mainLine ? formatPhonePretty(mainLine) : "—"}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Summary texts go to</dt><dd className="font-medium tabular-nums">{config?.lee_phone ? formatPhonePretty(config.lee_phone) : "not configured"}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Twilio credentials</dt><dd className="font-medium">{config?.twilio_configured ? "configured" : "missing"}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Claude (extraction)</dt><dd className="font-medium">{config?.anthropic_configured ? "configured" : "missing"}</dd></div>
          <div className="flex justify-between gap-2 sm:col-span-2"><dt className="text-muted-foreground">Tester phones (bypass guard)</dt><dd className="font-medium tabular-nums">{config?.tester_phones?.length ? config.tester_phones.map(formatPhonePretty).join(", ") : "none"}</dd></div>
        </dl>
        <p className="text-[10px] text-muted-foreground">
          To change the summary-text destination or tester phones, ask Lovable to update the <code>LEE_PERSONAL_PHONE</code> and <code>SMS_TESTER_PHONES</code> secrets.
        </p>
        {!mainLine && (
          <Button size="sm" className="self-start mt-1" onClick={getMainLine} disabled={provisioning}>
            {provisioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
            Provision main line
          </Button>
        )}
      </Card>

      <Card className="p-3 gap-2 border-violet-200 bg-violet-50/40 dark:bg-violet-950/10">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-semibold">Live test from your own cell</h3>
          <Badge variant="outline" className="text-[10px] h-4 px-1">~$0.015 per round-trip</Badge>
        </div>
        <ol className="text-xs space-y-1 list-decimal pl-4 text-foreground/90">
          <li>
            Confirm <strong>your cell number</strong> appears in both rows above: <em>Summary texts go to</em> and <em>Tester phones</em>. If not, ask Lovable to set <code>LEE_PERSONAL_PHONE</code> and add your number to <code>SMS_TESTER_PHONES</code>.
          </li>
          <li>
            From your cell, text the campus number{" "}
            {campusNumberOptions[0] ? (
              <strong className="tabular-nums">{formatPhonePretty(campusNumberOptions[0].phone)}</strong>
            ) : (
              <strong>(provision a number first)</strong>
            )}
            {" "}with a realistic student message — e.g. <em>"Hi I need a tutor for ACCT 2010, exam Thursday"</em>.
          </li>
          <li>
            You'll receive <strong>two texts back on the same phone</strong>:
            <ul className="list-disc pl-4 mt-0.5">
              <li><strong>From the campus number → "student"</strong> — the auto-reply booking link.</li>
              <li><strong>From the campus number → "Lee"</strong> — the AI summary with course, exam date, and struggles.</li>
            </ul>
          </li>
          <li>
            Watch the <em>Conversations</em> tab — the thread will appear and update. Use <em>Reset thread</em> there to start a brand-new flow without spinning up a new phone.
          </li>
        </ol>
        <p className="text-[10px] text-muted-foreground">
          Because tester phones bypass the one-shot guard, you can run the test as many times as you want without being silenced as a "returning student". When you don't want to spend Twilio credits, use the <em>Simulate</em> card below instead — it routes the exact same logic for $0.
        </p>
      </Card>

      <Card className="p-3 gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-semibold">Simulate an inbound text</h3>
          <Badge variant="outline" className="text-[10px] h-4 px-1">$0 webhook call</Badge>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto] items-end">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">Campus number (to)</label>
            <Select value={toPhone} onValueChange={setToPhone}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick a campus number" /></SelectTrigger>
              <SelectContent>
                {campusNumberOptions.map((c) => (
                  <SelectItem key={c.phone} value={c.phone} className="text-xs">{formatPhonePretty(c.phone)} — {c.label}</SelectItem>
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
          <Button onClick={simulate} disabled={sending} size="sm">
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Simulate
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          The webhook call is free. The auto-reply Twilio then sends costs ~$0.008. Use a tester phone (listed above) to bypass the one-shot booking guard.
        </p>
      </Card>
    </>
  );
}

export default TextsPanel;
