// BLAST OFF NODES — the canvas wrappers around components/blastoff/.
//
// The frames themselves know nothing about the canvas: they take content and
// render at a true 1080x1920. These nodes do three things and nothing more —
// scale that frame into the node's box, give Lee the one or two fields worth
// editing inline, and stay out of the way in film.
//
// Everything visual lives in blastoff/. If a phrase looks wrong, it is wrong in
// ONE place for every video ever made, which is the entire point.
import type { NodeProps } from "@xyflow/react";

import { CheatCodeFrame, PhraseFrame, TipFrame } from "@/components/blastoff/ContentFrames";
import { FoundOnYourExam } from "@/components/blastoff/FoundOnYourExam";
import { AdSlide } from "@/components/blastoff/AdSlide";
import { AD_KINDS, isAdKind } from "@/components/blastoff/ad-kinds";
import { BoltZoom } from "@/components/brand-cards/BoltZoom";
import { ZOOM_VARIANTS, isZoomVariant } from "@/components/brand-cards/bolt-zoom";
import { SurviveBio } from "@/components/blastoff/SurviveBio";
import { SurviveOutro } from "@/components/blastoff/SurviveOutro";
import { V } from "@/components/blastoff/stage";
import type {
  BlastAdElement,
  BlastBioElement, BlastCheatElement, BlastFoyeElement, BlastIntroElement, BlastOpenElement, BlastOutroElement,
  BlastPhraseElement, BlastTipElement,
} from "../types";
import { NEON } from "../theme";
import { useCardActions } from "../BaseCard";
import { ConnectionDots } from "../ConnectionDots";
import { spotStyle, useSpotTarget } from "../SpotlightContext";
import { ELEM_BTN, ELEM_TOOLBAR, ElementChrome, ElementResizer, useFrameEntryReplay } from "./elements";

/** Shared shell: scales a 1080-wide frame into the node and hosts the toolbar. */
function BlastShell({ id, w, h, posLock, selected, children, toolbar }: {
  id: string; w: number; h: number; posLock?: boolean; selected: boolean;
  children: React.ReactNode; toolbar?: React.ReactNode;
}) {
  const { toFront } = useCardActions(id);
  const spot = useSpotTarget(id, "self");
  const cleanShot = spot.state === "spot";
  const { nav } = useFrameEntryReplay(id);
  return (
    <div onPointerDownCapture={toFront} className="group/el animate-in fade-in relative duration-150" style={{ width: w, minHeight: h }}>
      <ConnectionDots />
      {!cleanShot && <ElementChrome id={id} posLock={posLock} selected={selected} />}
      {/* keepAspect: these are 9:16 deliverables — a squashed frame is a wasted take */}
      <ElementResizer id={id} selected={selected && !cleanShot} minWidth={220} minHeight={391} keepAspect />
      <div {...spot.props} style={{ width: w, height: h, overflow: "hidden", borderRadius: 8, ...spotStyle(spot.state) }}>
        {children}
      </div>
      {!cleanShot && !nav.film && toolbar ? (
        <div className={ELEM_TOOLBAR} style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}>{toolbar}</div>
      ) : null}
    </div>
  );
}

const field = {
  className: "nodrag h-5 rounded px-1 text-[9px]",
  style: { color: NEON.text, background: "transparent", border: `1px solid ${NEON.borderSoft}` } as React.CSSProperties,
};

/** The keyed/navy toggle every frame shares — OBS keys the transparent one. */
const KeyBtn = ({ on, onClick }: { on?: boolean; onClick: () => void }) => (
  <button className={ELEM_BTN} style={{ color: on ? NEON.yellow : NEON.muted, border: `1px solid ${NEON.borderSoft}` }}
    onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onClick(); }}
    title="Transparent background for OBS keying (else navy)">{on ? "keyed" : "navy"}</button>
);

/** THE COLD OPEN (2026-09-03) — the bolt zoom, ticker and wordmark, as a frame
 *  element. Nothing to type: it is the same for every rip by design. */
export function BlastOpenNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as BlastOpenElement;
  const { update } = useCardActions(id);
  const w = d.w ?? 540, h = d.h ?? 960;
  return (
    <BlastShell id={id} w={w} h={h} posLock={d.posLock} selected={selected}
      toolbar={<>
        <select className="nodrag" value={isZoomVariant(d.variant) ? d.variant : "zoom"} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ variant: e.target.value })}
          style={{ background: "rgba(0,0,0,0.4)", color: NEON.text, border: `1px solid ${NEON.borderSoft}`, borderRadius: 4, fontSize: 10 }} title="Which of the six looks">
          {ZOOM_VARIANTS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <span className="text-[9px] font-bold uppercase" style={{ color: NEON.muted }}>psych</span>
        <input type="range" min={0} max={1} step={0.05} value={d.psych ?? 0.1} className="nodrag" style={{ width: 90 }}
          onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ psych: Number(e.target.value) })} title="0 = brand colours at rest · 1 = full trip" />
        <button className={ELEM_BTN} style={{ color: d.banner !== false ? NEON.yellow : NEON.muted, border: `1px solid ${NEON.borderSoft}` }}
          onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); update({ banner: d.banner === false }); }} title="The campus banner along the lower third">banner</button>
      </>}>
      <BoltZoom w={w} h={h} mode={d.bare ? "bolt" : "open"} variant={isZoomVariant(d.variant) ? d.variant : "zoom"} psych={d.psych ?? 0.1} banner={d.banner !== false} live />
    </BlastShell>
  );
}

/** THE AD SLIDE — one of the three ads, picked in the toolbar. */
export function BlastAdNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as BlastAdElement;
  const { update } = useCardActions(id);
  const w = d.w ?? 540, h = d.h ?? 960;
  return (
    <BlastShell id={id} w={w} h={h} posLock={d.posLock} selected={selected}
      toolbar={<select className="nodrag" value={isAdKind(d.ad) ? d.ad : "greek"} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ ad: e.target.value })}
        style={{ background: "rgba(0,0,0,0.4)", color: NEON.text, border: `1px solid ${NEON.borderSoft}`, borderRadius: 4, fontSize: 10 }} title="Which ad">
        {AD_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>}>
      <AdSlide ad={isAdKind(d.ad) ? d.ad : "greek"} w={w} h={h} live copy={{ label: d.label, headline: d.headline, lines: d.lines, url: d.url }} />
    </BlastShell>
  );
}

export function BlastIntroNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as BlastIntroElement;
  const { update } = useCardActions(id);
  const w = d.w ?? 540, h = d.h ?? 960;
  return (
    <BlastShell id={id} w={w} h={h} posLock={d.posLock} selected={selected}
      toolbar={<>
        <input {...field} style={{ ...field.style, width: 200 }} value={d.topic ?? ""} placeholder="Set name (e.g. Accounting cycle order)"
          onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ topic: e.target.value })} />
        <input {...field} style={{ ...field.style, width: 110 }} value={d.tutor ?? ""} placeholder="tutor"
          onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ tutor: e.target.value })} />
        <KeyBtn on={d.transparent} onClick={() => update({ transparent: !d.transparent })} />
      </>}>
      <BoltZoom w={w} h={h} mode="intro" topic={d.topic || "Set name"} tutor={d.tutor || "Lee Ingram"} live />
    </BlastShell>
  );
}

export function BlastFoyeNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as BlastFoyeElement & { setStems?: string[] };
  const { update } = useCardActions(id);
  const w = d.w ?? 540, h = d.h ?? 960;
  return (
    <BlastShell id={id} w={w} h={h} posLock={d.posLock} selected={selected}
      toolbar={<>
        <input {...field} style={{ ...field.style, width: 230 }} value={d.canonical ?? ""} placeholder="Canonical stem (blank = generated)"
          onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ canonical: e.target.value })} />
        <KeyBtn on={d.transparent} onClick={() => update({ transparent: !d.transparent })} />
      </>}>
      <FoundOnYourExam stems={d.setStems ?? []} canonical={d.canonical || undefined} variations={d.variations}
        transparent={d.transparent} scale={w / V.w} />
    </BlastShell>
  );
}

export function BlastPhraseNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as BlastPhraseElement;
  const { update } = useCardActions(id);
  const w = d.w ?? 540, h = d.h ?? 960;
  return (
    <BlastShell id={id} w={w} h={h} posLock={d.posLock} selected={selected}
      toolbar={<>
        <input {...field} style={{ ...field.style, width: 260 }} value={d.text ?? ""} placeholder="The phrase, in Lee's words"
          onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ text: e.target.value })} />
        <KeyBtn on={d.transparent} onClick={() => update({ transparent: !d.transparent })} />
      </>}>
      <PhraseFrame text={d.text || "The phrase"} transparent={d.transparent} scale={w / V.w} />
    </BlastShell>
  );
}

export function BlastCheatNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as BlastCheatElement;
  const { update } = useCardActions(id);
  const w = d.w ?? 540, h = d.h ?? 960;
  return (
    <BlastShell id={id} w={w} h={h} posLock={d.posLock} selected={selected}
      toolbar={<>
        <input {...field} style={{ ...field.style, width: 190 }} value={d.cheatTitle ?? ""} placeholder="The rule"
          onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ cheatTitle: e.target.value })} />
        <input {...field} style={{ ...field.style, width: 190 }} value={d.body ?? ""} placeholder="Why / when (optional)"
          onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ body: e.target.value })} />
        <KeyBtn on={d.transparent} onClick={() => update({ transparent: !d.transparent })} />
      </>}>
      <CheatCodeFrame title={d.cheatTitle || "The rule"} body={d.body || undefined} transparent={d.transparent} scale={w / V.w} />
    </BlastShell>
  );
}

export function BlastTipNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as BlastTipElement;
  const { update } = useCardActions(id);
  const w = d.w ?? 540, h = d.h ?? 960;
  return (
    <BlastShell id={id} w={w} h={h} posLock={d.posLock} selected={selected}
      toolbar={<>
        <input {...field} style={{ ...field.style, width: 260 }} value={d.text ?? ""} placeholder="The tip"
          onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ text: e.target.value })} />
        <KeyBtn on={d.transparent} onClick={() => update({ transparent: !d.transparent })} />
      </>}>
      <TipFrame text={d.text || "The tip"} transparent={d.transparent} scale={w / V.w} />
    </BlastShell>
  );
}

export function BlastOutroNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as BlastOutroElement;
  const { update } = useCardActions(id);
  const w = d.w ?? 540, h = d.h ?? 960;
  return (
    <BlastShell id={id} w={w} h={h} posLock={d.posLock} selected={selected}
      toolbar={<>
        <input {...field} style={{ ...field.style, width: 220 }} value={d.tagline ?? ""} placeholder="Cram what's on your exam."
          onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ tagline: e.target.value })} />
        <KeyBtn on={d.transparent} onClick={() => update({ transparent: !d.transparent })} />
      </>}>
      <div className="sa-outro-fade"><SurviveOutro tagline={d.tagline || undefined} domain={d.domain || undefined} transparent={d.transparent} scale={w / V.w} /></div>
    </BlastShell>
  );
}

/** THE BIO SLOT. Four fields, all optional — blank means SurviveBio's default,
 *  which is where the cleared claims live. Lee edits them here when a frame
 *  needs different words, and nowhere else. */
export function BlastBioNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as BlastBioElement;
  const { update } = useCardActions(id);
  const w = d.w ?? 540, h = d.h ?? 960;
  return (
    <BlastShell id={id} w={w} h={h} posLock={d.posLock} selected={selected}
      toolbar={<>
        <input {...field} style={{ ...field.style, width: 120 }} value={d.name ?? ""} placeholder="Lee Ingram"
          onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ name: e.target.value })} />
        <input {...field} style={{ ...field.style, width: 180 }} value={d.credentials ?? ""} placeholder="BAccy · MAccy — Ole Miss"
          onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ credentials: e.target.value })} />
        <input {...field} style={{ ...field.style, width: 210 }} value={d.claim ?? ""} placeholder="1,000+ students tutored since 2015"
          onPointerDown={(e) => e.stopPropagation()} onChange={(e) => update({ claim: e.target.value })} />
        <KeyBtn on={d.transparent} onClick={() => update({ transparent: !d.transparent })} />
      </>}>
      <SurviveBio name={d.name || undefined} credentials={d.credentials || undefined}
        claim={d.claim || undefined} domain={d.domain || undefined}
        transparent={d.transparent} scale={w / V.w} />
    </BlastShell>
  );
}
