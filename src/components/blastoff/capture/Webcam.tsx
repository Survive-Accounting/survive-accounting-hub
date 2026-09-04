// THE CAMERA on the slide — Lee's face, in the frame, where the slide says.
//
// The old canvas bubble ("b", canvas/CameraBubble.tsx) was a screen-fixed
// overlay Lee dragged around. This one belongs to the SLIDE: the phone draws
// it at one of the spots in webcam-spots.ts (home / corner / hero / free /
// off, chosen per slide on Review, overridden per take with B), inside the
// 9:16 frame, so OBS window-captures the camera together with the slide and
// the placement is the same every time. It shrinks on its own when a card
// would be under it (avoidCard) — the one thing an in-app feed can do that an
// OBS overlay cannot.
//
// live=false (the Review and Arrange stages) draws a placeholder — no camera
// permission prompt while Lee is arranging. live=true (the capture) asks for
// the webcam, mirrors it, and fails soft: a quiet "no camera" ring, never a
// crash. The look: a cream ring with a soft glow and a navy shadow, a small
// nametag under the home circle.
import { useEffect, useRef, useState } from "react";

import { avoidCard, camRect, type Box, type CamRect, type CamSpot } from "./webcam-spots";

const CREAM = "#F5EFE6";
const NAVY = "#14213D";
const GOLD = "#FCA311";
const NAME = "Lee Ingram";

export function WebcamFrame({ w, h, spot, size, pos, live, cardBox, onFree, mirror = true }: {
  w: number; h: number;
  spot: Exclude<CamSpot, "off">;
  /** Free spot (and an override on the fixed spots): width as a fraction of the phone. */
  size?: number;
  /** Free spot: top-left as fractions of the phone. */
  pos?: { x: number; y: number };
  live: boolean;
  /** The live card's box in phone px, for avoidCard; null = nothing to avoid. */
  cardBox?: Box | null;
  /** Free spot on the Review stage: drag / wheel-resize write back here (fractions). */
  onFree?: (p: { pos?: { x: number; y: number }; size?: number }) => void;
  mirror?: boolean;
}) {
  const base = camRect(spot, w, h, size, pos);
  const fit = avoidCard(base, spot, cardBox ?? null);
  const r: CamRect = fit.rect;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [live]);

  // FREE: drag to move, wheel to resize — on the Review stage, written to the frame.
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const editable = spot === "free" && !!onFree;
  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!editable) return;
    e.preventDefault(); e.stopPropagation();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.x, oy: r.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || !onFree) return;
    const nx = Math.max(0, Math.min(w - r.w, d.ox + (e.clientX - d.sx)));
    const ny = Math.max(0, Math.min(h - r.h, d.oy + (e.clientY - d.sy)));
    onFree({ pos: { x: Math.round((nx / w) * 1000) / 1000, y: Math.round((ny / h) * 1000) / 1000 } });
  }
  function onUp() { drag.current = null; }
  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!editable || !onFree) return;
    e.preventDefault(); e.stopPropagation();
    const cur = size ?? 0.26;
    onFree({ size: Math.max(0.12, Math.min(0.9, Math.round((cur * (e.deltaY < 0 ? 1.06 : 0.94)) * 1000) / 1000)) });
  }

  const ring = Math.max(2, Math.round(r.w * 0.018));
  const radius = r.shape === "circle" ? "50%" : Math.round(r.w * 0.09);
  const tag = spot === "home" || spot === "free";
  return (
    <div data-sa-cam={spot} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel}
      title={editable ? "Drag to move · wheel to resize" : undefined}
      style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, zIndex: 12, cursor: editable ? "grab" : undefined, pointerEvents: editable ? "auto" : "none",
        transition: "left 220ms ease, top 220ms ease, width 220ms ease, height 220ms ease" }}>
      {/* the ring: cream, a soft outer glow, a navy shadow — never loud */}
      <div style={{ position: "absolute", inset: 0, borderRadius: radius, padding: ring, background: `linear-gradient(160deg, ${CREAM}, rgba(245,239,230,0.72))`,
        boxShadow: `0 0 0 ${Math.round(ring * 2.2)}px rgba(245,239,230,0.10), 0 ${Math.round(r.w * 0.06)}px ${Math.round(r.w * 0.16)}px -${Math.round(r.w * 0.05)}px rgba(0,0,0,0.75)` }}>
        <div style={{ width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", background: live ? "#000" : "rgba(20,33,61,0.55)", position: "relative" }}>
          {live && !err && <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: mirror ? "scaleX(-1)" : undefined, display: "block" }} />}
          {(!live || err) && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", textAlign: "center", padding: "8%" }}>
              <div>
                <div style={{ fontSize: Math.round(r.w * 0.2), lineHeight: 1 }}>🎥</div>
                <div style={{ fontSize: Math.max(9, Math.round(r.w * 0.07)), fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: Math.round(r.w * 0.04), opacity: 0.85 }}>{err ? "no camera" : "camera"}</div>
                {err && <div style={{ fontSize: Math.max(8, Math.round(r.w * 0.05)), opacity: 0.6, marginTop: 4 }}>allow the webcam for this site</div>}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* the nametag — under the home circle only; the hero and corner speak for themselves */}
      {tag && (
        <div style={{ position: "absolute", left: "50%", bottom: -Math.round(r.w * 0.09), transform: "translateX(-50%)", whiteSpace: "nowrap", borderRadius: 999, background: CREAM, color: NAVY,
          padding: `${Math.round(r.w * 0.015)}px ${Math.round(r.w * 0.09)}px`, fontFamily: "'League Spartan', 'Rubik', system-ui, sans-serif", fontWeight: 800, fontSize: Math.max(9, Math.round(r.w * 0.085)), lineHeight: 1.3,
          boxShadow: "0 8px 20px -10px rgba(0,0,0,0.7)", pointerEvents: "none" }}>
          {NAME}
          <span style={{ display: "block", margin: "1px auto 0", width: "60%", height: 2, borderRadius: 2, background: GOLD }} />
        </div>
      )}
    </div>
  );
}
