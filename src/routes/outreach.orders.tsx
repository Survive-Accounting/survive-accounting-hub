// /outreach/orders — admin list of order requests. Renders inside the AdminGate-
// wrapped /outreach shell. Two views: "All orders" (full table + filters) and
// "Triage" (open workflow, exam-date-sorted, quote/build/delivery at a glance).
// Row click opens the shared detail drawer (where triage fields are edited).
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RotateCw } from "lucide-react";

import { listOrders, TRIAGE_STATUSES, type AdminOrderRow } from "@/lib/orders-admin.functions";
import { OrderFilters, type OrderFiltersValue } from "@/components/outreach/orders/OrderFilters";
import { OrderDetailDrawer, StatusPill } from "@/components/outreach/orders/OrderDetailDrawer";

export const Route = createFileRoute("/outreach/orders")({
  head: () => ({ meta: [{ title: "Requests — Survive Accounting" }] }),
  component: OrdersAdmin,
});

const TIER_SHORT: Record<string, string> = { made_to_order: "Pre-order", one_on_one: "1-on-1", free_teaser: "Free teaser", something_else: "Something else" };
const REFERRAL_SHORT: Record<string, string> = { professor: "Professor", friend: "Friend", greek: "Greek", social: "Social", search: "Search", other: "Other" };
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
function daysUntil(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
}

function OrdersAdmin() {
  const listFn = useServerFn(listOrders);
  const [filters, setFilters] = useState<OrderFiltersValue>({ status: "all", tier: "all", campusId: "", search: "" });
  const [view, setView] = useState<"all" | "triage">("all");
  const [limit, setLimit] = useState(50);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [debSearch, setDebSearch] = useState("");

  // Deep link from the new-order SMS/email: /outreach/orders?ref=<short_ref>
  // opens that order's drawer straight away (review from your phone).
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setOpenRef(ref);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebSearch(filters.search.trim()), 250);
    return () => clearTimeout(t);
  }, [filters.search]);

  const q = useQuery({
    queryKey: ["admin-orders", view, filters.status, filters.tier, filters.campusId, debSearch, limit],
    queryFn: () => listFn({
      data: {
        // Triage fetches all statuses/tiers (it filters client-side to the open set).
        status: view === "triage" || filters.status === "all" ? null : (filters.status as never),
        tier: view === "triage" || filters.tier === "all" ? null : (filters.tier as never),
        campus_id: filters.campusId || null,
        search: debSearch || null,
        limit: view === "triage" ? 100 : limit,
      },
    }),
  });

  const data = q.data;
  const rows: AdminOrderRow[] = data?.rows ?? [];
  const campuses = useMemo(() => data?.campuses ?? [], [data]);
  const canLoadMore = !q.isLoading && limit < 100 && (data?.total ?? 0) > rows.length;

  // Triage: open statuses only, exam_date ASC NULLS LAST, then created_at ASC.
  const triageRows = useMemo(() => {
    const open = (TRIAGE_STATUSES as readonly string[]);
    return rows
      .filter((r) => open.includes(r.status))
      .sort((a, b) => {
        const ad = a.exam_date, bd = b.exam_date;
        if (ad && bd) { if (ad !== bd) return ad < bd ? -1 : 1; }
        else if (ad && !bd) return -1;
        else if (!ad && bd) return 1;
        return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
      });
  }, [rows]);

  const tabCls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Requests</h1>
        <div className="inline-flex rounded-lg border p-0.5">
          <button className={tabCls(view === "all")} onClick={() => setView("all")}>All orders</button>
          <button className={tabCls(view === "triage")} onClick={() => setView("triage")}>Triage</button>
        </div>
        {data && view === "all" && (
          <span className="text-sm text-muted-foreground">
            {data.total} request{data.total === 1 ? "" : "s"}{filters.status !== "all" || filters.tier !== "all" || filters.campusId || debSearch ? " in filter" : ""}
          </span>
        )}
        {view === "triage" && <span className="text-sm text-muted-foreground">{triageRows.length} open</span>}
        {data && data.newThisWeek > 0 && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{data.newThisWeek} new this week</span>
        )}
        <button className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => q.refetch()} disabled={q.isFetching}>
          <RotateCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {view === "all" && (
        <div className="mb-4">
          <OrderFilters value={filters} onChange={setFilters} campuses={campuses} />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        {view === "all" ? (
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
                <tr><td colSpan={10} className="py-12 text-center text-sm text-muted-foreground">No requests yet — first request will show up here.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} onClick={() => setOpenRef(r.short_ref)} className="cursor-pointer border-b last:border-0 hover:bg-accent/40">
                  <td className="px-3 py-2 font-mono text-xs font-medium">{r.short_ref}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{relTime(r.created_at)}</td>
                  <td className="px-2 py-2">
                    <div className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{r.email}</div>
                    {r.referral_source && <span className="mt-0.5 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">via {REFERRAL_SHORT[r.referral_source] ?? r.referral_source}</span>}
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
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Ref</th>
                <th className="px-2 py-2 text-left">Student</th>
                <th className="px-2 py-2 text-left">Course</th>
                <th className="px-2 py-2 text-left">Exam</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-center">Tool</th>
                <th className="px-2 py-2 text-right">Quote</th>
                <th className="px-2 py-2 text-left">Promised</th>
                <th className="px-2 py-2 text-right">Build</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                <tr><td colSpan={9} className="py-12 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : triageRows.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">Nothing in the triage queue — all caught up.</td></tr>
              ) : triageRows.map((r) => {
                const soon = r.exam_date != null && daysUntil(r.exam_date) <= 3;
                return (
                  <tr key={r.id} onClick={() => setOpenRef(r.short_ref)} className="cursor-pointer border-b last:border-0 hover:bg-accent/40">
                    <td className="px-3 py-2 font-mono text-xs font-medium">{r.short_ref}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{r.campus_name || r.campus_text || "—"}</div>
                    </td>
                    <td className="px-2 py-2 text-xs">{[r.course_code, r.course_name].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-2 py-2 text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        {r.exam_date ? fmtDate(r.exam_date) : r.exam_timeframe ? r.exam_timeframe.replace(/_/g, " ") : "—"}
                        {soon && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">≤3 days</span>}
                      </span>
                    </td>
                    <td className="px-2 py-2"><StatusPill status={r.status} /></td>
                    <td className="px-2 py-2 text-center">{r.tool_exists === true ? <span className="font-semibold text-emerald-600">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums">{r.quote_cents != null ? money(r.quote_cents) : "—"}</td>
                    <td className="px-2 py-2 text-xs">{r.promised_delivery_date ? fmtDate(r.promised_delivery_date) : "—"}</td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums">{r.estimated_build_minutes != null ? `${r.estimated_build_minutes}m` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {view === "all" && canLoadMore && (
        <div className="mt-3 text-center">
          <button className="text-sm font-medium text-primary hover:underline" onClick={() => setLimit(100)}>Load more</button>
        </div>
      )}

      <OrderDetailDrawer shortRef={openRef} onClose={() => setOpenRef(null)} onChanged={() => q.refetch()} />
    </div>
  );
}
