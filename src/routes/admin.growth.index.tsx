// /admin/growth — SURVIVE GROWTH V1: the shared campus operating dashboard.
// One ranked campus list (deterministic growth_priority_v1 under the hood),
// five basket chips + More, search, and a campus drawer that holds everything
// else (Overview / Outreach / Topic Map + nested professor & chapter drawers).
// "Don't Make Me Think": the intelligence stays under the hood, not on screen.
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Pin, RotateCw } from "lucide-react";
import { toast } from "sonner";
import {
  growthCampusList,
  growthRefreshPriority,
  type GrowthCampusRow,
} from "@/lib/growth-dashboard.functions";
import { growthDailyProgress } from "@/lib/growth-queue.functions";
import { SearchInput } from "@/components/growth/shared";
import { CampusDrawer } from "@/components/growth/CampusDrawer";
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

const PRIMARY_BASKETS: { key: string; label: string }[] = [
  { key: "top_markets", label: "Top Markets" },
  { key: "course_ready", label: "Course Ready" },
  { key: "greek_power", label: "Greek Powerhouses" },
  { key: "needs_enrichment", label: "Needs Enrichment" },
  { key: "live_demand", label: "Live Demand" },
];
const MORE_BASKETS: { key: string; label: string }[] = [
  { key: "proven_paid", label: "Proven Paid" },
  { key: "white_space", label: "White Space" },
];

function GrowthCampusesPage() {
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState(search.q ?? "");
  const [dq, setDq] = useState(search.q ?? "");
  const [basket, setBasket] = useState<string | null>(search.basket ?? null);
  const [openId, setOpenId] = useState<string | null>(search.open ?? null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [limit, setLimit] = useState(60);

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setLimit(60), [dq, basket]);
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
  const openRow = rows.find((r) => r.campusId === openId);
  const anyPinned = rows.some((r) => r.pinned);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search campuses…" />
        <div className="flex flex-wrap items-center gap-1.5">
          {anyPinned && (
            <Chip
              active={basket === "pinned"}
              onClick={() => setBasket(basket === "pinned" ? null : "pinned")}
              label="Pinned"
              icon={<Pin className="size-3" />}
            />
          )}
          {PRIMARY_BASKETS.map((b) => (
            <Chip
              key={b.key}
              active={basket === b.key}
              onClick={() => setBasket(basket === b.key ? null : b.key)}
              label={b.label}
            />
          ))}
          <div className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              More <ChevronDown className="size-3" />
            </button>
            {moreOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-md border border-border bg-background p-1 shadow-lg">
                {MORE_BASKETS.map((b) => (
                  <button
                    key={b.key}
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
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {daily.data &&
            (daily.data.email.done > 0 ||
              daily.data.instagram.done > 0 ||
              daily.data.followUpsDue > 0) && (
              <span className="hidden text-[11px] text-muted-foreground md:inline">
                Today: {daily.data.email.done}/{daily.data.email.target} emails ·{" "}
                {daily.data.instagram.done}/{daily.data.instagram.target} DMs
                {daily.data.followUpsDue > 0 && ` · ${daily.data.followUpsDue} follow-ups due`}
              </span>
            )}
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            title={`Ranking ${list.data?.version ?? ""} · computed ${list.data?.generatedAt ? new Date(list.data.generatedAt).toLocaleString() : "?"}`}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
          >
            {refresh.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RotateCw className="size-3" />
            )}{" "}
            Re-rank
          </button>
        </div>
      </div>

      {list.isLoading && (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading campuses…
        </div>
      )}

      {!list.isLoading && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Campus / Course</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Why</th>
                <th className="px-3 py-2 text-right font-medium">Ready</th>
                <th className="px-3 py-2 text-right font-medium">Users</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Outreach</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((r) => (
                <CampusRowView key={r.campusId} r={r} onOpen={() => setOpenId(r.campusId)} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">
                    No campuses match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
        <CampusDrawer
          campusId={openId}
          pinned={!!openRow?.pinned}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function CampusRowView({ r, onOpen }: { r: GrowthCampusRow; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t border-border/60 hover:bg-muted/50">
      <td className="px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {r.pinned && <Pin className="size-3 text-primary" />}
          {r.rank}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block size-3 shrink-0 rotate-12 rounded-[2px]"
            style={{
              background: `linear-gradient(135deg, ${r.colorPrimary ?? "#334155"} 50%, ${r.colorSecondary ?? "#facc15"} 50%)`,
            }}
          />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">{r.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {[r.courseCode, r.state].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      </td>
      <td className="hidden px-3 py-2 md:table-cell">
        <span className="text-[10px] text-muted-foreground">{r.why.join(" · ")}</span>
      </td>
      <td className="px-3 py-2 text-right text-xs tabular-nums">
        <span
          className={cn(
            r.readiness >= 60
              ? "text-emerald-600"
              : r.readiness >= 30
                ? "text-amber-600"
                : "text-muted-foreground",
          )}
        >
          {Math.round(r.readiness)}%
        </span>
      </td>
      <td className="px-3 py-2 text-right text-xs tabular-nums">
        {r.users > 0 ? r.users : r.attempts > 0 ? `~${r.attempts}q` : "—"}
      </td>
      <td className="hidden px-3 py-2 text-right text-xs tabular-nums sm:table-cell">
        {r.paid > 0 ? r.paid : "—"}
      </td>
      <td className="px-3 py-2 text-right text-xs tabular-nums">
        {r.outreachEligible > 0 ? `${r.outreachSent} / ${r.outreachEligible}` : "—"}
      </td>
    </tr>
  );
}
