// /outreach/councils — Lee's list of every council page, with its shareable link.
//
// The outreach loop this serves: pick a council, copy its link, send it to that council's academics
// chair. So the copy button is the primary control, not the token — the token is only shown so a
// rotation is visibly a different string afterwards.
//
// Rows are minted lazily by listCouncilPagesAdmin: any council with at least one chapter at that
// school appears with a token already generated, so there is never a "create page" step between
// deciding to send and sending.
import { createFileRoute } from "@tanstack/react-router";
import { useNavyDocument } from "@/components/site/SiteHeader";
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { supabase } from "@/integrations/supabase/client";
import { listCouncilPagesAdmin, rotateCouncilToken, type CouncilAdminRow } from "@/lib/greek-councils.functions";

export const Route = createFileRoute("/outreach/councils")({
  head: () => ({ meta: [{ title: "Council pages — outreach" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: CouncilsAdmin,
});

function CouncilsAdmin() {
  useNavyDocument();
  const [rows, setRows] = useState<CouncilAdminRow[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setDenied(true); return; }
    const r = await listCouncilPagesAdmin({ data: { accessToken: token } });
    // null means the server said "not an admin" — a different thing from an empty list, and worth
    // showing differently.
    if (r === null) { setDenied(true); return; }
    setRows(r);
  };
  useEffect(() => { void load(); }, []);

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600); } catch { /* blocked */ }
  };

  const rotate = async (row: CouncilAdminRow) => {
    if (!window.confirm(`Rotate the token for ${row.councilName} at ${row.schoolName}?\n\nThe old link stops working immediately.`)) return;
    setBusy(row.shareUrl);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await rotateCouncilToken({ data: { accessToken: token, schoolSlug: row.schoolSlug, councilSlug: row.councilSlug } });
      await load();
    } finally { setBusy(null); }
  };

  if (denied) {
    return (
      <div className="grid min-h-screen place-items-center px-5" style={{ background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_SANS }}>
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>Sign in as an admin to view council pages.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-10" style={{ background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_SANS }}>
      <div className="mx-auto w-full max-w-[1000px]">
        <h1 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Council pages</h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {rows ? `${rows.length} pages across ${new Set(rows.map((r) => r.schoolSlug)).size} schools` : "Loading…"}
          {" · "}Copy a link to send it to that council&apos;s academics chair.
        </p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-[13px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {["School", "Council", "Chapters", "Members", "Last opened", ""].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-[11px] font-black uppercase tracking-wide" style={{ borderBottom: "1px solid rgba(245,239,230,0.14)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={`${r.schoolSlug}/${r.councilSlug}`} style={{ borderBottom: "1px solid rgba(245,239,230,0.07)" }}>
                  <td className="px-3 py-2.5">{r.schoolName}</td>
                  <td className="px-3 py-2.5 font-bold">{r.councilName}</td>
                  <td className="px-3 py-2.5">{r.chapters}</td>
                  <td className="px-3 py-2.5 font-black" style={{ color: r.members ? "var(--accent)" : "var(--text-muted)" }}>{r.members || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--text-muted)" }}>
                    {r.lastOpenedAt ? new Date(r.lastOpenedAt).toLocaleDateString() : "never"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <button type="button" onClick={() => void copy(r.shareUrl, r.shareUrl)} className="rounded-lg px-2.5 text-[12px] font-bold" style={{ background: "rgba(252,163,17,0.14)", color: "var(--accent)", minHeight: 34 }}>
                      {copied === r.shareUrl ? "Copied ⚡" : "Copy link"}
                    </button>
                    <button type="button" onClick={() => void rotate(r)} disabled={busy === r.shareUrl} className="ml-2 rounded-lg px-2.5 text-[12px] font-bold disabled:opacity-40" style={{ background: "rgba(245,239,230,0.07)", color: "var(--brand-cream)", minHeight: 34 }}>
                      {busy === r.shareUrl ? "…" : "Rotate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows && !rows.length && <p className="mt-6 text-[13px]" style={{ color: "var(--text-muted)" }}>No councils with chapters yet.</p>}
      </div>
    </div>
  );
}
