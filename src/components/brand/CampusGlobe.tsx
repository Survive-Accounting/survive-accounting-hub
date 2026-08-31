// CAMPUS GLOBE — a rotating hologram globe of the campaign, driven by REAL data (see
// campus-globe.functions.ts): every campus in the system as a dim point, ready campuses
// brighter, live campuses lit with a pulsing ring, and arcs only when real events (approved
// chapter claims) exist. Zero events = zero arcs — the honest pre-launch state.
//
// LAZY BY CONTRACT (docs/BRAND-ANIMATION.md): react-globe.gl drags Three.js along, so nothing
// three-ish is imported at module scope. The component renders an empty placeholder until it
// scrolls near the viewport, THEN dynamic-imports the library and the vendored land shape
// (public/geo/land-110m.json — Natural Earth 110m COUNTRIES, public domain, same-origin;
// per-country features MINUS Antarctica, because h3's polyfill throws on the polar
// multipolygon — the single-feature "land" file was the source of an uncaught code:1 error).
// First paint of any page that mounts this is unaffected.
//
// LOOK: dot-matrix landmass over deep navy, glowing points, restraint everywhere else — the
// BioShock/Halo HUD family. School colours where known; the hologram accent otherwise.
//
// prefers-reduced-motion: no auto-rotation, no pulsing rings — a still, legible status map.
// `progress` (0..1) rotates the globe deterministically for offline rendering; omitted, it
// auto-rotates slowly on the live page.
import { useEffect, useRef, useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { campusLatLng } from "@/lib/globe/campus-geo";
import type { GlobeCampus, GlobeData, GlobeEvent } from "@/lib/globe/campus-globe.functions";

const ACCENT = "#FCA311";
const NAVY = "#0B1220";
const HOLO = "#5B8DEF";

type Pt = { lat: number; lng: number; status: GlobeCampus["status"]; name: string; color: string; r: number; alt: number };
type Arc = { startLat: number; startLng: number; endLat: number; endLng: number; color: string };
type Ring = { lat: number; lng: number };

function buildLayers(data: GlobeData, reduced: boolean) {
  const pts: Pt[] = [];
  const rings: Ring[] = [];
  for (const c of data.campuses) {
    const ll = campusLatLng(c.slug, c.state);
    if (!ll) continue;
    const [lat, lng] = ll;
    const color =
      c.status === "live" ? (c.c1 ?? ACCENT)
      : c.status === "ready" ? (c.c1 ?? HOLO)
      : "rgba(245,239,230,0.28)";
    pts.push({
      lat, lng, status: c.status, name: c.name, color,
      r: c.status === "live" ? 0.55 : c.status === "ready" ? 0.42 : 0.22,
      alt: c.status === "live" ? 0.045 : c.status === "ready" ? 0.025 : 0.008,
    });
    if (c.status === "live" && !reduced) rings.push({ lat, lng });
  }
  // Arcs between CONSECUTIVE real events, newest chaining backwards — energy travelling from
  // one launch to the next. Fewer than two events = no arcs, honestly.
  const placed = (e: GlobeEvent) => campusLatLng(e.campusSlug, e.campusState);
  const evs = data.events.map((e) => ({ e, ll: placed(e) })).filter((x) => x.ll) as Array<{ e: GlobeEvent; ll: [number, number] }>;
  const arcs: Arc[] = [];
  for (let i = 0; i + 1 < evs.length; i++) {
    arcs.push({ startLat: evs[i + 1].ll[0], startLng: evs[i + 1].ll[1], endLat: evs[i].ll[0], endLng: evs[i].ll[1], color: ACCENT });
  }
  return { pts, rings, arcs };
}

export function CampusGlobe({ data, progress, height = 420, sampleArcs = false, eager = false }: {
  data: GlobeData;
  /** 0..1 — deterministic rotation for offline rendering. Omitted = slow auto-rotate. */
  progress?: number;
  height?: number;
  /** LAB ONLY: draws clearly-labelled sample arcs so the arc styling can be judged before any
   *  real event exists. Never set on a public page — real events only there. */
  sampleArcs?: boolean;
  /** Skip the scroll-near lazy gate and load immediately. For the standalone preview and for
   *  offline rendering, where there is no scrolling to observe; public pages stay lazy. */
  eager?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any -- GlobeMethods, lazily typed
  const [near, setNear] = useState(false);
  const [GlobeComp, setGlobeComp] = useState<React.ComponentType<any> | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [land, setLand] = useState<Array<object>>([]);
  const [reduced, setReduced] = useState(false);
  const [w, setW] = useState(0);

  useEffect(() => { setReduced(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);

  // Load nothing until the globe is almost on screen (unless eager).
  useEffect(() => {
    if (eager) { setNear(true); return; }
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!near) return;
    let live = true;
    void import("react-globe.gl").then((m) => { if (live) setGlobeComp(() => m.default); });
    void fetch("/geo/land-110m.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((geo) => { if (live && geo?.features) setLand(geo.features as Array<object>); })
      .catch(() => { /* the globe stands without landmass — points still plot */ });
    return () => { live = false; };
  }, [near]);

  // Track the host width so the canvas fits its container (globe.gl wants pixel sizes).
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { pts, rings, arcs } = buildLayers(data, reduced);
  const shownArcs = sampleArcs && arcs.length === 0
    ? // LAB PREVIEW ONLY — three arcs between real LIVE campuses, so the styling is judgeable.
      pts.filter((p) => p.status === "live").slice(0, 4).flatMap((p, i, a) =>
        i + 1 < a.length ? [{ startLat: p.lat, startLng: p.lng, endLat: a[i + 1].lat, endLng: a[i + 1].lng, color: ACCENT }] : [])
    : arcs;

  // Camera: start over the US; `progress` spins deterministically, otherwise slow auto-rotate.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    if (progress !== undefined) {
      g.pointOfView({ lat: 30, lng: -95 + progress * 360, altitude: 1.9 }, 0);
      const c = g.controls?.(); if (c) c.autoRotate = false;
    } else {
      g.pointOfView({ lat: 34, lng: -95, altitude: 1.9 }, 0);
      const c = g.controls?.();
      if (c) { c.autoRotate = !reduced; c.autoRotateSpeed = 0.55; c.enableZoom = false; }
    }
  }, [GlobeComp, progress, reduced]);

  // eager (standalone preview / offline render) falls back to a fixed width when layout has
  // not produced one — an offline renderer may never fire ResizeObserver at all.
  const width = w > 0 ? w : eager ? 640 : 0;

  return (
    <div ref={hostRef} style={{ position: "relative", height, fontFamily: BRAND_SANS }}>
      {GlobeComp && width > 0 ? (
        <GlobeComp
          ref={globeRef}
          width={width}
          height={height}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={undefined}
          showGlobe
          globeImageUrl={null}
          showAtmosphere
          atmosphereColor={HOLO}
          atmosphereAltitude={0.16}
          hexPolygonsData={land}
          hexPolygonResolution={3}
          hexPolygonMargin={0.72}
          hexPolygonUseDots
          hexPolygonColor={() => "rgba(122,150,205,0.36)"}
          pointsData={pts}
          pointLat={(d: Pt) => d.lat}
          pointLng={(d: Pt) => d.lng}
          pointColor={(d: Pt) => d.color}
          pointAltitude={(d: Pt) => d.alt}
          pointRadius={(d: Pt) => d.r}
          pointLabel={(d: Pt) => `<div style="font: 700 12px ${BRAND_SANS}; color:#F5EFE6; background:rgba(11,18,32,0.92); border:1px solid rgba(245,239,230,0.2); border-radius:8px; padding:4px 8px;">${d.name}${d.status === "live" ? " · live" : d.status === "ready" ? " · ready" : ""}</div>`}
          ringsData={rings}
          ringLat={(d: Ring) => d.lat}
          ringLng={(d: Ring) => d.lng}
          ringColor={() => (t: number) => `rgba(252,163,17,${Math.max(0, 0.7 * (1 - t))})`}
          ringMaxRadius={3.2}
          ringPropagationSpeed={1.6}
          ringRepeatPeriod={1400}
          arcsData={shownArcs}
          arcColor={(d: Arc) => d.color}
          arcStroke={0.6}
          arcAltitudeAutoScale={0.4}
          arcDashLength={0.5}
          arcDashGap={0.3}
          arcDashAnimateTime={reduced ? 0 : 1600}
        />
      ) : (
        // The pre-load placeholder holds the layout so nothing below jumps when Three arrives.
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "rgba(245,239,230,0.4)", fontSize: 13 }}>
          {near ? "Loading the map…" : ""}
        </div>
      )}
    </div>
  );
}

/** The legend line every mount shows — real counts, and the honest placement caveat. */
export function GlobeLegend({ data }: { data: GlobeData }) {
  const bit = (color: string, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: color, boxShadow: `0 0 6px ${color}` }} />
      {label}
    </span>
  );
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12.5px]" style={{ color: "var(--text-muted, #93A0B4)", fontFamily: BRAND_SANS }}>
      {bit(ACCENT, `${data.counts.live.toLocaleString()} live`)}
      {bit(HOLO, `${data.counts.ready.toLocaleString()} ready`)}
      {bit("rgba(245,239,230,0.4)", `${data.counts.system.toLocaleString()} more in the system`)}
      <span style={{ opacity: 0.75 }}>
        positions approximate{data.unplaced > 0 ? ` · +${data.unplaced} not yet mapped` : ""}
      </span>
    </p>
  );
}
