// ONE FRAME, DRAWN — the single renderer every Blast Off surface uses: the
// Review phone stage, the Arrange preview, the /film capture and the canvas's
// staged brand slides all draw a frame through here (or through the same brand
// components), so what Lee approves on /results is what films.
//
// Moved out of BlastOffEditor.tsx on 2026-09-04 so PhoneFrame can wrap it
// without an import cycle. Nothing here re-implements a card — a set frame
// renders its stem and choices, an insert renders as the callout kind it
// becomes when it lands in the set.
import type { BoothCeq, BoothSetInfo } from "@/lib/talkthrough.functions";
import { CARD_W } from "@/components/canvas/ceq-geom";
import { renderInline } from "@/components/canvas/inline-md";
import { BoltZoom } from "@/components/brand-cards/BoltZoom";
import { isZoomVariant } from "@/components/brand-cards/bolt-zoom";

import { AdSlide } from "./AdSlide";
import { LeePortrait } from "./LeePortrait";
import { SetCard, type CardOverride } from "./SetCard";
import { BIO_CARD, bioCallout } from "./bio-card";
import { V } from "./stage";
import { SurviveOutro } from "./SurviveOutro";
import { INSERT_CALLOUT, frameBullets, insertStem, isAdKind, isStandard, type BlastFrame } from "./plan";

const GOLD = "#FCA311";

/** Is this plan frame a QUESTION, as opposed to one of the set's note frames?
 *  The canvas's own rule: a note frame is breath — it neither counts toward the
 *  "Q 3/8" counter nor is counted by it. */
function isQuestion(f: BlastFrame, byId: Map<string, BoothCeq>): boolean {
  return f.kind === "ceq" && !!f.ceqId && !byId.get(f.ceqId)?.noteOnly;
}

/** frame id → "Q 3/8", questions only. Built once per plan. */
export function questionProgress(frames: readonly BlastFrame[], byId: Map<string, BoothCeq>): Map<string, { x: number; y: number }> {
  const y = frames.filter((f) => isQuestion(f, byId)).length;
  const out = new Map<string, { x: number; y: number }>();
  let x = 0;
  for (const f of frames) if (isQuestion(f, byId)) out.set(f.id, { x: ++x, y });
  return out;
}

/** The full-frame kinds size themselves from a 1080×1920 frame at scale·0.34
 *  (a 1080-wide frame sized to sit beside a list); cards are the canvas's own
 *  560-wide card at `scale`. PhoneFrame turns a stage width into both. */
export function FrameView({ frame, set, scale, topicName, progress, live = false, cardOverride }: {
  frame: BlastFrame; set: BoothSetInfo; scale: number; topicName?: string | null;
  progress?: { x: number; y: number } | null;
  /** The capture surface: cards are live (SetCard `live`). */
  live?: boolean;
  /** The capture camera's grip override (width, scale multiplier), applied
   *  to whichever SetCard this frame renders. */
  cardOverride?: CardOverride;
}) {
  const s = scale * 0.34;
  const ov = cardOverride ?? {};
  const fw = Math.round(V.w * s), fh = Math.round(V.h * s);

  // THE STANDARD SPINE renders as the vertical 9:16 frame it actually is —
  // these are brand cards, not CEQ cards, and showing them in the silver card
  // shell would be the same mistake the first Blast Off preview made.
  if (isStandard(frame.kind)) {
    // SLIDES ONE AND TWO are one component (BoltZoom open / intro) so the
    // wordmark sits in the same place on both — Lee: "Make the Survive stay in
    // line between slides 1 and 2 so when I switch it doesn't look like I did."
    if (frame.kind === "open") return <BoltZoom w={fw} h={fh} mode="open" banner={frame.banner !== "off"} live />;
    if (frame.kind === "intro") return <BoltZoom w={fw} h={fh} mode="intro" topic={frame.text?.trim() || set.name} live />;
    // THE TUTOR CARD (2026-09-03): the bio in the detour format, a bit bigger.
    if (frame.kind === "bio") {
      // THE PORTRAIT (2026-09-04): Lee, hand-drawn, inked on in the /learn lime
      // above the tutor card, over the black. `frame.portrait === "off"` hides it.
      const cardW = CARD_W * scale * BIO_CARD.scale;
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * scale }}>
          {frame.portrait !== "off" && <LeePortrait width={Math.round(cardW * 0.42)} animate={live} />}
          <SetCard id={frame.id} stem={BIO_CARD.title} scale={scale * BIO_CARD.scale} callout={bioCallout() as Record<string, unknown>} live={live} {...ov} />
        </div>
      );
    }
    return <SurviveOutro tagline={frame.text?.trim() || undefined} scale={s} />;
  }

  // THE BOLT DETOUR (Lee, 2026-09-04): "just black backdrop and the bolt zoom
  // animation. Nothing else … a blank canvas to put things on."
  if (frame.kind === "bolt") return <BoltZoom w={fw} h={fh} mode="bolt" variant={isZoomVariant(frame.variant) ? frame.variant : "zoom"} psych={frame.psych ?? 0.1} live />;
  if (frame.kind === "ad") return <AdSlide ad={isAdKind(frame.ad) ? frame.ad : "greek"} w={fw} h={fh} live copy={{ label: frame.text, headline: frame.title, lines: frame.bullets, url: frame.url }} />;

  if (frame.kind === "ceq") {
    const ceq: BoothCeq | undefined = frame.ceqId ? set.ceqs.find((c) => c.id === frame.ceqId) : undefined;
    if (!ceq) return <SetCard stem="This card is no longer in the set." scale={scale} live={live} {...ov} />;
    // The set's own note cards ARE the "found on your exam" card. Since
    // 2026-09-03 they draw in the detour skin (dark, labelled) like every
    // other callout slide; the previewer does the same for a noteOnly card.
    if (ceq.noteOnly) return <SetCard id={ceq.id} stem={ceq.stem} scale={scale} callout={{ kind: "found-on-exam", detour: true, showTopic: false }} live={live} {...ov} />;
    return (
      <SetCard
        id={ceq.id}
        stem={ceq.stem}
        choices={ceq.choices}
        topic={topicName ?? null}
        progress={progress ?? null}
        scale={scale}
        live={live}
        {...ov}
      />
    );
  }

  // AN EXHIBIT FRAME IS THE EXHIBIT. On the canvas the sync stages the real
  // element on a bare frame; here a dark placeholder names it, so the running
  // order reads as a detour rather than a cream card saying "Exhibit: cycle".
  if (frame.kind === "exhibit") return <ExhibitDetour label={insertStem(frame)} scale={scale} />;

  const kindTag = INSERT_CALLOUT[frame.kind];
  return (
    <SetCard
      id={frame.id}
      stem={insertStem(frame)}
      scale={scale}
      live={live}
      {...ov}
      // "blank" is a BARE frame — card hidden, so Lee builds on it from scratch.
      // Every other insert is a DETOUR: the dark card, gold label, key phrase
      // highlighted — the same flag the sync writes, so preview = film.
      callout={frame.kind === "blank" ? { hidden: true } : kindTag ? { kind: kindTag, detour: true, ...(frameBullets(frame).length ? { extraStems: frameBullets(frame) } : {}) } : undefined}
    />
  );
}

/** The exhibit frame's stand-in, in the detour skin: same width and paper
 *  edge as the card shell, gold EXHIBIT label, the exhibit's name as the key
 *  phrase. Not a canvas card — the canvas stages the real element instead. */
function ExhibitDetour({ label, scale }: { label: string; scale: number }) {
  const navy = "#14213D";
  return (
    <div style={{ width: CARD_W * scale, background: navy, padding: 22 * scale, borderRadius: 12, display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", borderRadius: 14 * scale, border: "1.5px solid rgba(252,163,17,0.6)", padding: `${18 * scale}px ${20 * scale}px ${20 * scale}px`, background: navy, position: "relative" }}>
        <span aria-hidden style={{ position: "absolute", top: -1, right: -1, width: 26 * scale, height: 26 * scale, background: GOLD, clipPath: "polygon(100% 0, 0 0, 100% 100%)", borderTopRightRadius: 13 * scale, opacity: 0.9 }} />
        <div style={{ display: "inline-flex", padding: `${2 * scale}px ${8 * scale}px`, borderRadius: 6 * scale, fontSize: 10.5 * scale, fontWeight: 900, letterSpacing: "0.12em", color: GOLD, background: "rgba(252,163,17,0.14)", border: "1px solid rgba(252,163,17,0.27)", marginBottom: 8 * scale }}>
          EXHIBIT
        </div>
        <div style={{ fontSize: 24 * scale, fontWeight: 800, lineHeight: 1.25, color: "#F5EFE6" }}>
          {renderInline(label.includes("==") ? label : `==${label}==`, { bg: GOLD, color: navy })}
        </div>
        <div style={{ fontSize: 11 * scale, color: "rgba(245,239,230,0.55)", marginTop: 8 * scale }}>
          the real exhibit is staged on this frame when the plan is sent to film
        </div>
      </div>
    </div>
  );
}
