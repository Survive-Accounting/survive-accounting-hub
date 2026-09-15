// THE DEMO LENS — any page of the app, filmed in a vertical window. Lee, 2026-09-15: "I want to film a demo of the /v4
// /film page … a film popout that is vertical, but the demo inside is horizontal in the middle of vertical frame …
// because I can zoom and swim around (make sure a click drag move lets me swim around) I will show the app. I want
// to do the same for the stitch room."
//
// The page runs untouched in an iframe at a desktop size; the lens only moves and scales it.
//   wheel          zoom toward the pointer (as far in as you like)
//   drag           swim
//   tap            clicks what's under it (and the page takes the keyboard, so its own keys work)
//   shift + wheel  scrolls the page under the pointer
//   Alt+0          back to the whole page · Alt+H hides the hint
import { useCallback, useEffect, useRef, useState } from "react";

type View = { x: number; y: number; s: number };
const MIN_S = 0.08, MAX_S = 14;

export const DEMO_LENS_WINDOW = "sa-demo-lens";
/** Open the lens on a page, from a click. */
export function openDemoLens(src: string) {
  const url = `/v4/demo-lens?src=${encodeURIComponent(src)}`;
  const w = window.open(url, DEMO_LENS_WINDOW, "popup=yes,width=540,height=960");
  try { w?.focus(); } catch { /* the browser decides */ }
}

export function DemoLens({ src, appW = 1440, appH = 900 }: { src: string; appW?: number; appH?: number }) {
  const stage = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const layer = useRef<HTMLDivElement | null>(null);
  const target = useRef<View>({ x: 0, y: 0, s: 1 });
  const cur = useRef<View>({ x: 0, y: 0, s: 1 });
  const [hint, setHint] = useState(true);

  const fit = useCallback((): View => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0, s: 1 };
    const s = (r.width * 0.96) / appW;
    return { x: (r.width - appW * s) / 2, y: (r.height - appH * s) / 2, s };
  }, [appW, appH]);

  // the motion: the view eases toward its target, so zoom and swim glide on camera
  useEffect(() => {
    target.current = fit(); cur.current = { ...target.current };
    let raf = 0;
    const tick = () => {
      const c = cur.current, t = target.current;
      const k = 0.22;
      c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k;
      c.s = Math.exp(Math.log(c.s) + (Math.log(t.s) - Math.log(c.s)) * k);
      if (layer.current) layer.current.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) scale(${c.s})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onResize = () => { target.current = fit(); };
    window.addEventListener("resize", onResize);
    const t = window.setTimeout(() => setHint(false), 4000);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); window.clearTimeout(t); };
  }, [fit]);

  const zoomAt = (px: number, py: number, factor: number) => {
    const t = target.current;
    const s = Math.min(MAX_S, Math.max(MIN_S, t.s * factor));
    const k = s / t.s;
    target.current = { s, x: px - (px - t.x) * k, y: py - (py - t.y) * k };
  };
  /** A point on the stage → the same point inside the page. */
  const toPage = (cx: number, cy: number) => {
    const r = stage.current!.getBoundingClientRect();
    const c = cur.current;
    return { x: (cx - r.left - c.x) / c.s, y: (cy - r.top - c.y) / c.s };
  };

  // keys: Alt+0 / Alt+H here, and inside the page (it has the keyboard after a tap)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "0") { e.preventDefault(); e.stopPropagation(); target.current = fit(); }
      else if (e.key.toLowerCase() === "h") { e.preventDefault(); e.stopPropagation(); setHint((v) => !v); }
    };
    window.addEventListener("keydown", onKey, true);
    let inner: Window | null = null;
    const attach = () => { try { inner = frame.current?.contentWindow ?? null; inner?.addEventListener("keydown", onKey, true); } catch { inner = null; } };
    const f = frame.current;
    f?.addEventListener("load", attach);
    attach();
    return () => { window.removeEventListener("keydown", onKey, true); f?.removeEventListener("load", attach); try { inner?.removeEventListener("keydown", onKey, true); } catch { /* gone */ } };
  }, [fit]);

  // pointer: drag swims, a tap clicks through
  const press = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    press.current = { x: e.clientX, y: e.clientY, ox: target.current.x, oy: target.current.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < 5) return;
    p.moved = true;
    target.current = { ...target.current, x: p.ox + dx, y: p.oy + dy };
    cur.current = { ...cur.current, x: p.ox + dx, y: p.oy + dy };
  };
  const onUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p || p.moved) return;
    const doc = frame.current?.contentDocument;
    const win = frame.current?.contentWindow;
    if (!doc || !win) return;
    const pt = toPage(e.clientX, e.clientY);
    const el = doc.elementFromPoint(pt.x, pt.y) as HTMLElement | null;
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, composed: true, clientX: pt.x, clientY: pt.y, view: win, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    const focusable = el.closest("input, textarea, select, [contenteditable='true']") as HTMLElement | null;
    if (focusable) focusable.focus();
    else el.click();
    try { win.focus(); } catch { /* the browser decides */ }
  };
  const onWheel = (e: React.WheelEvent) => {
    if (e.shiftKey) {
      const doc = frame.current?.contentDocument;
      if (!doc) return;
      const pt = toPage(e.clientX, e.clientY);
      let el = doc.elementFromPoint(pt.x, pt.y) as HTMLElement | null;
      const amount = (e.deltaY || e.deltaX) / cur.current.s;
      while (el && el !== doc.body) {
        const st = doc.defaultView?.getComputedStyle(el);
        if (st && /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight) { el.scrollTop += amount; return; }
        el = el.parentElement;
      }
      doc.defaultView?.scrollBy(0, amount);
      return;
    }
    const r = stage.current!.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
  };

  return (
    <div ref={stage} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel}
      style={{ position: "fixed", inset: 0, overflow: "hidden", cursor: press.current?.moved ? "grabbing" : "grab", touchAction: "none", userSelect: "none",
        background: "radial-gradient(120% 70% at 50% 0%, #152a5e 0%, #0A1330 45%, #04060D 100%)" }}>
      <div ref={layer} style={{ position: "absolute", left: 0, top: 0, width: appW, height: appH, transformOrigin: "0 0", willChange: "transform",
        borderRadius: 14, overflow: "hidden", boxShadow: "0 0 0 1px rgba(140,215,255,.25), 0 40px 90px -30px rgba(0,0,0,.9)" }}>
        <iframe ref={frame} src={src} title="App" style={{ width: appW, height: appH, border: 0, display: "block", background: "#070B14", pointerEvents: "none" }} />
      </div>
      {hint && (
        <div style={{ position: "absolute", left: "50%", bottom: 22, transform: "translateX(-50%)", padding: "8px 14px", borderRadius: 999, background: "rgba(5,8,15,.8)", border: "1px solid rgba(140,215,255,.35)",
          color: "#DCEFFF", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", pointerEvents: "none" }}>
          wheel zoom · drag swim · tap clicks · Alt+0 whole page · Alt+H hint
        </div>
      )}
    </div>
  );
}
