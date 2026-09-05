// THE OPTIONAL ILLUSTRATION on a slide — two homes, one component.
//
// THE BAND (default under a card): PhoneFrame mounts this as the stage's SECOND child, after
// FrameView, so the stage's centred grid places it in its own row under the card — it inherits
// the capture camera's transform and is re-keyed per frame like everything else on the stage.
//
// PLACED (Lee, 2026-09-05: "shouldn't we be able to just resize and drag around an
// illustration if we needed to?"): once a picture has a `placement` — or the slide is blank,
// where the picture IS the slide and sits dead centre — PhoneFrame mounts it as a phone-level
// layer at that spot, carrying the same camera transform. On Review the picture drags (move)
// and its corner grip resizes; the result is saved on the frame as fractions of the phone, so
// it films at the same spot at any width. Dragging a band picture converts it to a placed one.
//
// Nothing here is a network call at render time beyond the <img> itself, which points at OUR
// bucket (never the provider's expiring URL). A fetch failure is loud: a small label, not a
// blank. Hoisted function declarations only — this file is on the canvas graph via PhoneFrame.
import { useRef, useState } from "react";

import { RasterBoil } from "@/components/brand-cards/RasterBoil";
import { BOIL_SECONDS } from "@/components/brand-cards/raster-boil";

import { defaultPlacement, type FrameIllustration, type IllustrationPlacement } from "./illustration";
import { CAPTION_RAIL, SAFE } from "./layout";

/** The band's size under a card: the safe column's width, a fixed share of the frame's height
 *  that stays clear of the rail on a pass-2 card. The picture is square (1024×1024), contained. */
export function bandSize(w: number, h: number): { bw: number; bh: number; marginTop: number } {
  const bw = Math.round(w * (SAFE.right - SAFE.left) * 0.62);
  const bh = Math.min(bw, Math.round(h * (CAPTION_RAIL.top - 0.02 - 0.36)));
  return { bw, bh, marginTop: Math.round(h * 0.018) };
}

/** Keep a placement on the phone: the centre inside the frame, the width between a thumb and
 *  the whole width. Pure. */
export function clampPlacement(p: IllustrationPlacement): IllustrationPlacement {
  const w = Math.min(0.98, Math.max(0.12, p.w));
  return { x: Math.min(1 - w / 2 + 0.1, Math.max(w / 2 - 0.1, p.x)), y: Math.min(1.05, Math.max(-0.05, p.y)), w };
}

/** The picture itself, at a given box. `data-sa-illustration` marks it for the camera's
 *  keep-off measurement (PhoneFrame reads the attribute, not the component). */
function Picture({ ill, width, height, live, boilFrame, onFail }: {
  ill: FrameIllustration; width: number; height: number; live: boolean; boilFrame?: number; onFail: () => void;
}) {
  const preset = ill.animationPreset ?? "boil";
  if (preset === "none") {
    return (
      <span style={{ position: "relative", display: "block", width, height }}>
        <img src={ill.assetUrl ?? ""} alt={ill.prompt ?? ""} decoding="sync" loading="eager" draggable={false} onError={onFail}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
      </span>
    );
  }
  return (
    <span style={{ display: "block", width, height }} onErrorCapture={onFail}>
      <RasterBoil src={ill.assetUrl ?? ""} width={width} height={height} alt={ill.prompt ?? ""} live={live} boilFrame={boilFrame}
        boilSeconds={preset === "boil-calm" ? BOIL_SECONDS["boil-calm"] : BOIL_SECONDS.boil}
        options={{ seed: ill.seed ?? 7 }} />
    </span>
  );
}

function Failed({ w, h }: { w: number; h: number }) {
  return (
    <div data-sa-illustration="" style={{ width: Math.round(w * 0.6), height: Math.round(h * 0.04), display: "grid", placeItems: "center", color: "rgba(252,163,17,0.9)", fontSize: Math.round(h * 0.014), fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
      illustration failed to load
    </div>
  );
}

/** THE BAND — under the card, inside the stage. `onPlace` (Review only) lets a drag lift it
 *  out of the band into a placed picture: the first move converts the band box to fractions. */
export function IllustrationLayer({ ill, w, h, live, boilFrame, onPlace }: {
  ill: FrameIllustration; w: number; h: number; live: boolean; boilFrame?: number;
  onPlace?: (p: IllustrationPlacement) => void;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  if (!ill.assetUrl) return null;
  if (failed) return <Failed w={w} h={h} />;
  const { bw, bh, marginTop } = bandSize(w, h);
  function lift(e: React.PointerEvent) {
    if (!onPlace || e.button !== 0) return;
    const el = ref.current; const phone = el?.closest("[data-sa-phone]") as HTMLElement | null;
    if (!el || !phone) return;
    const r = el.getBoundingClientRect(), p = phone.getBoundingClientRect();
    e.preventDefault();
    onPlace(clampPlacement({ x: (r.left + r.width / 2 - p.left) / p.width, y: (r.top + r.height / 2 - p.top) / p.height, w: r.width / p.width }));
  }
  return (
    <span ref={ref} data-sa-illustration="" onPointerDown={onPlace ? lift : undefined}
      style={{ display: "block", marginTop, width: bw, height: bh, cursor: onPlace ? "grab" : undefined }}
      title={onPlace ? "Drag to place the picture anywhere on the slide" : undefined}>
      <Picture ill={ill} width={bw} height={bh} live={live} boilFrame={boilFrame} onFail={() => setFailed(true)} />
    </span>
  );
}

/** PLACED — a phone-level layer at `placement` (or the blank slide's centre). Drag moves,
 *  the corner grip resizes; both commit through `onPlace` on release. Carries the capture
 *  camera's transform (`stageStyle`) so it zooms and blurs with the slide. */
export function PlacedIllustration({ ill, w, h, live, boilFrame, kind, onPlace, stageStyle }: {
  ill: FrameIllustration; w: number; h: number; live: boolean; boilFrame?: number; kind: string;
  onPlace?: (p: IllustrationPlacement) => void;
  stageStyle?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const [drag, setDrag] = useState<IllustrationPlacement | null>(null);
  const start = useRef<{ mode: "move" | "size"; px: number; py: number; from: IllustrationPlacement } | null>(null);
  if (!ill.assetUrl) return null;
  const base = ill.placement ?? defaultPlacement(kind);
  const p = drag ?? base;
  const size = Math.round(p.w * w);
  const left = Math.round(p.x * w - size / 2), top = Math.round(p.y * h - size / 2);

  function down(mode: "move" | "size") {
    return (e: React.PointerEvent) => {
      if (!onPlace || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      start.current = { mode, px: e.clientX, py: e.clientY, from: p };
      setDrag(p);
    };
  }
  function move(e: React.PointerEvent) {
    const s = start.current; if (!s) return;
    const dx = (e.clientX - s.px) / w, dy = (e.clientY - s.py) / h;
    if (s.mode === "move") setDrag(clampPlacement({ ...s.from, x: s.from.x + dx, y: s.from.y + dy }));
    else {
      // The grip is the bottom-right corner: growing keeps the top-left where it was.
      const nw = s.from.w + dx;
      const next = clampPlacement({ ...s.from, w: nw });
      setDrag({ ...next, x: s.from.x - s.from.w / 2 + next.w / 2, y: s.from.y - (s.from.w * w) / h / 2 + (next.w * w) / h / 2 });
    }
  }
  function up() {
    const s = start.current; start.current = null;
    if (s && drag && onPlace) onPlace(drag);
    setDrag(null);
  }

  if (failed) {
    return <div style={{ position: "absolute", left, top, width: size }}><Failed w={w} h={h} /></div>;
  }
  return (
    <div data-sa-illustration="" onPointerDown={down("move")} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      title={onPlace ? "Drag to move · the corner grip resizes" : undefined}
      style={{ position: "absolute", left, top, width: size, height: size, cursor: onPlace ? (drag ? "grabbing" : "grab") : undefined,
        touchAction: "none", userSelect: "none", ...stageStyle }}>
      <Picture ill={ill} width={size} height={size} live={live} boilFrame={boilFrame} onFail={() => setFailed(true)} />
      {onPlace && (
        <>
          <span aria-hidden style={{ position: "absolute", inset: 0, border: `1px dashed rgba(252,163,17,${drag ? 0.9 : 0.35})`, borderRadius: 4, pointerEvents: "none" }} />
          <span role="button" aria-label="Resize the picture" onPointerDown={down("size")}
            style={{ position: "absolute", right: -6, bottom: -6, width: 14, height: 14, borderRadius: 3, background: "#FCA311", border: "2px solid #0B1220", cursor: "nwse-resize", touchAction: "none" }} />
        </>
      )}
    </div>
  );
}
