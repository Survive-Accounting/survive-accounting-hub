// /admin/growth/dm — THE DM CONSOLE. King's whole job on one page.
//
// Three campuses we are on now, the Florida cluster greyed out behind them, and today's DM list at
// the top. Open a campus and the roster grid is there: every chapter, its account, its president,
// its scholarship chair — type them in or paste the sheet. The existing DM board is one click away
// and unchanged, so Copy DM, the sent tick, link clicks and the reply thread all still live there.
//
// WHY THIS EXISTS SEPARATELY FROM /admin/growth. The Growth dashboard answers "how is everything
// doing"; this answers "what do I send next". Consolidating meant leaving almost everything out:
// no tranches, no ladders, no professor intel, no charts. If a thing does not help King send the
// next DM, it is deliberately not on this page.
//
// TODAY'S LIST IS DERIVED, NEVER STORED. The old Upcoming Sends laid out a semester in advance and
// went stale the first week it slipped. This rebuilds every load out of what is unsent and what has
// gone quiet, so a missed day just means the work is still here tomorrow.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Instagram, Landmark, Link as LinkIcon, Loader2, MessageSquare, Square, Users } from "lucide-react";

import { BottomSheet } from "@/components/growth/BottomSheet";
import { ChapterRoster } from "@/components/growth/ChapterRoster";
import { DmBoard } from "@/components/growth/DmBoard";
import { MiniBolt } from "@/components/growth/v2";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { renderQueryState } from "@/components/growth/QueryState";
import { dmForPlanEntry } from "@/lib/outreach-dm";
import { growthIgMarkSent } from "@/lib/growth-ig-dm.functions";
import { dmConsoleBoard, dmConsolePlan, type ConsoleCampus, type PlanEntry } from "@/lib/king-dm.functions";
import { DEFAULT_DAILY_TARGET } from "@/lib/king-dm";
import { boltForSlug, schoolBySlug } from "@/lib/schools";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/dm")({
  head: () => ({ meta: [{ title: "DM console — Survive Growth" }, { name: "robots", content: "noindex" }] }),
  component: DmConsole,
});

const TARGET_KEY = "sa-dm-daily-target";

function DmConsole() {
  const [target, setTarget] = useState(DEFAULT_DAILY_TARGET);
  const [open, setOpen] = useState<ConsoleCampus | null>(null);
  const [board, setBoard] = useState<ConsoleCampus | null>(null);

  // The daily number is King's own pace, remembered on his machine — not a setting anyone else owns.
  useEffect(() => {
    try { const v = Number(localStorage.getItem(TARGET_KEY)); if (Number.isFinite(v) && v > 0) setTarget(v); } catch { /* private window */ }
  }, []);
  const changeTarget = (v: number) => {
    setTarget(v);
    try { localStorage.setItem(TARGET_KEY, String(v)); } catch { /* private window */ }
  };

  const boardQ = useQuery({ queryKey: ["dm-board"], queryFn: () => dmConsoleBoard() });
  const planQ = useQuery({ queryKey: ["dm-plan", target], queryFn: () => dmConsolePlan({ data: { dailyTarget: target } }) });

  const active = (boardQ.data?.campuses ?? []).filter((c) => c.stage === "active");
  const upcoming = (boardQ.data?.campuses ?? []).filter((c) => c.stage === "upcoming");

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-5 pb-24">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-2 pt-1">
        <div>
          <h1 className="sa-admin-display text-lg font-semibold uppercase tracking-wide">DM console</h1>
          <p className="text-[11.5px] text-muted-foreground">Today&apos;s list, then the campuses. Everything else lives in Growth.</p>
        </div>
        <label className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          DMs per day
          <input
            type="number" min={1} max={200} value={target}
            onChange={(e) => changeTarget(Math.max(1, Math.min(200, Number(e.target.value) || DEFAULT_DAILY_TARGET)))}
            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-[12px] tabular-nums text-foreground"
          />
        </label>
      </header>

      <TodayList q={planQ} target={target} />

      <section className="space-y-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Campuses</h2>
        {renderQueryState(boardQ, { label: "campuses" })}
        <div className="space-y-1.5">
          {active.map((c) => <CampusRow key={c.slug} c={c} onOpen={() => setOpen(c)} onBoard={() => setBoard(c)} />)}
        </div>

        {upcoming.length > 0 && (
          <>
            <h3 className="pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {upcoming[0].cluster ?? "Next"} · not started
            </h3>
            <div className="space-y-1.5">
              {upcoming.map((c) => <CampusRow key={c.slug} c={c} greyed onOpen={() => setOpen(c)} onBoard={() => setBoard(c)} />)}
            </div>
          </>
        )}
      </section>

      {open && open.campusId && (
        <BottomSheet
          open
          onClose={() => setOpen(null)}
          title={<span className="sa-admin-display text-sm font-semibold">{open.name} · roster</span>}
        >
          <div className="pb-24">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <BoltBoil height={44} red={open.colorPrimary || boltForSlug(open.slug).c1} blue={open.colorSecondary || boltForSlug(open.slug).c2} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{open.name}</div>
                {open.mascot && <div className="text-[10px] text-muted-foreground">{open.mascot}</div>}
              </div>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <Stat label="DMs sent" value={open.metrics.dmsSent} />
                <Stat label="Replied" value={open.metrics.replied} />
                <Stat label="Link clicks" value={open.metrics.clicks} accent />
                <Stat label="Chapter opens" value={open.metrics.chapterOpens} accent />
              </div>
            </div>
            <button
              onClick={() => setBoard(open)}
              className="mb-3 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted"
            >
              <MessageSquare className="size-3.5" /> Open DM board (send, thread, clicks)
            </button>
            <ChapterRoster campusId={open.campusId} campusName={open.name} />
          </div>
        </BottomSheet>
      )}

      {board && board.campusId && (
        <DmBoard campusId={board.campusId} campusName={board.name} onClose={() => setBoard(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg px-2.5 py-1", accent ? "bg-primary/10" : "bg-muted/40")}>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-[14px] font-semibold tabular-nums", accent && "text-primary")}>{value}</div>
    </div>
  );
}

/** One campus. Greyed rows are the cluster we have not started — still openable, so King can get a
 *  head start on handles, but visibly not the job today. */
function CampusRow({ c, greyed, onOpen, onBoard }: { c: ConsoleCampus; greyed?: boolean; onOpen: () => void; onBoard: () => void }) {
  const { c1, c2 } = boltForSlug(c.slug);
  const missing = !c.campusId;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border px-3 py-2", greyed && "opacity-55")}>
      <MiniBolt primary={c.colorPrimary || c1} secondary={c.colorSecondary || c2} size={22} title={c.name} />
      <button onClick={onOpen} disabled={missing} className="min-w-0 text-left disabled:cursor-not-allowed">
        <div className="truncate text-[13px] font-semibold hover:underline">{c.label}</div>
        <div className="text-[10px] text-muted-foreground">
          {missing ? "not in the campus table yet" : `${c.metrics.chaptersWithIg}/${c.metrics.chapters} chapters have a handle`}
        </div>
      </button>
      <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
        <span title="Contacts with a reachable handle"><Users className="mr-1 inline size-3" />{c.metrics.contacts}</span>
        <span title="DMs sent"><Instagram className="mr-1 inline size-3" />{c.metrics.dmsSent}</span>
        <span title="Replied"><MessageSquare className="mr-1 inline size-3" />{c.metrics.replied}</span>
        <span title="Link clicks"><LinkIcon className="mr-1 inline size-3" />{c.metrics.clicks}</span>
        <span title="Chapter opens"><Landmark className="mr-1 inline size-3" />{c.metrics.chapterOpens}</span>
      </div>
      <div className="flex gap-1.5">
        <button onClick={onOpen} disabled={missing} className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-40">Roster</button>
        <button onClick={onBoard} disabled={missing} className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-40">DM board</button>
      </div>
    </div>
  );
}

/** TODAY — the only list King has to work. Follow-ups first, then the biggest unsent chapters,
 *  interleaved so every live campus moves each day. */
function TodayList({ q, target }: { q: ReturnType<typeof useQuery<{ date: string; entries: PlanEntry[]; totals: { unsent: number; followUpsDue: number; sentToday: number } }>>; target: number }) {
  const plan = q.data;
  const done = plan?.totals.sentToday ?? 0;
  const pct = Math.min(100, Math.round((done / Math.max(1, target)) * 100));
  return (
    <section className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide">Today</h2>
        <span className="text-[11px] text-muted-foreground">
          {done} of {target} sent{plan ? ` · ${plan.totals.followUpsDue} follow-up${plan.totals.followUpsDue === 1 ? "" : "s"} due · ${plan.totals.unsent} never contacted` : ""}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {renderQueryState(q, { label: "today's list" })}
      {plan && plan.entries.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-[12px] text-muted-foreground">
          Nothing queued. Add handles on a campus roster below and today&apos;s list fills itself.
        </p>
      )}
      <div className="divide-y divide-border/60">
        {plan?.entries.map((e) => <PlanRow key={e.contactId} e={e} />)}
      </div>
    </section>
  );
}

function PlanRow({ e }: { e: PlanEntry }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const slug = schoolBySlug(e.campusSlug)?.slug ?? e.campusSlug;
  const courseCode = schoolBySlug(e.campusSlug)?.courseCode ?? null;

  const mark = useMutation({
    mutationFn: () => growthIgMarkSent({ data: { contactId: e.contactId, sent: true } }),
    onSuccess: () => {
      toast.success("Marked sent.");
      void qc.invalidateQueries({ queryKey: ["dm-plan"] });
      void qc.invalidateQueries({ queryKey: ["dm-board"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copy = async () => {
    // WHO THEY ARE decides the link and the ask (2026-09-11) — a Panhellenic chair no longer reads
    // "across your fraternities", and a chapter chair gets their chapter's page.
    const msg = dmForPlanEntry(e, { campusLabel: schoolBySlug(e.campusSlug)?.name ?? e.campusLabel, courseCode, slug });
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Clipboard blocked — open the profile and paste by hand."); }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
      <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide", e.reason === "follow_up" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
        {e.reason === "follow_up" ? `nudge · ${e.daysSince}d` : "new"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium">
          {/* Chapter or council when we know it; otherwise the person is the headline rather than a
              bare dash, which reads as missing data when it is just an unattached contact. */}
          {e.chapterName ?? (!e.isOrg && e.name ? e.name : "Contact")}
          {e.chapterName && !e.isOrg && e.name && <span className="font-normal text-muted-foreground"> · {e.name}</span>}
          {e.role && <span className="font-normal text-muted-foreground"> · {e.role}</span>}
        </div>
        <div className="text-[10.5px] text-muted-foreground">{e.campusLabel} · @{e.handle}</div>
      </div>
      <a href={`https://ig.me/m/${e.handle}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted" title="Opens the Instagram DM thread">
        <ExternalLink className="size-3.5" /> Open DM
      </a>
      <button onClick={() => void copy()} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted">
        {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />} Copy DM
      </button>
      <button onClick={() => mark.mutate()} disabled={mark.isPending} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-40">
        {mark.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />} Sent
      </button>
    </div>
  );
}
