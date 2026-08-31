// BLAST-OFF FRAMES — the vertical (9:16) card family every Blast Off opens,
// punctuates and closes with. Filming spec, Lee 2026-08-30.
//
// THE RULES THESE ALL OBEY
//  · 1080x1920 ONLY. There is no landscape variant here — the landscape brand
//    cards already exist in brand-cards/ and are untouched.
//  · ONE BOLT PER CARD, and it is the "i" in surv[bolt]ve. Lee's call: a second
//    standalone bolt above the wordmark reads as two logos. SurviveWordmark is
//    the whole lockup; nothing else draws a bolt.
//  · NO WALL-CLOCK MOTION. Every animated thing takes a `progress` (0..1) and
//    derives its look from it, so the same progress always renders the same
//    pixels. That is what lets these be rendered offline later instead of
//    screen-captured. Pass nothing and you get a still first frame.
//  · Each card MOUNTS STANDALONE — no router, no canvas, no context beyond the
//    optional BoltContext. `/blastoff-demo` mounts every one of them bare.
//
// SAFE AREAS come from canvas/orientation.ts (the one module that knows what a
// frame's shape means) rather than magic numbers, so the guides Lee sees on the
// canvas and the placement here cannot drift apart.
import type { CSSProperties, ReactNode } from "react";

import { BRAND_CREAM, BRAND_NAVY } from "@/components/brand-cards/bolt-boil";
import { captureSize, safeZones } from "@/components/canvas/orientation";

export const V = captureSize("9:16");           // 1080 x 1920
export const V_SAFE = safeZones("9:16");        // titleSafe / camera / watermark / endScreen

export const BRAND_FONT = "'Rubik', system-ui, sans-serif";
export const DISPLAY_FONT = "'League Spartan', 'Rubik', system-ui, sans-serif";

/** THE OUTRO/INTRO BAND — horizontally centred, in the upper third. It clears
 *  YouTube's end-screen overlay (bottom ~40%) and the caption zone, both of
 *  which eat the middle-bottom of a vertical frame. Derived from the same
 *  safe-zone model the canvas guides draw. */
export const UPPER_THIRD_Y = Math.round(V.h * 0.30);

/** A fixed 1080x1920 card, scaled for preview. `transparent` drops the navy so
 *  OBS can key it. Mirrors brand-cards/Stage, but vertical. */
export function VStage({ scale = 1, transparent = false, style, children }: {
  scale?: number; transparent?: boolean; style?: CSSProperties; children: ReactNode;
}) {
  return (
    <div style={{ width: V.w * scale, height: V.h * scale, overflow: "hidden", flex: "0 0 auto", ...style }}>
      <div style={{
        width: V.w, height: V.h, transform: `scale(${scale})`, transformOrigin: "top left",
        position: "relative", background: transparent ? "transparent" : BRAND_NAVY,
        fontFamily: BRAND_FONT, color: BRAND_CREAM,
      }}>
        {children}
      </div>
    </div>
  );
}

/** Progress → the boil frame to draw. The boil is a 4-frame cycle; at 8 cycles
 *  across the card's hold it reads exactly like the live animation but is a
 *  pure function of progress. */
export const boilAt = (progress: number | undefined): number | undefined =>
  progress === undefined ? undefined : Math.floor(progress * 32);

/** Staged reveal without keyframes: how far into [start, start+len] progress is.
 *  Returns 0..1. Undefined progress = fully revealed (the still frame). */
export function reveal(progress: number | undefined, start: number, len = 0.12): number {
  if (progress === undefined) return 1;
  return Math.max(0, Math.min(1, (progress - start) / len));
}

/** The rise-and-fade every secondary line shares. */
export const riseIn = (t: number): CSSProperties => ({
  opacity: t,
  transform: `translateY(${(1 - t) * 18}px)`,
});
