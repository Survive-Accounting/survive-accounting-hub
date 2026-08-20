// /outreach/reps — the rep application queue.
//
// Status and a note, and nothing else. No rep accounts, no links, no commission fields: those are
// a later pass, and a half-built payout column is worse than an empty one because it looks done.
import { createFileRoute } from "@tanstack/react-router";
import { useNavyDocument } from "@/components/site/SiteHeader";
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { supabase } from "@/integrations/supabase/client";
import { listRepApplications, REP_STATUSES, setRepStatus, type RepApplication, type RepStatus } from "@/lib/campus-rep.functions";

export const Route = createFileRoute("/outreach/reps")({
  head: () => ({ meta: [{ title: "Campus reps — outreach" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: RepsAdmin,
});

const TONE: Record<RepStatus, string> = {
  new: "var(--accent)", contacted: "#8B97BD", approved: "#3BF5A0", declined: "#F3C6CC",
};

function RepsAdmin() {
  useNavyDocument();
  const [rows, setRows] = useState<RepApplication[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setDenied(true); return; }
    const r = await listRepApplications({ data: { accessToken: token } });
    // null means "not an admin" — different from an empty queue, and shown differently.
    if (r === null) { setDenied(true); return; }
    setRows(r);
  };
  useEffect(() => { void load(); }, []);

  const update = async (id: string, patch: { status?: RepStatus; note?: string }) => {
    setBusy(id);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await setRepStatus({ data: { accessToken: token, id, ...patch } });
      await load();
    } finally { setBusy(null); }
  };

  if (denied) {
    return (
      <div className="grid min-h-screen place-items-center px-5" style={{ background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_SANS }}>
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>Sign in as an admin to view rep applications.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-10" style={{ background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_SANS }}>
      <div className="mx-auto w-full max-w-[900px]">
        <h1 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Campus reps</h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {rows ? `${rows.length} application${rows.length === 1 ? "" : "s"} · ${rows.filter((r) => r.status === "new").length} new` : "Loading…"}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {(rows ?? []).map((r) => (
            <div key={r.id} className="rounded-xl p-4" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.12)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[15px] font-black">{r.name}</span>
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {r.schoolName} · {r.year} · {new Date(r.submittedAt).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                {r.email} · {r.phone}{r.greek ? ` · ${r.greek}` : ""}
              </p>
              {r.pitch && <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--brand-cream)" }}>{r.pitch}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {REP_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => void update(r.id, { status: s })}
                    className="rounded-lg px-2.5 text-[12px] font-bold capitalize disabled:opacity-40"
                    style={{
                      minHeight: 34,
                      background: r.status === s ? "rgba(252,163,17,0.16)" : "rgba(245,239,230,0.06)",
                      color: r.status === s ? TONE[s] : "var(--text-muted)",
                      border: `1px solid ${r.status === s ? TONE[s] : "transparent"}`,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <input
                defaultValue={r.note}
                onBlur={(e) => { if (e.target.value !== r.note) void update(r.id, { note: e.target.value }); }}
                placeholder="Note…"
                className="mt-2 w-full rounded-lg px-3 text-[13px] outline-none"
                style={{ minHeight: 40, background: "rgba(0,0,0,0.18)", border: "1px solid rgba(245,239,230,0.12)", color: "var(--brand-cream)" }}
              />
            </div>
          ))}
        </div>

        {rows && !rows.length && <p className="mt-6 text-[13px]" style={{ color: "var(--text-muted)" }}>No applications yet.</p>}
      </div>
    </div>
  );
}
