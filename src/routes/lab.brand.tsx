// /lab/brand — the brand-animation tuning desk (dev lab, noindex). Both pieces mount
// STANDALONE here, per docs/BRAND-ANIMATION.md: the wordmark under a progress scrubber (the
// component is a pure function of progress — this page proves it), and the campus globe on the
// same live data the campaign page uses, plus a clearly-labelled sample-arcs toggle so arc
// styling can be judged before any real claim event exists.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, frameThemeVars } from "@/components/frames";
import { AnimatedWordmark } from "@/components/brand/AnimatedWordmark";
import { CampusGlobe, GlobeLegend } from "@/components/brand/CampusGlobe";
import { getGlobeData } from "@/lib/globe/campus-globe.functions";

export const Route = createFileRoute("/lab/brand")({
  head: () => ({ meta: [{ title: "Brand lab — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: BrandLab,
});

function BrandLab() {
  const [t, setT] = useState(1);
  const [showAcct, setShowAcct] = useState(true);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  // THE DRIVER LIVES IN THE PAGE, NOT THE COMPONENT — the lab feeds progress like Remotion
  // would, which is the whole contract being previewed.
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now();
    const dur = 2600;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setT(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const globeQ = useQuery({ queryKey: ["globe-data"], queryFn: () => getGlobeData(), staleTime: 300_000, networkMode: "always" });
  const [sampleArcs, setSampleArcs] = useState(false);

  const CARD: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 16, padding: 20 };

  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--bg-page)", color: "var(--brand-cream)", minHeight: "100vh", fontFamily: BRAND_SANS }}>
      <main className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-5 py-10">
        <h1 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Brand lab</h1>

        <section style={CARD}>
          <h2 className="mb-4 text-[15px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Animated wordmark</h2>
          <div className="grid place-items-center py-6" style={{ minHeight: 220 }}>
            <AnimatedWordmark progress={t} showAccounting={showAcct} size={104} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => { setT(0); setPlaying(true); }}
              className="rounded-lg px-4 text-[13px] font-black"
              style={{ minHeight: 40, background: "var(--accent)", color: "#0B1220" }}
            >
              {playing ? "Drawing…" : "▶ Play"}
            </button>
            <label className="flex min-w-[220px] flex-1 items-center gap-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              progress
              <input type="range" min={0} max={1} step={0.005} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} className="flex-1" />
              <span className="tabular-nums">{t.toFixed(2)}</span>
            </label>
            <label className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              <input type="checkbox" checked={showAcct} onChange={(e) => setShowAcct(e.target.checked)} />
              accounting line
            </label>
          </div>
          <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Pure function of the slider — scrub it: same value, same frame. Letterforms live in
            wordmark-glyphs.ts; tweak numbers, eyeball here.
          </p>
        </section>

        <section style={CARD}>
          <h2 className="mb-1 text-[15px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Campus globe</h2>
          <p className="mb-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Live data from campuses.campus_status — the same counts the campaign page shows.
          </p>
          {globeQ.data ? (
            <>
              <CampusGlobe data={globeQ.data} height={440} sampleArcs={sampleArcs} eager />
              <div className="mt-3"><GlobeLegend data={globeQ.data} /></div>
              <label className="mt-3 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                <input type="checkbox" checked={sampleArcs} onChange={(e) => setSampleArcs(e.target.checked)} />
                sample arcs — visual preview between live campuses, NOT real events (lab only)
              </label>
            </>
          ) : (
            <p className="py-10 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              {globeQ.isError ? "Couldn't load campus data." : "Loading campus data…"}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
