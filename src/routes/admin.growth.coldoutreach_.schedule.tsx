// /admin/growth/coldoutreach/schedule — the semester sending calendar. Two channels, one
// sequence per contact. The plan is built whether contacts exist or not; an empty slot is a
// work order, not an error. IG is always manual (copy-paste); email goes through Instantly.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown, ChevronRight, Copy, Download, ExternalLink, Flame, Instagram, Loader2, Mail,
  MessageSquare, Reply, Send, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  growthScheduleWeek, growthPrewarmWeek, growthMarkTouch, growthMarkReply, growthPrewarm,
  growthScheduleCsv, growthInstantlyPush,
  type ScheduleItemView, type ScheduleDayView, type Owner,
} from "@/lib/growth-schedule.functions";
import { addDays, dowOf, seasonWeeks } from "@/lib/growth-schedule-core";
import { ColdHeader } from "@/components/growth/ColdHeader";
import { cn } from "@/lib/utils";

// FLAT, NOT NESTED — the file is admin.growth.coldoutreach_.schedule.tsx.
//
// As admin.growth.coldoutreach.schedule.tsx this was generated as a CHILD of
// /admin/growth/coldoutreach, and that parent renders a full dashboard with no <Outlet/>, so the
// child never mounted: the URL rendered the dashboard and this page was unreachable. The trailing
// underscore opts out of the nesting. The URL is unchanged, and the dashboard's own
// <Link to="/admin/growth/coldoutreach/schedule"> keeps working.
export const Route = createFileRoute("/admin/growth/coldoutreach_/schedule")({ component: SchedulePage });

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return `${DOW[dowOf(d)]} · ${MON[m - 1]} ${dd}`; };
const OWNERS: { id: Owner; label: string }[] = [{ id: "lee", label: "Lee" }, { id: "king", label: "King" }, { id: "ej", label: "EJ" }];

function todayYmd() { try { return new Date().toISOString().slice(0, 10); } catch { return "2026-09-01"; } }

async function copyText(text: string, ok: string) {
  try { await navigator.clipboard.writeText(text); toast.success(ok); } catch { toast.error("Clipboard blocked."); }
}

function SchedulePage() {
  const weeks = useMemo(() => seasonWeeks(), []);
  const [owner, setOwner] = useState<Owner>("king");
  const initialWeek = useMemo(() => {
    const t = todayYmd();
    return (weeks.find((w) => t >= w.start && t <= w.end) ?? weeks[0]).start;
  }, [weeks]);
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [tab, setTab] = useState<"schedule" | "prewarm">("schedule");

  const wk = useQuery({ queryKey: ["schedule", owner, weekStart], queryFn: () => growthScheduleWeek({ data: { owner, weekStart } }) });
  const weekMeta = weeks.find((w) => w.start === weekStart);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <ColdHeader
        tab="sends"
        right={
          <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
            {OWNERS.map((o) => (
              <button key={o.id} onClick={() => setOwner(o.id)} className={cn("px-3 py-1.5 font-medium", owner === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{o.label}</button>
            ))}
          </div>
        }
      />
      <p className="px-1 text-[11px] text-muted-foreground">Sun–Fri · one sequence per contact, both channels. Instagram is manual; email goes through Instantly.</p>

      {/* week nav */}
      <div className="flex items-center gap-2">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} disabled={weekStart <= weeks[0].start} className="rounded border border-border px-2 py-1 text-xs disabled:opacity-30">←</button>
        <select value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="rounded border border-border bg-card px-2 py-1 text-xs">
          {weeks.map((w) => <option key={w.start} value={w.start}>Week {w.index} · {MON[Number(w.start.split("-")[1]) - 1]} {Number(w.start.split("-")[2])}</option>)}
        </select>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={weekStart >= weeks[weeks.length - 1].start} className="rounded border border-border px-2 py-1 text-xs disabled:opacity-30">→</button>
        <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-border text-xs">
          <button onClick={() => setTab("schedule")} className={cn("px-3 py-1.5 font-medium", tab === "schedule" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>Schedule</button>
          <button onClick={() => setTab("prewarm")} className={cn("px-3 py-1.5 font-medium", tab === "prewarm" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>Pre-warm next week</button>
        </div>
      </div>

      {wk.isLoading && <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>}
      {!wk.isLoading && wk.data?.ready === false && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">EJ isn't set up yet — no tranches to schedule.</div>
      )}

      {tab === "schedule" && wk.data?.ready && (
        <>
          {/* week header — the gaps number is the enrichment deadline */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 p-2.5 text-[11px]">
            <span className="font-semibold">Week {weekMeta?.index}</span>
            <span className={cn(wk.data.stats.gaps > 0 && "text-amber-500")}><strong>{wk.data.stats.gaps}</strong> slots need a contact</span>
            <span><strong>{wk.data.stats.slots}</strong> filled</span>
            <span><strong>{wk.data.stats.sent}</strong> sent</span>
            <span><strong>{wk.data.stats.replies}</strong> replies</span>
            <span className="ml-auto text-muted-foreground">Send window 9–11am Manila = 9–11pm ET prev. eve</span>
          </div>
          {wk.data.days.map((d) => <DayCard key={d.date} day={d} owner={owner} onChange={() => wk.refetch()} />)}
        </>
      )}

      {tab === "prewarm" && <PrewarmView owner={owner} weekStart={addDays(weekStart, 7)} />}
    </div>
  );
}

function DayCard({ day, owner, onChange }: { day: ScheduleDayView; owner: Owner; onChange: () => void }) {
  const t = todayYmd();
  const [open, setOpen] = useState(day.date >= t); // today & future open by default
  const status = day.date < t ? (day.items.length && day.dmUsed + day.emailUsed === 0 ? "missed" : "past") : day.date === t ? "today" : "scheduled";
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 bg-card px-3 py-2 text-left">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <span className="text-[13px] font-semibold">{fmtDay(day.date)}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{day.sender}</span>
        {status === "missed" && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-500">Missed</span>}
        {status === "today" && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">Today</span>}
        <span className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5"><Instagram className="size-3" /> {day.dmUsed}/{day.dmCap}</span>
          <span className="inline-flex items-center gap-0.5"><Mail className="size-3" /> {day.emailUsed}/{day.emailCap}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-3">
          {day.items.length === 0 && day.gaps.length === 0 && <p className="text-[11px] text-muted-foreground">Nothing scheduled.</p>}
          {day.items.map((it, i) => <SequenceRow key={`${it.orgKey}-${i}`} it={it} sender={day.sender as "lee" | "king"} onChange={onChange} />)}
          {day.gaps.length > 0 && (
            <div className="space-y-1 rounded-md border border-dashed border-amber-500/30 bg-amber-500/[0.03] p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-500/80">{day.gaps.length} work order{day.gaps.length === 1 ? "" : "s"} — no contact yet</div>
              {day.gaps.map((g, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground">◇</span>
                  <span className="min-w-0 truncate">{g.gapLabel}</span>
                  <Link to="/admin/growth/coldoutreach" className="ml-auto inline-flex items-center gap-0.5 text-primary hover:underline">Find contact <ArrowRightMini /></Link>
                </div>
              ))}
            </div>
          )}
          {/* Email track tools */}
          {day.items.some((it) => it.channels.some((c) => c.track === "email")) && <EmailDayTools owner={owner} date={day.date} />}
        </div>
      )}
    </div>
  );
}

function ArrowRightMini() { return <ExternalLink className="size-3" />; }

function SequenceRow({ it, sender, onChange }: { it: ScheduleItemView; sender: "lee" | "king"; onChange: () => void }) {
  const dm = it.channels.find((c) => c.track === "dm");
  const email = it.channels.find((c) => c.track === "email");
  const [replying, setReplying] = useState(false);
  const mark = useMutation({
    mutationFn: (v: { channel: "dm" | "story_reply" | "email"; variant: string }) =>
      growthMarkTouch({ data: { campusId: it.campusId, orgKey: it.orgKey, contactId: it.contactId, channel: v.channel, kind: it.kind, scheduledDate: it.date, sender, messageVariant: v.variant } }),
    onSuccess: () => { onChange(); },
  });
  const copyAndSend = (channel: "dm" | "story_reply" | "email", text: string, variant: string) => {
    copyText(text, channel === "email" ? "Email copied — marked sent." : "Message copied — marked sent.");
    mark.mutate({ channel, variant });
  };
  return (
    <div className="rounded-md border border-border bg-card p-2 text-[11px]">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="font-semibold">{it.contactName || it.orgLabel}</span>
        {it.contactRole && <span className="text-muted-foreground">· {it.contactRole}</span>}
        <span className="text-muted-foreground">· {it.orgLabel} · {it.campusName}</span>
        {it.kind === "follow_up" && <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-sky-400">Follow-up</span>}
        {it.singleChannel && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">single-channel</span>}
        {it.prewarmedAt && <span className="inline-flex items-center gap-0.5 text-[9px] text-pink-400"><Flame className="size-2.5" /> pre-warmed{it.igFollowed ? " ·follow" : ""}{it.igLiked ? " ·like" : ""}</span>}
      </div>

      {dm && (
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex w-5 justify-center text-muted-foreground">①</span>
          <Instagram className="size-3 text-pink-400" />
          <a href={`https://instagram.com/${dm.handle.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="text-pink-400 hover:underline">@{dm.handle.replace(/^@/, "")}</a>
          <ExternalLink className="size-2.5 text-muted-foreground" />
          <button onClick={() => copyAndSend("dm", it.messages.dm ?? "", "dm")} className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 hover:bg-muted"><Copy className="size-3" /> Copy DM</button>
          <button onClick={() => copyAndSend("story_reply", it.messages.story ?? "", "story_reply")} title="Reply to an active Story instead of a cold DM" className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 hover:bg-muted"><MessageSquare className="size-3" /> Story reply</button>
        </div>
      )}
      {email && (
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex w-5 justify-center text-muted-foreground">{dm ? "②" : "①"}</span>
          <Mail className="size-3 text-sky-400" />
          <span className="text-muted-foreground">{email.handle}</span>
          <button onClick={() => copyAndSend("email", it.messages.email ?? "", "email")} className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 hover:bg-muted"><Copy className="size-3" /> Copy email</button>
          <span className="text-[9px] text-muted-foreground">via Instantly / hand-send</span>
        </div>
      )}

      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
        {it.followUpDate && <span>Follow-up {it.followUpDate.slice(5)} if no reply</span>}
        <button onClick={() => setReplying((v) => !v)} className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-foreground hover:bg-muted"><Reply className="size-3" /> Replied</button>
      </div>
      {replying && <ReplyForm it={it} onDone={() => { setReplying(false); onChange(); }} />}
    </div>
  );
}

const OUTCOMES: { v: string; label: string }[] = [
  { v: "interested", label: "interested" }, { v: "referred", label: "referred" }, { v: "not_now", label: "not now" },
  { v: "wrong_person", label: "wrong person" }, { v: "no", label: "no" }, { v: "hostile", label: "hostile" },
];
function ReplyForm({ it, onDone }: { it: ScheduleItemView; onDone: () => void }) {
  const [outcome, setOutcome] = useState("interested");
  const [text, setText] = useState("");
  const [referred, setReferred] = useState("");
  const save = useMutation({
    mutationFn: () => growthMarkReply({ data: { campusId: it.campusId, orgKey: it.orgKey, contactId: it.contactId, channel: "dm", scheduledDate: it.date, outcome: outcome as any, replyText: text, referredName: outcome === "referred" ? (referred || null) : null } }),
    onSuccess: (r) => { if (r.ok) { toast.success("Reply logged."); onDone(); } else toast.error(r.error ?? "Failed"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <div className="mt-1.5 space-y-1.5 rounded border border-primary/30 bg-background p-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What did they say? (required — this trains the response playbook)" rows={2} className="w-full rounded border border-border bg-card px-2 py-1 text-[11px]" />
      <div className="flex flex-wrap items-center gap-1">
        {OUTCOMES.map((o) => (
          <button key={o.v} onClick={() => setOutcome(o.v)} className={cn("rounded-full border px-2 py-0.5 text-[10px]", outcome === o.v ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>{o.label}</button>
        ))}
      </div>
      {outcome === "referred" && <input value={referred} onChange={(e) => setReferred(e.target.value)} placeholder="Referred person's name" className="w-full rounded border border-border bg-card px-2 py-1 text-[11px]" />}
      <div className="flex justify-end gap-1.5">
        <button onClick={onDone} className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground">Cancel</button>
        <button onClick={() => save.mutate()} disabled={!text.trim() || save.isPending} className="rounded bg-primary px-3 py-0.5 text-[10px] font-medium text-primary-foreground disabled:opacity-40">{save.isPending ? "…" : "Log reply"}</button>
      </div>
    </div>
  );
}

function EmailDayTools({ owner, date }: { owner: Owner; date: string }) {
  const csv = useMutation({
    mutationFn: () => growthScheduleCsv({ data: { owner, date } }),
    onSuccess: (r) => {
      if (!r.rows) { toast.message("No email rows for this day."); return; }
      try {
        const blob = new Blob([r.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob); const a = document.createElement("a");
        a.href = url; a.download = `instantly-${date}.csv`; a.click(); URL.revokeObjectURL(url);
        toast.success(`Exported ${r.rows} rows for Instantly.`);
      } catch { toast.error("Download blocked."); }
    },
  });
  const push = useMutation({
    mutationFn: () => growthInstantlyPush({ data: { owner, date } }),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.message(r.message)),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Push failed"),
  });
  return (
    <div className="flex items-center gap-1.5 border-t border-border pt-2 text-[10px]">
      <span className="text-muted-foreground">Email track:</span>
      <button onClick={() => push.mutate()} disabled={push.isPending} className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 hover:bg-muted"><Send className="size-3" /> Push to Instantly</button>
      <button onClick={() => csv.mutate()} disabled={csv.isPending} className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 hover:bg-muted"><Download className="size-3" /> CSV</button>
    </div>
  );
}

function PrewarmView({ owner, weekStart }: { owner: Owner; weekStart: string }) {
  const qc = useQueryClient();
  const pw = useQuery({ queryKey: ["prewarm", owner, weekStart], queryFn: () => growthPrewarmWeek({ data: { owner, weekStart } }) });
  const set = useMutation({
    mutationFn: (v: { contactId: string; followed?: boolean; liked?: boolean }) => growthPrewarm({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prewarm", owner, weekStart] }),
  });
  const targets = pw.data?.targets ?? [];
  const done = targets.filter((t) => t.igFollowed || t.igLiked).length;
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-[11px]">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-pink-400" />
          <span className="font-semibold">Pre-warm — week of {weekStart.slice(5)}</span>
          <span className="text-muted-foreground">{targets.length} Instagram targets</span>
          <span className="ml-auto"><strong>{done}</strong> of {targets.length} pre-warmed</span>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Follow + like one recent post the week before — manual, paced across a couple of sessions. Never automate following.</p>
      </div>
      {pw.isLoading && <div className="flex h-24 items-center justify-center text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>}
      {targets.map((t) => (
        <div key={t.contactId} className="flex items-center gap-2 rounded-md border border-border bg-card p-2 text-[11px]">
          <span className="text-muted-foreground">◇</span>
          <a href={`https://instagram.com/${t.handle.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="text-pink-400 hover:underline">@{t.handle.replace(/^@/, "")}</a>
          <ExternalLink className="size-2.5 text-muted-foreground" />
          <span className="min-w-0 truncate text-muted-foreground">{t.label} · {t.campusName}</span>
          <label className="ml-auto inline-flex items-center gap-1"><input type="checkbox" checked={t.igFollowed} onChange={(e) => t.contactId && set.mutate({ contactId: t.contactId, followed: e.target.checked })} /> follow</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={t.igLiked} onChange={(e) => t.contactId && set.mutate({ contactId: t.contactId, liked: e.target.checked })} /> like</label>
        </div>
      ))}
      {!pw.isLoading && !targets.length && <p className="px-1 text-[11px] text-muted-foreground">No Instagram targets next week yet — fill contacts on the enrichment page.</p>}
    </div>
  );
}
