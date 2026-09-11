// THE END-OF-TOPIC FRAMES — Topic Complete and Up Next, two full-frame kinds drawn through
// PhoneFrame like every other slide (the Editor thumbnails, the Review stage, the film pop-out).
//
// Prompt 3 of the Editor session brief (2026-09-11), matched to end-of-topic-frames.html:
//
//   TOPIC COMPLETE — the small wordmark top-left, chip "Topic complete", the topic's name, a
//   segmented charge bar (one segment per topic in the exam, done ones filled amber→red, the
//   newest animating its fill), "X of Y topics charged", then a card: chip "Your move", "Now go
//   practice", one line, the red "Start practice questions" pill.
//
//   UP NEXT — the small wordmark, chip "Up next", the NEXT topic's name, a subtitle, and the
//   rubric block in arrows mode auto-cycling borrow → supplies → services on account → rent
//   every ~3 s. The frame marks the start of a skippable segment (plan.ts `segment`).
//
// THE WORDS ARE THE BANK'S. The topic, X of Y and the next topic come from useBank() through
// end-of-topic.ts — never typed, so the slide can't say "3 of 10" on a ten-topic exam that
// became twelve. The only typed lines are the card's one line and Up Next's subtitle
// (frame.text), each with the mockup's copy as its default. A set the bank doesn't know is a
// loud red frame, not a blank one.
//
// GEOMETRY. Phone units for the 306-wide stage, times k = w / 306, the way RubricFrame does
// it. The camera is the CORNER bubble (layout.camDefault) — top-right, .73w–.95w, down to
// ~.235h — so the header block (chip + title) keeps to a 195-unit column that clears it, and
// only the bar and the card below it take the safe column's full width. Both stacks end above
// the caption rail (.61h); end-of-topic-frames.test.ts pins the numbers.
//
// MOTION. The charge bar's newest segment fills (and zaps) and the Up Next rubric cycles ONLY
// on the film surface (`live`); the Editor stage, the thumbnails and the next-slide preview
// show the settled state. The cycle is wall-clock on purpose — the brief asks for "every ~3 s"
// and the slide is a tease behind Lee's voice, not a captured animation. Reduced motion:
// settled, no cycle.
import { useEffect, useState } from "react";

import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { useBank } from "@/components/v3/use-bank";

import { watermarkSpot } from "./capture/webcam-spots";
import { TOPIC_DONE_COPY, UP_NEXT_COPY, UP_NEXT_DEMO, UP_NEXT_EVERY_MS, demoIndexAt, topicProgress, upNextFor } from "./end-of-topic";
import type { BlastFrame } from "./plan";
import { RubricFrame } from "./RubricFrame";
import { applyPreset, emptyRubric } from "./rubric";
import { BRAND_FONT, DISPLAY_FONT } from "./stage";

const GOLD = "#FCA311";
const RED = "#EF4B3F";
const MUTED = "#8C9BBA";
const CARD = "#152241";
const CARD_EDGE = "#8A6A2A";
const SEG_BG = "#17223C";
const BAD = "#FF8A80";

/** The layout, in phone units. */
export const END_OF_TOPIC_GEOM = {
  left: 15, top: 65, w: 242,
  /** The chip + title column that stays clear of the corner camera (.73w = 223 units). */
  headerW: 195,
  chipH: 20, titleSize: 22, subtitleSize: 12,
  barH: 14, barGap: 4, noteSize: 11,
  card: { pad: 12, radius: 12, headingSize: 19, lineSize: 11.5, ctaSize: 14, ctaPad: 9 },
  /** Up Next: the rubric block is drawn at this fraction of the stage's k so it ends above the rail. */
  rubricScale: 0.9,
} as const;

const CHARGE_CSS = `
@keyframes sa-charge-fill { to { transform: scaleX(1); } }
@keyframes sa-charge-zap { 0%, 86%, 100% { filter: none; } 90% { filter: brightness(1.9); } 94% { filter: brightness(1); } 96% { filter: brightness(1.7); } }
.sa-charge-seg { transform: scaleX(0); transform-origin: left; animation: sa-charge-fill 900ms cubic-bezier(0.3, 0.8, 0.3, 1) forwards; }
.sa-charge-seg.sa-charge-last { animation: sa-charge-fill 1100ms 350ms cubic-bezier(0.3, 0.8, 0.3, 1) forwards, sa-charge-zap 2400ms 1500ms infinite; }
@media (prefers-reduced-motion: reduce) { .sa-charge-seg, .sa-charge-seg.sa-charge-last { animation: none; transform: scaleX(1); } }`;

function reducedMotion(): boolean {
  try { return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function Chip({ text, k }: { text: string; k: number }) {
  return <span style={{ display: "inline-block", fontFamily: BRAND_FONT, fontWeight: 800, fontSize: 9.5 * k, lineHeight: 1, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, border: `1px solid rgba(252,163,17,0.45)`, background: "rgba(252,163,17,0.08)", borderRadius: 5 * k, padding: `${5 * k}px ${7 * k}px` }}>{text}</span>;
}

/** The frame's shell: black, w × 16:9·w, the small wordmark top-left at the watermark's own spot
 *  (full opacity — on these slides it is the mini logo, not a watermark). */
export function Shell({ w, k, children }: { w: number; k: number; children: React.ReactNode }) {
  const h = Math.round(w * 16 / 9);
  const wm = watermarkSpot(w);
  return (
    <div style={{ position: "relative", width: w, height: h, background: "transparent", overflow: "hidden", fontFamily: BRAND_FONT, color: BRAND_CREAM }}>
      <div style={{ position: "absolute", left: wm.left, top: wm.top, pointerEvents: "none" }}><SurviveWordmark size={wm.size} boilSeconds={1.2} /></div>
      <div style={{ position: "absolute", left: END_OF_TOPIC_GEOM.left * k, top: END_OF_TOPIC_GEOM.top * k, width: END_OF_TOPIC_GEOM.w * k, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        {children}
      </div>
    </div>
  );
}

/** The fail-loud block (red), or — `quiet` — the beat while the cached bank promise resolves on
 *  a fresh mount (every thumbnail, the hover peek): muted, so it never reads as an error. */
export function Loud({ w, k, text, quiet = false }: { w: number; k: number; text: string; quiet?: boolean }) {
  const ink = quiet ? MUTED : BAD;
  return (
    <Shell w={w} k={k}>
      <div style={{ boxSizing: "border-box", width: "100%", border: `${Math.max(1, 2 * k)}px solid ${ink}`, borderRadius: 12 * k, padding: 14 * k, fontWeight: 700, fontSize: 13 * k, lineHeight: 1.3, color: ink, background: quiet ? "transparent" : "rgba(255,138,128,0.08)" }}>{text}</div>
    </Shell>
  );
}

/** The bank, or the reason the slide can't draw yet (`quiet` while it is merely loading). */
export function useBankOrReason(): { topics: ReturnType<typeof useBank>["topics"]; reason: string | null; quiet: boolean } {
  const { topics, error } = useBank();
  if (error) return { topics: null, reason: `The bank didn't load: ${error}`, quiet: false };
  if (!topics) return { topics: null, reason: "Loading the bank…", quiet: true };
  return { topics, reason: null, quiet: false };
}

export function TopicDoneFrame({ w, set, frame, live = false }: { w: number; set: BoothSetInfo; frame: BlastFrame; live?: boolean }) {
  const k = w / 306;
  const G = END_OF_TOPIC_GEOM;
  const { topics, reason, quiet } = useBankOrReason();
  if (!topics) return <Loud w={w} k={k} text={reason ?? "No bank."} quiet={quiet} />;
  const prog = topicProgress(topics, set.id);
  if (!prog) return <Loud w={w} k={k} text={`"${set.name}" isn't on an exam topic in the bank — Topic Complete has nothing to charge.`} />;
  const line = frame.text?.trim() || TOPIC_DONE_COPY.line;
  return (
    <Shell w={w} k={k}>
      {live && <style>{CHARGE_CSS}</style>}
      <div style={{ width: G.headerW * k }}>
        <Chip text={TOPIC_DONE_COPY.chip} k={k} />
        <div style={{ marginTop: 8 * k, fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: G.titleSize * k, lineHeight: 1.05, color: BRAND_CREAM, textWrap: "balance" as never }}>{prog.topic.name}</div>
      </div>
      {/* THE CHARGE BAR: one segment per exam topic; the done ones amber→red, the newest fills last and zaps. */}
      <div data-sa-charge="" style={{ marginTop: 10 * k, width: "100%", height: G.barH * k, display: "grid", gridTemplateColumns: `repeat(${prog.total}, 1fr)`, gap: G.barGap * k }}>
        {Array.from({ length: prog.total }, (_, i) => {
          const charged = i < prog.done, last = i === prog.done - 1;
          return (
            <div key={i} data-charged={charged ? "" : undefined} style={{ position: "relative", borderRadius: 4 * k, background: SEG_BG, overflow: "hidden" }}>
              {charged && <i className={live ? `sa-charge-seg${last ? " sa-charge-last" : ""}` : undefined} style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${GOLD}, ${RED})`, display: "block" }} />}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 6 * k, fontSize: G.noteSize * k, color: MUTED }}>{TOPIC_DONE_COPY.note(prog.done, prog.total)}</div>
      <div style={{ boxSizing: "border-box", marginTop: 12 * k, width: "100%", background: CARD, border: `${Math.max(1, 1.5 * k)}px solid ${CARD_EDGE}`, borderRadius: G.card.radius * k, padding: `${G.card.pad * k}px ${(G.card.pad + 2) * k}px ${(G.card.pad + 1) * k}px` }}>
        <Chip text={TOPIC_DONE_COPY.yourMove} k={k} />
        <div style={{ margin: `${8 * k}px 0 ${5 * k}px`, fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: G.card.headingSize * k, lineHeight: 1.1 }}>{TOPIC_DONE_COPY.heading}</div>
        <div style={{ fontSize: G.card.lineSize * k, lineHeight: 1.4, color: "#C9D1E3" }}>{line}</div>
        <div style={{ boxSizing: "border-box", marginTop: 10 * k, width: "100%", background: RED, borderRadius: 999, padding: `${G.card.ctaPad * k}px 0`, textAlign: "center", fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: G.card.ctaSize * k, color: "#FFFFFF", boxShadow: `0 0 ${22 * k}px rgba(239,75,63,0.45)` }}>{TOPIC_DONE_COPY.cta}</div>
      </div>
    </Shell>
  );
}

export function UpNextFrame({ w, set, frame, live = false }: { w: number; set: BoothSetInfo; frame: BlastFrame; live?: boolean }) {
  const k = w / 306;
  const G = END_OF_TOPIC_GEOM;
  const { topics, reason, quiet } = useBankOrReason();
  // The demo: which of the four transactions is up. Ticks only on film, and not under reduced motion.
  const [tick, setTick] = useState(0);
  const cycling = live && !reducedMotion();
  useEffect(() => {
    if (!cycling) { setTick(0); return; }
    const t0 = Date.now();
    const id = window.setInterval(() => setTick(demoIndexAt(Date.now() - t0)), 250);
    return () => window.clearInterval(id);
  }, [cycling]);
  if (!topics) return <Loud w={w} k={k} text={reason ?? "No bank."} quiet={quiet} />;
  const next = upNextFor(topics, set.id);
  if (!next) return <Loud w={w} k={k} text={`"${set.name}" is the last set in the bank — there is no next topic to tease.`} />;
  const subtitle = frame.text?.trim() || next.set.name;
  const spec = applyPreset(emptyRubric(), UP_NEXT_DEMO[tick]);
  return (
    <Shell w={w} k={k}>
      <div style={{ width: G.headerW * k }}>
        <Chip text={UP_NEXT_COPY.chip} k={k} />
        <div style={{ marginTop: 7 * k, fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: G.titleSize * k, lineHeight: 1.05, color: BRAND_CREAM, textWrap: "balance" as never }}>{next.topic.name}</div>
        <div style={{ marginTop: 3 * k, fontSize: G.subtitleSize * k, color: MUTED }}>{subtitle}</div>
      </div>
      <div style={{ marginTop: 12 * k }}>
        <RubricFrame spec={spec} k={k * G.rubricScale} live={live} popKey={cycling ? `demo-${tick}` : undefined} />
      </div>
    </Shell>
  );
}

/** Exposed for the layout test: the demo's period, so a change here is a deliberate one. */
export const UP_NEXT_PERIOD_MS = UP_NEXT_EVERY_MS;
