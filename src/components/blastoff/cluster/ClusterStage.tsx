// THE MAP'S STAGE — the field inside the phone (2026-09-07).
//
// Lee: "Where we can like see the entire cluster from birds eye view in the frame, but we can go
// swim around for it in the capture window." A cluster frame IS the whole 9:16 slide: a black
// stage, a playfield bigger than the phone, typed nodes on it (cluster-spec.ts), the posting
// arrows between them, and ONE camera — a single transformed layer, `translate / scale` from the
// shot's camera (cameraAt) plus the film's free-roam offset (capture/field-roam.ts), moved with
// the same 480 ms overshoot the camera ring uses (Webcam.tsx), a plain ease when only the zoom
// shrinks, none while a drag flies.
//
// THE REVEAL IS THE SPACEBAR (BlastOffCapture walks `shot`): a node not yet in
// visibleAt(spec, shot) is NOT DRAWN — never in the DOM until it is revealed, so a screen capture
// cannot leak it; a node revealed this shot rises in; a stepwise node (an entry, a list) gets
// its `steps` count and reveals inside itself. Everything drawn is a ResolvedNode
// (cluster-models.ts) — the renderers in ./nodes derive nothing.
//
// Field units: the phone is 1080 × 1920 (cluster-spec's PHONE); `w` is the phone's CSS width and
// the whole thing scales from it, like every full-frame kind (frame-view.tsx).
import { createContext, useEffect, useMemo, useRef } from "react";

import type { BoothSetInfo } from "@/lib/talkthrough.functions";

import type { FieldRoam } from "../capture/field-roam";
import { effectiveCamera, NO_ROAM } from "../capture/field-roam";
import { resolveCluster, withArrowOverrides, type ArrowOverrides, type EqTerm, type ResolvedNode } from "./cluster-models";
import { PHONE, cameraAt, overviewCamera, shotsOf, visibleAt, type ClusterCamera, type ClusterEdge, type ClusterNode, type ClusterSpec } from "./cluster-spec";
import { AccountsNode } from "./nodes/AccountsNode";
import { CalloutNode } from "./nodes/CalloutNode";
import { CeqNode } from "./nodes/CeqNode";
import { EquationNode } from "./nodes/EquationNode";
import { JeNode } from "./nodes/JeNode";
import { NoteNode } from "./nodes/NoteNode";
import { TAccountNode } from "./nodes/TAccountNode";
import { TbNode } from "./nodes/TbNode";
import { BRAND_FONT, INK, NODE_CSS } from "./nodes/theme";

/** The camera ring's choreography curve (capture/Webcam.tsx OVERSHOOT) — one gesture, one curve. */
export const OVERSHOOT = "cubic-bezier(0.34, 1.3, 0.64, 1)";

/** WHAT THE FILM KNOWS about a map frame, handed to FrameView without threading a prop through
 *  PhoneFrame: the shot being walked, the roam, the take's arrow overrides and the click that
 *  cycles an arrow. Absent (the Review stage, the next-slide preview) → the overview with
 *  everything revealed: the whole map as one picture. */
export interface ClusterFilm {
  shot: number;
  roam?: FieldRoam;
  /** Draw the bird's-eye with everything revealed (the main window's NEXT preview). */
  overview?: boolean;
  arrowOverrides?: ArrowOverrides;
  onArrowCycle?: (nodeId: string, term: EqTerm) => void;
}
export const ClusterFilmContext = createContext<ClusterFilm | null>(null);

/** The field's transform in phone units: the camera's centre lands on the phone's centre. */
export function fieldTransform(cam: ClusterCamera, phone = PHONE): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  return `translate(${r(phone.w / 2 - cam.x * cam.zoom)}px, ${r(phone.h / 2 - cam.y * cam.zoom)}px) scale(${r(cam.zoom)})`;
}

/** The dotted grid's opacity: there at the bird's-eye, gone by the time a node fills the phone. */
export const gridOpacity = (zoom: number): number => Math.max(0, Math.min(1, (0.75 - zoom) / 0.45));

/** Where an edge leaves a box: the point on its border along the line to `to`'s centre. */
export function edgeAnchor(from: Pick<ClusterNode, "x" | "y" | "w" | "h">, to: Pick<ClusterNode, "x" | "y" | "w" | "h">): { x: number; y: number } {
  const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
  const tx = to.x + to.w / 2, ty = to.y + to.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? (from.w / 2) / Math.abs(dx) : Infinity, sy = dy ? (from.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

export function ClusterStage({ spec, set, w, shot, live, roam, overview = false, arrowOverrides, onArrowCycle }: {
  spec: ClusterSpec;
  set: BoothSetInfo | null;
  /** The phone's CSS width. */
  w: number;
  shot: number;
  live: boolean;
  roam?: FieldRoam;
  overview?: boolean;
  arrowOverrides?: ArrowOverrides;
  onArrowCycle?: (nodeId: string, term: EqTerm) => void;
}) {
  const h = Math.round(w * PHONE.h / PHONE.w);
  const k = w / PHONE.w;
  const shots = shotsOf(spec);
  const last = Math.max(0, shots.length - 1);
  const at = overview ? last : Math.max(0, Math.min(shot, last));
  const resolved = useMemo(() => withArrowOverrides(resolveCluster(spec), arrowOverrides), [spec, arrowOverrides]);
  const visible = useMemo(() => visibleAt(spec, at), [spec, at]);
  const before = useMemo(() => (at > 0 && !overview ? visibleAt(spec, at - 1).nodes : new Set<string>()), [spec, at, overview]);
  const shotCam = overview ? overviewCamera(spec.field) : cameraAt(spec, at);
  const cam = effectiveCamera(shotCam, roam ?? NO_ROAM);
  const gesture = roam?.gesture ?? "none";

  // THE TRANSITION: a drag flies, a wheel tick eases short, a shot change gets the choreography
  // curve — unless it only pulls back in place (same centre, smaller zoom), which reads as a
  // bounce with overshoot and gets a plain ease (the camera ring's own rule).
  const prev = useRef<ClusterCamera>(cam);
  const p = prev.current;
  const shrinkOnly = Math.abs(p.x - cam.x) < 0.5 && Math.abs(p.y - cam.y) < 0.5 && cam.zoom < p.zoom;
  const transition = gesture === "drag" ? "none" : gesture === "wheel" ? "transform 120ms ease-out" : `transform 480ms ${shrinkOnly ? "ease" : OVERSHOOT}`;
  useEffect(() => { prev.current = cam; });

  const byId = useMemo(() => new Map(spec.nodes.map((n) => [n.id, n])), [spec.nodes]);
  const edges = spec.edges.filter((e) => visible.nodes.has(e.from) && visible.nodes.has(e.to));
  const mk = `sa-map-${spec.id}`;

  return (
    <div data-sa-map="" style={{ width: w, height: h, background: "#000", position: "relative", overflow: "hidden", fontFamily: BRAND_FONT }}>
      <style>{NODE_CSS}</style>
      {/* the phone-unit layer: 1080 × 1920, scaled to the CSS width like every full-frame kind */}
      <div style={{ position: "absolute", left: 0, top: 0, width: PHONE.w, height: PHONE.h, transform: `scale(${k})`, transformOrigin: "0 0", overflow: "hidden" }}>
        {/* THE CAMERA — one transformed layer, the field */}
        <div data-sa-field="" style={{ position: "absolute", left: 0, top: 0, width: spec.field.w, height: spec.field.h, transform: fieldTransform(cam), transformOrigin: "0 0", transition, willChange: "transform" }}>
          {/* The bird's-eye reads as a place: a faint dotted grid and the field's own edge, both
              fading out as the camera comes in on a node. */}
          <div style={{ position: "absolute", inset: 0, opacity: gridOpacity(cam.zoom), transition: "opacity 480ms ease", pointerEvents: "none",
            backgroundImage: "radial-gradient(rgba(245,239,230,0.22) 1.5px, transparent 2px)", backgroundSize: "120px 120px", backgroundPosition: "60px 60px",
            boxShadow: "inset 0 0 0 2px rgba(245,239,230,0.14)" }} />
          {/* THE EDGES, under the nodes: post = gold with an arrowhead; arrow = cream with an
              arrowhead; link = a muted dashed line. Only between revealed nodes. */}
          {edges.length > 0 && (
            <svg width={spec.field.w} height={spec.field.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
              <defs>
                <marker id={`${mk}-gold`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={INK.gold} /></marker>
                <marker id={`${mk}-cream`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={INK.cream} /></marker>
              </defs>
              {edges.map((e, i) => <Edge key={`${e.from}-${e.to}-${i}`} edge={e} from={byId.get(e.from)!} to={byId.get(e.to)!} mk={mk} />)}
            </svg>
          )}
          {/* THE NODES — only the revealed ones exist. */}
          {spec.nodes.filter((n) => visible.nodes.has(n.id)).map((n) => {
            const r = resolved.get(n.id);
            if (!r) return null;
            const steps = visible.steps.get(n.id) ?? 1;
            const fresh = !before.has(n.id);
            return (
              <div key={n.id} data-sa-map-node={n.id} className={fresh && live ? "sa-map-rise" : undefined} style={{ position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h }}>
                {n.title && r.view.kind !== "equation" && r.view.kind !== "accounts" && (
                  <div style={{ position: "absolute", left: 0, bottom: "100%", marginBottom: Math.round(n.w * 0.02), fontSize: Math.max(18, Math.round(n.w * 0.045)), fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: INK.gold, whiteSpace: "nowrap" }}>{n.title}</div>
                )}
                <NodeBody r={r} steps={steps} live={live} set={set} onCycle={onArrowCycle ? (t) => onArrowCycle(n.id, t) : undefined} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Edge({ edge, from, to, mk }: { edge: ClusterEdge; from: ClusterNode; to: ClusterNode; mk: string }) {
  const a = edgeAnchor(from, to), b = edgeAnchor(to, from);
  const gold = edge.kind === "post";
  const stroke = gold ? INK.gold : edge.kind === "link" ? INK.creamFaint : INK.cream;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={gold ? 8 : 5} strokeLinecap="round" strokeDasharray={edge.kind === "link" ? "14 18" : undefined}
        markerEnd={edge.kind === "link" ? undefined : `url(#${mk}-${gold ? "gold" : "cream"})`} />
      {edge.label && (
        <text x={mx} y={my - 14} textAnchor="middle" fill={gold ? INK.gold : INK.creamMuted} fontFamily={BRAND_FONT} fontSize={30} fontWeight={700} style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 10, strokeLinejoin: "round" }}>{edge.label}</text>
      )}
    </g>
  );
}

function NodeBody({ r, steps, live, set, onCycle }: { r: ResolvedNode; steps: number; live: boolean; set: BoothSetInfo | null; onCycle?: (term: EqTerm) => void }) {
  const { node, view } = r;
  switch (view.kind) {
    case "equation": return <EquationNode w={node.w} h={node.h} view={view} live={live} onCycle={onCycle} />;
    case "accounts": return <AccountsNode w={node.w} h={node.h} view={view} steps={steps} />;
    case "je": return <JeNode w={node.w} h={node.h} view={view} steps={steps} />;
    case "taccount": return <TAccountNode w={node.w} h={node.h} view={view} />;
    case "tb": return <TbNode w={node.w} h={node.h} view={view} />;
    case "ceq": return <CeqNode id={node.id} w={node.w} ceqId={view.ceqId} set={set} live={live} />;
    case "callout": return <CalloutNode id={node.id} w={node.w} view={view} live={live} />;
    case "note": return <NoteNode w={node.w} h={node.h} view={view} />;
  }
}

/** The empty map — the frame exists, nothing built yet (the Editor's Map face fills it). */
export function EmptyMap({ w }: { w: number }) {
  const h = Math.round(w * PHONE.h / PHONE.w);
  return (
    <div style={{ width: w, height: h, background: "#000", display: "grid", placeItems: "center", color: INK.creamFaint, fontFamily: BRAND_FONT, fontSize: Math.max(12, Math.round(w * 0.028)), fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
      Map — nothing built yet
    </div>
  );
}
