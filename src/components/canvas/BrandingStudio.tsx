// BRANDING STUDIO — the workspace behind the "Branding Portal" frame (mirrors how the CEQ Portal
// opens the CEQ Studio). A gallery of the REUSABLE brand frames Lee drops into every video: the
// intro sting, the outro, the CEQ hook and the tease. Each tile is a LIVE preview built from the
// shared frames/ library (so it can never drift from what actually renders), on one of the three
// brand gradients — chosen to vary attention: "deep" pulls the eye to CENTER (vignette), "orbital"
// gives structured depth, "nebula" adds colour off to a corner. Blank "＋" slots are placeholders
// for the frames Lee will add here later. Read-only for now (view + replay); editing comes later.
import { useEffect, useState } from "react";
import { X, Plus, RotateCw } from "lucide-react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { BRAND_DISPLAY } from "@/components/canvas/brand";
import { FrameStage, IntroFrame, OutroFrame, type FrameBgVariant } from "@/components/frames";

const TILE_W = 460;
const TILE_H = Math.round((TILE_W * 9) / 16);
const SCALE = TILE_W / 1920;

const PANEL = "#0C1220";
const BORDER = "rgba(148,163,184,0.18)";
const CREAM = "#F5EFE6";
const MUTED = "rgba(226,232,240,0.55)";

/** One gallery tile: a fixed-size 16:9 live preview + a label/caption footer. */
function Tile({ label, note, badge, children }: { label: string; note: string; badge: string; children: React.ReactNode }) {
  return (
    <div style={{ width: TILE_W, borderRadius: 16, overflow: "hidden", background: "#0A0F1C", border: `1px solid ${BORDER}`, boxShadow: "0 18px 50px -22px rgba(0,0,0,0.8)" }}>
      <div style={{ width: TILE_W, height: TILE_H, position: "relative", overflow: "hidden" }}>{children}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 800, fontSize: 15, color: CREAM, letterSpacing: "0.01em" }}>{label}</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{note}</div>
        </div>
        <span style={{ flex: "0 0 auto", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#06121A", background: "#4FA3E3", borderRadius: 999, padding: "3px 9px" }}>{badge}</span>
      </div>
    </div>
  );
}

/** The CEQ-hook / tease preview content, authored at 1920×1080 and scaled by FrameStage. */
function HookContent({ withBolt }: { withBolt: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: withBolt ? 90 : 0, justifyContent: "center", width: 1560 }}>
      {withBolt && <BoltBoil height={300} />}
      <div style={{ textAlign: withBolt ? "left" : "center" }}>
        <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 700, fontSize: 44, letterSpacing: "0.14em", textTransform: "uppercase", color: CREAM, opacity: 0.6 }}>Common Exam Questions</div>
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 24 }}>
          {["Which account gets debited?", "Is it a permanent account?", "Where does it land on the statements?"].map((b, i) => (
            <div key={i} style={{ fontFamily: BRAND_DISPLAY, fontWeight: 800, fontSize: 58, lineHeight: 1.05, color: CREAM, display: "flex", alignItems: "baseline", gap: 22, justifyContent: withBolt ? "flex-start" : "center" }}>
              <span style={{ color: "var(--accent, #FCA311)", fontSize: 32 }}>•</span>{b}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BrandingStudio({ onClose }: { onClose: () => void }) {
  const [playKey, setPlayKey] = useState(0);
  const replay = () => setPlayKey((n) => n + 1);

  // Esc closes — capture phase so it wins over the canvas's global key handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const stage = (bg: FrameBgVariant, withBolt: boolean) => (
    <FrameStage scale={SCALE} background={bg} bgIntensity={0.32}><HookContent withBolt={withBolt} /></FrameStage>
  );

  return (
    <div className="fixed inset-0" style={{ zIndex: 80, background: "rgba(4,7,14,0.72)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div
        className="absolute left-1/2 top-1/2 flex flex-col"
        style={{ transform: "translate(-50%,-50%)", width: "min(1200px, 94vw)", height: "min(88vh, 900px)", background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 20, boxShadow: "0 40px 120px -30px rgba(0,0,0,0.9)", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderBottom: `1px solid ${BORDER}` }}>
          <BoltBoil height={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 20, color: CREAM, letterSpacing: "0.01em" }}>Branding Studio</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>Reusable frames for every video — intro · outro · CEQ hook · tease. Add more anytime.</div>
          </div>
          <button onClick={replay} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-white/10" style={{ color: CREAM, border: `1px solid ${BORDER}` }} title="Replay the animated previews">
            <RotateCw className="h-3.5 w-3.5" /> Replay
          </button>
          <button onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-white/10" style={{ color: CREAM }} title="Close Branding Studio (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Gallery */}
        <div className="nowheel" style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center" }}>
            <Tile label="Intro sting" note="Silent 1.5s opener — center focus" badge="Intro">
              <IntroFrame scale={SCALE} background="deep" playKey={`intro-${playKey}`} />
            </Tile>
            <Tile label="Outro" note="Wordmark · tagline · surviveaccounting.com" badge="Outro">
              <OutroFrame scale={SCALE} background="orbital" line="exam" playKey={`outro-${playKey}`} />
            </Tile>
            <Tile label="CEQ hook" note="Boiling bolt + the questions to come" badge="Hook">
              {stage("nebula", true)}
            </Tile>
            <Tile label="CEQ tease" note="The questions alone — no bolt" badge="Tease">
              {stage("deep", false)}
            </Tile>

            {/* Blank placeholders — Lee adds reusable frames here later. */}
            {[0, 1].map((i) => (
              <div key={i} style={{ width: TILE_W }}>
                <div className="grid place-items-center" style={{ width: TILE_W, height: TILE_H, borderRadius: 16, border: `2px dashed ${BORDER}`, background: "rgba(148,163,184,0.03)", color: MUTED }}>
                  <div className="flex flex-col items-center gap-2">
                    <Plus className="h-7 w-7" style={{ opacity: 0.6 }} />
                    <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 700, fontSize: 14 }}>Add branding frame</div>
                    <div style={{ fontSize: 11 }}>Coming soon</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
