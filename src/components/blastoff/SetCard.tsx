// THE REAL CARD, rendered in Blast Off.
//
// Blast Off used to draw its own dark navy CEQ card. Lee's verdict, looking at
// the two side by side: "they're not in the correct skin — we want the soft
// grayish, the silverish one I've been using all this time." He was right, and
// the fix is not to restyle a copy: it is to render the SAME component the study
// canvas renders, so there is exactly one card in the product.
//
// HOW IT RENDERS OUTSIDE THE CANVAS. `CeqPreviewNode` takes `{ id, data }`, and
// every context it reads directly (practice, spotlight, view-choice, attach-memo,
// choice-menu, card-write, highlights) is declared with a safe default, so
// outside a provider it simply gets the inert values.
//
// It does need ONE thing, which reading the file did not reveal and the browser
// did: each choice renders a <TextAnchor> (the chain attachment point), and that
// calls useUpdateNodeInternals() — a ReactFlow store hook. Without a provider the
// card throws "Seems like you have not used ReactFlowProvider as an ancestor".
// So the card is wrapped in a bare <ReactFlowProvider>, which supplies the store
// and nothing else: no <ReactFlow>, no viewport, no pan or zoom. Cheap, and it
// keeps this a preview rather than a second canvas.
//
// TWO FLAGS DO THE REST:
//   inert: true    the card is a stand-in, not the live one — the same flag the
//                  film stack uses for its non-active cards, so practice state
//                  and click handlers stay out of it.
//   FilmContext    true, which is what hides every authoring affordance (the
//                  callout controls, the scale grips). A preview is not an editor.
import type { ReactElement } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { CeqPreviewNode, PV_CSS } from "@/components/canvas/CeqPreviewer";
import { FLAME_CSS } from "@/components/canvas/FilmOverlays";
import { FilmContext } from "@/components/canvas/film-lock";
import { CARD_W } from "@/components/canvas/ceq-geom";
import { PAPER } from "@/components/canvas/theme";

/** CeqPreviewNode's signature is ReactFlow's NodeProps, but it only ever reads
 *  `id` and `data`. Narrowing it here keeps the cast in one place instead of at
 *  every call site. */
const Card = CeqPreviewNode as unknown as (p: { id: string; data: Record<string, unknown> }) => ReactElement;

export interface SetCardChoice { id?: string; text: string; correct?: boolean }

/** THE GRIPS' OVERRIDE (2026-09-04): what the capture camera's alt-hover grips
 *  change on the live card, per slide. `cardW` is the card's width in its own
 *  flow units (data.cardW; CARD_W = 560 when unset); `scaleMul` multiplies the
 *  scale the card was given, so the same grip drag means the same thing at
 *  every phone width. Threaded PhoneFrame → FrameView → SetCard. */
export interface CardOverride { cardW?: number; scaleMul?: number }

/** ALT ON THE CAPTURE SURFACE. PV_CSS keys the grab affordances on the canvas's
 *  `.react-flow__node` wrapper, which a SetCard does not have — the card is
 *  the node. Same ring, same latch (`.film-mode.sa-alt`); the grips come from
 *  PV_CSS as they are. The native cursor is hidden behind the brand cursor,
 *  so the ring is the whole affordance. */
const LIVE_ALT_CSS = `
.film-mode.sa-alt [data-sa-card] .sa-pv-node { cursor: grab; }
.film-mode.sa-alt [data-sa-card] .sa-pv-node:active { cursor: grabbing; }
.film-mode.sa-alt [data-sa-card] .sa-pv-node:hover { outline: 2px dashed rgba(252,163,17,0.85); outline-offset: 6px; }
`;

export function SetCard({
  id = "blast-preview",
  stem,
  choices = [],
  topic,
  progress,
  callout,
  scale = 1,
  live = false,
  cardW,
  scaleMul,
}: {
  id?: string;
  stem: string;
  choices?: readonly SetCardChoice[];
  /** The kicker above the stem. NOTE_EYEBROW ("FOUND ON YOUR EXAM") for note
   *  frames, the topic name for questions — the canvas's own rule. */
  topic?: string | null;
  /** "Q 3/8" top-right. Questions only; a note frame is breath, not a question. */
  progress?: { x: number; y: number } | null;
  callout?: Record<string, unknown>;
  scale?: number;
  /** THE CAPTURE SURFACE (2026-09-04): the card is the live one — practice
   *  clicks, spotlight, shift-click highlights, Alt-move all reach it — and it
   *  plays its entrance. Off (the default) it is the inert still the Review
   *  and Arrange stages draw. The contexts those tools read are provided by
   *  BlastOffCapture; without them a live card is merely not inert. */
  live?: boolean;
  /** The grips' width override, in flow units (see CardOverride). */
  cardW?: number;
  /** The grips' scale override — multiplies `scale` (see CardOverride). */
  scaleMul?: number;
}) {
  // The scale the card actually draws at. The GIVEN scale is published on the
  // wrapper (data-sa-card-scale) so the capture camera can turn a grip's
  // absolute target back into a multiplier of it — see capture/camera.ts.
  const s = scale * (scaleMul ?? 1);
  const w = cardW ?? CARD_W;
  return (
    <ReactFlowProvider>
    <FilmContext.Provider value={true}>
      {/* The card's own stylesheet — selection gold, enter animation, flame. */}
      <style>{FLAME_CSS}{PV_CSS}{LIVE_ALT_CSS}</style>
      <div
        data-sa-card=""
        data-sa-card-scale={scale}
        style={{
          width: w * s,
          display: "flex",
          justifyContent: "center",
          // A card floats on the frame, never on nothing — the same navy the
          // canvas stage sits on, so the paper edge reads correctly.
          background: PAPER.navy,
          padding: 22 * s,
          // Scaled like everything else on the card (audit §2.15): 12 px was nearly double
          // the card's own 14·s corner at Review size.
          borderRadius: Math.max(8, 12 * s),
        }}
      >
        <Card
          id={id}
          data={{
            stem,
            choices: choices.map((c, i) => ({ id: c.id ?? `c${i}`, text: c.text, correct: !!c.correct })),
            scale: s,
            ...(cardW == null ? {} : { cardW }),
            topic: topic ?? null,
            progress: progress ?? null,
            ...(callout ? { callout } : {}),
            // No entrance animation in a still preview — it would replay on
            // every keystroke while Lee is arranging. The live card keeps it.
            ...(live ? {} : { enterAnim: "none", enterAnimName: "none" }),
            inert: !live,
          }}
        />
      </div>
    </FilmContext.Provider>
    </ReactFlowProvider>
  );
}
