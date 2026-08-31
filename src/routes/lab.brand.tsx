// /lab/brand — the brand-animation tuning desk (dev lab, noindex). The campus globe mounts
// STANDALONE here on the same live data the campaign page uses, plus a clearly-labelled
// sample-arcs toggle so arc styling can be judged before any real claim event exists.
//
// (The drawn-wordmark scrubber that used to share this page was rejected 2026-08-31 along with
// the drawn wordmark — docs/BRAND-ANIMATION.md. The /learn intro uses the real boiling
// SurviveWordmark now, which needs no tuning desk.)
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, frameThemeVars } from "@/components/frames";
import { CampusGlobe, GlobeLegend } from "@/components/brand/CampusGlobe";
import { getGlobeData } from "@/lib/globe/campus-globe.functions";

export const Route = createFileRoute("/lab/brand")({
  head: () => ({ meta: [{ title: "Brand lab — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: BrandLab,
});

function BrandLab() {
  const globeQ = useQuery({ queryKey: ["globe-data"], queryFn: () => getGlobeData(), staleTime: 300_000, networkMode: "always" });
  const [sampleArcs, setSampleArcs] = useState(false);

  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--bg-page)", color: "var(--brand-cream)", minHeight: "100vh", fontFamily: BRAND_SANS }}>
      <main className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-5 py-10">
        <h1 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Brand lab</h1>

        <section style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 16, padding: 20 }}>
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
