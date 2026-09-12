// THE RUBRIC SLIDE — the A = L + E slide as Lee asked for it on 2026-09-11: "Same skin/UI we see
// for MCQ, but only the transaction, and we'll play with the rubric to get the answer … maybe we
// put 'Effect on A = L + E' at the top above rubric? And transaction more room to breathe and more
// understandable for a student to do practice here … Let revenue/exp be toggleable … If we bring
// R / Exp in… it will make transaction stem smaller, responsive like that. Helps to make sure
// we're using vertical real estate best."
//
// Three pieces in a column — the safe column exactly, flush to its left edge (layout.ts
// COLUMN_KINDS; PhoneFrame places it):
//   · the transaction in the SET CARD's own skin (SetCard — the kicker, the "Q n/N" counter when
//     the slide came from a card, the stem; no choices), sized to fill the column;
//   · the heading — frame.title, default "Effect on A = L + E?";
//   · the boxes (RubricFrame's slide variant), full size.
//
// THE SPACE (2026-09-11). Lee: "needs to make better use of our available space. It's too tucked
// into the top right corner." It was: the card overflowed the column to the right and the boxes
// were scaled to .68 and centred under it, all to end above a caption rail. The rubric has no rail
// now, so the block draws at full size both ways and the column runs toward the bottom of the safe
// area; with Rev/Exp in, the card's type steps down (same width, smaller scale) and the camera's
// home circle sits in the L's crook. rubric-frame.test.ts pins the budget.
//
// The card is drawn INERT even on film: a live SetCard brings the canvas previewer's own film keys
// (its ` and shift+` handlers stop the event), and ~ has to reach the capture to clear the rubric.
//
// On the Review stage a box click cycles the SAVED arrows (SlideEditContext). On film the reveal
// follows the capture's step, and a click or Tab change the TAKE only (FrameStepContext.rubric) —
// never saved; ~ puts it all back.
import { useContext } from "react";

import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";

import { FrameStepContext } from "./frame-step";
import type { SlideLayout } from "./layout";
import type { BlastFrame } from "./plan";
import { RUBRIC_GEOM, RubricFrame } from "./RubricFrame";
import { RUBRIC_HEADING, RUBRIC_KEYS, cycleArrows, cycleKey, emptyArrows, revExpShown, revealedKeys, rubricSteps, type RubricKey } from "./rubric";
import { SetCard } from "./SetCard";
import { SlideEditContext } from "./slide-edit";
import { DISPLAY_FONT } from "./stage";

/** The card's scale (the MCQ cards' .48 of the phone), its type at rest, and with Rev/Exp in. */
export const RUBRIC_SLIDE = { cardScale: 0.48, cardMulRest: 1.12, cardShrinkRevExp: 0.82 } as const;

/** The card's width in flow units so the card — its paper plus the navy padding round it (22 flow
 *  units a side) — fits the column at scale .48 × `mul`. */
export function rubricCardW(mul: number): number {
  return Math.floor(RUBRIC_GEOM.w / (RUBRIC_SLIDE.cardScale * mul) - 44);
}

export function RubricSlide({ frame, k, live = false, topicName, progress }: {
  frame: BlastFrame;
  /** The phone's width / 306. */
  k: number;
  live?: boolean;
  topicName?: string | null;
  progress?: { x: number; y: number } | null;
  /** The set's template — the rubric sits the same way in both. */
  layout?: SlideLayout;
}) {
  const edit = useContext(SlideEditContext);
  const film = useContext(FrameStepContext);
  const spec = frame.rubric;
  if (!spec) return <RubricFrame spec={undefined} k={k} variant="slide" />;

  const onFilm = live && !!film;
  const take = onFilm ? film.rubric : undefined;
  const revExp = take?.revExp ?? revExpShown(spec);
  const step = onFilm ? film.step : undefined;
  const shown = revealedKeys(spec, step, revExp);
  // What each box shows now: the take's own pick, else the saved arrows once revealed.
  const eff = emptyArrows();
  for (const key of RUBRIC_KEYS) eff[key] = take?.over[key] ?? (shown.has(key) ? spec.arrows[key] : []);
  const effSpec = { ...spec, arrows: eff, revExp };
  const clicked = !!take && Object.keys(take.over).length > 0;
  const allIn = step === undefined || step >= rubricSteps(spec, revExp) - 1 || clicked;
  const popKeys = onFilm ? (Object.fromEntries(RUBRIC_KEYS.map((key) => [key, `${key}:${eff[key].join("")}`])) as Partial<Record<RubricKey, string>>) : undefined;
  const onCycle = onFilm && take
    ? (key: RubricKey) => take.set(key, cycleArrows(eff[key]))
    : !live && edit
      ? (key: RubricKey) => edit({ rubric: { ...spec, arrows: cycleKey(spec.arrows, key) } })
      : undefined;

  // THE CARD fills the column; with Rev/Exp in, the same width at a smaller scale — smaller type,
  // a shorter card.
  const mul = revExp ? RUBRIC_SLIDE.cardShrinkRevExp : RUBRIC_SLIDE.cardMulRest;
  const heading = frame.title?.trim() || RUBRIC_HEADING;
  // NO TRANSACTION, NO CARD (2026-09-12). Lee: "Let me hide the transaction in the rubric card. So
  // it's just the rubric." Leaving the transaction blank IS hiding it — the slide becomes the
  // heading and the boxes, which is what the five-types slide wants.
  const transaction = spec.text.trim();
  return (
    <div data-sa-rubric-slide="" style={{ width: RUBRIC_GEOM.w * k, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8 * k }}>
      {transaction && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <SetCard id={frame.id} stem={transaction} topic={topicName ?? null} progress={progress ?? null}
            scale={RUBRIC_SLIDE.cardScale * k} cardW={rubricCardW(mul)} scaleMul={mul} />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 * k }}>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: (revExp ? 16 : 19) * k, lineHeight: 1.1, color: BRAND_CREAM }}>{heading}</div>
        <RubricFrame spec={effSpec} k={k} live={live} variant="slide" revExp={revExp} onCycle={onCycle} popKeys={popKeys} showBalance={allIn} />
      </div>
    </div>
  );
}
