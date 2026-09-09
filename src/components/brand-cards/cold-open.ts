// THE ASSEMBLY COLD OPEN — the choreography as data, so the timing is one
// tested fact instead of magic numbers scattered through a component.
//
// Lee (2026-09-07/08): "Nothing being on the screen maybe except the Bolt in
// the background, and then everything is symbols from, like, my camera's out on
// the right and comes in this... it comes in, slides in. The question comes from
// the top. Survive watermark comes from the top left, left to right. The topics
// come in, like, maybe top line, left, bottom line, right. You know? Just kind of
// like this assemblance. Like, this is a machine being put together, and we're
// about to, like, dive into this. I'm really honestly picturing like how it's
// made, the TV show. And the real thing is there's just kind of the bolt, and
// there's electricity. And that's really it. It's kind of like, you're about to
// get your system shocked. It's like a defibrillator."
//
// And (2026-09-08): "Build the assembly cold open with the wordmark landing
// last. I do want a countdown as well to ensure that filming is easy. I can take
// a deep breath, and know exactly when to hit F1... so I don't miss the
// transition. Better yet, for exact consistency, I'd love to reuse the tool I
// built for wiring this up to OBS."
//
// THREE RULES this file encodes, and nothing else may re-decide them:
//   1. THE CAMERA IS FIRST. It is the only living thing on screen and it exists
//      before Lee speaks; the graphics assemble around it.
//   2. EVERYTHING EASES IN; ONE ELEMENT LANDS HARD. Only the wordmark is `hard`
//      — a short, fast overshoot, with the bolt pulsing once underneath it. That
//      single hard landing is the defibrillator; without it this is a title
//      sequence.
//   3. THE WORDMARK IS LAST and it lands in the WATERMARK CORNER (the exact spot
//      PhoneFrame draws the watermark for the rest of the video — see
//      webcam-spots.watermarkSpot, the one copy of that coordinate). Until it
//      lands that corner is visibly EMPTY, so the eye has a hole waiting.
//
// THE COUNT AND THE ASSEMBLY ARE THE SAME SECONDS, not two phases: the pop-out's
// 10 s count (capture/popout.ts — "the tool I built") runs while the pieces
// arrive, and the wordmark lands ON zero.
//
// BUT THE DIGITS ARE NOT IN THE FRAME (2026-09-08). Lee: "So, will students see
// the 3 2 1?" They would have — the pop-out is the OBS window capture. The count
// draws in the main /film window now; this file's ten seconds are what the shot
// shows, and they show only the machine assembling. That is why there is no
// longer a `.sa-co-count` rule here: nothing inside the capture recedes, because
// nothing inside the capture is a timer.

/** The pieces, in the order they arrive. `camera` first, `wordmark` last. */
export const ASSEMBLY_KEYS = ["camera", "question", "topicTop", "topicBottom", "wordmark"] as const;
export type AssemblyKey = (typeof ASSEMBLY_KEYS)[number];

/** The edge a piece flies in from. */
export type PieceFrom = "right" | "top" | "left" | "bottom";

export interface AssemblyPiece {
  key: AssemblyKey;
  from: PieceFrom;
  /** ms from the top of the assembly. */
  atMs: number;
  durMs: number;
  /** The one hard landing: a short overshoot instead of a soft ease. Wordmark only. */
  hard?: boolean;
}

/** THREE SECONDS, not ten (2026-09-09). Lee: "Maybe we can speed it up so it's only 3 seconds?
 *  I'm going very fast at the beginning. My opening line: Let's cram for your exam. [Topic
 *  name]." That line is about three seconds long, and the assembly is what he says it over — so
 *  the machine finishes as the sentence does, and the first CEQ is up by second four.
 *
 *  It was ten because the count and the assembly were the same seconds. They came apart on
 *  09-09 (F4 rolls the recording and the animation together), which freed this number to be
 *  what the OPENING LINE needs rather than what the countdown needed. */
export const ASSEMBLY_TOTAL_MS = 3_000;
/** No countdown: landing on the open frame in film mode plays this short one once. */
export const ASSEMBLY_SHORT_MS = 1_400;

/** THE OPENER'S ONE MOVE (2026-09-09) — how long the intro's wordmark block takes to slide in
 *  on F4. Its own number, NOT the assembly's three seconds: this is a single block arriving, and
 *  three seconds of one thing moving is the sluggishness Lee was describing. The three seconds
 *  are how long he TALKS over the opener; this is how long the move takes. */
export const INTRO_ENTRANCE_MS = 700;

/** The beat sheet, at the three-second length. The hold between the last topic line and the
 *  wordmark is deliberate and survives the compression — the corner sits visibly empty, and
 *  then it SNAPS. Everything is up by 3 s: camera almost immediately (he is already talking),
 *  the line, the two topic lines close behind, and the wordmark landing hard on the end of
 *  "…for your exam." */
export const ASSEMBLY_PIECES: readonly AssemblyPiece[] = [
  { key: "camera", from: "right", atMs: 60, durMs: 420 },
  { key: "question", from: "top", atMs: 420, durMs: 380 },
  { key: "topicTop", from: "left", atMs: 900, durMs: 340 },
  { key: "topicBottom", from: "right", atMs: 1280, durMs: 340 },
  { key: "wordmark", from: "left", atMs: 2280, durMs: 720, hard: true },
];

export interface AssemblyPlan { totalMs: number; pieces: AssemblyPiece[] }

/** The pieces at absolute times for a total of `totalMs`, with the LAST piece
 *  ending exactly on `totalMs` — rounding never lets the wordmark land early or
 *  late, because that landing is the cut. */
export function assemblyPlan(totalMs: number = ASSEMBLY_TOTAL_MS): AssemblyPlan {
  const t = Math.max(1, Math.round(totalMs));
  const k = t / ASSEMBLY_TOTAL_MS;
  const pieces: AssemblyPiece[] = ASSEMBLY_PIECES.map((p) => ({
    ...p,
    atMs: Math.min(Math.max(0, Math.round(p.atMs * k)), t - 1),
    durMs: Math.max(1, Math.round(p.durMs * k)),
  }));
  for (const p of pieces) p.durMs = Math.max(1, Math.min(p.durMs, t - p.atMs));
  const last = pieces[pieces.length - 1];
  last.durMs = Math.max(1, t - last.atMs);
  return { totalMs: t, pieces };
}

export function pieceAt(plan: AssemblyPlan, key: AssemblyKey): AssemblyPiece {
  const p = plan.pieces.find((x) => x.key === key);
  if (!p) throw new Error(`cold-open: no piece "${key}"`);
  return p;
}

/** THE TICKER's beat — derived, not a sixth piece, because the five pieces above
 *  are Lee's own list. "Ticker last-but-one": the campus strip rises from the
 *  bottom after the last topic line and before the wordmark, so the frame is
 *  full and only the corner is still missing when the count reaches one. */
export function tickerBeat(plan: AssemblyPlan): { from: PieceFrom; atMs: number; durMs: number } {
  const tb = pieceAt(plan, "topicBottom");
  const wm = pieceAt(plan, "wordmark");
  const after = tb.atMs + tb.durMs;
  const gap = Math.max(1, wm.atMs - after);
  const atMs = Math.min(after + Math.round(gap * 0.25), Math.max(after, wm.atMs - 1));
  return { from: "bottom", atMs, durMs: Math.max(1, Math.min(Math.round(gap * 0.45), Math.max(1, wm.atMs - atMs))) };
}

/** How far, and which way, a piece starts from its resting place. */
export function pieceOffset(from: PieceFrom, dx: number, dy: number): { x: number; y: number } {
  switch (from) {
    case "right": return { x: dx, y: 0 };
    case "left": return { x: -dx, y: 0 };
    case "top": return { x: 0, y: -dy };
    case "bottom": return { x: 0, y: dy };
  }
}

// A function declaration, not a const arrow: this module is on the render path
// (BoltZoom reaches it) and the TDZ ratchet — canvas/tdz-graph.test.ts — is right.
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** The soft ease every piece but one uses (cubic out). */
export function easeSoft(t: number): number { const u = clamp01(t); return 1 - Math.pow(1 - u, 3); }
/** The hard landing: back-out, so the wordmark overshoots by a hair and snaps back. */
export function easeHard(t: number): number {
  const u = clamp01(t);
  const c = 1.9;   // slightly past the stock 1.70158 — Lee wants a shock, not a bounce
  return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
}

/** 0 before the piece starts, 1 once it has landed. */
export function pieceProgress(piece: { atMs: number; durMs: number }, nowMs: number): number {
  return clamp01((nowMs - piece.atMs) / piece.durMs);
}

/** One moment of one piece, with no DOM in sight — what a still render (Review
 *  preview, a thumbnail: `nowMs = plan.totalMs`, the FINISHED state) and an
 *  offline frame renderer both draw from. The live path uses coldOpenCss below;
 *  the two agree because both read this file's numbers. */
export function pieceStyle(piece: AssemblyPiece, nowMs: number, dist: { dx: number; dy: number } = { dx: 0, dy: 0 }): { opacity: number; transform: string } {
  const p = pieceProgress(piece, nowMs);
  const off = pieceOffset(piece.from, dist.dx, dist.dy);
  const e = piece.hard ? easeHard(p) : easeSoft(p);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    // The fade is done well before the travel is — a piece reads as arriving, not as appearing.
    opacity: round(clamp01(p / 0.45)),
    transform: `translate3d(${round(off.x * (1 - e))}px, ${round(off.y * (1 - e))}px, 0)`,
  };
}

// ---- the live path: one keyframe, per-piece delays -------------------------
//
// Every piece runs the SAME keyframe and differs only in delay, duration, easing
// and how far it travels (two custom properties). Reduced motion then costs one
// rule: zero the two properties and everything simply appears, on the same beat,
// with no travel at all.

export const COLD_OPEN_CLASS = "sa-co";
export function pieceClass(key: AssemblyKey | "ticker"): string { return `sa-co-${key}`; }

/** THE HOUSE EASES. Exported because the outro's entrance (blastoff/outro-entrance.ts) is the
 *  same gesture at the other end of the video — everything eases in, one thing lands hard — and
 *  two copies of these curves would drift. */
export const SOFT_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
export const HARD_EASE = "cubic-bezier(0.34, 1.62, 0.64, 1)";

/** The stylesheet for one plan, with `dx` / `dy` the travel in px. */
export function coldOpenCss(plan: AssemblyPlan, dx: number, dy: number): string {
  const rule = (cls: string, spec: { from: PieceFrom; atMs: number; durMs: number; hard?: boolean }) => {
    const off = pieceOffset(spec.from, dx, dy);
    return `.${cls} { animation-delay: ${spec.atMs}ms; animation-duration: ${spec.durMs}ms; animation-timing-function: ${spec.hard ? HARD_EASE : SOFT_EASE}; --sa-co-x: ${Math.round(off.x)}px; --sa-co-y: ${Math.round(off.y)}px; }`;
  };
  const wm = pieceAt(plan, "wordmark");
  // The bolt pulses ONCE, timed to the wordmark's landing — the discharge.
  const shockAt = Math.max(0, wm.atMs + Math.round(wm.durMs * 0.45));
  const shockFor = Math.max(200, wm.durMs);
  return `
@keyframes sa-co-in { from { opacity: 0; transform: translate3d(var(--sa-co-x, 0px), var(--sa-co-y, 0px), 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
@keyframes sa-co-shock { 0% { opacity: var(--sa-co-bolt, 0.34); filter: none; } 16% { opacity: 0.82; filter: brightness(1.9) saturate(1.3); } 100% { opacity: var(--sa-co-bolt, 0.34); filter: none; } }
.${COLD_OPEN_CLASS} { animation-name: sa-co-in; animation-fill-mode: both; will-change: transform, opacity; }
${plan.pieces.map((p) => rule(pieceClass(p.key), p)).join("\n")}
${rule(pieceClass("ticker"), tickerBeat(plan))}
.sa-co-shock { animation: sa-co-shock ${shockFor}ms ease-out ${shockAt}ms both; }
@media (prefers-reduced-motion: reduce) {
  .${COLD_OPEN_CLASS} { --sa-co-x: 0px; --sa-co-y: 0px; }
  .sa-co-shock { animation: none; }
}
`;
}
