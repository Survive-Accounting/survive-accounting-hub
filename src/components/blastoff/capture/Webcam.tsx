// THE CAMERA on the slide — Lee's face, in the frame, where the slide says.
//
// The old canvas bubble ("b", canvas/CameraBubble.tsx) was a screen-fixed
// overlay Lee dragged around. This one belongs to the SLIDE: the phone draws
// it at one of the spots in webcam-spots.ts (home / corner / hero / top /
// free / off, chosen per slide on Review, overridden per take with B), inside
// the 9:16 frame, so OBS window-captures the camera together with the slide
// and the placement is the same every time. It shrinks on its own when a card
// would be under it (avoidCard). Walking between spots animates — Lee: "the
// camera movement is really cool how it animates around."
//
// THE MOMENT (2026-09-05, the easter egg): Ctrl+click the camera and it takes
// the frame — grows to a big portrait in the middle, the slide dims behind it —
// for the line that matters. Ctrl+click again, ` or the next slide ends it.
//
// live=false (the Review and Arrange stages) draws a placeholder — no camera
// permission prompt while Lee is arranging. live=true (the capture) asks for
// the webcam, mirrors it, and fails soft. The look: a cream ring with a soft
// glow and a navy shadow. No nametag (Lee: "simple, elegant, modern").
import { useEffect, useRef, useState } from "react";

import { avoidCard, camRect, heroCamRect, type Box, type CamRect, type CamSpot } from "./webcam-spots";

const CREAM = "#F5EFE6";

const OVERSHOOT = "cubic-bezier(0.34, 1.3, 0.64, 1)";

export function WebcamFrame({ w, h, spot, size, pos, live, cardBox, onFree, mirror = true, moment = false, onMoment }: {
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
  /** The easter egg: the camera takes the frame. */
  moment?: boolean;
  /** Ctrl+click on the camera. */
  onMoment?: () => void;
}) {
  const base = camRect(spot, w, h, size, pos);
  const fit = avoidCard(base, spot, cardBox ?? null);
  const r: CamRect = moment ? heroCamRect(w, h) : fit.rect;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  // THE CHOREOGRAPHY CURVE overshoots — right for a move between spots, wrong for a shrink
  // in place: avoidCard pulling the ring in on a tall card read as a bounce on every slide
  // entrance. A same-spot, same-mode, smaller ring gets a plain ease. A drag gets none.
  const prevRef = useRef<{ spot: string; w: number; moment: boolean }>({ spot, w: r.w, moment });
  const shrinkOnly = prevRef.current.spot === spot && prevRef.current.moment === moment && r.w < prevRef.current.w;
  useEffect(() => { prevRef.current = { spot, w: r.w, moment }; });
  const [dragging, setDragging] = useState(false);
  const ease = shrinkOnly ? "ease" : OVERSHOOT;

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
  const editable = spot === "free" && !!onFree && !moment;
  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.ctrlKey || e.metaKey) { if (onMoment) { e.preventDefault(); e.stopPropagation(); onMoment(); } return; }
    if (!editable) return;
    e.preventDefault(); e.stopPropagation();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.x, oy: r.y };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || !onFree) return;
    const nx = Math.max(0, Math.min(w - r.w, d.ox + (e.clientX - d.sx)));
    const ny = Math.max(0, Math.min(h - r.h, d.oy + (e.clientY - d.sy)));
    onFree({ pos: { x: Math.round((nx / w) * 1000) / 1000, y: Math.round((ny / h) * 1000) / 1000 } });
  }
  function onUp() { drag.current = null; setDragging(false); }
  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!editable || !onFree) return;
    e.preventDefault(); e.stopPropagation();
    const cur = size ?? 0.26;
    onFree({ size: Math.max(0.12, Math.min(0.9, Math.round((cur * (e.deltaY < 0 ? 1.06 : 0.94)) * 1000) / 1000)) });
  }

  const ring = Math.max(2, Math.round(r.w * 0.016));
  const radius = r.shape === "circle" ? "50%" : Math.round(r.w * 0.09);
  return (
    <div data-sa-cam={moment ? "moment" : spot} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel}
      title={editable ? "Drag to move · wheel to resize · ctrl+click for the moment" : onMoment ? "ctrl+click: the camera takes the frame" : undefined}
      style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, zIndex: moment ? 30 : 12, cursor: editable ? "grab" : undefined, pointerEvents: editable || onMoment ? "auto" : "none",
        // The move between spots is the choreography — a touch of overshoot, never a snap.
        transition: dragging ? "none" : `left 480ms ${ease}, top 480ms ${ease}, width 480ms ${ease}, height 480ms ${ease}` }}>
      {/* the ring: cream, a soft outer glow, a navy shadow — never loud; the moment breathes */}
      <div style={{ position: "absolute", inset: 0, borderRadius: radius, padding: ring, background: `linear-gradient(160deg, ${CREAM}, rgba(245,239,230,0.7))`,
        boxShadow: moment
          ? `0 0 0 ${Math.round(ring * 3)}px rgba(252,163,17,0.18), 0 0 ${Math.round(r.w * 0.18)}px rgba(252,163,17,0.35), 0 ${Math.round(r.w * 0.06)}px ${Math.round(r.w * 0.2)}px -${Math.round(r.w * 0.05)}px rgba(0,0,0,0.8)`
          : `0 0 0 ${Math.round(ring * 2.2)}px rgba(245,239,230,0.10), 0 ${Math.round(r.w * 0.06)}px ${Math.round(r.w * 0.16)}px -${Math.round(r.w * 0.05)}px rgba(0,0,0,0.75)`,
        transition: "box-shadow 480ms ease, border-radius 480ms ease" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", background: live ? "#000" : "rgba(20,33,61,0.55)", position: "relative", transition: "border-radius 480ms ease" }}>
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
    </div>
  );
}
