// /study/dashboard — THROWAWAY student-dashboard prototype for the publish
// pipeline. Lists Start Here's lessons in order with their published lesson video
// (the newest READY lesson_videos row, played via hls.js). Paid lessons (past the
// free-through count) show a visual LOCK — no auth yet, purely a placeholder to
// iterate on. Not the real product; a scaffold to feel the flow end-to-end.
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, PlayCircle } from "lucide-react";

import { fetchJeBrowserTree } from "@/lib/je-api";
import { listPublishedByLabel } from "@/lib/publish.functions";

export const Route = createFileRoute("/study_/dashboard")({
  component: DashboardPrototype,
});

const NAVY = "#14213D";
const GOLD = "#E8B84B";
const FREE_THROUGH = 8; // lessons 1..8 free; the rest locked (visual only)
const COURSE = "Start Here";

/** Minimal hls.js player (public playback id). */
function LessonVideo({ playbackId }: { playbackId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let cancelled = false;
    const url = `https://stream.mux.com/${playbackId}.m3u8`;
    let hls: import("hls.js").default | null = null;
    (async () => {
      const { default: Hls } = await import("hls.js");
      if (cancelled || !ref.current) return;
      if (Hls.isSupported()) { hls = new Hls(); hls.loadSource(url); hls.attachMedia(ref.current); }
      else ref.current.src = url;
    })();
    return () => { cancelled = true; hls?.destroy(); };
  }, [playbackId]);
  return <video ref={ref} controls playsInline preload="metadata" poster={`https://image.mux.com/${playbackId}/thumbnail.jpg?time=1`} className="block w-full rounded-lg" style={{ aspectRatio: "16/9", background: "#000" }} />;
}

/** Extract a chapter number from a lesson label ("Ch 4 · …" → 4). */
const numOf = (s: string | null | undefined): number | null => {
  const m = (s ?? "").match(/\b(\d+)\b/);
  return m ? parseInt(m[1], 10) : null;
};

function DashboardPrototype() {
  const tree = useQuery({ queryKey: ["je-tree"], queryFn: fetchJeBrowserTree, staleTime: 60_000 });
  const published = useQuery({ queryKey: ["published", COURSE], queryFn: () => listPublishedByLabel({ data: { courseName: COURSE } }), staleTime: 20_000 });

  const lessons = useMemo(() => {
    const course = tree.data?.courses.find((c) => c.course_name === COURSE);
    const chapters = (course?.chapters ?? [])
      .filter((ch) => ch.id !== "__unassigned__" && (ch.status ?? "active") !== "archived")
      .slice()
      .sort((a, b) => (a.chapter_number ?? 9999) - (b.chapter_number ?? 9999));
    const byNum = new Map<number, string>();
    for (const p of published.data ?? []) { const n = numOf(p.lesson_label); if (n != null && p.playback_id) byNum.set(n, p.playback_id); }
    return chapters.map((ch, i) => ({
      n: i + 1,
      num: ch.chapter_number,
      title: ch.chapter_name?.trim() || `Lesson ${i + 1}`,
      free: i < FREE_THROUGH,
      playbackId: ch.chapter_number != null ? byNum.get(ch.chapter_number) ?? null : null,
    }));
  }, [tree.data, published.data]);

  return (
    <div style={{ minHeight: "100vh", background: "#0B1322", color: "#F4EFE6", fontFamily: "'Poppins','Inter',system-ui,sans-serif" }}>
      <div className="mx-auto max-w-3xl px-5 py-10">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>Start Here · prototype</div>
        <h1 className="mb-6 text-3xl font-black">Your lessons</h1>
        {(tree.isLoading || published.isLoading) && <p className="text-white/50">loading…</p>}
        <ol className="space-y-5">
          {lessons.map((l) => {
            const locked = !l.free;
            return (
              <li key={l.n} className="overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.1)", background: NAVY }}>
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-black tabular-nums" style={{ background: locked ? "#3A4152" : GOLD, color: locked ? "#9AA6B8" : "#3A2A00" }}>{l.num ?? l.n}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{l.title}</span>
                  {locked && <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ color: "#FFD98A", border: "1px solid rgba(232,184,75,0.5)" }}><Lock className="h-3 w-3" /> study pass</span>}
                </div>
                <div className="px-4 pb-4">
                  {locked ? (
                    <div className="grid place-items-center rounded-lg" style={{ aspectRatio: "16/9", background: "linear-gradient(180deg,#111726,#0a0f1a)", border: "1px dashed rgba(255,255,255,0.12)" }}>
                      <div className="text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
                        <Lock className="mx-auto mb-1 h-6 w-6" />
                        <div className="text-[12px] font-semibold">Requires study pass</div>
                      </div>
                    </div>
                  ) : l.playbackId ? (
                    <LessonVideo playbackId={l.playbackId} />
                  ) : (
                    <div className="grid place-items-center rounded-lg" style={{ aspectRatio: "16/9", background: "#0a0f1a", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="text-center" style={{ color: "rgba(255,255,255,0.35)" }}>
                        <PlayCircle className="mx-auto mb-1 h-6 w-6" />
                        <div className="text-[12px]">Coming soon</div>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-8 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Prototype dashboard — no auth; locks are visual only.</p>
      </div>
    </div>
  );
}
