// /outreach/chapters — chapters members created for themselves.
//
// Member-created rows only. A queue that also listed the ~1,100 scraped chapters would not be a
// queue, it would be the table.
//
// Each row is ALREADY LIVE — that is the point of lazy creation, and approving is confirmation
// rather than release. So the primary action is the link: look at the page a real person is
// using before deciding anything about it.
import { createFileRoute } from "@tanstack/react-router";
import { frameThemeVars } from "@/components/frames/frame-theme";
import { useNavyDocument } from "@/components/site/SiteHeader";
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { supabase } from "@/integrations/supabase/client";
import { listIncompleteRosterCampuses, listPendingChapters, setPendingChapterStatus, type IncompleteRosterCampus, type PendingChapter } from "@/lib/greek-lazy-chapter.functions";

export const Route = createFileRoute("/outreach/chapters")({
  head: () => ({ meta: [{ title: "Member-created chapters — outreach" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PendingChaptersAdmin,
});

function PendingChaptersAdmin() {
  useNavyDocument();
  const [rows, setRows] = useState<PendingChapter[] | null>(null);
  const [incomplete, setIncomplete] = useState<IncompleteRosterCampus[]>([]);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setDenied(true); return; }
    const r = await listPendingChapters({ data: { accessToken: token } });
    // null means "not an admin" — different from an empty queue, and shown differently.
    if (r === null) { setDenied(true); return; }
    setRows(r);
    // The re-collection worklist rides on the same page load; a failure here must never take
    // down the queue, so it degrades to an empty list silently.
    try { setIncomplete((await listIncompleteRosterCampuses({ data: { accessToken: token } })) ?? []); } catch { /* section hides */ }
  };
  useEffect(() => { void load(); }, []);

  const act = async (id: string, action: "approve" | "remove") => {
    setBusy(id);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await setPendingChapterStatus({ data: { accessToken: token, id, action } });
      await load();
    } finally { setBusy(null); }
  };

  if (denied) {
    return (
      <div className="grid min-h-screen place-items-center px-5" style={{ ...frameThemeVars(), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_SANS }}>
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>Sign in as an admin to view member-created chapters.</p>
      </div>
    );
  }

  const pending = (rows ?? []).filter((r) => r.status !== "active");

  return (
    <div className="min-h-screen px-5 py-10" style={{ ...frameThemeVars(), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_SANS }}>
      <div className="mx-auto w-full max-w-[860px]">
        <h1 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Member-created chapters</h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {rows ? `${rows.length} total · ${pending.length} awaiting review` : "Loading…"}
        </p>
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Every one of these already has a working page — a member made it to use it. Approving
          confirms it; removing archives the page rather than deleting it, because the link may
          already be in a group chat.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {(rows ?? []).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl p-3.5" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.12)" }}>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-black">
                  {r.chapterName} <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>· {r.schoolName}</span>
                </p>
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {r.council ?? "no council"} · {new Date(r.createdAt).toLocaleDateString()} · {r.status}
                </p>
              </div>
              <a
                href={`/go/${r.schoolSlug}/${r.chapterSlug}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg px-3 text-[12.5px] font-bold"
                style={{ minHeight: 36, lineHeight: "36px", background: "rgba(252,163,17,0.14)", color: "var(--accent)" }}
              >
                Open page ↗
              </a>
              {r.status !== "active" && (
                <button type="button" disabled={busy === r.id} onClick={() => void act(r.id, "approve")}
                  className="rounded-lg px-3 text-[12.5px] font-bold disabled:opacity-40"
                  style={{ minHeight: 36, background: "rgba(59,245,160,0.14)", color: "#3BF5A0" }}>
                  Approve
                </button>
              )}
              <button type="button" disabled={busy === r.id} onClick={() => void act(r.id, "remove")}
                className="rounded-lg px-3 text-[12.5px] font-bold disabled:opacity-40"
                style={{ minHeight: 36, background: "rgba(245,239,230,0.06)", color: "var(--text-muted)" }}>
                Remove
              </button>
            </div>
          ))}
        </div>

        {rows && !rows.length && (
          <p className="mt-6 text-[13px]" style={{ color: "var(--text-muted)" }}>
            No member-created chapters yet.
          </p>
        )}

        {/* INCOMPLETE ROSTERS — the re-collection worklist from the 66-campus import. These
            campuses' pages all work; their chapter counts are just known to be partial. */}
        {incomplete.length > 0 && (
          <div className="mt-10">
            <h2 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Incomplete rosters</h2>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              {incomplete.length} campuses whose imported Greek roster is known to be partial — counts
              are implausibly low for these systems. Pages work; re-collect when possible.
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {incomplete.map((c) => (
                <div key={c.schoolSlug || c.schoolName} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.1)" }}>
                  <span className="min-w-0 flex-1 text-[13.5px] font-bold">{c.schoolName}</span>
                  <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {c.chapters} chapter{c.chapters === 1 ? "" : "s"}{c.asOf ? ` · as of ${c.asOf}` : ""}
                  </span>
                  {c.schoolSlug && (
                    <a href={`/${c.schoolSlug}`} target="_blank" rel="noreferrer" className="text-[12px] font-bold" style={{ color: "var(--accent)" }}>
                      campus ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
