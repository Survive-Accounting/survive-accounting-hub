// GAMER MODE — the layer that does it all (lib/gamer-mode.ts has the switch and the bolt maths).
//
// Mounted once in __root; renders nothing unless the switch is on. When it is:
//   · every bolt marked data-gm-bolt="<name>" shoots lightning at the button marked data-gm-cta="<name>"
//     (a CTA with no named bolt takes the header's data-gm-bolt="auto") — on load, when the button
//     scrolls into view, when you hover the bolt, and when the bolt drops in after a school change;
//     the button stays charged (a spinning arc and a pulse) and goes haywire on hover
//   · video cards (data-gm-card) become character-select tiles: title as a HUD plate floating over
//     a dimmed frame, 3D tilt that follows the pointer, the rest of the row dims, previews play fast
//   · the video you're on (first in progress, else first unwatched) wears a pulsing electric frame
// Everything is scoped under html.gm, so turning it off (?gamer=0 or the pill) leaves the site as it was.
import { useEffect, useRef, useState } from "react";

import { boltPath, GAMER_EVENT, readGamerMode, setGamerMode, strikePoint, toPathD, type Pt } from "@/lib/gamer-mode";

const CSS = `
@property --gm-a { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes gm-glow {
  0%, 100% { box-shadow: 0 0 0 2px rgba(130,210,255,.85), 0 0 16px 3px rgba(70,160,255,.5), 0 0 44px 8px rgba(70,160,255,.2); }
  50% { box-shadow: 0 0 0 2px rgba(210,245,255,1), 0 0 28px 7px rgba(90,180,255,.75), 0 0 72px 18px rgba(90,180,255,.3); }
}
@keyframes gm-spin { to { --gm-a: 360deg; } }
@keyframes gm-jitter { 0% { translate: 0 0; } 33% { translate: .8px -.7px; } 66% { translate: -.7px .6px; } 100% { translate: .4px .5px; } }
@keyframes gm-hit { 0% { filter: brightness(2.4) saturate(1.4); scale: 1.05; } 100% { filter: none; scale: 1; } }
@keyframes gm-zap { 0% { filter: drop-shadow(0 0 0 rgba(140,215,255,0)); } 12% { filter: brightness(2) drop-shadow(0 0 14px rgba(160,225,255,1)); } 24% { filter: drop-shadow(0 0 3px rgba(140,215,255,.5)); } 36% { filter: brightness(1.8) drop-shadow(0 0 18px rgba(160,225,255,1)); } 100% { filter: drop-shadow(0 0 6px rgba(120,200,255,.6)); } }
@keyframes gm-idle { 0%, 100% { filter: drop-shadow(0 0 4px rgba(120,200,255,.45)); } 50% { filter: drop-shadow(0 0 10px rgba(140,215,255,.85)); } }

html.gm [data-gm-bolt] { animation: gm-idle 2.8s ease-in-out infinite; }
/* Home doors in gamer mode: taller icon envelope, more air between the bolt and the school picker. */
html.gm .sa-home-door-icon { height: 138px !important; padding-bottom: 18px; }
html.gm [data-gm-bolt].gm-firing { animation: gm-zap 700ms ease-out; }

html.gm .gm-charged { position: relative; isolation: isolate; animation: gm-glow 2.4s ease-in-out infinite; }
html.gm .gm-charged::before {
  content: ""; position: absolute; inset: -3px; border-radius: inherit; padding: 2px; pointer-events: none; z-index: 1;
  background: conic-gradient(from var(--gm-a), transparent 0 60%, rgba(160,225,255,.85) 71%, #fff 75%, rgba(160,225,255,.85) 79%, transparent 90%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
  animation: gm-spin 1.9s linear infinite;
}
html.gm .gm-charged:hover { animation: gm-glow .32s ease-in-out infinite, gm-jitter .11s steps(3) infinite; }
html.gm .gm-charged:hover::before { animation-duration: .4s; }
html.gm .gm-hit { animation: gm-hit 420ms ease-out, gm-glow 2.4s ease-in-out infinite; }

/* THE DROP-IN, charged: the school's bolt arrives in a burst. */
html.gm .lk-bolt-arrive { animation: lk-bolt-arrive 320ms cubic-bezier(.2,.9,.3,1.2) both, gm-zap 900ms ease-out; }
html.gm .sa-door-bolt--arrive { animation: sa-bolt-arrive 320ms cubic-bezier(.2,.9,.3,1.2) both, gm-zap 900ms ease-out; }

/* CHARACTER SELECT */
html.gm .lk-short[data-gm-card] {
  transform: perspective(760px) rotateX(var(--gm-rx, 0deg)) rotateY(var(--gm-ry, 0deg));
  transition: transform 110ms ease-out, filter 220ms ease, box-shadow 220ms ease;
  box-shadow: 0 12px 30px -14px rgba(0,0,0,.85);
}
html.gm .lk-short[data-gm-card] img { filter: brightness(.3) saturate(1.2) blur(3px); transform: scale(1.1) translate(var(--gm-px, 0px), var(--gm-py, 0px)); transition: transform 110ms ease-out, filter 220ms ease; }
html.gm .lk-short[data-gm-card]:hover img { filter: brightness(.45) saturate(1.3) blur(2px); }
/* Playing: the title lifts to a nameplate at the top so the video shows through. */
html.gm .lk-short[data-gm-card][data-live="true"]::before { top: 8px; left: 8px; right: 8px; padding: 6px 8px; border-radius: 8px; font-size: 13px; background: rgba(6,12,28,.78); box-shadow: 0 0 0 1px rgba(140,210,255,.55), 0 0 14px rgba(80,170,255,.45); }
html.gm .lk-short[data-gm-card] .lk-short-t { display: none; }
html.gm .lk-short[data-gm-card]::before {
  content: attr(data-gm-title); position: absolute; left: 9px; right: 9px; top: 30%; z-index: 3; pointer-events: none;
  font: 900 18px/1.05 'League Spartan', 'Rubik', system-ui, sans-serif; text-transform: uppercase; text-align: center; color: #F5EFE6;
  text-shadow: 0 2px 0 rgba(0,0,0,.65), 0 0 16px rgba(90,180,255,.6);
  transform: translate(calc(var(--gm-px, 0px) * -2.4), calc(var(--gm-py, 0px) * -2.4));
  transition: transform 110ms ease-out; white-space: pre-line;
}
html.gm .lk-short[data-gm-card]:hover { box-shadow: 0 0 0 2px rgba(150,220,255,.95), 0 0 26px 5px rgba(80,170,255,.6), 0 20px 44px -16px rgba(0,0,0,.95); z-index: 4; }
html.gm *:has(> .lk-short[data-gm-card]:hover) > .lk-short[data-gm-card]:not(:hover) { filter: brightness(.5) saturate(.55); }
html.gm .lk-short[data-gm-current] { animation: gm-glow 2.2s ease-in-out infinite; }
html.gm .lk-short[data-gm-current]::before { content: "▶ CONTINUE\\A" attr(data-gm-title); }

@media (prefers-reduced-motion: reduce) {
  html.gm [data-gm-bolt], html.gm .gm-charged, html.gm .gm-charged::before, html.gm .lk-short[data-gm-current] { animation: none !important; }
}
`;

const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight; };
const center = (el: Element): Pt => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

export function GamerLayer() {
  const [on, setOn] = useState(false);
  const svg = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const read = () => setOn(readGamerMode());
    read();
    window.addEventListener(GAMER_EVENT, read);
    window.addEventListener("popstate", read);
    return () => { window.removeEventListener(GAMER_EVENT, read); window.removeEventListener("popstate", read); };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!on) { root.classList.remove("gm"); return; }
    root.classList.add("gm");
    const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => { const t = window.setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

    // ── drawing ──────────────────────────────────────────────────────────────────────────────
    const draw = (paths: { d: string; w: number; o: number }[]) => {
      const s = svg.current; if (!s) return;
      const g = s.querySelector("g[data-strands]"); if (!g) return;
      // Two passes per strand: a wide blue halo, then the white-hot core.
      shield(s);
      g.innerHTML = paths.map((p) => `<path d="${p.d}" stroke="#58B8FF" stroke-width="${p.w * 3.2}" stroke-opacity="${p.o * 0.45}" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#gm-glow)"/><path d="${p.d}" stroke="#F4FBFF" stroke-width="${p.w}" stroke-opacity="${p.o}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
    };
    const clear = () => draw([]);
    // Cut holes in the lightning wherever a shield sits, so the bolt reads as running behind it.
    function shield(s: SVGSVGElement) {
      const holes = s.querySelector("g[data-holes]"); if (!holes) return;
      holes.innerHTML = [...document.querySelectorAll("[data-gm-shield]")].map((slot) => {
        const el = slot.firstElementChild ?? slot; const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return "";
        return `<rect x="${(r.left - 6).toFixed(1)}" y="${(r.top - 5).toFixed(1)}" width="${(r.width + 12).toFixed(1)}" height="${(r.height + 10).toFixed(1)}" rx="${((r.height + 10) / 2).toFixed(1)}" fill="#000"/>`;
      }).join("");
    }
    // THE CURRENT: once a wired button (data-gm-wire) has been struck, a thin live arc keeps running
    // from its bolt to it. Redrawn a few times a second so it flickers and follows scroll.
    const wired = new Set<Element>();
    const current = window.setInterval(() => {
      const s = svg.current; if (!s || reduced) return;
      const g = s.querySelector("g[data-current]"); if (!g) return;
      shield(s);
      let out = "";
      for (const cta of wired) {
        if (!cta.isConnected) { wired.delete(cta); continue; }
        const bolt = boltFor(cta); if (!bolt || !visible(cta) || !visible(bolt)) continue;
        const b = bolt.getBoundingClientRect();
        const from = { x: b.left + b.width / 2, y: b.bottom - 4 };
        const to = strikePoint(from, cta.getBoundingClientRect());
        const hot = cta.matches(":hover");
        const d = toPathD(boltPath(from, to, hot ? 0.34 : 0.2, 4));
        out += `<path d="${d}" stroke="#58B8FF" stroke-width="${hot ? 7 : 4.5}" stroke-opacity="${hot ? 0.5 : 0.28}" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#gm-glow)"/><path d="${d}" stroke="#EAF7FF" stroke-width="${hot ? 2.2 : 1.3}" stroke-opacity="${hot ? 1 : 0.7}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      g.innerHTML = out;
    }, 90);

    const strike = (bolt: Element, cta: Element) => {
      const from = center(bolt);
      const to = strikePoint(from, cta.getBoundingClientRect());
      cta.classList.add("gm-charged");
      if (reduced) return;
      if (cta.hasAttribute("data-gm-wire")) later(() => wired.add(cta), 200);
      bolt.classList.add("gm-firing");
      const frames = [0, 35, 70, 110, 160, 210];
      frames.forEach((t, i) => later(() => {
        if (i === frames.length - 1) { clear(); bolt.classList.remove("gm-firing"); return; }
        const f = center(bolt); const dest = strikePoint(f, cta.getBoundingClientRect());
        const main = boltPath(f, dest, 0.24, 5);
        const strands = [{ d: toPathD(main), w: i % 2 ? 3 : 4.6, o: i === 3 ? 0.35 : 1 }];
        for (let k = 0; k < 2; k++) {
          const at = main[Math.floor(main.length * (0.25 + Math.random() * 0.5))];
          const end = { x: at.x + (Math.random() - 0.5) * 120, y: at.y + (Math.random() - 0.2) * 90 };
          strands.push({ d: toPathD(boltPath(at, end, 0.3, 3)), w: 1.8, o: 0.8 });
        }
        draw(strands);
        if (i === 1) { cta.classList.remove("gm-hit"); void (cta as HTMLElement).offsetWidth; cta.classList.add("gm-hit"); later(() => cta.classList.remove("gm-hit"), 450); }
      }, t));
      void to;
    };

    // ── pairing ──────────────────────────────────────────────────────────────────────────────
    const boltFor = (cta: Element): Element | null => {
      const name = cta.getAttribute("data-gm-cta");
      const named = [...document.querySelectorAll(`[data-gm-bolt="${CSS_ESCAPE(name ?? "")}"]`)].find(visible);
      return named ?? [...document.querySelectorAll('[data-gm-bolt="auto"]')].find(visible) ?? null;
    };
    const struck = new WeakSet<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || struck.has(e.target)) continue;
        struck.add(e.target);
        const cta = e.target;
        later(() => { const b = boltFor(cta); if (b) strike(b, cta); else cta.classList.add("gm-charged"); }, 140);
      }
    }, { threshold: 0.6 });

    // Hover a bolt → it fires again at its button. Hover a charged button → it crackles.
    let crackle: number | null = null;
    const onOver = (ev: Event) => {
      const t = ev.target as Element | null;
      const bolt = t?.closest?.("[data-gm-bolt]");
      if (bolt && !bolt.classList.contains("gm-firing")) {
        const name = bolt.getAttribute("data-gm-bolt");
        const cta = [...document.querySelectorAll(name === "auto" ? "[data-gm-cta]" : `[data-gm-cta="${CSS_ESCAPE(name ?? "")}"]`)].find(visible);
        if (cta) strike(bolt, cta);
      }
      const cta = t?.closest?.(".gm-charged");
      if (cta && crackle == null && !reduced) {
        crackle = window.setInterval(() => {
          const r = cta.getBoundingClientRect();
          const arcs: { d: string; w: number; o: number }[] = [];
          for (let k = 0; k < 3; k++) {
            const side = Math.floor(Math.random() * 4);
            const p = side === 0 ? { x: r.left + Math.random() * r.width, y: r.top } : side === 1 ? { x: r.right, y: r.top + Math.random() * r.height } : side === 2 ? { x: r.left + Math.random() * r.width, y: r.bottom } : { x: r.left, y: r.top + Math.random() * r.height };
            const ang = Math.atan2(p.y - (r.top + r.height / 2), p.x - (r.left + r.width / 2)) + (Math.random() - 0.5);
            const len = 14 + Math.random() * 30;
            arcs.push({ d: toPathD(boltPath(p, { x: p.x + Math.cos(ang) * len, y: p.y + Math.sin(ang) * len }, 0.5, 3)), w: 1.8, o: 0.95 });
          }
          draw(arcs);
        }, 70);
      }
    };
    const onOut = (ev: Event) => {
      const t = ev.target as Element | null;
      const rel = (ev as MouseEvent).relatedTarget as Element | null;
      const cta = t?.closest?.(".gm-charged");
      if (cta && !(rel && cta.contains(rel)) && crackle != null) { window.clearInterval(crackle); crackle = null; clear(); }
      const card = t?.closest?.("[data-gm-card]") as HTMLElement | null;
      if (card && !(rel && card.contains(rel))) { card.style.removeProperty("--gm-rx"); card.style.removeProperty("--gm-ry"); card.style.removeProperty("--gm-px"); card.style.removeProperty("--gm-py"); }
    };
    // Tilt: the card leans toward the pointer; the title plate slides the other way for depth.
    const onMove = (ev: PointerEvent) => {
      const card = (ev.target as Element | null)?.closest?.("[data-gm-card]") as HTMLElement | null;
      if (!card || reduced) return;
      const r = card.getBoundingClientRect();
      const nx = (ev.clientX - r.left) / r.width - 0.5, ny = (ev.clientY - r.top) / r.height - 0.5;
      card.style.setProperty("--gm-ry", `${(nx * 16).toFixed(2)}deg`);
      card.style.setProperty("--gm-rx", `${(-ny * 14).toFixed(2)}deg`);
      card.style.setProperty("--gm-px", `${(nx * 6).toFixed(1)}px`);
      card.style.setProperty("--gm-py", `${(ny * 6).toFixed(1)}px`);
    };
    // Previews play fast in gamer mode.
    const onPlaying = (ev: Event) => { const v = ev.target as HTMLVideoElement; if (v?.closest?.("[data-gm-card]")) v.playbackRate = 1.75; };

    // ── scanning: pages mount late and change (school switch, SPA navigation) ─────────────────
    const seen = new WeakSet<Element>();
    const markCurrent = () => {
      const cards = [...document.querySelectorAll<HTMLElement>("[data-gm-card]")];
      const current = cards.find((c) => c.dataset.gmDone !== "1" && Number(c.dataset.gmWatched ?? 0) > 0) ?? cards.find((c) => c.dataset.gmDone !== "1");
      for (const c of cards) { if (c === current) c.setAttribute("data-gm-current", "1"); else c.removeAttribute("data-gm-current"); }
    };
    let scanT: number | null = null;
    const scan = () => {
      scanT = null;
      for (const cta of document.querySelectorAll("[data-gm-cta]")) if (!seen.has(cta)) { seen.add(cta); io.observe(cta); }
      markCurrent();
    };
    const arrived = new WeakSet<Element>();
    const mo = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue;
        const drop = n.matches(".lk-bolt-arrive, .sa-door-bolt--arrive") ? n : n.querySelector(".lk-bolt-arrive, .sa-door-bolt--arrive");
        if (drop && !arrived.has(drop)) {
          arrived.add(drop);
          const bolt = drop.closest("[data-gm-bolt]") ?? drop.querySelector("[data-gm-bolt]") ?? drop;
          const name = bolt.getAttribute("data-gm-bolt");
          later(() => { const cta = [...document.querySelectorAll(name ? `[data-gm-cta="${CSS_ESCAPE(name)}"]` : "[data-gm-cta]")].find(visible); if (cta) strike(bolt, cta); }, 330);
        }
      }
      if (scanT == null) scanT = window.setTimeout(scan, 250);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    scan();
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("playing", onPlaying, true);

    return () => {
      root.classList.remove("gm");
      mo.disconnect(); io.disconnect();
      window.clearInterval(current);
      timers.forEach((t) => window.clearTimeout(t));
      if (crackle != null) window.clearInterval(crackle);
      if (scanT != null) window.clearTimeout(scanT);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("playing", onPlaying, true);
      document.querySelectorAll(".gm-charged, .gm-hit, .gm-firing").forEach((el) => el.classList.remove("gm-charged", "gm-hit", "gm-firing"));
      document.querySelectorAll("[data-gm-current]").forEach((el) => el.removeAttribute("data-gm-current"));
    };
  }, [on]);

  if (!on) return null;
  return (
    <>
      <style>{CSS}</style>
      <svg ref={svg} aria-hidden style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 9990, overflow: "visible" }}>
        <defs>
          <filter id="gm-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="b1" />
            <feGaussianBlur stdDeviation="7" result="b2" in="SourceGraphic" />
            <feColorMatrix in="b2" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.7  0 0 0 0 1  0 0 0 1.6 0" result="blue" />
            <feMerge><feMergeNode in="blue" /><feMergeNode in="b1" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <mask id="gm-shield" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect x="-50" y="-50" width="10000" height="10000" fill="#fff" />
            <g data-holes="" />
          </mask>
        </defs>
        <g mask="url(#gm-shield)">
          <g data-current="" />
          <g data-strands="" />
        </g>
      </svg>
      <button type="button" onClick={() => setGamerMode(false)} title="Turn gamer mode off"
        style={{ position: "fixed", left: 12, bottom: "calc(58px + env(safe-area-inset-bottom, 0px))", zIndex: 9991, padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(150,220,255,.7)", background: "rgba(8,14,30,.88)", color: "#CFEFFF", font: "800 11px/1 'Rubik', system-ui, sans-serif", letterSpacing: ".12em", cursor: "pointer", boxShadow: "0 0 14px rgba(80,170,255,.45)" }}>
        ⚡ GAMER MODE · EXIT
      </button>
    </>
  );
}

function CSS_ESCAPE(s: string): string {
  return typeof window !== "undefined" && window.CSS?.escape ? window.CSS.escape(s) : s.replace(/"/g, '\\"');
}
