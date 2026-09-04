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

export function SetCard({
  id = "blast-preview",
  stem,
  choices = [],
  topic,
  progress,
  callout,
  scale = 1,
  live = false,
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
}) {
  return (
    <ReactFlowProvider>
    <FilmContext.Provider value={true}>
      {/* The card's own stylesheet — selection gold, enter animation, flame. */}
      <style>{FLAME_CSS}{PV_CSS}</style>
      <div
        style={{
          width: CARD_W * scale,
          display: "flex",
          justifyContent: "center",
          // A card floats on the frame, never on nothing — the same navy the
          // canvas stage sits on, so the paper edge reads correctly.
          background: PAPER.navy,
          padding: 22 * scale,
          borderRadius: 12,
        }}
      >
        <Card
          id={id}
          data={{
            stem,
            choices: choices.map((c, i) => ({ id: c.id ?? `c${i}`, text: c.text, correct: !!c.correct })),
            scale,
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
