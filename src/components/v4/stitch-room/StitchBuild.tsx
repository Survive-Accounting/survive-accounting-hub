// THE BUILD — a video being stitched, live. Lee, 2026-09-15: "some kind of cool animation (with the animated bolt)
// that's building the timeline of stitches in real time and showing me what's going on. The bolt is shooting
// its electricity (like what we see in the outro clip we made) onto the timeline as it's being built. This is an
// exciting moment." The outro's own chain lightning (brand-cards/ChainLightning) strikes from the boiling bolt
// to the clip being worked on — again at every milestone, and on a slow pulse while it waits on the worker.
// With the animation off (the ⚙), the same timeline and words, no bolt.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { ChainLightning } from "@/components/brand-cards/ChainLightning";
import type { Rect } from "@/components/brand-cards/chain-lightning";
import { money, PAY_PER_SLIDE_CENTS } from "@/lib/film-stitch";

import type { StitchJob } from "../../blastoff/capture/stitch-queue";
import { ROOM } from "./room-theme";

const STATE_WORDS: Record<StitchJob["state"], string> = {
  waiting: "Waiting its turn",
  uploading: "Sending the takes",
  waking: "Waking the joiner",
  stitching: "Cutting the pauses · stitching",
  saving: "Saving",
  done: "Stitched",
  error: "Stopped",
};

export function StitchBuild({ job, animate }: { job: StitchJob; animate: boolean }) {
  const host = useRef<HTMLDivElement | null>(null);
  const boltRef = useRef<HTMLDivElement | null>(null);
  const segRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [rects, setRects] = useState<{ bolt: Rect | null; target: Rect | null }>({ bolt: null, target: null });
  const [pulse, setPulse] = useState(0);
  const [now, setNow] = useState(Date.now());
  // reduced motion: the timeline and words only (the strike would sit frozen over the text)
  const [calm, setCalm] = useState(false);
  useEffect(() => { try { setCalm(window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { /* motion stays */ } }, []);

  const live = job.state !== "done" && job.state !== "error";
  const activeIdx = (() => {
    const working = job.segments.findIndex((s) => s.state === "uploading" || s.state === "joining");
    if (working >= 0) return working;
    if (job.state === "done") return job.segments.length - 1;
    const firstWaiting = job.segments.findIndex((s) => s.state === "waiting");
    return firstWaiting >= 0 ? firstWaiting : job.segments.length - 1;
  })();

  // the clock, and a slow re-strike while the worker grinds
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    const p = window.setInterval(() => setPulse((n) => n + 1), 2600);
    return () => { window.clearInterval(t); window.clearInterval(p); };
  }, [live]);

  useLayoutEffect(() => {
    const measure = () => {
      const h = host.current;
      if (!h) return;
      const o = h.getBoundingClientRect();
      const rel = (el: Element | null | undefined): Rect | null => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }; };
      setBox({ w: o.width, h: o.height });
      setRects({ bolt: rel(boltRef.current), target: rel(segRefs.current[Math.max(0, activeIdx)]) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (host.current) ro.observe(host.current);
    return () => ro.disconnect();
  }, [activeIdx, job.segments.length]);

  const totalSlides = job.segments.reduce((n, s) => n + s.slides, 0) || 1;
  const elapsed = job.startedAt ? ((job.finishedAt ?? now) - job.startedAt) / 1000 : 0;
  const joined = job.segments.filter((s) => s.state === "joined").length;
  const sent = job.segments.filter((s) => s.state !== "waiting" && s.state !== "uploading").length;

  return (
    <div ref={host} style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "radial-gradient(120% 90% at 20% 10%, #16244A 0%, #0A1024 55%, #05070F 100%)", border: `1px solid ${ROOM.edge}`, padding: "28px 28px 34px", minHeight: 420, display: "flex", flexDirection: "column", gap: 22 }}>
      <style>{BUILD_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div ref={boltRef} className={animate && live ? "sa-sb-bolt" : undefined} style={{ flex: "none", filter: animate ? "drop-shadow(0 0 18px rgba(125,211,252,0.55))" : undefined }}>
          {animate ? <BoltBoil height={120} boilSeconds={0.9} /> : <BoltBoil height={120} boilFrame={0} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.18em", fontWeight: 800, color: job.state === "error" ? ROOM.red : ROOM.gold }}>{STATE_WORDS[job.state].toUpperCase()}</div>
          <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.05, color: ROOM.cream }}>{job.name || job.setName}</div>
          <div style={{ fontSize: 13, color: ROOM.muted }}>{job.setName} · Video {job.takeIndex + 1} · {job.segments.length} clip{job.segments.length === 1 ? "" : "s"} · {job.slides} slide{job.slides === 1 ? "" : "s"}</div>
          <div style={{ fontSize: 13, color: ROOM.sky, fontVariantNumeric: "tabular-nums" }}>{job.note}{live && job.startedAt ? ` · ${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}` : ""}</div>
        </div>
      </div>

      {/* THE TIMELINE: one block per clip, as wide as its slides */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: ROOM.muted, letterSpacing: "0.08em", fontWeight: 700 }}>
          <span>SENT {sent} / {job.segments.length}</span>
          <span>STITCHED {joined} / {job.segments.length}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "stretch", height: 64 }}>
          {job.segments.map((s, i) => {
            const on = s.state === "joined";
            const working = s.state === "uploading" || s.state === "joining";
            const bg = on ? "linear-gradient(180deg, #FFD36B, #FCA311)" : s.state === "uploaded" || s.state === "joining" ? "linear-gradient(180deg, #7DD3FC55, #0EA5E933)" : "rgba(255,255,255,0.04)";
            return (
              <div key={i} ref={(el) => { segRefs.current[i] = el; }}
                className={[working && animate ? "sa-sb-working" : "", on && animate ? "sa-sb-joined" : ""].join(" ")}
                style={{ flex: `${Math.max(1, s.slides)} 1 0`, minWidth: 18, borderRadius: 8, background: bg, border: `1px solid ${on ? "#FFD36B" : working ? ROOM.sky : ROOM.edge}`, display: "flex", alignItems: "flex-end", padding: "0 6px 5px", overflow: "hidden", position: "relative" }}
                title={s.label}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: on ? "#14213D" : ROOM.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
              </div>
            );
          })}
        </div>
        <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round((job.segments.filter((s) => s.state === "joined").reduce((n, s) => n + s.slides, 0) / totalSlides) * 100)}%`, background: ROOM.gold, transition: "width 600ms" }} />
        </div>
      </div>

      {job.state === "done" && (
        <div className={animate ? "sa-sb-pay" : undefined} style={{ alignSelf: "flex-start", fontSize: 18, fontWeight: 900, color: ROOM.mint }}>
          +{money(job.slides * PAY_PER_SLIDE_CENTS)} · {job.slides} slide{job.slides === 1 ? "" : "s"} at {money(PAY_PER_SLIDE_CENTS)}
        </div>
      )}
      {job.error && <div style={{ color: ROOM.red, fontSize: 13 }}>{job.error}</div>}

      {animate && !calm && box.w > 0 && (live || job.state === "done") && (
        <ChainLightning key={`${job.strike}-${live ? pulse : "end"}`} active={live || job.strike > 0} flamed={job.state === "done"}
          from={rects.bolt} to={rects.target} w={box.w} h={box.h} seed={7 + job.strike * 13 + pulse} />
      )}
    </div>
  );
}

const BUILD_CSS = `
@keyframes sa-sb-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
.sa-sb-bolt { animation: sa-sb-float 2.4s ease-in-out infinite; }
@keyframes sa-sb-work { 0%,100% { box-shadow: 0 0 0 0 rgba(125,211,252,0.0) } 50% { box-shadow: 0 0 22px 2px rgba(125,211,252,0.55) } }
.sa-sb-working { animation: sa-sb-work 1.2s ease-in-out infinite; }
@keyframes sa-sb-lock { 0% { transform: scaleY(0.6); filter: brightness(2.2) } 100% { transform: scaleY(1); filter: brightness(1) } }
.sa-sb-joined { animation: sa-sb-lock 520ms cubic-bezier(0.2, 0.9, 0.3, 1.2); box-shadow: 0 0 16px rgba(252,163,17,0.45); }
@keyframes sa-sb-pay { 0% { transform: translateY(8px) scale(0.9); opacity: 0 } 100% { transform: none; opacity: 1 } }
.sa-sb-pay { animation: sa-sb-pay 600ms 200ms both cubic-bezier(0.2, 0.9, 0.3, 1.3); }
@media (prefers-reduced-motion: reduce) { .sa-sb-bolt, .sa-sb-working, .sa-sb-joined, .sa-sb-pay { animation: none; } }
`;
