// Texts — SMS conversations inbox. Templates, setup/tester, and maintenance
// (clear-by-phone / clear-all) live behind a "Texts Settings" dialog.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, FlaskConical, Loader2,
  MessageSquare, Phone, RefreshCw, RotateCcw, Send, Settings, ShieldCheck, Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Campus } from "@/lib/outreach-mock";
import {
  clearAllSmsConversations, clearConversationsByPhone,
  fetchCampusPhones, fetchSmsConfig, fetchSmsConversations, fetchSmsInboundRaw,
  fetchSmsDiagnostics, fetchSmsMessages, formatPhonePretty, provisionCampusNumber,
  resetSmsConversation, resyncSmsNumber, sendSmsReply, simulateInboundSms,
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

export function TextsPanel({ campuses }: { campuses: Campus[] }) {
  const qc = useQueryClient();
  const convosQuery = useQuery({
    queryKey: ["sms-conversations"],
    queryFn: fetchSmsConversations,
    retry: 1,
    refetchInterval: 60_000,
  });
  const phonesQuery = useQuery({ queryKey: ["campus-phones"], queryFn: fetchCampusPhones, retry: 1 });
  const rawQuery = useQuery({
    queryKey: ["sms-inbound-raw"],
    queryFn: () => fetchSmsInboundRaw(25),
    refetchInterval: 60_000,
    retry: 1,
  });
  const configQuery = useQuery({ queryKey: ["sms-config"], queryFn: fetchSmsConfig, retry: 1 });

  const mainLine = phonesQuery.data?.get("__main__");
  const convos = convosQuery.data ?? [];
  const rawRows = rawQuery.data ?? [];
  const lastInbound = rawRows[0]?.received_at ?? null;
  const lastError = rawRows.find((r) => r.parse_status === "error") ?? null;
  const healthOk = !lastError || (lastInbound && new Date(lastInbound).getTime() > new Date(lastError.received_at).getTime());

  // Default to no selection — user must click a conversation to open it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected: SmsConversation | undefined = convos.find((c) => c.id === selectedId);
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
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  return (
    <div className="space-y-3">
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
        <div className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Summary texts → </span>
          <span className="font-semibold tabular-nums">
            {configQuery.data?.lee_phone ? formatPhonePretty(configQuery.data.lee_phone) : "not configured"}
          </span>
        </div>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs">
              <Settings className="h-3.5 w-3.5" /> Texts Settings
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Texts Settings</DialogTitle>
            </DialogHeader>
            <TextsSettingsContent
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
              onClearedConvos={() => setSelectedId(null)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {convosQuery.isLoading ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading conversations…
        </Card>
      ) : convos.length === 0 ? (
        <Card className="p-10 text-center">
          <MessageSquare className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-medium">No texts yet</div>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Student texts will appear here.
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
    </div>
  );
}

function TextsSettingsContent({
  mainLine, campuses, campusById, phoneMap, config, onAfter, onProvisioned, onClearedConvos,
}: {
  mainLine: string | undefined;
  campuses: Campus[];
  campusById: Map<string, Campus>;
  phoneMap: Map<string, string>;
  config: { lee_phone: string | null; tester_phones: string[]; twilio_configured: boolean; anthropic_configured: boolean } | undefined;
  onAfter: () => void;
  onProvisioned: () => void;
  onClearedConvos: () => void;
}) {
  return (
    <Tabs defaultValue="templates" className="mt-2">
      <TabsList>
        <TabsTrigger value="templates">Templates</TabsTrigger>
        <TabsTrigger value="setup">Setup &amp; tester</TabsTrigger>
        <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
      </TabsList>
      <TabsContent value="templates" className="mt-3">
        <Card className="p-3 gap-2 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            These are every automated message the SMS bot sends. Edits take effect immediately.
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
          phoneMap={phoneMap}
          config={config}
          onAfter={onAfter}
          onProvisioned={onProvisioned}
        />
      </TabsContent>
      <TabsContent value="maintenance" className="mt-3">
        <MaintenanceTab onClearedConvos={onClearedConvos} />
      </TabsContent>
    </Tabs>
  );
}

function MaintenanceTab({ onClearedConvos }: { onClearedConvos: () => void }) {
  const qc = useQueryClient();
  const [clearPhone, setClearPhone] = useState("");
  const [clearingPhone, setClearingPhone] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const doClearPhone = async () => {
    if (!clearPhone.trim()) return;
    if (!window.confirm(`Delete all conversations, messages, queued outbox, and inbound logs for ${clearPhone.trim()}?`)) return;
    setClearingPhone(true);
    const res = await clearConversationsByPhone(clearPhone.trim());
    setClearingPhone(false);
    if (res.ok) {
      toast.success(res.deleted ? `Cleared ${res.deleted} conversation${res.deleted === 1 ? "" : "s"}` : "Nothing to clear for that number");
      setClearPhone("");
      onClearedConvos();
      qc.invalidateQueries({ queryKey: ["sms-conversations"] });
      qc.invalidateQueries({ queryKey: ["sms-inbound-raw"] });
    } else toast.error(res.error ?? "Clear failed");
  };

  const doClearAll = async () => {
    const typed = window.prompt('Type CLEAR to wipe EVERY conversation, message, outbox, and inbound log. This cannot be undone.');
    if (typed !== "CLEAR") {
      if (typed != null) toast.error("Canceled — you must type CLEAR exactly.");
      return;
    }
    setClearingAll(true);
    const res = await clearAllSmsConversations();
    setClearingAll(false);
    if (res.ok) {
      toast.success("All SMS data cleared");
      onClearedConvos();
      qc.invalidateQueries({ queryKey: ["sms-conversations"] });
      qc.invalidateQueries({ queryKey: ["sms-inbound-raw"] });
    } else toast.error(res.error ?? "Clear failed");
  };

  return (
    <Card className="p-3 gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Clear by phone</label>
          <div className="flex items-center gap-1.5">
            <Input
              value={clearPhone}
              onChange={(e) => setClearPhone(e.target.value)}
              placeholder="e.g. 901-871-3321"
              className="h-8 w-48 text-xs"
            />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={doClearPhone} disabled={clearingPhone || !clearPhone.trim()}>
              {clearingPhone ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Clear
            </Button>
          </div>
        </div>
        <div className="ml-auto flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Danger zone</label>
          <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={doClearAll} disabled={clearingAll}>
            {clearingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Clear ALL conversations
          </Button>
        </div>
      </div>
    </Card>
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
  const [resyncing, setResyncing] = useState(false);
  const diagnosticsQuery = useQuery({
    queryKey: ["sms-diagnostics"],
    queryFn: fetchSmsDiagnostics,
    retry: 1,
    refetchInterval: 60_000,
  });

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

  const doResync = async () => {
    setResyncing(true);
    const res = await resyncSmsNumber();
    setResyncing(false);
    if (res.ok) { toast.success("SMS webhook settings resynced"); diagnosticsQuery.refetch(); }
    else toast.error(res.error ?? "Resync failed");
  };

  const diagnostics = diagnosticsQuery.data;

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
          <div className="flex justify-between gap-2 sm:col-span-2"><dt className="text-muted-foreground">Tester phones</dt><dd className="font-medium tabular-nums">{config?.tester_phones?.length ? config.tester_phones.map(formatPhonePretty).join(", ") : "none"}</dd></div>
        </dl>
        {!mainLine && (
          <Button size="sm" className="self-start mt-1" onClick={getMainLine} disabled={provisioning}>
            {provisioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
            Provision main line
          </Button>
        )}
        <div className="flex items-center gap-2 mt-1">
          <Badge variant={diagnostics?.webhook_ok ? "default" : "outline"} className="text-[10px] h-4 px-1">
            {diagnosticsQuery.isLoading ? "checking" : diagnostics?.webhook_ok ? "webhook synced" : "needs resync"}
          </Badge>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={doResync} disabled={resyncing}>
            {resyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
            Resync webhook
          </Button>
        </div>
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
      </Card>
    </>
  );
}

export default TextsPanel;
