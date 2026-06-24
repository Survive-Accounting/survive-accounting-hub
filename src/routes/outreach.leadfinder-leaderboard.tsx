// Campus scrape leaderboard — a "prioritize these first" view over every
// campus's scrape results: lead count, email-coverage % (the real success
// metric), and RMP average. Select one/many to (re-)scrape, or re-scrape a
// single campus in place without resetting anything. Reuses the exact
// discover -> faculty -> rmp sequence the batch + single-campus scrapes use.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowUpDown, Loader2, Play, RotateCw, CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchCampuses } from "@/lib/outreach-api";
import { autoDiscoverCampusUrls } from "@/lib/auto-scrape.functions";
import { scrapeCampusFaculty } from "@/lib/faculty-scrape.functions";
import { scrapeCampusRmp } from "@/lib/rmp-scrape.functions";

export const Route = createFileRoute("/outreach/leadfinder-leaderboard")({
  head: () => ({ meta: [{ title: "Scrape Leaderboard — Survive Accounting" }] }),
  component: Leaderboard,
});

type Row = {
  campusId: string;
  name: string;
  state: string;
  leads: number;
  emailed: number;
  emailPct: number;
  rmpAvg: number | null;
  status: "idle" | "running" | "done" | "error";
};
type SortKey = "name" | "leads" | "emailed" | "emailPct" | "rmpAvg";

// Fetch every active faculty_scrape suggestion, paging past PostgREST's 1k cap.
async function loadSuggestions(): Promise<Array<{ campus_id: string; email: string | null; rmp_rating: number | null }>> {
  const pageSize = 1000;
  const out: Array<{ campus_id: string; email: string | null; rmp_rating: number | null }> = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("campus_lead_suggestions")
      .select("campus_id,email,rmp_rating")
      .eq("research_mode", "faculty_scrape")
      .is("archived_at", null)
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    out.push(...(data as never[]));
    if (data.length < pageSize) break;
  }
  return out;
}

function Leaderboard() {
  const discover = useServerFn(autoDiscoverCampusUrls);
  const facultyFn = useServerFn(scrapeCampusFaculty);
  const rmpFn = useServerFn(scrapeCampusRmp);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "emailed", dir: "desc" });
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [campuses, sugs] = await Promise.all([fetchCampuses(), loadSuggestions()]);
      const agg = new Map<string, { leads: number; emailed: number; rmpSum: number; rmpCount: number }>();
      for (const s of sugs) {
        const a = agg.get(s.campus_id) ?? { leads: 0, emailed: 0, rmpSum: 0, rmpCount: 0 };
        a.leads += 1;
        if (s.email && String(s.email).trim()) a.emailed += 1;
        if (s.rmp_rating != null) { a.rmpSum += Number(s.rmp_rating); a.rmpCount += 1; }
        agg.set(s.campus_id, a);
      }
      const next: Row[] = (campuses as Array<{ id: string; school_name: string; state: string | null; archived?: boolean }>)
        .filter((c) => !c.archived)
        .map((c) => {
          const a = agg.get(c.id) ?? { leads: 0, emailed: 0, rmpSum: 0, rmpCount: 0 };
          return {
            campusId: c.id,
            name: c.school_name,
            state: c.state ?? "",
            leads: a.leads,
            emailed: a.emailed,
            emailPct: a.leads > 0 ? Math.round((100 * a.emailed) / a.leads) : 0,
            rmpAvg: a.rmpCount > 0 ? Math.round((a.rmpSum / a.rmpCount) * 10) / 10 : null,
            status: "idle" as const,
          };
        });
      setRows((prev) => {
        // preserve any in-flight status from a re-scrape in progress
        const byId = new Map(prev.map((r) => [r.campusId, r.status]));
        return next.map((r) => ({ ...r, status: byId.get(r.campusId) === "running" ? "running" : r.status }));
      });
    } catch (e) {
      toast.error(`Failed to load: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setStatus = (id: string, status: Row["status"]) =>
    setRows((prev) => prev.map((r) => (r.campusId === id ? { ...r, status } : r)));

  // The exact discover -> faculty -> rmp sequence used elsewhere.
  const scrapeOne = useCallback(async (campusId: string) => {
    setStatus(campusId, "running");
    try {
      const found = (await discover({ data: { campusId } })) as { facultyUrls?: string[]; rmpUrl?: string | null };
      if (found.facultyUrls && found.facultyUrls.length > 0) {
        await facultyFn({ data: { campusId, urls: found.facultyUrls, allowNoContact: true } });
      }
      if (found.rmpUrl) {
        try { await rmpFn({ data: { campusId, urls: [found.rmpUrl] } }); } catch { /* rmp optional */ }
      }
      setStatus(campusId, "done");
    } catch (e) {
      setStatus(campusId, "error");
      toast.error(`${campusId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [discover, facultyFn, rmpFn]);

  const runMany = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setRunning(true);
    const queue = [...ids];
    const CONCURRENCY = 3;
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) break;
        await scrapeOne(id);
      }
    });
    await Promise.all(workers);
    setRunning(false);
    await load(); // refresh stats with the new leads
    toast.success(`Re-scraped ${ids.length} campus(es).`);
  }, [scrapeOne, load]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.state.toLowerCase().includes(q))
      : rows;
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (key === "name") return mul * a.name.localeCompare(b.name);
      const av = (a[key] ?? -1) as number;
      const bv = (b[key] ?? -1) as number;
      return mul * (av - bv);
    });
  }, [rows, sort, search]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const totals = useMemo(() => {
    const leads = rows.reduce((s, r) => s + r.leads, 0);
    const emailed = rows.reduce((s, r) => s + r.emailed, 0);
    const withLeads = rows.filter((r) => r.leads > 0).length;
    return { leads, emailed, withLeads, campuses: rows.length };
  }, [rows]);

  const pctClass = (p: number, leads: number) =>
    leads === 0 ? "text-muted-foreground" : p >= 60 ? "text-green-600" : p >= 30 ? "text-amber-600" : "text-red-600";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <Link to="/outreach/leadfinder" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-lg font-semibold">Scrape Leaderboard</h1>
        <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={() => void load()} disabled={loading || running}>
          <RotateCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2 rounded-lg border bg-card p-3 text-center text-sm">
        <Stat label="Campuses" value={`${totals.withLeads}/${totals.campuses}`} />
        <Stat label="Total leads" value={totals.leads.toLocaleString()} />
        <Stat label="With email" value={totals.emailed.toLocaleString()} />
        <Stat label="Email rate" value={totals.leads ? `${Math.round((100 * totals.emailed) / totals.leads)}%` : "—"} />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name or state…"
          className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
        <Button onClick={() => void runMany(Array.from(selected))} disabled={running || selected.size === 0} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Scrape selected ({selected.size})
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <Th label="Campus" onClick={() => toggleSort("name")} active={sort.key === "name"} />
              <Th label="Leads" onClick={() => toggleSort("leads")} active={sort.key === "leads"} right />
              <Th label="Emailed" onClick={() => toggleSort("emailed")} active={sort.key === "emailed"} right />
              <Th label="Email %" onClick={() => toggleSort("emailPct")} active={sort.key === "emailPct"} right />
              <Th label="RMP" onClick={() => toggleSort("rmpAvg")} active={sort.key === "rmpAvg"} right />
              <th className="px-2 py-2 text-right">Run</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : sorted.map((r) => (
              <tr key={r.campusId} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-2 py-1.5">
                  <input type="checkbox" checked={selected.has(r.campusId)} onChange={() => toggle(r.campusId)} disabled={running} className="h-3.5 w-3.5" />
                </td>
                <td className="px-2 py-1.5">
                  <Link to="/outreach/leadfinder/$campusId" params={{ campusId: r.campusId }} className="hover:underline">{r.name}</Link>
                  {r.state ? <span className="ml-1.5 text-xs text-muted-foreground">{r.state}</span> : null}
                  {r.leads === 0 ? <span className="ml-1.5 rounded bg-red-100 px-1 text-[10px] font-medium text-red-700">empty</span> : null}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.leads}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.emailed}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${pctClass(r.emailPct, r.leads)}`}>{r.leads ? `${r.emailPct}%` : "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.rmpAvg ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">
                  {r.status === "running" ? <Loader2 className="ml-auto h-4 w-4 animate-spin text-primary" />
                    : r.status === "done" ? <CheckCircle2 className="ml-auto h-4 w-4 text-green-600" />
                    : r.status === "error" ? <XCircle className="ml-auto h-4 w-4 text-red-500" />
                    : <button onClick={() => void runMany([r.campusId])} disabled={running} title="Re-scrape this campus" className="text-muted-foreground hover:text-primary disabled:opacity-40"><RotateCw className="h-3.5 w-3.5" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Email % is the share of this campus's leads that have a real email — the best signal of a usable scrape. Red (&lt;30%) campuses are worth re-scraping. Re-scraping never deletes existing leads; it adds any new ones (deduped).
      </p>
    </div>
  );
}

function Th({ label, onClick, active, right }: { label: string; onClick: () => void; active: boolean; right?: boolean }) {
  return (
    <th className={`px-2 py-2 ${right ? "text-right" : "text-left"}`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}>
        {label}<ArrowUpDown className="h-3 w-3 opacity-50" />
      </button>
    </th>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (<div><div className="text-base font-semibold">{value}</div><div className="text-[11px] text-muted-foreground">{label}</div></div>);
}

export default Leaderboard;
