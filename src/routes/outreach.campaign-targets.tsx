// Campaign Targets — a GLOBAL, ranked view of scrape leads across all campuses,
// surfacing the Phase-1 teaching-confidence tiers + Hasselback priors so Lee can
// work the highest-confidence, confirmed-email accounting faculty first (50/day).
// Reads live data only (campus_lead_suggestions). Export to CSV for the send tool.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { EmailQueueShell } from "@/components/outreach/EmailQueueShell";
import { fetchCampuses } from "@/lib/outreach-api";
import { MOCK_CAMPUSES, type Campus } from "@/lib/outreach-mock";

export const Route = createFileRoute("/outreach/campaign-targets")({
  head: () => ({ meta: [{ title: "Campaign Targets — Survive Accounting" }] }),
  component: CampaignTargets,
});

type Lead = {
  id: string;
  campus_id: string;
  campus: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  tier: "high" | "medium" | "low" | null;
  tenured: boolean;
  areas: string | null;
  rmp: number | null;
};
type SortKey = "rank" | "campus" | "name" | "rmp";
const TIER_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

async function loadLeads(): Promise<Array<Record<string, unknown>>> {
  const pageSize = 1000;
  const out: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("campus_lead_suggestions")
      .select("id,campus_id,first_name,last_name,title,email,teaching_confidence,hasselback_tenured,hasselback_areas,rmp_rating")
      .eq("research_mode", "faculty_scrape")
      .is("archived_at", null)
      .not("email", "is", null)
      .neq("email", "")
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    out.push(...(data as never[]));
    if (data.length < pageSize) break;
  }
  return out;
}

function CampaignTargets() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [tenuredOnly, setTenuredOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "rank", dir: "desc" });

  const campusesQ = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: 1 });
  const campuses: Campus[] = campusesQ.data ?? (campusesQ.isError ? MOCK_CAMPUSES : []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [campuses, rows] = await Promise.all([fetchCampuses(), loadLeads()]);
      const nameById = new Map<string, string>(
        (campuses as Array<{ id: string; school_name: string }>).map((c) => [c.id, c.school_name]),
      );
      setLeads(rows.map((r) => ({
        id: String(r.id),
        campus_id: String(r.campus_id),
        campus: nameById.get(String(r.campus_id)) ?? "—",
        first_name: (r.first_name as string) ?? null,
        last_name: (r.last_name as string) ?? null,
        title: (r.title as string) ?? null,
        email: (r.email as string) ?? null,
        tier: (r.teaching_confidence as Lead["tier"]) ?? null,
        tenured: r.hasselback_tenured === true,
        areas: (r.hasselback_areas as string) ?? null,
        rmp: r.rmp_rating != null ? Number(r.rmp_rating) : null,
      })));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rankOf = (l: Lead) => (TIER_RANK[l.tier ?? ""] ?? 0) * 10 + (l.tenured ? 5 : 0) + (l.areas ? 2 : 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = leads;
    if (tierFilter !== "all") rows = rows.filter((l) => l.tier === tierFilter);
    if (tenuredOnly) rows = rows.filter((l) => l.tenured);
    if (q) rows = rows.filter((l) =>
      `${l.first_name ?? ""} ${l.last_name ?? ""}`.toLowerCase().includes(q) ||
      l.campus.toLowerCase().includes(q) || (l.email ?? "").toLowerCase().includes(q));
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "rank") return mul * (rankOf(a) - rankOf(b));
      if (sort.key === "rmp") return mul * ((a.rmp ?? -1) - (b.rmp ?? -1));
      if (sort.key === "campus") return mul * a.campus.localeCompare(b.campus);
      return mul * `${a.last_name ?? ""}`.localeCompare(`${b.last_name ?? ""}`);
    });
  }, [leads, tierFilter, tenuredOnly, search, sort]);

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0, tenured: 0 };
    for (const l of leads) {
      if (l.tier === "high") c.high++; else if (l.tier === "medium") c.medium++; else c.low++;
      if (l.tenured) c.tenured++;
    }
    return c;
  }, [leads]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "campus" || key === "name" ? "asc" : "desc" }));

  function exportCsv() {
    const cell = (v: string | number | null | undefined) => {
      const s = String(v ?? "").replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = ["rank_tier,tenured,campus,first_name,last_name,title,email,hasselback_areas,rmp"];
    for (const l of filtered) {
      lines.push([l.tier ?? "low", l.tenured ? "Y" : "", l.campus, l.first_name, l.last_name, l.title, l.email, l.areas, l.rmp].map(cell).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `campaign-targets-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const tierBadge = (t: Lead["tier"]) => {
    const cls = t === "high" ? "bg-green-100 text-green-700" : t === "medium" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground";
    return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>{t ?? "low"}</span>;
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Priority Queue</h1>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={exportCsv} disabled={loading || filtered.length === 0}>
          <Download className="h-3.5 w-3.5" /> Export CSV ({filtered.length})
        </Button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        The ranked send order — highest-confidence, confirmed-email accounting faculty first. Work it top-down at 50/day.
      </p>

      <div className="mb-4 grid grid-cols-4 gap-2 rounded-lg border bg-card p-3 text-center text-sm">
        <Stat label="High" value={String(counts.high)} />
        <Stat label="Medium" value={String(counts.medium)} />
        <Stat label="Low" value={String(counts.low)} />
        <Stat label="Tenured" value={String(counts.tenured)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "high", "medium", "low"] as const).map((t) => (
          <button key={t} onClick={() => setTierFilter(t)}
            className={`rounded-md border px-2.5 py-1 text-xs capitalize ${tierFilter === t ? "border-primary bg-primary/5 text-primary" : "hover:bg-accent"}`}>{t}</button>
        ))}
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={tenuredOnly} onChange={(e) => setTenuredOnly(e.target.checked)} className="h-3.5 w-3.5" /> tenured only
        </label>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter name / campus / email…"
          className="ml-auto min-w-[220px] flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary" />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <Th label="Tier" onClick={() => toggleSort("rank")} active={sort.key === "rank"} />
              <Th label="Name" onClick={() => toggleSort("name")} active={sort.key === "name"} />
              <Th label="Campus" onClick={() => toggleSort("campus")} active={sort.key === "campus"} />
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left">Areas</th>
              <Th label="RMP" onClick={() => toggleSort("rmp")} active={sort.key === "rmp"} right />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : filtered.slice(0, 1000).map((l) => (
              <tr key={l.id} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-2 py-1.5">{tierBadge(l.tier)}{l.tenured ? <span className="ml-1 text-[10px] text-green-700">tenured</span> : null}</td>
                <td className="px-2 py-1.5">{`${l.first_name ?? ""} ${l.last_name ?? ""}`.trim()}{l.title ? <span className="block text-[11px] text-muted-foreground">{l.title}</span> : null}</td>
                <td className="px-2 py-1.5 text-xs">{l.campus}</td>
                <td className="px-2 py-1.5"><a className="text-primary hover:underline" href={`mailto:${l.email}`}>{l.email}</a></td>
                <td className="px-2 py-1.5 font-mono text-xs">{l.areas ?? "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.rmp ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Tiers: <strong>high</strong> = a course schedule confirms they teach Intro/Intermediate · <strong>medium</strong> = Hasselback area-code or AI teaching signal · <strong>low</strong> = accounting faculty, no teaching signal yet. Areas: P=Principles, F=Financial, M=Managerial. Showing first 1,000 of {filtered.length}.
      </p>

      {/* Sending lives with the queue: compose, schedule, and work the daily send. */}
      <div className="mt-10 border-t pt-6">
        <h2 className="mb-1 text-lg font-semibold">Email Queue</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Compose, schedule, and send to the targets above. The 50/day cap and confirmed-email rule stay enforced.
        </p>
        <EmailQueueShell campuses={campuses} />
      </div>
    </div>
  );
}

function Th({ label, onClick, active, right }: { label: string; onClick: () => void; active: boolean; right?: boolean }) {
  return (
    <th className={`px-2 py-2 ${right ? "text-right" : "text-left"}`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}>{label}<ArrowUpDown className="h-3 w-3 opacity-50" /></button>
    </th>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (<div><div className="text-base font-semibold">{value}</div><div className="text-[11px] text-muted-foreground">{label}</div></div>);
}

export default CampaignTargets;
