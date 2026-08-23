// /outreach/test-mode — the guided-run activity feed. Reads test_mode_activity via a service-
// role-backed server fn (any signed-in Supabase user can read; the admin gate is the route
// itself living under /outreach). One row per event; grouped by session for readability.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { supabase } from "@/integrations/supabase/client";
import { listTestModeActivity, type TestActivityRow } from "@/lib/test-mode.functions";

export const Route = createFileRoute("/outreach/test-mode")({
  head: () => ({ meta: [{ title: "Test Mode activity — outreach" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: TestModeActivity,
});

const INK = "#0B1220", MUTED = "#6B7280", LINE = "#E5E7EB";

function TestModeActivity() {
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<TestActivityRow[] | null>(null);
  const [minutes, setMinutes] = useState<number>(24 * 60);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null)); }, []);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const load = async () => {
      const r = await listTestModeActivity({ data: { accessToken: token, limit: 300, sinceMinutes: minutes } });
      if (!alive) return;
      setRows(r.rows);
      setError((r as { error?: string }).error ?? null);
    };
    void load();
    if (!autoRefresh) return () => { alive = false; };
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [token, minutes, autoRefresh]);
  const groups = useMemo(() => {
    const byKey = new Map<string, TestActivityRow[]>();
    for (const r of rows ?? []) { const k = r.session_key; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k)!.push(r); }
    return [...byKey.entries()].sort((a, b) => (b[1][0]?.created_at ?? "").localeCompare(a[1][0]?.created_at ?? ""));
  }, [rows]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6" style={{ color: INK, fontFamily: BRAND_SANS }}>
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Test Mode activity</h1>
        <span className="text-[12px]" style={{ color: MUTED }}>Guided student runs · nothing here counts toward real analytics</span>
        <div className="ml-auto flex items-center gap-2 text-[12px]">
          <label className="flex items-center gap-1"><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> auto-refresh</label>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="rounded border px-2 py-0.5 text-xs" style={{ borderColor: LINE }}>
            <option value={60}>Last hour</option>
            <option value={60 * 6}>Last 6 hours</option>
            <option value={60 * 24}>Last 24 hours</option>
            <option value={60 * 24 * 7}>Last 7 days</option>
          </select>
        </div>
      </div>
      {!token && <p className="text-[13px]" style={{ color: "#B91C1C" }}>Sign in with an admin account.</p>}
      {error && <p className="text-[13px]" style={{ color: "#B91C1C" }}>{error}</p>}
      {token && rows === null && <p className="text-[12px]" style={{ color: MUTED }}>Loading…</p>}
      {token && rows && rows.length === 0 && <p className="text-[13px]" style={{ color: MUTED }}>No test activity in this window. Open /?feedback=1&t=you&email=lee@surviveaccounting.com&testmode=1 to arm a run.</p>}
      <div className="space-y-4">
        {groups.map(([session, events]) => (
          <section key={session} className="rounded-xl border" style={{ borderColor: LINE }}>
            <header className="flex flex-wrap items-baseline gap-3 border-b px-3 py-2" style={{ borderColor: LINE }}>
              <span className="font-black tabular-nums text-[13px]">#{session.slice(0, 8)}</span>
              <span className="text-[12px]" style={{ color: MUTED }}>{events[0]?.tester_name || "anonymous"}{events[0]?.tester_email ? ` · ${events[0]?.tester_email}` : ""}</span>
              <span className="ml-auto text-[11px]" style={{ color: MUTED }}>{new Date(events[events.length - 1]!.created_at).toLocaleString()} → {new Date(events[0]!.created_at).toLocaleString()}</span>
            </header>
            <ol className="divide-y" style={{ borderColor: LINE }}>
              {events.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 px-3 py-1.5 text-[12.5px]">
                  <span className="w-24 shrink-0 tabular-nums" style={{ color: MUTED }}>{new Date(e.created_at).toLocaleTimeString()}</span>
                  <span className={`w-16 shrink-0 font-black uppercase tracking-wide ${e.status === "error" ? "" : e.status === "warn" ? "" : ""}`} style={{ color: e.status === "error" ? "#B91C1C" : e.status === "warn" ? "#B45309" : "#059669" }}>{e.status}</span>
                  <span className="w-24 shrink-0 font-bold">{e.step ?? "—"}</span>
                  <span className="w-40 shrink-0">{e.event}</span>
                  <span className="flex-1 truncate" style={{ color: MUTED }}>{e.detail ?? (e.meta_json ?? "")}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
