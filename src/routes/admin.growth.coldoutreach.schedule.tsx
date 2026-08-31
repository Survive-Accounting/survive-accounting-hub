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
  growthScheduleWeek, growthPrewarmWeek, growthMarkTouch, growthPrewarm,
  growthScheduleCsv, growthInstantlyPush,
  type SchedDay, type SchedColumn, type SchedSectionCol, type SchedCampusCol, type SchedContactView, type Owner,
} from "@/lib/growth-schedule.functions";
import { growthSaveCampusContacts } from "@/lib/growth-tranche.functions";
import { addDays, dowOf, seasonWeeks, HANDOFF_DATE } from "@/lib/growth-schedule-core";
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
          {wk.data.days.map((d) => <DayCard key={d.date} day={d} owner={owner} onChange={() => wk.refetch()} />)}
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

function DayCard({ day, owner, onChange }: { day: SchedDay; owner: Owner; onChange: () => void }) {
  const t = todayYmd();
  const [open, setOpen] = useState(day.date <= t ? false : day.date === t); // keep collapsed; open deliberately
  const hasContent = day.columns.some((c) => c.sections.length > 0);
  if (!hasContent) return null; // founder-first: not this owner's window
  const status = day.date < t ? "past" : day.date === t ? "today" : "scheduled";
  const col = (ch: "dm" | "email") => day.columns.find((c) => c.channel === ch);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 bg-card px-3 py-2.5 text-left">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <span className="text-[13px] font-semibold uppercase tracking-wide">{fmtDay(day.date)}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{day.sender}</span>
        {status === "today" && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">Today</span>}
        <span className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5"><Instagram className="size-3 text-pink-400" /> {col("dm")?.readyToSend ?? 0}/{col("dm")?.budget ?? 0}</span>
          <span className="inline-flex items-center gap-0.5"><Mail className="size-3 text-sky-400" /> {col("email")?.readyToSend ?? 0}/{col("email")?.budget ?? 0}</span>
        </span>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-border p-3 md:grid-cols-2">
          {day.columns.map((c) => <ChannelColumn key={c.channel} col={c} date={day.date} sender={day.sender as "lee" | "king"} owner={owner} onChange={onChange} />)}
        </div>
      )}
    </div>
  );
}

function ChannelColumn({ col, date, sender, owner, onChange }: { col: SchedColumn; date: string; sender: "lee" | "king"; owner: Owner; onChange: () => void }) {
  const isDm = col.channel === "dm";
  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-card px-2.5 py-1.5">
        {isDm ? <Instagram className="size-3.5 text-pink-400" /> : <Mail className="size-3.5 text-sky-400" />}
        <span className="text-[11px] font-bold uppercase tracking-wide">{isDm ? "Instagram" : "Email"}</span>
        <span className="text-[10px] text-muted-foreground"><strong className={col.readyToSend > 0 ? "text-foreground" : ""}>{col.readyToSend}</strong> of {col.budget} ready to send</span>
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
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{state === "ready" ? `${campus.contactCount} contacts` : `${campus.coveredCount} of ${campus.neededCount}`}</span>
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
  if (c.gap) return <GapLine c={c} campus={campus} onChange={onChange} />;
  const mark = useMutation({
    mutationFn: (channel: "dm" | "story_reply" | "email") => growthMarkTouch({ data: { campusId: campus.campusId, orgKey: c.orgKey, contactId: c.contactId, channel, kind: c.kind, scheduledDate: date, sender } }),
    onSuccess: () => onChange(),
  });
  const copyAndSend = (channel: "dm" | "story_reply" | "email", text: string) => { copyText(text, "Copied — marked sent."); mark.mutate(channel); };
  const beforeHandoff = date < HANDOFF_DATE;
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
          {c.channel === "dm" ? (<>
            <button onClick={() => copyAndSend("dm", c.messages.dm ?? "")} className={btn}><Copy className="size-3" /> Copy DM</button>
            <button onClick={() => copyAndSend("story_reply", c.messages.story ?? "")} title="Reply to an active Story instead of a cold DM" className={btn}><MessageSquare className="size-3" /> Story reply</button>
          </>) : (
            <button onClick={() => copyAndSend("email", c.messages.email ?? "")} className={btn}><Copy className="size-3" /> Copy email</button>
          )}
        </div>
      </div>
      {beforeHandoff && <FollowupChecks storageKey={`co-fu:${date}:${campus.campusId}:${c.orgKey}:${c.channel}`} />}
    </div>
  );
}

// Manual-period follow-up tracking, localStorage only (removed after the Sept 13 handoff to Instantly).
function FollowupChecks({ storageKey }: { storageKey: string }) {
  const [st, setSt] = useState<{ followup?: boolean; replied?: boolean }>(() => { try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; } });
  const set = (patch: Partial<typeof st>) => { const next = { ...st, ...patch }; setSt(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ } };
  return (
    <div className="mt-1 flex items-center gap-3 border-t border-border/40 pt-1 text-[9px] text-muted-foreground">
      <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!st.followup} onChange={(e) => set({ followup: e.target.checked })} /> follow-up sent</label>
      <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!st.replied} onChange={(e) => set({ replied: e.target.checked })} /> replied</label>
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
      {adding && <GapAddForm orgKey={c.orgKey} campusId={campus.campusId} onSaved={() => { setAdding(false); onChange(); }} />}
    </div>
  );
}

function GapAddForm({ orgKey, campusId, onSaved }: { orgKey: string; campusId: string; onSaved: () => void }) {
  const [f, setF] = useState({ isPerson: false, name: "", role: "", email: "", instagram: "" });
  const [k, rest] = orgKey.split(":");
  const kind = (k === "council" ? "council" : k === "chapter" ? "chapter" : "club") as "council" | "chapter" | "club";
  const save = useMutation({
    mutationFn: () => growthSaveCampusContacts({ data: { campusId, contacts: [{
      kind, entityId: k === "council" ? null : rest, councilType: k === "council" ? rest : null,
      newClubName: null, newClubCategory: k === "club" ? "women_in_business" : null,
      isPerson: f.isPerson, notFound: false, isRoleAccount: false,
      name: f.name || null, role: f.role || null, email: f.email || null, instagram: f.instagram || null,
    }] } }),
    onSuccess: (r) => { if (r.saved > 0) { toast.success("Contact added."); onSaved(); } else toast.error(r.errors[0] ?? "Nothing saved — add an email or Instagram."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
  const canSave = !!(f.email.trim() || f.instagram.trim());
  return (
    <div className="mt-1.5 space-y-1.5 rounded border border-primary/30 bg-background p-2">
      <div className="inline-flex overflow-hidden rounded border border-border text-[10px]">
        <button onClick={() => setF({ ...f, isPerson: false })} className={cn("px-2 py-0.5", !f.isPerson ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Organization</button>
        <button onClick={() => setF({ ...f, isPerson: true })} className={cn("px-2 py-0.5", f.isPerson ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Person</button>
      </div>
      {f.isPerson && <div className="grid grid-cols-2 gap-1.5">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name" className="rounded border border-border bg-card px-2 py-1 text-[11px]" />
        <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Role" className="rounded border border-border bg-card px-2 py-1 text-[11px]" />
      </div>}
      <div className="grid grid-cols-2 gap-1.5">
        <input value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} placeholder="@instagram" className="rounded border border-pink-500/30 bg-card px-2 py-1 text-[11px]" />
        <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" className="rounded border border-border bg-card px-2 py-1 text-[11px]" />
      </div>
      <div className="flex justify-end">
        <button onClick={() => save.mutate()} disabled={!canSave || save.isPending} className="rounded bg-primary px-3 py-0.5 text-[10px] font-medium text-primary-foreground disabled:opacity-40">{save.isPending ? "…" : "Save contact"}</button>
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
