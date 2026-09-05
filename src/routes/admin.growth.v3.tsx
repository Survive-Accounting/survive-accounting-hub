// /admin/growth/v3 — KING'S PLAYGROUND (Lee, 2026-09-05: "any changes he pushes can go to a
// route /growth/v3? So he can stay in /v2 without fear of breaking it. /v3 is his playground").
//
// A self-contained copy of admin.growth.v2.tsx as of 2026-09-05. King's fast-track builds edit
// THIS file (and new files under src/components/growth/v3/), never v2 or the shared growth
// pieces — see playgroundRules in src/lib/fast-track.ts. When something here is proven, Lee
// ports it to v2 by hand. Do not "sync" the two files; they are meant to drift.
//
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, ChevronRight, Radar, Plus, Minus } from "lucide-react";

import { growthBoard, type BoardCampus, type BoardOwner } from "@/lib/growth-tranche.functions";
import { growthV2Metrics, type V2Metrics } from "@/lib/growth-v2-metrics.functions";
import { growthIgCampus } from "@/lib/growth-ig-dm.functions";
import { ContactRow } from "@/components/growth/DmBoard";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { Metric, MiniBolt, Accordion, useAdminDarkDocument } from "@/components/growth/v2";
import { FindContactsPanel } from "@/components/growth/FindContactsPanel";
import { BottomSheet } from "@/components/growth/BottomSheet";
import { renderQueryState } from "@/components/growth/QueryState";
import { schoolByCampusId, boltForSlug } from "@/lib/schools";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/v3")({ component: GrowthV3Page });

const GREY = { c1: "#6b7280", c2: "#4b5563" };
const OWNERS: { id: BoardOwner; label: string }[] = [{ id: "lee", label: "Lee" }, { id: "king", label: "King" }];

// Lee's in Bucerias, Mexico; King's in the Philippines — a quick "what time is it for them" readout
// in the navbar's top-right corner. Ticks once a minute; nothing else depends on it.
function DualClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const fmt = (timeZone: string) => new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(now);
  return (
    <div className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground md:flex">
      <span>Bucerias, Mexico {fmt("America/Bahia_Banderas")}</span>
      <span className="text-muted-foreground/40">|</span>
      <span>Philippines {fmt("Asia/Manila")}</span>
    </div>
  );
}

// Same queue order as coldoutreach: Ole Miss → LSU → Florida by size → rest; King straight by size.
function queueSort(campuses: BoardCampus[], owner: BoardOwner): BoardCampus[] {
  const rank = (c: BoardCampus): [number, number] => {
    const n = c.name.toLowerCase();
    if (owner === "lee") {
      if (n.includes("university of mississippi") || n.includes("ole miss")) return [0, 0];
      if (n.includes("louisiana state")) return [1, 0];
      if ((c.state ?? "") === "FL") return [2, -(c.seats ?? 0)];
      return [3, -(c.seats ?? 0)];
    }
    return [0, -(c.seats ?? 0)];
  };
  return campuses.slice().sort((a, b) => { const [ap, as] = rank(a), [bp, bs] = rank(b); return ap - bp || as - bs || a.name.localeCompare(b.name); });
}

function GrowthV3Page() {
  useAdminDarkDocument();
  const [owner, setOwner] = useState<BoardOwner>("lee");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scrape, setScrape] = useState<BoardCampus | null>(null);

  const board = useQuery({ queryKey: ["v2-board", owner], queryFn: () => growthBoard({ data: { owner } }) });
  const metrics = useQuery({ queryKey: ["v2-metrics"], queryFn: () => growthV2Metrics() });
  const metricsBy = useMemo(() => new Map((metrics.data ?? []).map((m) => [m.campusId, m])), [metrics.data]);

  const campuses = useMemo(() => {
    const all = queueSort((board.data?.tranches ?? []).flatMap((t) => t.campuses), owner);
    const q = search.trim().toLowerCase();
    return q ? all.filter((c) => c.name.toLowerCase().includes(q) || (c.state ?? "").toLowerCase().includes(q)) : all;
  }, [board.data, owner, search]);

  return (
    <div className="mx-auto max-w-3xl">
      {/* THE PLAYGROUND BANNER — so nobody mistakes this for the real board. */}
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-dashed border-amber-400/50 bg-amber-400/10 px-3 py-1.5 text-[11.5px] text-amber-200">
        <span className="font-semibold">v3 · King's playground</span>
        <span className="text-amber-200/80">— fast-track changes land here first; /admin/growth/v2 stays as it is.</span>
      </div>
      <div className="sticky top-0 z-20 mb-2 flex items-center gap-3 bg-background/90 py-2 backdrop-blur">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a campus…" className="w-full bg-transparent text-[13px] focus:outline-none" />
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
          {OWNERS.map((o) => (
            <button key={o.id} onClick={() => { setOwner(o.id); setExpanded(null); }} className={cn("px-4 py-2 font-medium", owner === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{o.label}</button>
          ))}
        </div>
        <DualClock />
      </div>

      {renderQueryState(board)}

      <div>
        {campuses.map((c) => (
          <CampusCard key={c.campusId} campus={c} metrics={metricsBy.get(c.campusId) ?? null}
            open={expanded === c.campusId} onToggle={() => setExpanded((v) => (v === c.campusId ? null : c.campusId))}
            onScrape={() => setScrape(c)} onChanged={() => { board.refetch(); metrics.refetch(); }} />
        ))}
        {!board.isLoading && campuses.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">No campuses{search ? " match that search" : ""}.</div>}
      </div>

      {scrape && (
        <BottomSheet open onClose={() => setScrape(null)} title={<span className="sa-admin-display text-sm font-semibold">Scrape contacts · {scrape.name}</span>}>
          <div className="pb-24">
            <FindContactsPanel campusId={scrape.campusId} campusName={scrape.name} autoStart onImported={() => { board.refetch(); metrics.refetch(); setScrape(null); }} />
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function coreMetrics(m: V2Metrics | null) {
  return [
    { label: "DMs sent", value: m?.dmsSent ?? 0 },
    { label: "Link clicks", value: m?.linkClicks ?? 0, tone: "good" as const },
    { label: "Free", value: m?.freeStudents ?? 0, tone: "good" as const },
    { label: "Paid", value: m?.paidStudents ?? 0, tone: "good" as const },
  ];
}

function CampusCard({ campus, metrics, open, onToggle, onScrape, onChanged }: {
  campus: BoardCampus; metrics: V2Metrics | null; open: boolean; onToggle: () => void; onScrape: () => void; onChanged: () => void;
}) {
  const [viewMore, setViewMore] = useState(false);
  const school = schoolByCampusId(campus.campusId);
  const ready = campus.igContacts > 0;
  const bolt = ready ? boltForSlug(school?.slug ?? "") : GREY;
  const sub = [campus.state, school?.courseCode, campus.seats ? `~${campus.seats.toLocaleString()} students` : null].filter(Boolean).join(" · ");

  return (
    <div className={cn("border-b border-border", open && "bg-card/40")}>
      <div className="flex items-center gap-3 px-1 py-4">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {open ? <BoltBoil height={40} red={bolt.c1} blue={bolt.c2} /> : <MiniBolt primary={bolt.c1} secondary={bolt.c2} size={30} title={campus.name} />}
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{campus.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{sub}{!ready && <span className="text-muted-foreground/70"> · no contacts yet</span>}</span>
          </span>
        </button>
        {!open && (
          <div className="hidden gap-1.5 sm:flex">
            {coreMetrics(metrics).map((mm) => <Metric key={mm.label} label={mm.label} value={mm.value} tone={mm.tone} />)}
          </div>
        )}
        <button onClick={onScrape} title="Scrape / add contacts" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted"><Radar className="size-3.5" /> <span className="hidden sm:inline">Scrape</span></button>
        <button onClick={onToggle} className="shrink-0 text-muted-foreground">{open ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />}</button>
      </div>

      {open && (
        <div className="px-1 pb-5">
          <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {coreMetrics(metrics).map((mm) => <Metric key={mm.label} label={mm.label} value={mm.value} tone={mm.tone} />)}
          </div>
          <button onClick={() => setViewMore((v) => !v)} className="mb-3 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
            {viewMore ? <Minus className="size-3" /> : <Plus className="size-3" />} {viewMore ? "fewer metrics" : "view more"}
          </button>
          {viewMore && (
            <div className="mb-4 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Metric label="Reps hired" value={metrics?.repsHired ?? 0} />
              <Metric label="Emails sent" value={metrics?.emailsSent ?? 0} />
              <Metric label="Paid chapters" value={metrics?.paidChapters ?? 0} />
              <Metric label="Pageviews" value={null} hint="Coming soon — needs site analytics." />
              <Metric label="MCQs answered" value={null} hint="Coming soon." />
              <Metric label="Watch hours" value={null} hint="Coming soon." />
              <Metric label="Active chapters" value={null} hint="Coming soon — chapters with free students." />
            </div>
          )}

          {ready
            ? <CampusCouncils campusId={campus.campusId} onChanged={onChanged} />
            : <div className="rounded-lg border border-dashed border-border p-5 text-center text-[12px] text-muted-foreground">No contacts yet. Hit <span className="font-medium text-foreground">Scrape</span> to find the councils, review, and send them to the DM queue.</div>}
        </div>
      )}
    </div>
  );
}

// The councils, collapsed — open one at a time to DM its contacts.
function CampusCouncils({ campusId, onChanged }: { campusId: string; onChanged: () => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["ig-campus", campusId], queryFn: () => growthIgCampus({ data: { campusId } }) });
  const school = schoolByCampusId(campusId);
  const slug = school?.slug ?? q.data?.slug ?? "";
  const courseCode = school?.courseCode ?? q.data?.courseCode ?? null;

  if (q.isLoading) return <div className="py-4 text-center text-[12px] text-muted-foreground">Loading contacts…</div>;
  const councils = q.data?.councils ?? [];
  if (!councils.length) return <div className="py-4 text-center text-[12px] text-muted-foreground">No reachable handles yet.</div>;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {councils.map((council) => (
        <Accordion key={council.key} open={openKey === council.key} onToggle={() => setOpenKey((k) => (k === council.key ? null : council.key))}
          header={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="text-[12.5px] font-semibold">{council.label}</span>
              <span className="text-[10.5px] text-muted-foreground">sent {council.metrics.sent} · replied {council.metrics.replied} · 🔗 {council.metrics.clicks} · 🏛 {council.metrics.chapterOpens}</span>
            </span>
          }>
          <div className="divide-y divide-border/60">
            {council.contacts.map((ct) => (
              <ContactRow key={ct.contactId} contact={ct} councilKey={council.key} slug={slug} courseCode={courseCode} campusId={campusId} />
            ))}
          </div>
        </Accordion>
      ))}
    </div>
  );
}
