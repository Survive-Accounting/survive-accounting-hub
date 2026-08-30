// /admin/growth — SURVIVE GROWTH: the shared campus operating dashboard.
//
// PRE-LAUNCH SIMPLIFICATION (2026-08-27, launch Sep 1). King lives here starting
// Monday, so the page shows him a JOB, not just data: the TASKS strip on top says
// what to do this morning (quota, next three campuses, contact gaps), the list below
// says where everything else stands, and a campus opens as a bottom sheet — the
// in-place/sheet A/B is over, sheet won, the toggle is gone.
//
// The table is a fixed GRID, not content-driven flex: WHY tags wrap inside their own
// column, numbers stay right-aligned in the same positions on every row, long campus
// names truncate instead of pushing the grid.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  ChevronDown,
  Loader2,
  Pin,
  Plus,
  RotateCw,
  Search,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
  growthCampusList,
  growthRefreshPriority,
  growthSetParked,
  type GrowthCampusRow,
} from "@/lib/growth-dashboard.functions";
import { growthTasks, type GrowthTasks } from "@/lib/growth-queue.functions";
import { getAdminWho } from "@/components/AdminGate";
import { CampusPanel, type Section } from "@/components/growth/CampusPanel";
import { BottomSheet } from "@/components/growth/BottomSheet";
import { GrowthAnnouncement } from "@/components/growth/GrowthAnnouncement";
import { Chip, Hint, MiniBolt, useDebounced } from "@/components/growth/v2";
import { HINTS } from "@/components/growth/hints";
import { renderQueryState } from "@/components/growth/QueryState";
import { cn } from "@/lib/utils";

type SearchParams = { open?: string; basket?: string; q?: string };

export const Route = createFileRoute("/admin/growth/")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    open: typeof s.open === "string" ? s.open : undefined,
    basket: typeof s.basket === "string" ? s.basket : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: GrowthCampusesPage,
});

const PRIMARY_BASKETS = [
  {
    key: "top_markets",
    label: "Top Markets",
    hint: "The biggest intro-accounting classes in the country, by business graduates.",
  },
  {
    key: "course_ready",
    label: "Course Ready",
    hint: "We know the course code, the professors and what's on Exam 1 — content work can start.",
  },
  {
    key: "greek_power",
    label: "Greek Powerhouses",
    hint: "Lots of usable ways in: council emails, chapter contacts, Instagram.",
  },
  {
    key: "needs_enrichment",
    label: "Needs Enrichment",
    hint: "Big market, but we barely know anything about the course. Best return on research.",
  },
  {
    key: "live_demand",
    label: "Live Demand",
    hint: "Real students from this campus have already used Survive.",
  },
] as const;

const MORE_BASKETS = [
  {
    key: "proven_paid",
    label: "Proven Paid",
    hint: "Someone already sells help for this exact course here.",
  },
  {
    key: "white_space",
    label: "White Space",
    hint: "No course-specific competitor yet — first-mover lane.",
  },
] as const;

/* THE grid. One template, used by the header row and every campus row, so columns
   can never drift. V2 columns: rank · bolt · campus · est-seats · practice-Qs · emails ·
   Greek sold · individual sold · action. Numerics are fixed-width and right-aligned.
   Small screens keep only seats + the action; Qs/emails/Greek/individual hide (same
   template, cells collapse). */
const GRID =
  "grid grid-cols-[1.75rem_1.5rem_minmax(0,1fr)_4.5rem_9.5rem] " +
  "md:grid-cols-[1.75rem_1.5rem_minmax(0,1fr)_5.5rem_3.5rem_3.5rem_3.5rem_3.5rem_9.5rem] " +
  "items-center gap-x-2.5";

function GrowthCampusesPage() {
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState(search.q ?? "");
  const dq = useDebounced(q, 200);
  const [basket, setBasket] = useState<string | null>(search.basket ?? null);
  const [openId, setOpenId] = useState<string | null>(search.open ?? null);
  // Where the sheet should land when opened from the TASKS strip.
  const [openSection, setOpenSection] = useState<Section | undefined>(undefined);
  const [openGapMode, setOpenGapMode] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [limit, setLimit] = useState(50);
  // V2: sort the list by priority (default) or by estimated market size.
  const [sort, setSort] = useState<"priority" | "seats">("priority");
  // V2 launch list: King's board defaults to the working set; parked/all on demand.
  const [listView, setListView] = useState<"launch" | "parked" | "all">("launch");

  // KING LANDS ON HQ. His home is the earnings page, not the work queue — once per
  // tab-session so the Campuses tab still functions afterwards.
  const navigate = useNavigate();
  useEffect(() => {
    if (getAdminWho() === "king" && !sessionStorage.getItem("sa-king-landed")) {
      sessionStorage.setItem("sa-king-landed", "1");
      navigate({ to: "/admin/growth/king" });
    }
  }, [navigate]);

  useEffect(() => setLimit(50), [dq, basket]);
  useEffect(() => {
    nav({
      search: { open: openId ?? undefined, basket: basket ?? undefined, q: dq || undefined },
      replace: true,
    });
  }, [openId, basket, dq, nav]);

  const list = useQuery({
    queryKey: ["growth-campus-list"],
    queryFn: () => growthCampusList(),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const tasks = useQuery({
    queryKey: ["growth-tasks"],
    queryFn: () => growthTasks(),
    staleTime: 60_000,
  });
  const refresh = useMutation({
    mutationFn: () => growthRefreshPriority(),
    onSuccess: (r) => {
      toast.success(`Re-ranked ${r.ranked} campuses`);
      qc.invalidateQueries({ queryKey: ["growth-campus-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Refresh failed"),
  });
  const park = useMutation({
    mutationFn: (v: { campusId: string; parked: boolean }) => growthSetParked({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.parked ? "Parked — off the launch list" : "Back on the launch list");
      qc.invalidateQueries({ queryKey: ["growth-campus-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update"),
  });

  const openCampus = (campusId: string, section?: Section, gapMode = false) => {
    setOpenSection(section);
    setOpenGapMode(gapMode);
    setOpenId(campusId);
  };

  const rows = list.data?.rows ?? [];
  const parkedCount = useMemo(() => rows.filter((r) => r.parked).length, [rows]);
  const filtered = useMemo(() => {
    const needle = dq.trim().toLowerCase();
    const out = rows.filter((r) => {
      // Launch-list view: King's board is the working set unless he asks for parked/all.
      if (listView === "launch" && r.parked) return false;
      if (listView === "parked" && !r.parked) return false;
      if (basket === "pinned") {
        if (!r.pinned) return false;
      } else if (basket && !r.baskets.includes(basket)) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        (r.state ?? "").toLowerCase().includes(needle) ||
        (r.courseCode ?? "").toLowerCase().includes(needle)
      );
    });
    if (sort === "seats") {
      // Biggest markets first; campuses with no estimate sink to the bottom.
      out.sort((a, b) => (b.estSeats ?? -1) - (a.estSeats ?? -1));
    }
    return out;
  }, [rows, dq, basket, listView, sort]);
  const anyPinned = rows.some((r) => r.pinned);
  const openRow = rows.find((r) => r.campusId === openId);

  return (
    <div className="space-y-3">
      {/* the week's focus, pinned up top */}
      <GrowthAnnouncement />

      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search campuses…"
            className="w-56 rounded-md border border-border bg-card py-1.5 pl-7 pr-2 text-xs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {anyPinned && (
            <Chipish
              active={basket === "pinned"}
              onClick={() => setBasket(basket === "pinned" ? null : "pinned")}
              hint={HINTS.pin}
            >
              <Pin className="size-3" /> Pinned
            </Chipish>
          )}
          {PRIMARY_BASKETS.map((b) => (
            <Chipish
              key={b.key}
              active={basket === b.key}
              onClick={() => setBasket(basket === b.key ? null : b.key)}
              hint={b.hint}
            >
              {b.label}
            </Chipish>
          ))}
          <div className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              More <ChevronDown className="size-3" />
            </button>
            {moreOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-md border border-border bg-popover p-1 shadow-lg">
                {MORE_BASKETS.map((b) => (
                  <Hint key={b.key} text={b.hint} side="right">
                    <button
                      onClick={() => {
                        setBasket(basket === b.key ? null : b.key);
                        setMoreOpen(false);
                      }}
                      className={cn(
                        "block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted",
                        basket === b.key && "bg-primary/10 text-primary",
                      )}
                    >
                      {b.label}
                    </button>
                  </Hint>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="ml-auto">
          <Hint
            text={`Recompute the priority order from current data. Version ${list.data?.version ?? "—"}, last run ${
              list.data?.generatedAt ? new Date(list.data.generatedAt).toLocaleString() : "—"
            }.`}
          >
            <button
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
            >
              {refresh.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RotateCw className="size-3" />
              )}{" "}
              Re-rank
            </button>
          </Hint>
        </div>
      </div>

      {/* TASKS — the first thing King reads every morning */}
      {tasks.data && <TasksStrip t={tasks.data} onOpen={openCampus} />}

      {/* launch-list view + sort — King works the launch set, sorts by size when pruning */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-border text-[11px]">
          <SegBtn active={listView === "launch"} onClick={() => setListView("launch")}>
            Launch list
          </SegBtn>
          <SegBtn active={listView === "parked"} onClick={() => setListView("parked")}>
            Parked{parkedCount > 0 ? ` (${parkedCount})` : ""}
          </SegBtn>
          <SegBtn active={listView === "all"} onClick={() => setListView("all")}>
            All
          </SegBtn>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Sort</span>
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            <SegBtn active={sort === "priority"} onClick={() => setSort("priority")}>
              Priority
            </SegBtn>
            <SegBtn active={sort === "seats"} onClick={() => setSort("seats")}>
              Est. seats
            </SegBtn>
          </div>
        </div>
      </div>

      {(list.isLoading || list.isError) && renderQueryState(list, { label: "campuses" })}

      {!list.isLoading && !list.isError && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {/* column headings — same grid as the rows, so alignment cannot drift */}
          <div
            className={cn(
              GRID,
              "border-b border-border bg-muted/40 px-3 py-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground",
            )}
          >
            <span>
              <Hint text={HINTS.rank}>#</Hint>
            </span>
            <span />
            <span>Campus / course</span>
            <button
              onClick={() => setSort(sort === "seats" ? "priority" : "seats")}
              className={cn(
                "flex items-center justify-end gap-1 text-right uppercase tracking-wider hover:text-foreground",
                sort === "seats" && "text-primary",
              )}
            >
              <Hint text="Estimated Intro-1 seats per academic year — the market size. Click to sort.">
                <span>Est. seats</span>
              </Hint>
              <ChevronDown className={cn("size-2.5", sort === "seats" ? "opacity-100" : "opacity-30")} />
            </button>
            <span className="hidden text-right md:block">
              <Hint text={HINTS.questionsAnswered}>Prac. Qs</Hint>
            </span>
            <span className="hidden text-right md:block">
              <Hint text="Emails actually sent from here (provider-confirmed).">Emails</Hint>
            </span>
            <span className="hidden text-right md:block">
              <Hint text="Seats a chapter bought in bulk at this campus.">Greek</Hint>
            </span>
            <span className="hidden text-right md:block">
              <Hint text="Individual exam purchases — one student, one exam.">Indiv.</Hint>
            </span>
            <span className="text-right">Contacts</span>
          </div>

          {filtered.slice(0, limit).map((r) => (
            <div
              key={r.campusId}
              onClick={() => openCampus(r.campusId)}
              className={cn(
                GRID,
                "w-full cursor-pointer border-b border-border/60 px-3 py-3.5 text-left last:border-b-0 hover:bg-muted/50",
                r.parked && "opacity-55",
              )}
            >
              <CampusRowCells
                r={r}
                onAdd={() => openCampus(r.campusId, "outreach")}
                onPark={() => park.mutate({ campusId: r.campusId, parked: !r.parked })}
                parkPending={park.isPending && park.variables?.campusId === r.campusId}
              />
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No campuses match.
            </div>
          )}
          {filtered.length > limit && (
            <button
              onClick={() => setLimit((l) => l + 100)}
              className="block w-full border-t border-border py-2 text-center text-xs text-muted-foreground hover:bg-muted"
            >
              Show more ({filtered.length - limit} remaining)
            </button>
          )}
        </div>
      )}

      {openId && (
        <BottomSheet
          open
          onClose={() => {
            setOpenId(null);
            setOpenSection(undefined);
            setOpenGapMode(false);
          }}
          title={
            <span className="sa-admin-display text-sm font-semibold">
              {openRow?.name ?? "Campus"}
            </span>
          }
        >
          <CampusPanel
            campusId={openId}
            pinned={!!openRow?.pinned}
            initialSection={openSection}
            outreachGapMode={openGapMode}
          />
        </BottomSheet>
      )}
    </div>
  );
}

/* ── TASKS strip ─────────────────────────────────────────────────────────────────── */

function TasksStrip({
  t,
  onOpen,
}: {
  t: GrowthTasks;
  onOpen: (campusId: string, section?: Section, gapMode?: boolean) => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-card p-3 md:grid-cols-[15rem_minmax(0,1fr)_auto]">
      {/* quota */}
      <div className="space-y-1.5">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Today's quota
        </div>
        <QuotaBar label="Emails" done={t.quota.emails} target={t.quota.emailTarget} />
        <QuotaBar label="DMs" done={t.quota.dms} target={t.quota.dmTarget} />
      </div>

      {/* next up */}
      <div>
        <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Next up
        </div>
        {t.nextUp.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Every campus with council contacts has been contacted — fill gaps or run enrichment to
            open new ones.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {t.nextUp.map((n) => (
              <Hint
                key={n.campusId}
                text={`#${n.rank} in priority · ${n.councilContacts} council contact${n.councilContacts === 1 ? "" : "s"} ready, none contacted yet. Opens straight into Outreach.`}
              >
                <button
                  onClick={() => onOpen(n.campusId, "outreach")}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:border-primary/60 hover:bg-muted"
                >
                  <span className="font-medium">{n.name}</span>
                  <span className="text-muted-foreground">{n.councilContacts} council</span>
                  <ArrowRight className="size-3 text-primary" />
                </button>
              </Hint>
            ))}
          </div>
        )}
      </div>

      {/* gaps */}
      <div className="md:text-right">
        <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Gaps
        </div>
        {t.gaps.total === 0 ? (
          <span className="text-[11px] text-muted-foreground">No email gaps. Clean board.</span>
        ) : (
          <Hint
            text={`${t.gaps.total} contacts across ${t.gaps.campuses} campuses have Instagram but no email. Opens the highest-priority one (${t.gaps.topCampusName ?? "—"}) in gap-filling mode.`}
          >
            <button
              onClick={() => t.gaps.topCampusId && onOpen(t.gaps.topCampusId, "outreach", true)}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 px-2 py-1 text-[11px] text-amber-400 hover:bg-amber-500/10"
            >
              <Wrench className="size-3" /> {t.gaps.total} missing emails
            </button>
          </Hint>
        )}
      </div>
    </div>
  );
}

function QuotaBar({ label, done, target }: { label: string; done: number; target: number }) {
  const pct = target > 0 ? Math.min(1, done / target) : 0;
  const met = done >= target && target > 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-11 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            met ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${Math.max(pct * 100, done > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span
        className={cn(
          "w-12 shrink-0 text-right text-[10px] tabular-nums",
          met ? "font-semibold text-emerald-400" : "text-muted-foreground",
        )}
      >
        {done} / {target}
      </span>
    </div>
  );
}

/* ── campus row (grid cells — MUST mirror the GRID template order) ───────────────── */

function CampusRowCells({
  r,
  onAdd,
  onPark,
  parkPending,
}: {
  r: GrowthCampusRow;
  onAdd: () => void;
  onPark: () => void;
  parkPending: boolean;
}) {
  return (
    <>
      {/* rank */}
      <span className="text-xs tabular-nums text-muted-foreground">
        <span className="inline-flex items-center gap-0.5">
          {r.pinned && <Pin className="size-2.5 text-primary" />}
          {r.rank}
        </span>
      </span>
      {/* bolt */}
      <MiniBolt primary={r.colorPrimary} secondary={r.colorSecondary} size={22} title={r.name} />
      {/* campus + course */}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{r.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[r.courseCode, r.state].filter(Boolean).join(" · ") || "—"}
        </span>
      </span>
      {/* est seats — the sort key, visible on every screen */}
      <span className="text-right text-[13px] font-medium tabular-nums">
        {r.estSeats != null ? (
          <Hint text={`~${r.estSeats.toLocaleString()} estimated Intro-1 seats per year.`}>
            <span>~{r.estSeats.toLocaleString()}</span>
          </Hint>
        ) : (
          <Hint text="No seat estimate on file for this campus yet.">
            <span className="text-muted-foreground">—</span>
          </Hint>
        )}
      </span>
      {/* practice Qs answered */}
      <span className="hidden text-right text-xs tabular-nums md:block">
        {r.attempts > 0 ? (
          <Hint text={`${r.attempts.toLocaleString()} practice questions answered here.`}>
            <span>{r.attempts.toLocaleString()}</span>
          </Hint>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      {/* emails sent */}
      <span className="hidden text-right text-xs tabular-nums md:block">
        {r.outreachSent > 0 ? (
          <Hint text={`${r.outreachSent} emails sent from this campus.`}>
            <span>{r.outreachSent}</span>
          </Hint>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      {/* Greek seats sold */}
      <span className="hidden text-right text-xs tabular-nums md:block">
        {r.soldGreek > 0 ? (
          <Hint text={`${r.soldGreek} seats bought by chapters here.`}>
            <span className="text-emerald-400">{r.soldGreek}</span>
          </Hint>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      {/* individual purchases */}
      <span className="hidden text-right text-xs tabular-nums md:block">
        {r.soldIndividual > 0 ? (
          <Hint text={`${r.soldIndividual} individual exam purchases here.`}>
            <span className="text-primary">{r.soldIndividual}</span>
          </Hint>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      {/* action — the main job */}
      <span className="flex items-center justify-end gap-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-3" /> Contacts
        </button>
        <Hint
          text={
            r.parked
              ? "Parked — click to put this campus back on the launch list."
              : "Park — take this campus off the launch list (no outreach for now)."
          }
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPark();
            }}
            disabled={parkPending}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
            aria-label={r.parked ? "Un-park campus" : "Park campus"}
          >
            {parkPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : r.parked ? (
              <RotateCw className="size-3" />
            ) : (
              <Archive className="size-3" />
            )}
          </button>
        </Hint>
      </span>
    </>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-[11px] transition-colors",
        active
          ? "bg-primary/15 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Chipish({
  active,
  onClick,
  hint,
  children,
}: {
  active: boolean;
  onClick: () => void;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Hint text={hint}>
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
          active
            ? "border-primary bg-primary/10 font-medium text-primary"
            : "border-border text-muted-foreground hover:bg-muted",
        )}
      >
        {children}
      </button>
    </Hint>
  );
}

export { Chip };
