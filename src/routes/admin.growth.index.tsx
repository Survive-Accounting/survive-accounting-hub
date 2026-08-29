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
import { ArrowRight, ChevronDown, Loader2, Pin, RotateCw, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  growthCampusList,
  growthRefreshPriority,
  type GrowthCampusRow,
} from "@/lib/growth-dashboard.functions";
import { growthTasks, type GrowthTasks } from "@/lib/growth-queue.functions";
import { getAdminWho } from "@/components/AdminGate";
import { CampusPanel, type Section } from "@/components/growth/CampusPanel";
import { BottomSheet } from "@/components/growth/BottomSheet";
import { GrowthAnnouncement } from "@/components/growth/GrowthAnnouncement";
import { Chip, Hint, MiniBolt, useDebounced } from "@/components/growth/v2";
import { HINTS } from "@/components/growth/hints";
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
   can never drift. WHY gets a hard-capped column; numerics are fixed-width and
   right-aligned. Small screens drop WHY/PAID/GAPS (hidden cells, same template). */
const GRID =
  "grid grid-cols-[1.75rem_1.5rem_minmax(0,1fr)_3rem_3.5rem_4rem] " +
  "md:grid-cols-[1.75rem_1.5rem_minmax(0,1fr)_13rem_3rem_3.5rem_2.5rem_4rem_2.75rem] " +
  "items-center gap-x-2";

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

  const openCampus = (campusId: string, section?: Section, gapMode = false) => {
    setOpenSection(section);
    setOpenGapMode(gapMode);
    setOpenId(campusId);
  };

  const rows = list.data?.rows ?? [];
  const filtered = useMemo(() => {
    const needle = dq.trim().toLowerCase();
    return rows.filter((r) => {
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
  }, [rows, dq, basket]);
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

      {list.isLoading && (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading campuses…
        </div>
      )}

      {!list.isLoading && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {/* column headings — same grid as the rows, so alignment cannot drift */}
          <div
            className={cn(
              GRID,
              "border-b border-border bg-muted/40 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground",
            )}
          >
            <span>
              <Hint text={HINTS.rank}>#</Hint>
            </span>
            <span />
            <span>Campus / course</span>
            <span className="hidden md:block">Why</span>
            <span className="text-right">
              <Hint text={HINTS.courseReadiness}>Ready</Hint>
            </span>
            <span className="text-right">
              <Hint text={HINTS.questionsAnswered}>Students</Hint>
            </span>
            <span className="hidden text-right md:block">
              <Hint text={HINTS.paid}>Paid</Hint>
            </span>
            <span className="text-right">
              <Hint text="Emails actually sent / contacts we could email at this campus.">
                Outreach
              </Hint>
            </span>
            <span className="hidden text-right md:block">
              <Hint text="Contacts here that are Instagram-only — no email yet. Filling these is the gap work.">
                Gaps
              </Hint>
            </span>
          </div>

          {filtered.slice(0, limit).map((r) => (
            <button
              key={r.campusId}
              onClick={() => openCampus(r.campusId)}
              className={cn(
                GRID,
                "w-full border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-muted/60",
              )}
            >
              <CampusRowCells r={r} />
            </button>
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

function CampusRowCells({ r }: { r: GrowthCampusRow }) {
  return (
    <>
      <span className="text-xs tabular-nums text-muted-foreground">
        <span className="inline-flex items-center gap-0.5">
          {r.pinned && <Pin className="size-2.5 text-primary" />}
          {r.rank}
        </span>
      </span>
      <MiniBolt primary={r.colorPrimary} secondary={r.colorSecondary} size={20} title={r.name} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{r.name}</span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {[r.courseCode, r.state].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="hidden min-w-0 md:block">
        <span className="flex max-w-full flex-wrap gap-1 overflow-hidden">
          {r.why.map((w) => (
            <Hint key={w} text={HINTS.why[w] ?? "Why this campus ranks here."}>
              <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                {w}
              </span>
            </Hint>
          ))}
        </span>
      </span>
      <span className="text-right text-xs tabular-nums">
        <span
          className={cn(
            r.readiness >= 60
              ? "text-emerald-400"
              : r.readiness >= 30
                ? "text-amber-400"
                : "text-muted-foreground",
          )}
        >
          {Math.round(r.readiness)}%
        </span>
      </span>
      <span className="text-right text-xs tabular-nums">
        {r.users > 0 ? (
          <Hint text="Students we can name at this campus.">
            <span>{r.users}</span>
          </Hint>
        ) : r.attempts > 0 ? (
          <Hint
            text={`${r.attempts} practice questions answered, but nobody signed in — we don't know who they are yet.`}
          >
            <span className="text-muted-foreground">{r.attempts} Q</span>
          </Hint>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      <span className="hidden text-right text-xs tabular-nums md:block">
        {r.paid > 0 ? (
          <span className="text-emerald-400">{r.paid}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      <span className="text-right text-xs tabular-nums">
        {r.outreachEligible > 0 ? (
          <Hint
            text={`${r.outreachSent} emails sent · ${r.outreachEligible} contacts available here.`}
          >
            <span className={cn(r.outreachSent > 0 ? "" : "text-muted-foreground")}>
              {r.outreachSent} / {r.outreachEligible}
            </span>
          </Hint>
        ) : (
          <Hint text="No usable contacts on file yet. Open the campus and run ✨ Enrichment, or add one by hand.">
            <span className="text-muted-foreground">—</span>
          </Hint>
        )}
      </span>
      <span className="hidden text-right text-xs tabular-nums md:block">
        {r.contactGaps > 0 ? (
          <Hint
            text={`${r.contactGaps} contact${r.contactGaps === 1 ? "" : "s"} here have Instagram but no email — fill them in the campus's gap mode.`}
          >
            <span className="text-amber-400">{r.contactGaps}</span>
          </Hint>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
    </>
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
