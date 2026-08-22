// /outreach/practice — QUESTION-LEVEL ANALYTICS: per CEQ, attempts · % missed · median time ·
// skips · abandons · "ask me" count. Sortable. This IS the filming priority queue: the most
// missed + most asked-about questions are the ones to film and to author feedback for first.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { supabase } from "@/integrations/supabase/client";
import { fetchPracticeAnalytics, type QuestionStat } from "@/lib/practice.functions";

export const Route = createFileRoute("/outreach/practice")({
  head: () => ({ meta: [{ title: "Practice analytics — outreach" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PracticeAnalytics,
});

type SortKey = "reference" | "attempts" | "missedPct" | "medianMs" | "skips" | "abandons" | "asks";
const INK = "#0B1220", MUTED = "#6B7280", LINE = "#E5E7EB";

function PracticeAnalytics() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPracticeAnalytics>> | undefined>(undefined);
  const [includeTest, setIncludeTest] = useState(false);
  const [days, setDays] = useState(90);
  const [sort, setSort] = useState<SortKey>("missedPct");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [q, setQ] = useState("");
  useEffect(() => { void supabase.auth.getSession().then(({ data: s }) => setToken(s.session?.access_token ?? null)); }, []);
  useEffect(() => { if (!token) return; setData(undefined); void fetchPracticeAnalytics({ data: { accessToken: token, includeTest, days } }).then(setData); }, [token, includeTest, days]);

  const rows = useMemo(() => {
    const list = (data?.questions ?? []).filter((r) => !q || `${r.reference} ${r.topic} ${r.setName} ${r.shorthand ?? ""} ${r.prompt}`.toLowerCase().includes(q.toLowerCase()));
    const val = (r: QuestionStat): number | string => sort === "reference" ? r.reference.split(".").map((n) => n.padStart(3, "0")).join(".") : (r[sort] ?? -1);
    return list.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }, [data, sort, dir, q]);
  const head = (key: SortKey, label: string, title?: string) => (
    <th className="cursor-pointer select-none whitespace-nowrap px-2 py-2 text-left text-[10.5px] font-black uppercase tracking-wider" style={{ color: sort === key ? INK : MUTED }} title={title} onClick={() => { if (sort === key) setDir((d) => (d === 1 ? -1 : 1)); else { setSort(key); setDir(key === "reference" ? 1 : -1); } }}>
      {label}{sort === key ? (dir === -1 ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8" style={{ color: INK, fontFamily: BRAND_SANS }}>
      <div className="mb-1 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[24px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Practice analytics</h1>
        <span className="text-[12px]" style={{ color: MUTED }}>Per question. Sort by % missed or asks — that's the filming queue.</span>
        <Link to="/outreach/comms" className="ml-auto text-[12.5px] underline" style={{ color: "#B45309" }}>Comms console →</Link>
      </div>
      {!token && <p className="text-[13px]" style={{ color: "#B91C1C" }}>Sign in with an admin account.</p>}
      {data === null && <p className="text-[13px]" style={{ color: "#B91C1C" }}>Not an admin account.</p>}
      {data && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-[12.5px]">
          <span><b>{data.totals.attempts}</b> answers · <b>{data.totals.sessions}</b> sessions · <b>{data.totals.asks}</b> asks · {data.questions.length} live questions</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: LINE }}>
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option>
          </select>
          <label className="flex items-center gap-1 text-[11px]" style={{ color: MUTED }}><input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} /> include tests</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter: 3.2, topic, words in the stem…" className="ml-auto w-[260px] rounded-md border px-2 py-1 text-xs" style={{ borderColor: LINE }} />
        </div>
      )}
      {token && data === undefined && <p className="text-[12px]" style={{ color: MUTED }}>Loading…</p>}
      {data && (
        <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${LINE}` }}>
          <table className="w-full text-[12.5px]" style={{ minWidth: 960 }}>
            <thead style={{ background: "#F8FAFC", borderBottom: `1px solid ${LINE}` }}>
              <tr>
                {head("reference", "Ref", "Topic.Set.Question — derived from the live order; analytics key on stable ids")}
                <th className="px-2 py-2 text-left text-[10.5px] font-black uppercase tracking-wider" style={{ color: MUTED }}>Question</th>
                {head("attempts", "Attempts")}
                {head("missedPct", "% missed")}
                {head("medianMs", "Median time")}
                {head("skips", "Skips")}
                {head("abandons", "Quit here", "Last question reached before leaving the set")}
                {head("asks", "Asks", "“Ask me about this one” submissions")}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ceqId} style={{ borderBottom: `1px solid ${LINE}`, background: r.asks > 0 ? "#FFFBEB" : "transparent" }}>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] font-bold tabular-nums">{r.reference}</td>
                  <td className="px-2 py-1.5">
                    <div className="text-[11px]" style={{ color: MUTED }}>{r.topic} · {r.setName}</div>
                    <div className="max-w-[520px] truncate" title={r.prompt}>{r.shorthand ? <b>{r.shorthand} — </b> : null}{r.prompt}</div>
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{r.attempts}</td>
                  <td className="px-2 py-1.5 tabular-nums" style={{ color: r.missedPct != null && r.missedPct >= 50 ? "#B91C1C" : INK }}>{r.missedPct == null ? "—" : `${r.missedPct}%`}{r.attempts ? <span style={{ color: MUTED }}> ({r.missed})</span> : null}</td>
                  <td className="px-2 py-1.5 tabular-nums">{r.medianMs == null ? "—" : `${(r.medianMs / 1000).toFixed(1)}s`}</td>
                  <td className="px-2 py-1.5 tabular-nums">{r.skips || "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums">{r.abandons || "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums font-bold">{r.asks || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-[12px]" style={{ color: MUTED }}>No questions match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
