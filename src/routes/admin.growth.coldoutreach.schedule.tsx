// /admin/growth/coldoutreach/schedule — the semester sending calendar. Two channels, one
// sequence per contact. The plan is built whether contacts exist or not; an empty slot is a
// work order, not an error. IG is always manual (copy-paste); email goes through Instantly.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Building2, Check, ChevronDown, ChevronRight, Copy, Download, ExternalLink,
  HelpCircle, Instagram, Loader2, Mail, MessageSquare, Plus, Send, Sparkles, User, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  growthScheduleWeek, growthPrewarmWeek, growthMarkTouch, growthDeleteTouch, growthMarkReplied, growthPrewarm,
  growthScheduleCsv, growthInstantlyPush,
  type SchedDay, type SchedColumn, type SchedSectionCol, type SchedCampusCol, type SchedContactView, type Owner,
} from "@/lib/growth-schedule.functions";
import { addDays, dowOf, seasonWeeks, HANDOFF_DATE } from "@/lib/growth-schedule-core";
import { ContactAddForm } from "@/components/growth/contact-add-form";
import { ColdHeader } from "@/components/growth/ColdHeader";
import { renderQueryState } from "@/components/growth/QueryState";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/coldoutreach/schedule")({ component: SchedulePage });

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return `${DOW[dowOf(d)]} · ${MON[m - 1]} ${dd}`; };
const OWNERS: { id: Owner; label: string }[] = [{ id: "lee", label: "Lee" }, { id: "king", label: "King" }, { id: "ej", label: "EJ" }];

function todayYmd() { try { return new Date().toISOString().slice(0, 10); } catch { return "2026-09-01"; } }

// Bare Instagram handle from either an @handle or a full instagram.com URL.
const igName = (s: string) => {
  const m = String(s || "").match(/instagram\.com\/([^/?#\s]+)/i);
  return (m ? m[1] : String(s || "")).replace(/^@+/, "").replace(/\/+$/, "");
};

async function copyText(text: string, ok: string) {
  try { await navigator.clipboard.writeText(text); toast.success(ok); } catch { toast.error("Clipboard blocked."); }
}

function SchedulePage() {
  const weeks = useMemo(() => seasonWeeks(), []);
  const [owner, setOwner] = useState<Owner>(() => (todayYmd() < HANDOFF_DATE ? "lee" : "king"));
  const initialWeek = useMemo(() => {
    const t = todayYmd();
    return (weeks.find((w) => t >= w.start && t <= w.end) ?? weeks[0]).start;
  }, [weeks]);
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [tab, setTab] = useState<"schedule" | "prewarm">("schedule");
  // Which channel column(s) to show — persists across days and reloads (item 5).
  const [channelView, setChannelView] = useState<"dm" | "email" | "both">(() => { try { const v = localStorage.getItem("co-sched-channel"); return v === "dm" || v === "email" ? v : "both"; } catch { return "both"; } });
  const setChannel = (v: "dm" | "email" | "both") => { setChannelView(v); try { localStorage.setItem("co-sched-channel", v); } catch { /* ignore */ } };

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
        <div className="ml-auto"><NeedHelp /></div>
        <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
          <button onClick={() => setTab("schedule")} className={cn("px-3 py-1.5 font-medium", tab === "schedule" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>Schedule</button>
          <button onClick={() => setTab("prewarm")} className={cn("px-3 py-1.5 font-medium", tab === "prewarm" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>Pre-warm next week</button>
        </div>
      </div>

      {renderQueryState(wk, { label: "the schedule" })}
      {!wk.isLoading && !wk.isError && wk.data?.ready === false && (
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
          {!wk.data.days.some((d) => d.columns.some((c) => c.sections.length > 0)) && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-[12px] text-muted-foreground">
              Nothing scheduled for {OWNERS.find((o) => o.id === owner)?.label} this week. Founder-first: Lee runs Sept 1–12 (Ole Miss + the Florida cluster); King takes over Sept 13.
            </div>
          )}
          {wk.data.days.map((d) => <DayCard key={d.date} day={d} owner={owner} channelView={channelView} onChannel={setChannel} onChange={() => wk.refetch()} />)}
        </>
      )}

      {tab === "prewarm" && <PrewarmView owner={owner} weekStart={addDays(weekStart, 7)} />}
    </div>
  );
}

const TIPS: Record<"dm" | "email" | "rep", { title: string; body: string }> = {
  email: { title: "Email — campus depth", body: "All councils at a campus on the same day, then its top 5 chapters. Council forwards only work if the whole campus gets hit at once. One officer who forwards reaches 20+ chapters." },
  dm: { title: "Instagram — scattershot by role", body: "Weeks 1–2 group by role across many campuses — all IFC scholarship chairs, then all Panhellenic. That isolates whether the message works from whether the campus does. Campus-depth from week 3." },
  rep: { title: "Campus reps — the unlock", body: "A campus without a rep never gets chapter-level DMs. Our 20 daily DMs go to councils; reps DM chapters from their own accounts. Recruiting a rep is what opens a campus." },
};
function Tip({ which }: { which: "dm" | "email" | "rep" }) {
  const [open, setOpen] = useState(false);
  const t = TIPS[which];
  return (
    <span className="relative inline-block">
      <button onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} title={t.title} className="grid size-4 place-items-center rounded-full border border-border text-[9px] text-muted-foreground hover:bg-muted">?</button>
      {open && (<>
        <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
        <div className="absolute right-0 top-full z-40 mt-1 w-64 rounded-md border border-border bg-background p-2 text-left text-[10px] shadow-lg">
          <div className="mb-1 font-semibold">{t.title}</div><p className="text-muted-foreground">{t.body}</p>
        </div>
      </>)}
    </span>
  );
}
function NeedHelp() {
  const [open, setOpen] = useState(false);
  const panel = (t: { title: string; body: string }) => (<div className="rounded border border-border p-2"><div className="mb-0.5 font-semibold">{t.title}</div><p className="text-muted-foreground">{t.body}</p></div>);
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"><HelpCircle className="size-3.5" /> Need help?</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-md space-y-2 overflow-y-auto rounded-lg border border-border bg-background p-4 text-[11px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center"><span className="text-sm font-semibold">How the schedule works</span><button onClick={() => setOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground"><X className="size-4" /></button></div>
            {panel(TIPS.email)}{panel(TIPS.dm)}{panel(TIPS.rep)}
            <div className="rounded border border-border bg-muted/30 p-2 text-muted-foreground">Daily caps ramp 10→20 DMs and 25→100 emails through the season. Send window 9–11am Manila = 9–11pm ET the evening before — peak student hours.</div>
          </div>
        </div>
      )}
    </>
  );
}

function DayCard({ day, owner, channelView, onChannel, onChange }: { day: SchedDay; owner: Owner; channelView: "dm" | "email" | "both"; onChannel: (v: "dm" | "email" | "both") => void; onChange: () => void }) {
  const t = todayYmd();
  const [open, setOpen] = useState(day.date <= t ? false : day.date === t); // keep collapsed; open deliberately
  const hasContent = day.columns.some((c) => c.sections.length > 0);
  if (!hasContent) return null; // founder-first: not this owner's window
  const status = day.date < t ? "past" : day.date === t ? "today" : "scheduled";
  const col = (ch: "dm" | "email") => day.columns.find((c) => c.channel === ch);
  const dm = col("dm"), email = col("email");
  const badgeTitle = `${dm?.readyToSend ?? 0} of ${dm?.budget ?? 0} Instagram · ${email?.readyToSend ?? 0} of ${email?.budget ?? 0} email ready to send`;
  // Even when one channel is hidden, its counter still shows here so nothing is silently missed.
  const shown = day.columns.filter((c) => channelView === "both" || c.channel === channelView);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 bg-card px-3 py-2.5 text-left">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <span className="text-[13px] font-semibold uppercase tracking-wide">{fmtDay(day.date)}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{day.sender}</span>
        {status === "today" && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">Today</span>}
        <span title={badgeTitle} className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className={cn("inline-flex items-center gap-0.5", channelView === "email" && "opacity-40")}><Instagram className="size-3 text-pink-400" /> {dm?.readyToSend ?? 0}/{dm?.budget ?? 0}</span>
          <span className={cn("inline-flex items-center gap-0.5", channelView === "dm" && "opacity-40")}><Mail className="size-3 text-sky-400" /> {email?.readyToSend ?? 0}/{email?.budget ?? 0}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <div className="flex justify-center">
            <ChannelToggle value={channelView} onChange={onChannel} />
          </div>
          <div className={cn("grid gap-3", channelView === "both" && "md:grid-cols-2")}>
            {shown.map((c) => <ChannelColumn key={c.channel} col={c} date={day.date} sender={day.sender as "lee" | "king"} owner={owner} onChange={onChange} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelToggle({ value, onChange }: { value: "dm" | "email" | "both"; onChange: (v: "dm" | "email" | "both") => void }) {
  const opt = (v: "dm" | "email" | "both", label: ReactNode) => (
    <button onClick={() => onChange(v)} className={cn("inline-flex items-center gap-1 px-2.5 py-0.5", value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{label}</button>
  );
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border text-[10px] font-medium">
      {opt("dm", <><Instagram className="size-3" /> Instagram</>)}
      {opt("email", <><Mail className="size-3" /> Email</>)}
      {opt("both", "Both")}
    </div>
  );
}

function ChannelColumn({ col, date, sender, owner, onChange }: { col: SchedColumn; date: string; sender: "lee" | "king"; owner: Owner; onChange: () => void }) {
  const isDm = col.channel === "dm";
  const assigned = col.readyToSend + col.gaps; // slots that map to an org (filled or gap)
  const unassigned = Math.max(0, col.budget - assigned); // budget with no org left this week
  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-border bg-card px-2.5 py-1.5">
        {isDm ? <Instagram className="size-3.5 text-pink-400" /> : <Mail className="size-3.5 text-sky-400" />}
        <span className="text-[11px] font-bold uppercase tracking-wide">{isDm ? "Instagram" : "Email"}</span>
        <span className="text-[10px] text-muted-foreground"><strong className={col.readyToSend > 0 ? "text-foreground" : ""}>{col.readyToSend}</strong> of {col.budget} ready to send</span>
        {col.gaps > 0 && <span className="text-[10px] text-amber-500">· {col.gaps} need a contact</span>}
        {unassigned > 0 && <span title={`Only ${assigned} target${assigned === 1 ? "" : "s"} scheduled — ${unassigned} of the ${col.budget}-slot budget has no organization left to assign this week.`} className="text-[10px] text-muted-foreground/70">· {unassigned} slot{unassigned === 1 ? "" : "s"} unassigned</span>}
        <span className="ml-auto"><Tip which={col.channel} /></span>
      </div>
      <div className="divide-y divide-border/40">
        {col.sections.map((s) => <SectionBlock key={s.section} sec={s} date={date} sender={sender} owner={owner} onChange={onChange} />)}
        {!col.sections.length && <p className="p-2 text-[10px] text-muted-foreground">Nothing on this channel today.</p>}
      </div>
      {!isDm && col.sections.length > 0 && <EmailDayTools owner={owner} date={date} />}
    </div>
  );
}

function SectionBlock({ sec, date, sender, owner, onChange }: { sec: SchedSectionCol; date: string; sender: "lee" | "king"; owner: Owner; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left">
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{sec.label}</span>
        {sec.section === "rep" && <Tip which="rep" />}
        <span className="ml-auto text-[10px] text-muted-foreground">{sec.campuses.length} campus{sec.campuses.length === 1 ? "" : "es"}</span>
      </button>
      {open && <div className="space-y-1 px-1.5 pb-1.5">{sec.campuses.map((c) => <CampusBlock key={c.campusId} campus={c} date={date} sender={sender} onChange={onChange} />)}</div>}
    </div>
  );
}

function Bolt({ color, ready }: { color: string | null; ready: boolean }) {
  return <Zap className={cn("size-3.5 shrink-0", ready && "animate-pulse")} style={{ color: color ?? undefined, fill: ready && color ? color : "transparent" }} />;
}

function CampusBlock({ campus, date, sender, onChange }: { campus: SchedCampusCol; date: string; sender: "lee" | "king"; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const state = !campus.dataReady ? "data" : campus.contactReady ? "ready" : "notready";
  return (
    <div className="overflow-hidden rounded border border-border/50 bg-background/40">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left">
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Bolt color={campus.colorPrimary} ready={state === "ready"} />
        <span className="min-w-0 truncate text-[12px] font-semibold text-foreground">{campus.name}</span>
        {state === "ready" && <Check className="size-4 shrink-0 text-emerald-400" />}
        {state === "notready" && <X className="size-4 shrink-0 text-red-400" />}
        {state === "data" && <AlertTriangle className="size-3.5 shrink-0 text-amber-400" />}
        <span title={state === "ready" ? `${campus.contactCount} contacts on file` : `${campus.coveredCount} of ${campus.neededCount} needed organizations have a contact`} className="ml-auto shrink-0 text-[10px] text-muted-foreground">{state === "ready" ? `${campus.contactCount} contacts` : `${campus.coveredCount} of ${campus.neededCount} contacts`}</span>
      </button>
      {open && (
        <div className="space-y-1 px-2 pb-2">
          {state === "data" && <DataChecks checks={campus.dataChecks} />}
          {campus.contacts.map((c, i) => <ContactLine key={`${c.orgKey}-${i}`} c={c} campus={campus} date={date} sender={sender} onChange={onChange} />)}
        </div>
      )}
    </div>
  );
}

function DataChecks({ checks }: { checks: { courseCode: boolean; chaptersSeeded: boolean; colors: boolean } }) {
  const row = (ok: boolean, label: string) => <span className={cn("inline-flex items-center gap-1", ok ? "text-emerald-400" : "text-red-400")}>{ok ? <Check className="size-3" /> : <X className="size-3" />}{label}</span>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 rounded border border-amber-500/30 bg-amber-500/[0.05] p-1.5 text-[9px]">
      <span className="font-semibold uppercase text-amber-400">Missing data</span>
      {row(checks.courseCode, "Course code")}{row(checks.chaptersSeeded, "Chapters seeded")}{row(checks.colors, "School colors")}
    </div>
  );
}

function ContactLine({ c, campus, date, sender, onChange }: { c: SchedContactView; campus: SchedCampusCol; date: string; sender: "lee" | "king"; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  if (c.gap) return <GapLine c={c} campus={campus} onChange={onChange} />;
  const btn = "inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] hover:bg-muted";
  return (
    <div className="rounded border border-border/50 bg-card p-1.5 text-[11px]">
      <div className="flex items-start gap-1.5">
        {c.isPerson ? <User className="size-4 shrink-0 text-primary" /> : <Building2 className="size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 font-semibold text-foreground">
            <span className="truncate">{c.orgLabel}</span>
            {c.kind === "follow_up" && <span className="rounded-full bg-sky-500/15 px-1 py-px text-[8px] font-semibold uppercase text-sky-400">follow-up</span>}
          </div>
          {c.isPerson && (c.name || c.role) && <div className="text-[10px] text-foreground/80">{[c.name, c.role].filter(Boolean).join(" · ")}</div>}
          <div className="mt-0.5">
            {c.channel === "dm"
              ? <a href={`https://instagram.com/${igName(c.handle ?? "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-pink-400 hover:underline">@{igName(c.handle ?? "")}<ExternalLink className="size-2.5" /></a>
              : <a href={`mailto:${c.handle ?? ""}`} className="inline-flex items-center gap-0.5 text-sky-400 hover:underline">{c.handle}<ExternalLink className="size-2.5" /></a>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1">
          {/* Copy is clipboard-only — marking sent is the checkbox below, never a side effect of Copy. */}
          {c.channel === "dm" ? (<>
            <button onClick={() => copyText(c.messages.dm ?? "", "DM copied.")} className={btn}><Copy className="size-3" /> Copy DM</button>
            <button onClick={() => copyText(c.messages.story ?? "", "Story reply copied.")} title="Reply to an active Story instead of a cold DM" className={btn}><MessageSquare className="size-3" /> Story reply</button>
          </>) : (
            <button onClick={() => copyText(c.messages.email ?? "", "Email copied.")} className={btn}><Copy className="size-3" /> Copy email</button>
          )}
        </div>
      </div>
      <SentReplied c={c} campus={campus} date={date} sender={sender} onChange={onChange} />
      {/* Every org gets +Add — a council legitimately has four or five contacts (item 4). */}
      <div className="mt-1 border-t border-border/40 pt-1">
        {adding
          ? <ContactAddForm campusId={campus.campusId} orgKey={c.orgKey} orgLabel={c.orgLabel} onSaved={() => { setAdding(false); onChange(); }} onCancel={() => setAdding(false)} />
          : <button onClick={() => setAdding(true)} className="inline-flex items-center gap-0.5 text-[9px] text-primary hover:underline"><Plus className="size-2.5" /> add another contact</button>}
      </div>
    </div>
  );
}

// Sent / replied for one row, from the real touch log. Sent writes/clears a touch (which drives
// cooldown and the week's counts); replied toggles replied_at on it. After the Sept 13 handoff,
// email is Instantly's job — those rows drop the checkboxes and show its status instead.
function SentReplied({ c, campus, date, sender, onChange }: { c: SchedContactView; campus: SchedCampusCol; date: string; sender: "lee" | "king"; onChange: () => void }) {
  const instantlyEmail = c.channel === "email" && date >= HANDOFF_DATE;
  const markSent = useMutation({
    mutationFn: (on: boolean) => on
      ? growthMarkTouch({ data: { campusId: campus.campusId, orgKey: c.orgKey, contactId: c.contactId, channel: c.channel, kind: c.kind, scheduledDate: date, sender } })
      : growthDeleteTouch({ data: { touchId: c.touchId! } }),
    onSuccess: () => onChange(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update"),
  });
  const markReplied = useMutation({
    mutationFn: (on: boolean) => growthMarkReplied({ data: { touchId: c.touchId!, replied: on } }),
    onSuccess: () => onChange(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update"),
  });
  if (instantlyEmail) {
    return <div className="mt-1 border-t border-border/40 pt-1 text-[9px] italic text-muted-foreground">Sending handled by Instantly — status syncs here.</div>;
  }
  const busy = markSent.isPending || markReplied.isPending;
  return (
    <div className="mt-1 flex items-center gap-3 border-t border-border/40 pt-1 text-[9px] text-muted-foreground">
      <label className="inline-flex items-center gap-1" title="Mark this contact sent — records the touch and starts the org's cooldown">
        <input type="checkbox" disabled={busy || (c.sent && !c.touchId)} checked={c.sent} onChange={(e) => markSent.mutate(e.target.checked)} /> sent
      </label>
      <label className={cn("inline-flex items-center gap-1", !c.sent && "opacity-40")} title={c.sent ? "They replied" : "Mark sent first"}>
        <input type="checkbox" disabled={busy || !c.sent || !c.touchId} checked={c.replied} onChange={(e) => markReplied.mutate(e.target.checked)} /> replied
      </label>
    </div>
  );
}

function GapLine({ c, campus, onChange }: { c: SchedContactView; campus: SchedCampusCol; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const q = `"${campus.name}" "${c.orgLabel}" ${c.channel === "dm" ? "instagram" : "email"}`;
  return (
    <div className="rounded border border-dashed border-amber-500/30 bg-amber-500/[0.03] p-1.5 text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className="text-amber-400">◇</span>
        <span className="min-w-0 flex-1 truncate font-medium">{c.orgLabel}<span className="ml-1 text-[9px] italic text-muted-foreground">no contact yet</span></span>
        <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-0.5 text-primary hover:underline"><Plus className="size-3" /> Add contact</button>
        <button onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground">Find contact<ExternalLink className="size-2.5" /></button>
      </div>
      {adding && <ContactAddForm campusId={campus.campusId} orgKey={c.orgKey} orgLabel={c.orgLabel} onSaved={() => { setAdding(false); onChange(); }} onCancel={() => setAdding(false)} />}
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
          <a href={`https://instagram.com/${igName(t.handle)}`} target="_blank" rel="noreferrer" className="text-pink-400 hover:underline">@{igName(t.handle)}</a>
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
