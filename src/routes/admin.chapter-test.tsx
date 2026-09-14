// /admin/chapter-test — THE EXEC TEST DASHBOARD (Lee, 2026-09-14: "Can you give me a test exec
// dashboard I can use for testing? Like, that I can access at any time?"). The real chapter
// dashboard (/chapters/dashboard) opened by an admin on "Exec Test Chapter" at Test University: no
// magic link, no claim. The chapter is created on first open (and again after a test purge), and
// nothing pressed here emails or texts anyone. Server half: lib/chapter-dashboard.functions.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { BRAND_DISPLAY } from "@/components/canvas/brand";
import { getChapterHome, type ChapterHome } from "@/lib/chapter-dashboard.functions";
import { Dashboard } from "@/components/site/ChapterDashboard";

export const Route = createFileRoute("/admin/chapter-test")({
  head: () => ({ meta: [{ title: "Exec test dashboard — Survive Accounting" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => <AdminGate><ExecTestDashboard /></AdminGate>,
});

function ExecTestDashboard() {
  const [data, setData] = useState<ChapterHome | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void getChapterHome({ data: { preview: true } })
      .then((d) => { if (d) setData(d); else setErr("The test chapter didn't load."); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>
      <main style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto", padding: "24px 20px 0" }}>
        <p className="mb-3 rounded-xl px-3 py-2 text-center text-[12.5px] font-bold" style={{ background: "rgba(252,163,17,0.14)", border: "1px solid rgba(252,163,17,0.45)", color: "var(--brand-cream)" }}>
          Exec test dashboard: what a chair sees after claiming. Test data only; nothing here notifies anyone.
        </p>
        {err && <p className="text-center text-[13px]" style={{ color: "#F3C6CC" }}>{err}</p>}
        {!data && !err && <p className="text-center text-[13px] italic" style={{ color: "var(--text-muted)" }}>Loading…</p>}
        {data && <Dashboard data={data} auth={{ preview: true }} onChange={setData} />}
      </main>
    </div>
  );
}
