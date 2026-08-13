// OUTRO STING (frames/, D) — three elements, existing hierarchy: the survive⚡ wordmark
// (dominant), the tagline (medium), and the URL (small, ~65% opacity, its OWN beat with generous
// space above it). NO separate "ACCOUNTING" line — the URL already carries the word (this differs
// deliberately from the intro). Two `line` variants pick the tagline for different audiences.
//
// Animation: the wordmark is present from the start (bolt boils throughout); the tagline fades up
// (200ms), then the URL fades up ~180ms after it — staggered, never simultaneous. Orbital bg is
// the frame's job. Colours read the frame theme CSS vars. Re-mounts on playKey.
import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { BRAND_DISPLAY } from "@/components/canvas/brand";

export type OutroLine = "exam" | "retake";
export const OUTRO_LINE_TAGLINE: Record<OutroLine, string> = {
  exam: "Only what’s on your exam.",          // student-facing
  retake: "Because retaking isn’t an option.", // parent-facing
};

const OUTRO_CSS = `
@keyframes sa-outro-tag { from { opacity: 0; transform: translateY(12px); } to { opacity: 0.92; transform: none; } }
@keyframes sa-outro-url { from { opacity: 0; transform: translateY(12px); } to { opacity: 0.65; transform: none; } }
@media (prefers-reduced-motion: reduce) { .sa-outro-el { animation: none !important; transform: none !important; } }`;

export function OutroSting({ line = "exam", tagline, url = "surviveaccounting.com", playKey, scale = 1 }: {
  line?: OutroLine;
  tagline?: string;
  url?: string;
  playKey?: number | string;
  scale?: number;
}) {
  const tag = (tagline && tagline.trim()) || OUTRO_LINE_TAGLINE[line];
  return (
    <div style={{ width: 1920 * scale, height: 1080 * scale, overflow: "hidden", position: "relative", flex: "0 0 auto" }}>
      <div key={playKey} style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", inset: 0 }}>
        <style>{OUTRO_CSS}</style>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <SurviveWordmark size={200} />
          <div className="sa-outro-el" style={{ marginTop: 40, fontFamily: BRAND_DISPLAY, fontWeight: 500, fontSize: 54, letterSpacing: "0.01em", color: "var(--brand-cream, #F5EFE6)", opacity: 0.92, animation: "sa-outro-tag 200ms ease 150ms both" }}>{tag}</div>
          {/* URL — its own beat: generous space above, small + quiet, staggered after the tagline. */}
          <div className="sa-outro-el" style={{ marginTop: 104, fontFamily: BRAND_DISPLAY, fontWeight: 600, fontSize: 34, letterSpacing: "0.05em", color: "var(--brand-cream, #F5EFE6)", opacity: 0.65, animation: "sa-outro-url 180ms ease 430ms both" }}>{url}</div>
        </div>
      </div>
    </div>
  );
}
