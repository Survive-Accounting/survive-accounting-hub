// INTRO STING (frames/, C) — the SILENT 1.5s opener. No music, no warp, no reversed audio (the
// video's music/warp is added later by the render worker). Clean like the outro: the "survive"
// wordmark with the boiling bolt as the "i" (dominant, cream) + the byline. Colours read the
// frame theme CSS vars.
//
// Timeline: 0-0.8s the bolt alone boils · 0.8s the wordmark LETTERS SNAP in around the bolt (hard
// cut, no fade) · 1.0-1.5s the byline fades up. Re-mounts on playKey. The byline is a PROP ("Cram
// videos by [tutor]"); topicChip is optional (the player pre-roll).
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { BRAND_DISPLAY } from "@/components/canvas/brand";

const STING_CSS = `
@keyframes sa-sting-snap { from { opacity: 0; } to { opacity: 1; } }
@keyframes sa-sting-byline { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .sa-sting-letters, .sa-sting-byline { animation: none !important; transform: none !important; opacity: 1 !important; }
}`;

export function IntroSting({ byline = "Cram videos by Lee Ingram", topicChip, playKey, scale = 1 }: {
  byline?: string;
  topicChip?: string;
  playKey?: number | string;
  scale?: number;
}) {
  const size = 220; // wordmark cap-height at 1920x1080
  const snap = "sa-sting-snap 1ms linear 800ms both"; // hard cut in at 0.8s (0→1 over 1ms)
  const byl = "sa-sting-byline 500ms ease 1000ms both"; // fade up 1.0-1.5s
  return (
    <div style={{ width: 1920 * scale, height: 1080 * scale, overflow: "hidden", position: "relative", flex: "0 0 auto" }}>
      <div key={playKey} style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", inset: 0 }}>
        <style>{STING_CSS}</style>
        {/* WORDMARK (bolt always boiling; letters snap in at 0.8s) + byline. Clean like the outro —
            no ghosted word behind it; the wordmark + byline carry the frame. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ zIndex: 2, gap: 34 }}>
          <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: size, lineHeight: 1, letterSpacing: "-0.01em", color: "var(--brand-cream, #F5EFE6)", whiteSpace: "nowrap" }}>
            <span className="sa-sting-letters" style={{ animation: snap }}>surv</span>
            <BoltBoil height={size * 0.8} style={{ marginLeft: size * -0.015, marginRight: size * 0.03, transform: `translate(${size * (-1 / 96)}px, ${size * 0.13}px) rotate(2deg)`, transformOrigin: "100% 51%" }} />
            <span className="sa-sting-letters" style={{ animation: snap }}>ve</span>
          </span>
          <div className="sa-sting-byline" style={{ fontFamily: BRAND_DISPLAY, fontWeight: 500, fontSize: 46, letterSpacing: "0.01em", color: "var(--brand-cream, #F5EFE6)", opacity: 0.9, animation: byl }}>{byline}</div>
          {topicChip && <div className="sa-sting-byline" style={{ marginTop: 6, borderRadius: 999, padding: "6px 20px", fontFamily: BRAND_DISPLAY, fontWeight: 800, fontSize: 26, letterSpacing: "0.06em", textTransform: "uppercase", color: "#0B1322", background: "var(--accent, #FCA311)", animation: byl }}>{topicChip}</div>}
        </div>
      </div>
    </div>
  );
}
