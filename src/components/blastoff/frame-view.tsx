// ONE FRAME, DRAWN — the single renderer every Blast Off surface uses: the
// Review phone stage, the Arrange preview (BlastOffEditor — the old /blast-off
// route only, since V3's /arrange folded into Review on 2026-09-05), the /film
// capture and the canvas's staged brand slides all draw a frame through here
// (or through the same brand components), so what Lee approves on /results is
// what films.
//
// Moved out of BlastOffEditor.tsx on 2026-09-04 so PhoneFrame can wrap it
// without an import cycle. Nothing here re-implements a card — a set frame
// renders its stem and choices, an insert renders as the callout kind it
// becomes when it lands in the set.
import { useContext } from "react";

import type { BoothCeq, BoothSetInfo } from "@/lib/talkthrough.functions";
import { KindChip, calloutMeta } from "@/components/canvas/cards/CalloutCard";
import { PreviewSpotContext } from "@/components/canvas/CeqPreviewer";
import { CARD_W } from "@/components/canvas/ceq-geom";
import { renderInline } from "@/components/canvas/inline-md";
import { BoltZoom } from "@/components/brand-cards/BoltZoom";
import { isZoomVariant } from "@/components/brand-cards/bolt-zoom";
import { BigCallout } from "@/components/brand-cards/BigCallout";
import { SloganCard } from "@/components/brand-cards/SloganCard";
import { SLOGANS } from "@/components/brand-cards/slogans";

import { AdSlide } from "./AdSlide";
import { watermarkSpot } from "./capture/webcam-spots";
import { ClusterFilmContext, ClusterStage, EmptyMap } from "./cluster/ClusterStage";
import { LeePortrait } from "./LeePortrait";
import { SetCard, type CardOverride } from "./SetCard";
import { BIO_CARD, bioCallout } from "./bio-card";
import { DISPLAY_FONT, V } from "./stage";
import { OUTRO_CTA_KEY, SurviveOutro } from "./SurviveOutro";
import { FRAME_LABEL, INSERT_CALLOUT, frameBullets, insertStem, isAdKind, isBigCallout, isStandard, type BlastFrame } from "./plan";
import { SlideEditContext } from "./slide-edit";
import { introWordmarkTop, type SlideLayout } from "./layout";

const GOLD = "#FCA311";

/** Is this plan frame a QUESTION, as opposed to one of the set's note frames?
 *  The canvas's own rule: a note frame is breath — it neither counts toward the
 *  "Q 3/8" counter nor is counted by it. */
function isQuestion(f: BlastFrame, byId: Map<string, BoothCeq>): boolean {
  return f.kind === "ceq" && !!f.ceqId && !byId.get(f.ceqId)?.noteOnly;
}

/** frame id → "Q 3/8", questions only. Built once per plan. */
// A duplicated card (same ceqId twice in the run) is ONE question asked twice — it keeps
// the first number, and the total counts unique cards (audit §2.15).
// THE COUNTER RESTARTS AT EVERY CUT (2026-09-09). Lee: "if I split somewhere, change the
// numbering of the sets in top right… so a student doesn't think that video is 1/29 — it's like,
// the split I'm doing for 'assets' is actually just 1/11. Wherever the split point is, adjust
// the numbers shown." A cut mark (plan.ts `cutAfter`) says where one Short ends and the next
// begins, so each run counts its own questions out of its own total — before the knife is ever
// applied, which is the point: he sees the real numbers while he is deciding where to cut.
export function questionProgress(frames: readonly BlastFrame[], byId: Map<string, BoothCeq>): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  // One run per cut: the frames between two marks are one video.
  let run: BlastFrame[] = [];
  const runs: BlastFrame[][] = [];
  for (const f of frames) {
    run.push(f);
    if (f.cutAfter) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);

  for (const group of runs) {
    const seen = new Map<string, number>();
    const y = new Set(group.filter((f) => isQuestion(f, byId)).map((f) => f.ceqId ?? f.id)).size;
    let x = 0;
    for (const f of group) {
      if (!isQuestion(f, byId)) continue;
      const key = f.ceqId ?? f.id;
      const n = seen.get(key) ?? ++x;
      seen.set(key, n);
      out.set(f.id, { x: n, y });
    }
  }
  return out;
}

/** The full-frame kinds size themselves from a 1080×1920 frame at scale·0.34
 *  (a 1080-wide frame sized to sit beside a list); cards are the canvas's own
 *  560-wide card at `scale`. PhoneFrame turns a stage width into both. */
export function FrameView({ frame, set, scale, topicName, progress, live = false, cardOverride, layout = "pass1", coldOpen, opener = false }: {
  frame: BlastFrame; set: BoothSetInfo; scale: number; topicName?: string | null;
  progress?: { x: number; y: number } | null;
  /** THE ASSEMBLY COLD OPEN (2026-09-08, brand-cards/cold-open.ts): the open frame
   *  builds itself over `ms`; `key` restarts it (a new countdown, or walking back
   *  onto the slide). Absent everywhere but the capture surface. */
  coldOpen?: { ms: number; key?: string | number; held?: boolean } | null;
  /** THIS FRAME OPENS THE VIDEO — the first FILMED slide. An intro in that slot assembles the
   *  way the cold open does; anywhere else it is the plain intro card. */
  opener?: boolean;
  /** The capture surface: cards are live (SetCard `live`). */
  live?: boolean;
  /** The capture camera's grip override (width, scale multiplier), applied
   *  to whichever SetCard this frame renders. */
  cardOverride?: CardOverride;
  /** The set's slide template (layout.ts). */
  layout?: SlideLayout;
}) {
  const s = scale * 0.34;
  const ov = cardOverride ?? {};
  const fw = Math.round(V.w * s), fh = Math.round(V.h * s);
  // THE REVIEW STAGE'S CLICK-TO-EDIT (2026-09-04): present only there.
  const edit = useContext(SlideEditContext);
  // THE OUTRO CTA's SPOTLIGHT (2026-09-07): the film's spotlight layer, handed to the outro
  // the way a detour line gets its LineSpot — the outro can't read this context itself
  // (it sits under BlastOffNodes, which CeqPreviewer reaches: a runtime cycle).
  const spot = useContext(PreviewSpotContext);
  // THE MAP's film state (2026-09-07): the shot being walked, the roam, the arrow overrides —
  // provided by BlastOffCapture; absent everywhere else (the overview, everything revealed).
  const film = useContext(ClusterFilmContext);

  // THE MAP (2026-09-07, cluster/cluster-spec.ts): the whole 9:16 frame is the field; the film
  // walks its shots with space. A frame with no spec yet is a bare black frame that says so.
  if (frame.kind === "cluster") {
    if (!frame.cluster) return <EmptyMap w={fw} />;
    return <ClusterStage spec={frame.cluster} set={set} w={fw} live={live} shot={film?.shot ?? 0} overview={!film || !!film.overview} roam={film?.roam} arrowOverrides={film?.arrowOverrides} onArrowCycle={live ? film?.onArrowCycle : undefined} />;
  }

  // THE STANDARD SPINE renders as the vertical 9:16 frame it actually is —
  // these are brand cards, not CEQ cards, and showing them in the silver card
  // shell would be the same mistake the first Blast Off preview made.
  if (isStandard(frame.kind)) {
    // SLIDES ONE AND TWO are one component (BoltZoom open / intro) so the
    // wordmark sits in the same place on both — Lee: "Make the Survive stay in
    // line between slides 1 and 2 so when I switch it doesn't look like I did."
    // open: tagline = text, domain = url · intro: topic = text, the tutor line = title, domain = url
    // THE ASSEMBLY COLD OPEN (2026-09-08). Its two topic lines are the topic and the set —
    // "the topics come in, top line, left, bottom line, right" — the copy the slide already
    // has, nothing invented.
    //
    // IT IS NOW THE ONLY COLD OPEN THERE IS. Until today the assembly was handed in by the
    // capture surface alone, so /film ran it and the Editor drew the OLD card — a big wordmark
    // over "Cram what's on your exam." with no topics on it at all. Lee, opening the Editor:
    // "The /results is starting the slides off with the cram what's on your exam. It needs to
    // start on the slide with the topics." Two different first slides was the bug. Everywhere
    // else now renders the SAME assembly, pinned at its finished moment (`atMs`) so the Review
    // stage stays at rest; only the film plays it.
    //
    // AND NO DEFAULT SLOGAN. `tagline` falls back to "" instead of BoltZoom's TAGLINE — Lee:
    // "'Cram what's on your exam' as intro… retired as defaults for now. Cram what's on your
    // exam is an outro card only for now." The line is still typeable per set; it is just not
    // put in Lee's mouth. With the slot empty the set name takes the hero size
    // (ColdOpenAssembly's `lead`), which is what "start on the slide with the topics" means.
    //
    // THE OPENER ASSEMBLES, WHATEVER KIND IT IS (2026-09-09). Lee: "animation still isn't showing
    // up on entrance." It could not: his draft SKIPS the cold open, so the first filmed slide is
    // the INTRO and the choreography only ever attached to kind "open". Both are the same
    // component and the same lockup, and his description of slide one — "hero camera, Survive,
    // [topic name], surviveaccounting.com, campus banner underneath" — is this assembly. So the
    // deck's first filmed slide builds itself, and an intro that opens the video takes the
    // open's own topic lines (the topic above, the set below).
    if (frame.kind === "open") return <BoltZoom w={fw} h={fh} mode="open" banner={frame.banner !== "off"} tagline={frame.text?.trim() ?? ""} domain={frame.url?.trim() || undefined} live
      assembly={{ wordmarkSpot: watermarkSpot(fw), ...(coldOpen ? (coldOpen.held ? { key: "held", atMs: 0 } : { totalMs: coldOpen.ms, key: coldOpen.key }) : { key: "still", finished: true }) }}
      topicTop={topicName} topicBottom={set.name}
      onEdit={edit ? (p) => edit({ ...(p.tagline !== undefined ? { text: p.tagline } : {}), ...(p.domain !== undefined ? { url: p.domain } : {}) }) : undefined} />;
    // THE INTRO, INCLUDING WHEN IT OPENS THE VIDEO (2026-09-09). It is ONE layout now, in the
    // Editor and on camera: camera, bolt, ticker, and the wordmark block. The opener's only
    // difference is that the block SLIDES IN when the take rolls, which is exactly what Lee
    // asked for — "on F4, the Survive wordmark, topic, and domain name slide in. Simple." The
    // five-piece assembly is gone from this path: it drew a different composition than the
    // Editor did (his two screenshots side by side), and staggering was the "starts and stops
    // and all kinds of mess."
    if (frame.kind === "intro") return <BoltZoom w={fw} h={fh} mode="intro" topic={frame.text?.trim() || set.name} tutorLine={frame.title?.trim() || undefined} domain={frame.url?.trim() || undefined} banner={frame.banner !== "off"} wordmarkTop={introWordmarkTop(layout)} live
      entrance={opener && coldOpen && !coldOpen.held ? { key: coldOpen.key } : null}
      onEdit={edit ? (p) => edit({ ...(p.topic !== undefined ? { text: p.topic } : {}), ...(p.tutorLine !== undefined ? { title: p.tutorLine } : {}), ...(p.domain !== undefined ? { url: p.domain } : {}) }) : undefined} />;
    // THE TUTOR CARD (2026-09-03): the bio in the detour format, a bit bigger.
    if (frame.kind === "bio") {
      // THE PORTRAIT (2026-09-04): Lee, hand-drawn, inked on in the /learn lime
      // above the tutor card, over the black. `frame.portrait === "off"` hides it.
      const cardW = CARD_W * scale * BIO_CARD.scale;
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * scale }}>
          {/* PARKED (Lee, 2026-09-05: "the SVG drawing of me didn't quite work. Let's park that") — on only when asked. */}
          {frame.portrait === "on" && <LeePortrait width={Math.round(cardW * 0.42)} animate={live} />}
          <SetCard id={frame.id} stem={BIO_CARD.title} scale={scale * BIO_CARD.scale} callout={bioCallout() as Record<string, unknown>} live={live} {...ov} />
        </div>
      );
    }
    // THE OUTRO. It keeps "Cram what's on your exam." as its default — Lee, 2026-09-08: "Cram
    // what's on your exam is an outro card only for now" — and it is the one slide that can say
    // either house slogan (the Editor's two chips write frame.text).
    //
    // AND IT ASSEMBLES. "THAT is the slide that needs entrance animation too." The choreography
    // was always here; it only ever ran off `progress`, which nothing on the deck passes, so
    // the card arrived finished. `entrance` is the live path (outro-entrance.ts) and is on
    // wherever the slide is being watched rather than authored.
    return <SurviveOutro tagline={frame.text?.trim() || undefined} scale={s} live={live} entrance={live}
      ctaSpot={{ state: spot.state(OUTRO_CTA_KEY), flamed: spot.flamed(OUTRO_CTA_KEY), onDown: (e) => spot.onClick(OUTRO_CTA_KEY, e) }} />;
  }

  // THE SLOGAN SLIDE (Lee, 2026-09-08: "do the three slogan slides. B to an A is the picture,
  // yes. Others just text."): the whole 9:16 frame — black, the bolt behind, the line huge.
  // `art` only says whether the words move down to make room; the picture itself is PhoneFrame's
  // own placed layer, exactly as on a blank slide. An empty frame falls back to the first
  // slogan rather than rendering a black nothing, so a slide inserted and not yet typed still
  // reads as what it is.
  if (frame.kind === "slogan") return <SloganCard w={fw} h={fh} text={frame.text?.trim() || SLOGANS[0].text} art={!!frame.illustration?.assetUrl} live={live} />;

  // THE BOLT DETOUR (Lee, 2026-09-04): "just black backdrop and the bolt zoom
  // animation. Nothing else … a blank canvas to put things on."
  if (frame.kind === "bolt") return <BoltZoom w={fw} h={fh} mode="bolt" variant={isZoomVariant(frame.variant) ? frame.variant : "zoom"} psych={frame.psych ?? 0.1} live />;
  if (frame.kind === "ad") return <AdSlide ad={isAdKind(frame.ad) ? frame.ad : "greek"} w={fw} h={fh} live hlKey={live ? frame.id : undefined} copy={{ label: frame.text, headline: frame.title, lines: frame.bullets, url: frame.url }}
    onEdit={edit ? (p) => edit({ ...(p.label !== undefined ? { text: p.label } : {}), ...(p.headline !== undefined ? { title: p.headline } : {}), ...(p.lines !== undefined ? { bullets: p.lines } : {}), ...(p.url !== undefined ? { url: p.url } : {}) }) : undefined} />;

  if (frame.kind === "ceq") {
    const ceq: BoothCeq | undefined = frame.ceqId ? set.ceqs.find((c) => c.id === frame.ceqId) : undefined;
    if (!ceq) return <SetCard stem="This card is no longer in the set." scale={scale} live={live} {...ov} />;
    // The set's own note cards. Since 2026-09-03 they draw in the detour skin (dark, labelled)
    // like every other callout slide; the previewer does the same for a noteOnly card.
    //
    // WITHOUT THE LABEL, since 2026-09-08. Lee: "'Found on your exam' [is] being retired as a
    // default for now." He had cut that wording once already ("forget found on your exam, it's
    // wrong" — plan.ts's own header) and it survived here as the gold chip on top of every note
    // card. The card keeps the detour skin, which is what he asked for in the first place
    // ("the found on your exam should also look more like the detour cards"); it just no longer
    // announces itself in words he doesn't stand behind. FOUND_META still exists for the canvas
    // card that is explicitly that kind.
    if (ceq.noteOnly) return <SetCard id={ceq.id} stem={ceq.stem} scale={scale} callout={{ detour: true, showTopic: false }} live={live} {...ov} />;
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

  // BIG (2026-09-08, plan.ts `display`). Lee: "either it's in the current format, or it's more
  // emphatic where it's a slide just like the slogan one. Bolt in background. BIG letters."
  // Same words, same fields — only the treatment changes, so switching a slide between the two
  // never loses anything. The chip's label and accent come from the ONE callout registry, so a
  // big cheat code is the same colour as a card cheat code.
  if (isBigCallout(frame)) {
    const tag = INSERT_CALLOUT[frame.kind];
    const meta = tag ? calloutMeta(tag as Parameters<typeof calloutMeta>[0]) : { label: FRAME_LABEL[frame.kind].toUpperCase(), accent: GOLD };
    return <BigCallout w={fw} h={fh} label={meta.label} accent={meta.accent} text={insertStem(frame)} bullets={frameBullets(frame)} art={!!frame.illustration?.assetUrl} live={live} />;
  }

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
  // The same shell as a real detour (audit §2.15): chip above the box, 16·s padding, 13·s
  // radius, a scaled border, League Spartan 31·s — so an exhibit slot reads as one of the family.
  return (
    <div style={{ width: CARD_W * scale, background: navy, padding: 22 * scale, borderRadius: Math.max(8, 12 * scale), display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <KindChip text="Exhibit" accent={GOLD} scale={scale} />
      <div style={{ width: "100%", borderRadius: 13 * scale, border: `${Math.max(1, 1.5 * scale)}px solid rgba(252,163,17,0.6)`, padding: 16 * scale, background: navy, position: "relative", boxShadow: "0 8px 30px rgba(0,0,0,0.35)" }}>
        <div style={{ fontFamily: DISPLAY_FONT, fontSize: 31 * scale, fontWeight: 800, lineHeight: 1.1, color: "#F5EFE6" }}>
          {renderInline(label.includes("==") ? label : `==${label}==`, { bg: GOLD, color: navy })}
        </div>
        <div style={{ fontSize: 11 * scale, color: "rgba(245,239,230,0.55)", marginTop: 8 * scale }}>
          the real exhibit is staged on this frame when the plan is sent to film
        </div>
      </div>
    </div>
  );
}
