// /admin/growth/coldoutreach/activity — the Cold Outreach Activity log. An accountability
// surface: a stats strip (this week / total, scopeable to one person) over a chronological feed.
// No charts, no scoring, no leaderboards — a record, not a game.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle } from "lucide-react";
import { growthColdActivity, type ActivityEvent, type ColdActivityView } from "@/lib/growth-cold-activity.functions";
import { ColdHeader } from "@/components/growth/ColdHeader";
import { renderQueryState } from "@/components/growth/QueryState";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/coldoutreach/activity")({ component: ActivityPage });

const DOW = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const dowOf = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const fmtDay = (d: string) => { const [, m, dd] = d.split("-").map(Number); return `${DOW[dowOf(d)]} · ${MON[m - 1]} ${dd}`; };
const fmtWeek = (d: string) => { const [, m, dd] = d.split("-").map(Number); return `WEEK OF ${MON[m - 1].toUpperCase()} ${dd}`; };
const fmtTime = (ts: string) => { try { return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
const weekStartSun = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay()); return dt.toISOString().slice(0, 10); };

const PEOPLE: { id: "all" | "lee" | "king" | "ej"; label: string }[] = [{ id: "all", label: "All" }, { id: "lee", label: "Lee" }, { id: "king", label: "King" }, { id: "ej", label: "EJ" }];
const WHENS: { id: "today" | "week" | "30" | "all"; label: string }[] = [{ id: "today", label: "Today" }, { id: "week", label: "This week" }, { id: "30", label: "Last 30 days" }, { id: "all", label: "All" }];
const TYPES: { id: "all" | "contacts" | "outreach" | "replies" | "warmup" | "feedback"; label: string }[] = [{ id: "all", label: "All" }, { id: "contacts", label: "Contacts" }, { id: "outreach", label: "Outreach" }, { id: "replies", label: "Replies" }, { id: "warmup", label: "Warm-up" }, { id: "feedback", label: "Feedback" }];

function ActivityPage() {
  const [person, setPerson] = useState<(typeof PEOPLE)[number]["id"]>("all");
  const [when, setWhen] = useState<(typeof WHENS)[number]["id"]>("week");
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>("all");
  const [campusId, setCampusId] = useState<string>("");
  const q = useQuery({ queryKey: ["cold-activity", person, when, type, campusId], queryFn: () => growthColdActivity({ data: { person, when, type, campusId: campusId || null } }) });

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <ColdHeader tab="activity" />

      {/* filters — apply to stats + feed together */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
        <Seg label="Person" value={person} opts={PEOPLE} onChange={setPerson} />
        <Seg label="When" value={when} opts={WHENS} onChange={setWhen} />
        <Seg label="Type" value={type} opts={TYPES} onChange={setType} />
        <label className="inline-flex items-center gap-1">
          <span className="text-muted-foreground">Campus</span>
          <select value={campusId} onChange={(e) => setCampusId(e.target.value)} className="rounded border border-border bg-card px-1.5 py-1 text-[11px]">
            <option value="">All</option>
            {(q.data?.campuses ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      {renderQueryState(q)}
      {q.data && <>
        <StatsStrip stats={q.data.stats} />
        <Feed view={q.data} />
      </>}
    </div>
  );
}

function Seg<T extends string>({ label, value, opts, onChange }: { label: string; value: T; opts: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="inline-flex overflow-hidden rounded-md border border-border">
        {opts.map((o) => (
          <button key={o.id} onClick={() => onChange(o.id)} className={cn("px-2 py-0.5 font-medium", value === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{o.label}</button>
        ))}
      </span>
    </span>
  );
}

function StatsStrip({ stats }: { stats: { key: string; label: string; tip: string; thisWeek: number; total: number }[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-border bg-card px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span />
        <span className="w-14 text-right">This week</span>
        <span className="w-14 text-right">Total</span>
      </div>
      <div className="divide-y divide-border/50">
        {stats.map((s) => (
          <div key={s.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-3 py-1.5 text-[12px]">
            <span className="inline-flex items-center gap-1" title={s.tip}>{s.label}<HelpCircle className="size-2.5 text-muted-foreground/60" /></span>
            <span className="w-14 text-right font-semibold tabular-nums">{s.thisWeek}</span>
            <span className="w-14 text-right tabular-nums text-muted-foreground">{s.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Feed({ view }: { view: ColdActivityView }) {
  const nav = useNavigate();
  if (!view.days.length) return <p className="rounded-lg border border-dashed border-border p-6 text-center text-[12px] text-muted-foreground">No activity in this window. It fills as contacts are added and messages go out.</p>;
  let lastWeek = "";
  return (
    <div className="space-y-3">
      {view.days.map((day) => {
        const ws = weekStartSun(day.date);
        const showWeek = ws !== lastWeek;
        lastWeek = ws;
        const wk = view.weeks[ws];
        return (
          <div key={day.date} className="space-y-1">
            {showWeek && wk && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md bg-muted/40 px-2.5 py-1.5 text-[10px]">
                <span className="font-bold uppercase tracking-wide">{fmtWeek(ws)}</span>
                {wk.rows.map((r) => (
                  <span key={r.actor} className="text-muted-foreground"><strong className="text-foreground">{r.label}:</strong> {r.contacts} contacts · {r.emails} emails · {r.dms} DMs</span>
                ))}
              </div>
            )}
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{fmtDay(day.date)}</div>
            <div className="space-y-0.5">
              {day.events.map((e) => <Row key={e.id} e={e} onOpen={() => nav({ to: "/admin/growth/coldoutreach" })} />)}
              {day.quiet.map((qa) => (
                <div key={qa.actor} className="flex items-center gap-2 px-1 py-1 text-[11px] text-muted-foreground/70">
                  <span className="w-16 shrink-0" />
                  <span className="w-12 shrink-0 font-medium">{qa.label}</span>
                  <span className="italic">no activity logged</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const OUTCOME_TONE: Record<string, string> = { interested: "text-emerald-400", referred: "text-emerald-400", not_now: "text-muted-foreground", wrong_person: "text-muted-foreground", no: "text-muted-foreground", hostile: "text-red-400" };
function Row({ e, onOpen }: { e: ActivityEvent; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-[11px] hover:bg-muted/50">
      <span className="w-16 shrink-0 text-right text-muted-foreground tabular-nums">{fmtTime(e.ts)}</span>
      <span className="w-12 shrink-0 font-medium">{e.actorLabel}</span>
      <span className="text-foreground">{e.verb}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {e.campusName}{e.org ? ` · ${e.org}` : ""}
        {e.type === "feedback" && e.detail
          ? <span className="ml-1 italic text-amber-300/90">{e.campusName ? " · " : ""}“{e.detail}”</span>
          : e.detail ? <span className={cn("ml-1", e.type === "reply_logged" ? OUTCOME_TONE[e.detail] ?? "text-muted-foreground" : "text-pink-400")}> · {e.type === "reply_logged" ? e.detail.replace(/_/g, " ") : e.detail}</span> : null}
      </span>
    </button>
  );
}
