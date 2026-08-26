// /admin/growth — SURVIVE GROWTH: the shared campus operating dashboard.
//
// One ranked list. Click a campus and it opens IN PLACE beneath its row — the row you
// clicked doesn't move, and a chapter or professor opens nested inside that, so you can
// always see where you are. Everything else (what a number means, why a campus ranks where
// it does, what a badge is for) is a tooltip away, because King has to be able to read this
// screen without having sat through the research.
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Pin, RotateCw, Search } from "lucide-react";
import { toast } from "sonner";
import {
  growthCampusList,
  growthRefreshPriority,
  type GrowthCampusRow,
} from "@/lib/growth-dashboard.functions";
import { growthDailyProgress } from "@/lib/growth-queue.functions";
import { CampusPanel } from "@/components/growth/CampusPanel";
import { Accordion, Chip, Hint, MiniBolt, useDebounced } from "@/components/growth/v2";
import { BottomSheet, LayoutSwitch } from "@/components/growth/BottomSheet";
import { useLayoutMode } from "@/components/growth/layout-mode";
import { HINTS } from "@/components/growth/hints";
import { cn } from "@/lib/utils";

type Search = { open?: string; basket?: string; q?: string };

export const Route = createFileRoute("/admin/growth/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
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

function GrowthCampusesPage() {
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState(search.q ?? "");
  const dq = useDebounced(q, 200);
  const [basket, setBasket] = useState<string | null>(search.basket ?? null);
  const [openId, setOpenId] = useState<string | null>(search.open ?? null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [limit, setLimit] = useState(50);
  // TEMPORARY A/B — see layout-mode.ts. Remove with the switch once a style wins.
  const [layout, setLayout] = useLayoutMode();

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
  const daily = useQuery({
    queryKey: ["growth-daily"],
    queryFn: () => growthDailyProgress(),
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

  return (
    <div className="space-y-3">
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
        <div className="ml-auto flex items-center gap-3">
          {daily.data && (
            <Hint text={HINTS.emailsSentToday}>
              <span className="hidden text-[11px] text-muted-foreground md:inline">
                Today: {daily.data.email.done}/{daily.data.email.target} emails ·{" "}
                {daily.data.instagram.done}/{daily.data.instagram.target} DMs
              </span>
            </Hint>
          )}
          <LayoutSwitch mode={layout} onChange={setLayout} />
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

      {list.isLoading && (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading campuses…
        </div>
      )}

      {!list.isLoading && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {/* column headings — every one explains itself */}
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="w-4" />
            <span className="w-7">
              <Hint text={HINTS.rank}>#</Hint>
            </span>
            <span className="min-w-0 flex-1">Campus / course</span>
            <span className="hidden w-52 md:block">Why</span>
            <span className="w-12 text-right">
              <Hint text={HINTS.courseReadiness}>Ready</Hint>
            </span>
            <span className="w-16 text-right">
              <Hint text={HINTS.questionsAnswered}>Students</Hint>
            </span>
            <span className="hidden w-10 text-right sm:block">
              <Hint text={HINTS.paid}>Paid</Hint>
            </span>
            <span className="w-16 text-right">
              <Hint text="Emails actually sent / contacts we could email at this campus.">
                Outreach
              </Hint>
            </span>
          </div>

          {filtered.slice(0, limit).map((r) =>
            layout === "accordion" ? (
              <Accordion
                key={r.campusId}
                open={openId === r.campusId}
                onToggle={() => setOpenId((cur) => (cur === r.campusId ? null : r.campusId))}
                header={<CampusRowHeader r={r} />}
              >
                {openId === r.campusId && <CampusPanel campusId={r.campusId} pinned={r.pinned} />}
              </Accordion>
            ) : (
              <button
                key={r.campusId}
                onClick={() => setOpenId(r.campusId)}
                className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-muted/60"
              >
                <CampusRowHeader r={r} />
              </button>
            ),
          )}

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

      {layout === "sheet" && openId && (
        <BottomSheet
          open
          onClose={() => setOpenId(null)}
          title={
            <span className="sa-admin-display text-sm font-semibold">
              {rows.find((r) => r.campusId === openId)?.name ?? "Campus"}
            </span>
          }
        >
          <CampusPanel
            campusId={openId}
            pinned={!!rows.find((r) => r.campusId === openId)?.pinned}
          />
        </BottomSheet>
      )}
    </div>
  );
}

function CampusRowHeader({ r }: { r: GrowthCampusRow }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-xs tabular-nums text-muted-foreground">
        <span className="inline-flex items-center gap-0.5">
          {r.pinned && <Pin className="size-2.5 text-primary" />}
          {r.rank}
        </span>
      </span>
      <MiniBolt primary={r.colorPrimary} secondary={r.colorSecondary} size={20} title={r.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{r.name}</span>
        <span className="block text-[10px] text-muted-foreground">
          {[r.courseCode, r.state].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="hidden w-52 shrink-0 md:block">
        <span className="flex flex-wrap gap-1">
          {r.why.map((w) => (
            <Hint key={w} text={HINTS.why[w] ?? "Why this campus ranks here."}>
              <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                {w}
              </span>
            </Hint>
          ))}
        </span>
      </span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums">
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
      <span className="w-16 shrink-0 text-right text-xs tabular-nums">
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
      <span className="hidden w-10 shrink-0 text-right text-xs tabular-nums sm:block">
        {r.paid > 0 ? (
          <span className="text-emerald-400">{r.paid}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums">
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
    </span>
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
