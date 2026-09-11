// THE RUBRIC SLIDE — the A = L + E slide as Lee asked for it on 2026-09-11: "Same skin/UI we see
// for MCQ, but only the transaction, and we'll play with the rubric to get the answer … maybe we
// put 'Effect on A = L + E' at the top above rubric? And transaction more room to breathe and more
// understandable for a student to do practice here … Let revenue/exp be toggleable … If we bring
// R / Exp in… it will make transaction stem smaller, responsive like that. Helps to make sure
// we're using vertical real estate best."
//
// Three pieces in a column at the top of the safe column:
//   · the transaction in the SET CARD's own skin (SetCard — the kicker, the "Q n/N" counter when
//     the slide came from a card, the stem; no choices), sized exactly like the MCQ cards;
//   · the heading — frame.title, default "Effect on A = L + E?";
//   · the boxes (RubricFrame's slide variant).
// With Rev/Exp in, the card's type steps down (same width, smaller scale) and the boxes scale to
// .68 so the column still ends above the caption rail (.61h) — rubric-frame.test.ts pins the
// budget with a generous card height; the Rev/Exp column sits where the captions would.
//
// The card is drawn INERT even on film: a live SetCard brings the canvas previewer's own film keys
// (its ` and shift+` handlers stop the event), and ~ has to reach the capture to clear the rubric.
//
// On the Review stage a box click cycles the SAVED arrows (SlideEditContext). On film the reveal
// follows the capture's step, and a click or Tab change the TAKE only (FrameStepContext.rubric) —
// never saved; ~ puts it all back.
import { useContext } from "react";

import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { CARD_W } from "@/components/canvas/ceq-geom";

import { FrameStepContext } from "./frame-step";
import { cardPlacement, type SlideLayout } from "./layout";
import type { BlastFrame } from "./plan";
import { RUBRIC_GEOM, RubricFrame } from "./RubricFrame";
import { RUBRIC_HEADING, RUBRIC_KEYS, cycleArrows, cycleKey, emptyArrows, revExpShown, revealedKeys, rubricSteps, type RubricKey } from "./rubric";
import { SetCard } from "./SetCard";
import { SlideEditContext } from "./slide-edit";
import { DISPLAY_FONT } from "./stage";

/** How the column changes with the Rev/Exp row in: the card's type and the boxes' scale. */
export const RUBRIC_SLIDE = { cardShrinkRevExp: 0.82, blockScaleRevExp: 0.68, cardScale: 0.48 } as const;

export function RubricSlide({ frame, k, live = false, topicName, progress, layout }: {
  frame: BlastFrame;
  /** The phone's width / 306. */
  k: number;
  live?: boolean;
  topicName?: string | null;
  progress?: { x: number; y: number } | null;
  layout: SlideLayout;
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

  // THE CARD, sized like the MCQ cards (phoneScale's .48 and the template's card placement); with
  // Rev/Exp in, the same width at a smaller scale — smaller type, a shorter card.
  const cp = cardPlacement(layout, "ceq");
  const shrink = revExp ? RUBRIC_SLIDE.cardShrinkRevExp : 1;
  const cardW = Math.round((cp.cardW ?? CARD_W) / shrink);
  const scaleMul = (cp.scaleMul ?? 1) * shrink;
  const rk = revExp ? k * RUBRIC_SLIDE.blockScaleRevExp : k;
  const heading = frame.title?.trim() || RUBRIC_HEADING;
  return (
    <div data-sa-rubric-slide="" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 * k }}>
      <SetCard id={frame.id} stem={spec.text.trim() || "Type the transaction in the Editor."} topic={topicName ?? null} progress={progress ?? null}
        scale={RUBRIC_SLIDE.cardScale * k} cardW={cardW} scaleMul={scaleMul} />
      <div style={{ width: RUBRIC_GEOM.w * rk, display: "flex", flexDirection: "column", gap: 6 * k }}>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: (revExp ? 14 : 16) * k, lineHeight: 1.1, color: BRAND_CREAM }}>{heading}</div>
        <RubricFrame spec={effSpec} k={rk} live={live} variant="slide" revExp={revExp} onCycle={onCycle} popKeys={popKeys} showBalance={allIn} />
      </div>
    </div>
  );
}
