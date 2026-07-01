// /outreach/orders — admin list of Cram Pack pre-orders. Renders inside the
// AdminGate-wrapped /outreach shell (auth + nav inherited). Filter + search, a
// compact table, and an in-page detail drawer on row click.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RotateCw } from "lucide-react";

import { listOrders, type AdminOrderRow } from "@/lib/orders-admin.functions";
import { OrderFilters, type OrderFiltersValue } from "@/components/outreach/orders/OrderFilters";
import { OrderDetailDrawer, StatusPill } from "@/components/outreach/orders/OrderDetailDrawer";

export const Route = createFileRoute("/outreach/orders")({
  head: () => ({ meta: [{ title: "Orders — Survive Accounting" }] }),
  component: OrdersAdmin,
});

const TIER_SHORT: Record<string, string> = { made_to_order: "Pre-order", one_on_one: "1-on-1", free_teaser: "Free teaser" };
const money = (c: number) => `$${Math.round((c ?? 0) / 100)}`;
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function OrdersAdmin() {
  const listFn = useServerFn(listOrders);
  const [filters, setFilters] = useState<OrderFiltersValue>({ status: "all", tier: "all", campusId: "", search: "" });
  const [limit, setLimit] = useState(50);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [debSearch, setDebSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebSearch(filters.search.trim()), 250);
    return () => clearTimeout(t);
  }, [filters.search]);

  const q = useQuery({
    queryKey: ["admin-orders", filters.status, filters.tier, filters.campusId, debSearch, limit],
    queryFn: () => listFn({
      data: {
        status: filters.status === "all" ? null : (filters.status as never),
        tier: filters.tier === "all" ? null : (filters.tier as never),
        campus_id: filters.campusId || null,
        search: debSearch || null,
        limit,
      },
    }),
  });

  const data = q.data;
  const rows: AdminOrderRow[] = data?.rows ?? [];
  const campuses = useMemo(() => data?.campuses ?? [], [data]);
  const canLoadMore = !q.isLoading && limit < 100 && (data?.total ?? 0) > rows.length;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Orders</h1>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} order{data.total === 1 ? "" : "s"}{filters.status !== "all" || filters.tier !== "all" || filters.campusId || debSearch ? " in filter" : ""}
          </span>
        )}
        {data && data.newThisWeek > 0 && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{data.newThisWeek} new this week</span>
        )}
        <button className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => q.refetch()} disabled={q.isFetching}>
          <RotateCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="mb-4">
        <OrderFilters value={filters} onChange={setFilters} campuses={campuses} />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Ref</th>
              <th className="px-2 py-2 text-left">Created</th>
              <th className="px-2 py-2 text-left">Student</th>
              <th className="px-2 py-2 text-left">Campus</th>
              <th className="px-2 py-2 text-left">Course</th>
              <th className="px-2 py-2 text-left">Tier</th>
              <th className="px-2 py-2 text-right">Ch.</th>
              <th className="px-2 py-2 text-left">Exam</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={10} className="py-12 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="py-12 text-center text-sm text-muted-foreground">No orders yet — first pre-order will show up here.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} onClick={() => setOpenRef(r.short_ref)} className="cursor-pointer border-b last:border-0 hover:bg-accent/40">
                <td className="px-3 py-2 font-mono text-xs font-medium">{r.short_ref}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{relTime(r.created_at)}</td>
                <td className="px-2 py-2">
                  <div className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{r.email}</div>
                </td>
                <td className="px-2 py-2 text-xs">{r.campus_name || r.campus_text || "—"}</td>
                <td className="px-2 py-2 text-xs">{[r.course_code, r.course_name].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-2 py-2 text-xs">{TIER_SHORT[r.tier] ?? r.tier}</td>
                <td className="px-2 py-2 text-right text-xs tabular-nums">
                  {r.chapter_count_only ?? r.chapter_count ?? "—"}
                  {r.awaiting_syllabus && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700" title="Syllabus pending">⚠</span>}
                </td>
                <td className="px-2 py-2 text-xs">{r.exam_date ? fmtDate(r.exam_date) : r.exam_timeframe ? r.exam_timeframe.replace(/_/g, " ") : "—"}</td>
                <td className="px-2 py-2 text-right text-xs tabular-nums">{r.tier === "made_to_order" ? money(r.total_cents) : "—"}</td>
                <td className="px-2 py-2"><StatusPill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canLoadMore && (
        <div className="mt-3 text-center">
          <button className="text-sm font-medium text-primary hover:underline" onClick={() => setLimit(100)}>Load more</button>
        </div>
      )}

      <OrderDetailDrawer shortRef={openRef} onClose={() => setOpenRef(null)} onChanged={() => q.refetch()} />
    </div>
  );
}
