// ACCOUNTING PONG — the lobby, the field, the recap, the results. A block that
// sits at the bottom of /learn (PongOnLearn) and stands alone on /play/pong.
//
// The game itself lives in lib/pong.ts (pure, tested). This file owns the
// clock (rAF, hands `now` in), the DOM geometry the ball flights need, the
// sounds, the device's records, and the workshop drawer Lee tunes from.
//
// Shape (Lee, 2026-09-16, fourth pass): a compact game lobby. Navy header —
// SURVIVE GAMES left, the school, sound and settings right. Cream body: the
// title, one line, five full-width challenge rows with their best scores,
// then Leaderboard · How to play · Account guide. No sidebar. In a run the
// field takes the whole body; a small Lobby link gets you back.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { ARC_BLUE, ARC_CORE, ARC_GOLD, CTA_RED, CTA_RED_DEEP, CTA_RED_LIT } from "@/components/brand-cards/chain-lightning";
import { BRAND_BLUE, BoltBoil, SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { LEE_PHOTO, LEE_TEL } from "@/components/learn/LearnTextLee";
import { track } from "@/lib/analytics";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import {
  PONG_CONFIG, armClock, bossesCleared, continueRun, createRun, cupOutcome, currentSection, formatScore, heatLabel,
  isTapped, isExpired, limitMs, quitRun, racksCleared, recapFor, remainingCorrect, remainingMs, restart, rng,
  secondsDefault, secondsScaled, startSection, tap, timeout,
  type Cup, type CupOutcome, type Rack, type Recap, type RoundRecord, type RunState,
} from "@/lib/pong";
import { PONG_SECTIONS } from "@/lib/pong-content";
import { MISS_KINDS, makeFlight, pickMissKind, type CupGeo, type Flight, type FlightKind, type MissKind, type Pt } from "@/lib/pong-flight";
import { pongSfx, setSoundEnabled, soundEnabled } from "@/lib/pong-sfx";

// ---- tokens: the navy header and the cream body (learn-theme NAVY / CREAM, read not invented)

const NAVY = "#0D1730";
const NAVY_SURFACE = "#162443";
const NAVY_BORDER = "#34486D";
const NAVY_TEXT = "#F7F0E6";
const NAVY_MUTED = "#AAB4C8";

const CREAM = "#F5F1E8";
const CREAM_SURFACE = "#FBF9F4";
const CREAM_SURFACE2 = "#EFEAE0";
const CREAM_BORDER = "#E4DDD0";
const INK = "#14213D";
const INK_MUTED = "#6E6B63";
const GREEN = "#1B8F6A";
const GREEN_LIT = "#4EE8B4";
const RED = CTA_RED;
const HEAT_BLUE = "#0369A1";
const DEBIT_INK = "#B45309";
const CREDIT_INK = "#0369A1";
/** The school's colour where the body would use red; the brand red when there is no school. */
const ACCENT = "var(--pong-accent)";
const DISPLAY = BRAND_DISPLAY;
const SANS = BRAND_SANS;
const MAX_FIELD = 620;
const SHARE_URL = "surviveaccounting.com/play/pong";
const K = {
  best: (id: string) => `sa.pong.best.${id}`,
  total: "sa.pong.total",
  name: "sa.pong.name",
  scores: "sa.pong.scores",
  sound: "sa.pong.sound",
};
const SHUFFLE_MS = 900;

/** Lee's playthrough video, once it is filmed. null = the link shows and says it is coming. */
const WATCH_LEE_URL: string | null = null;

// ---- workshop settings (the drawer) ------------------------------------------------

export interface WorkshopSettings {
  clock: "default" | "scaled";
  missStyle: "random" | MissKind;
  showRemaining: boolean;
}

const WS_DEFAULT: WorkshopSettings = { clock: "default", missStyle: "random", showRemaining: true };

// ---- the device's records -----------------------------------------------------------------

function readNum(key: string): number {
  try { return Number(localStorage.getItem(key) ?? 0) || 0; } catch { return 0; }
}
function writeNum(key: string, v: number): void {
  try { localStorage.setItem(key, String(v)); } catch { /* private window */ }
}
function readStr(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}
/** Total points on this device. The first read folds in the run scores the earlier builds
 *  kept (sa.pong.scores), so Lee's practice so far counts. */
function readTotal(): number {
  try {
    if (localStorage.getItem(K.total) == null) {
      const raw = localStorage.getItem(K.scores);
      const old = raw ? (JSON.parse(raw) as { score: number }[]) : [];
      const sum = old.reduce((s, x) => s + (Number(x.score) || 0), 0);
      localStorage.setItem(K.total, String(sum));
      return sum;
    }
  } catch { /* fall through */ }
  return readNum(K.total);
}
function bankPoints(points: number): number {
  const total = readTotal() + points;
  writeNum(K.total, total);
  return total;
}
function saveRun(sectionId: string, score: number): { best: number; isNew: boolean } {
  const prev = readNum(K.best(sectionId));
  const isNew = score > prev;
  if (isNew) writeNum(K.best(sectionId), score);
  try {
    const raw = localStorage.getItem(K.scores);
    const list = [{ section: sectionId, score, at: new Date().toISOString() }, ...(raw ? (JSON.parse(raw) as unknown[]) : [])].slice(0, 30);
    localStorage.setItem(K.scores, JSON.stringify(list));
  } catch { /* private window */ }
  return { best: isNew ? score : prev, isNew };
}

function usePrefersReducedMotion(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setV(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return v;
}

/** Width of an element that may mount LATER than the component (the field only exists once a
 *  run starts), so the observer rides a callback ref rather than a one-shot effect. */
function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number, React.RefObject<T | null>] {
  const ref = useRef<T | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  const [w, setW] = useState(360);
  const attach = useCallback((el: T | null) => {
    ro.current?.disconnect();
    ro.current = null;
    ref.current = el;
    if (!el) return;
    setW(el.clientWidth);
    ro.current = new ResizeObserver((es) => { for (const e of es) setW(e.contentRect.width); });
    ro.current.observe(el);
  }, []);
  return [attach, w, ref];
}

// ---- the school's ink on cream --------------------------------------------------------------

function hexRgb(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(h: string): number {
  const rgb = hexRgb(h);
  if (!rgb) return 0;
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}
/** The darker of the two school colours; if both are light (gold, sky) it is pulled toward
 *  the ink so it still reads as type on cream. */
function inkOnCream(c1: string, c2: string): string {
  const pick = luminance(c1) <= luminance(c2) ? c1 : c2;
  const rgb = hexRgb(pick);
  if (!rgb) return RED;
  if (luminance(pick) < 0.35) return pick;
  const ink = hexRgb(INK)!;
  const mix = rgb.map((c, i) => Math.round(c * 0.45 + ink[i] * 0.55));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// ---- geometry: a front-view rack -----------------------------------------------------------
//
// Rows stack the way a real rack reads from the shooter's side: the wide row at the back (top),
// the single cup in front (bottom). Each row steps down by `pitch`, so a back cup's rim — where
// its name is written — stays visible above the row in front of it. Cups in a row touch.

interface Layout { width: number; cup: number; h: number; rim: number; pitch: number; gap: number; font: number; short: boolean }

function layoutFor(width: number, rack: Rack | null, scale = 1): Layout {
  const cols = rack ? rack.rows[0] : 5;
  const gap = cols >= 5 ? 0 : cols === 4 ? 2 : cols === 3 ? 6 : 10;
  const cup = Math.min(140, Math.floor((width - gap * (cols - 1)) / cols)) * scale;
  return { width, cup, h: cup * 1.12, rim: cup * 0.4, pitch: cup * 0.52, gap, font: Math.max(10, Math.min(15, cup * 0.145)), short: cup < 84 };
}

const rackHeight = (rack: Rack, l: Layout) => (rack.rows.length - 1) * l.pitch + l.h;

function cupPos(rack: Rack, l: Layout, cup: Cup): { x: number; y: number } {
  const n = rack.rows[cup.row];
  const rowW = n * l.cup + (n - 1) * l.gap;
  return { x: (l.width - rowW) / 2 + cup.col * (l.cup + l.gap), y: cup.row * l.pitch };
}

// ---- main ---------------------------------------------------------------------------------

interface Ball { id: number; cupId: string; flight: Flight; startedAt: number; heat: number; trail: Pt[] }
type Panel = null | "board" | "how" | "guide" | "solutions";

export interface AccountingPongProps {
  /** Inside /learn: no trailing page padding. */
  embedded?: boolean;
  /** "Ole Miss · ACCY 201" in the header when the page knows the school. */
  courseCode?: string | null;
  campusName?: string | null;
  /** The campus's two colours — the stripe and the accents. */
  bolt?: { c1: string; c2: string } | null;
}

export function AccountingPong({ embedded = false, courseCode = null, campusName = null, bolt = null }: AccountingPongProps) {
  const [ws, setWs] = useState<WorkshopSettings>(WS_DEFAULT);
  const [drawer, setDrawer] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const cfg = useMemo(() => ({ ...PONG_CONFIG, secondsFor: ws.clock === "scaled" ? secondsScaled : secondsDefault }), [ws.clock]);
  const accent = useMemo(() => (bolt ? inkOnCream(bolt.c1, bolt.c2) : RED), [bolt]);

  const [run, setRunState] = useState<RunState>(() => createRun({ cfg }));
  const runRef = useRef(run);
  const setRun = useCallback((next: RunState | ((s: RunState) => RunState)) => {
    const v = typeof next === "function" ? next(runRef.current) : next;
    runRef.current = v;
    setRunState(v);
  }, []);

  // A different clock rule restarts from the lobby.
  useEffect(() => { setRun(createRun({ cfg })); }, [cfg, setRun]);

  const reduced = usePrefersReducedMotion();
  const [sound, setSound] = useState(true);
  useEffect(() => { setSound(soundEnabled()); }, []);
  const toggleSound = () => { const v = !sound; setSound(v); setSoundEnabled(v); if (v) pongSfx.rim(); };

  const [fieldAttach, fieldW, fieldRef] = useWidth<HTMLDivElement>();
  const cupEls = useRef(new Map<string, HTMLElement>());
  const launchRef = useRef<HTMLDivElement>(null);
  const balls = useRef<Ball[]>([]);
  const ballSeq = useRef(0);
  const rand = useRef(rng(Date.now() >>> 0));
  const [, setFrame] = useState(0);
  const [records, setRecords] = useState<{ total: number; bests: Record<string, number> }>({ total: 0, bests: {} });
  const refreshRecords = useCallback(() => {
    const bests: Record<string, number> = {};
    for (const s of PONG_SECTIONS) bests[s.id] = readNum(K.best(s.id));
    setRecords({ total: readTotal(), bests });
  }, []);
  useEffect(() => { refreshRecords(); }, [refreshRecords]);

  const layout = layoutFor(Math.min(fieldW, MAX_FIELD), run.rack);

  // ---- the clock + ball loop -------------------------------------------------------
  const playing = run.phase === "playing";
  const armed = run.clockStartedAt != null;
  useEffect(() => {
    if (!(playing && armed) && balls.current.length === 0) return;
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const s = runRef.current;
      if (isExpired(s, now)) setRun(timeout(s, now));
      const keep: Ball[] = [];
      for (const b of balls.current) {
        const t = now - b.startedAt;
        const f = b.flight.at(t);
        if (f && b.heat >= 2 && !reduced) { b.trail.push({ x: f.x, y: f.y }); if (b.trail.length > 9) b.trail.shift(); }
        if (t <= b.flight.total || b.flight.rests) keep.push(b);
      }
      balls.current = keep;
      setFrame((x) => x + 1);
      if (runRef.current.phase === "playing" || keep.length) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const tick = window.setInterval(() => {
      const s = runRef.current;
      const now = performance.now();
      if (isExpired(s, now)) setRun(timeout(s, now));
    }, 200);
    return () => { cancelAnimationFrame(raf); window.clearInterval(tick); };
  }, [playing, armed, reduced, setRun]);

  // ---- the ready gate: instruction first, then Begin. A retry shuffles the cups first.
  const [shuffling, setShuffling] = useState(false);
  useEffect(() => {
    if (!playing || armed) return;
    if (run.attempt > 0 && !reduced) {
      setShuffling(true);
      const t = window.setTimeout(() => setShuffling(false), SHUFFLE_MS);
      return () => window.clearTimeout(t);
    }
    setShuffling(false);
  }, [playing, armed, run.rackNo, run.attempt, run.seed, reduced]);

  const onBegin = useCallback(() => {
    if (shuffling) return;
    setRun((s) => armClock(s, performance.now()));
    pongSfx.rim();
  }, [setRun, shuffling]);

  // ---- rack bookkeeping: bank the points, sound, analytics ---------------------------
  const seenRounds = useRef(0);
  useEffect(() => {
    if (run.history.length <= seenRounds.current) { seenRounds.current = run.history.length; return; }
    seenRounds.current = run.history.length;
    const rec = run.history[run.history.length - 1];
    const recap = recapFor(run, rec);
    if (rec.points > 0) { bankPoints(rec.points); refreshRecords(); }
    track("pong_round", {
      section: run.sectionId ?? "", rule: rec.rack.rule.id, cups: rec.rack.size, rack_no: rec.index, attempt: rec.attempt,
      result: rec.result, points: rec.points, multiplier: rec.multiplier, boss: rec.rack.boss,
    });
    if (recap.bossCleared) {
      window.setTimeout(() => pongSfx.heat(3), 200);
      window.setTimeout(() => pongSfx.ding(), 520);
    } else if (rec.result === "perfect") {
      window.setTimeout(() => { if (run.streak >= 2) pongSfx.heat(run.streak >= 3 ? 3 : 2); else pongSfx.ding(); }, 220);
    } else if (rec.result === "cleared") {
      window.setTimeout(() => pongSfx.ding(), 220);
    } else {
      pongSfx.womp();
    }
  }, [run, refreshRecords]);

  const [best, setBest] = useState<{ best: number; isNew: boolean } | null>(null);
  const savedFor = useRef<RunState | null>(null);
  useEffect(() => {
    if (run.phase !== "results" || savedFor.current === run || !run.sectionId) return;
    savedFor.current = run;
    const b = saveRun(run.sectionId, run.score);
    setBest(b);
    refreshRecords();
    track("pong_end", { section: run.sectionId, score: run.score, racks_cleared: racksCleared(run), bosses_cleared: bossesCleared(run), quit: run.quit, best: b.isNew });
  }, [run, refreshRecords]);

  // "+2s" flashes by the clock on every sunk cup.
  const [bonusFlash, setBonusFlash] = useState(0);
  useEffect(() => {
    if (run.lastEvent?.type !== "hit" && !(run.lastEvent?.type === "round-end" && run.taps.length)) return;
    setBonusFlash((n) => n + 1);
  }, [run.taps.length, run.lastEvent]);

  // ---- actions ---------------------------------------------------------------------------
  const geoOf = useCallback((el: HTMLElement): { c: Pt; r: number } => {
    const f = fieldRef.current!.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { c: { x: b.left - f.left + b.width / 2, y: b.top - f.top + b.height / 2 }, r: b.width / 2 };
  }, [fieldRef]);

  const onTap = useCallback((cupId: string) => {
    const now = performance.now();
    const before = runRef.current;
    const after = tap(before, cupId, now);
    if (after === before) return;
    setRun(after);
    const last = after.taps[after.taps.length - 1];
    if (!last || last.cupId !== cupId || after.taps.length === before.taps.length) { pongSfx.womp(); return; }

    const el = cupEls.current.get(cupId);
    const field = fieldRef.current;
    const launchEl = launchRef.current;
    if (!el || !field || !launchEl) return;
    const cup: CupGeo = { id: cupId, ...geoOf(el) };
    const neighbors: CupGeo[] = [];
    cupEls.current.forEach((e, id) => { if (id !== cupId) neighbors.push({ id, ...geoOf(e) }); });
    const near = neighbors.filter((n) => Math.hypot(n.c.x - cup.c.x, n.c.y - cup.c.y) < cup.r * 2.6).slice(0, 4);
    const launch = geoOf(launchEl).c;
    const kind: FlightKind = last.correct ? "sink" : ws.missStyle === "random" ? pickMissKind(rand.current) : ws.missStyle;
    const flight = makeFlight(kind, launch, cup, near, rand.current, { reduced });
    balls.current.push({ id: ++ballSeq.current, cupId, flight, startedAt: now, heat: before.multiplier, trail: [] });
    pongSfx.swoosh();
    for (const cue of flight.cues) window.setTimeout(() => (cue.sfx === "plop" ? pongSfx.plop() : pongSfx.rim()), cue.at);
    setFrame((x) => x + 1);
  }, [fieldRef, geoOf, reduced, setRun, ws.missStyle]);

  const onPlay = useCallback((sectionId: string) => {
    balls.current = [];
    setBest(null);
    setPanel(null);
    setRun((s) => startSection(s, sectionId));
    track("pong_start", { section: sectionId, clock: ws.clock });
    pongSfx.rim();
  }, [setRun, ws.clock]);

  const onRestart = useCallback(() => {
    balls.current = [];
    setBest(null);
    setPanel(null);
    setRun((s) => restart(s));
    pongSfx.rim();
  }, [setRun]);

  const onContinue = useCallback(() => {
    balls.current = [];
    setRun((s) => continueRun(s));
  }, [setRun]);

  const onQuit = useCallback(() => {
    balls.current = [];
    setRun((s) => quitRun(s));
  }, [setRun]);

  const onLobby = useCallback(() => {
    balls.current = [];
    setBest(null);
    setPanel(null);
    setRun((s) => createRun({ cfg: s.cfg }));
  }, [setRun]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPanel(null); return; }
      if (e.key !== "Enter" && e.key !== " ") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "SELECT" || tag === "INPUT" || tag === "BUTTON" || tag === "A") return;
      if (run.phase === "recap") { e.preventDefault(); onContinue(); }
      else if (run.phase === "playing" && !armed) { e.preventDefault(); onBegin(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run.phase, armed, onContinue, onBegin]);

  const registerCup = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cupEls.current.set(id, el); else cupEls.current.delete(id);
  }, []);

  // ---- render ------------------------------------------------------------------------------
  const now = performance.now();
  const lastRecord = run.history[run.history.length - 1];
  const recap = run.phase === "recap" && lastRecord ? recapFor(run, lastRecord) : null;
  const lastWrong = run.phase === "playing" && run.rack
    ? run.rack.cups.find((c) => c.id === [...run.taps].reverse().find((t) => !t.correct)?.cupId) ?? null
    : null;
  const inGame = run.phase === "playing" || run.phase === "recap";
  const ready = playing && !armed;
  const section = currentSection(run);
  const school = campusName || courseCode ? [campusName, courseCode].filter(Boolean).join(" · ") : null;

  return (
    <div style={{ fontFamily: SANS, color: INK, WebkitTapHighlightColor: "transparent", ["--pong-accent" as string]: accent }}>
      <style>{CSS}</style>
      <section aria-label="Accounting Pong" style={{ borderRadius: 18, border: `1px solid ${CREAM_BORDER}`, background: CREAM, boxShadow: "0 18px 40px -24px rgba(20,33,61,0.45)", overflow: "hidden" }}>
        <div aria-hidden style={{ height: 6, background: bolt ? `linear-gradient(90deg, ${bolt.c1} 0 50%, ${bolt.c2} 50% 100%)` : `linear-gradient(90deg, ${CTA_RED}, ${BRAND_BLUE})` }} />

        {/* HEADER — Survive Games left; the school, sound and settings right. */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 16px", background: NAVY, color: NAVY_TEXT, borderBottom: `1px solid ${NAVY_BORDER}` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
            <SurviveWordmark size={22} cream={NAVY_TEXT} boilSeconds={1.2} />
            <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 15, letterSpacing: "0.14em", textTransform: "uppercase", color: NAVY_TEXT, opacity: 0.85 }}>games</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {school && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 999, background: NAVY_SURFACE, border: `1px solid ${NAVY_BORDER}`, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                {bolt && <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: `linear-gradient(90deg, ${bolt.c1} 50%, ${bolt.c2} 50%)`, flexShrink: 0 }} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{school}</span>
              </span>
            )}
            <IconButton label={sound ? "Sound on" : "Sound off"} onClick={toggleSound}>{sound ? "🔊" : "🔇"}</IconButton>
            <IconButton label="Workshop settings" onClick={() => setDrawer((d) => !d)} active={drawer}>⚙</IconButton>
            {/* LEE, top right (Lee, 2026-09-16: "instead of the floating modal, a circle frame of my
                headshot in the top right"). Tapping it texts him; the floating bubble stays off this page. */}
            <a href={`sms:${LEE_TEL}`} aria-label="Text Lee" title="Text Lee" style={{ display: "block", width: 36, height: 36, borderRadius: 999, overflow: "hidden", border: `2px solid ${NAVY_TEXT}`, flexShrink: 0, boxShadow: "0 4px 10px -4px rgba(0,0,0,0.6)" }}>
              <img src={LEE_PHOTO} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%", display: "block" }} />
            </a>
          </div>
        </header>

        {drawer && <Workshop ws={ws} setWs={setWs} onClose={() => setDrawer(false)} seed={run.seed} />}

        <main style={{ padding: "16px 16px 22px", background: CREAM }}>
          {run.phase === "intro" && <Lobby onPlay={onPlay} records={records} onPanel={setPanel} />}

          {inGame && run.rack && section && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                <button type="button" onClick={onQuit} style={{ background: "none", border: 0, padding: 0, color: INK_MUTED, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}>← Lobby</button>
                <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: INK_MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{section.title}</div>
              </div>
              <Hud run={run} />
              <Clock run={run} now={now} flash={bonusFlash} bonusS={run.cfg.bonusMsPerHit / 1000} />

              <div style={{ minHeight: 76, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "10px 0 12px" }}>
                {run.phase === "playing" ? (
                  <Instruction text={run.rack.rule.instruction} boss={run.rack.boss} retry={run.attempt > 0} toSink={remainingCorrect(run)} ready={ready} />
                ) : (
                  <Banner streak={run.streak} recap={recap} />
                )}
              </div>

              <div ref={fieldAttach} style={{ position: "relative", margin: "0 auto", maxWidth: MAX_FIELD, userSelect: "none" }}>
                <RackView rack={run.rack} layout={layout} mode={run.phase === "playing" ? "play" : "recap"} run={run}
                  record={run.phase === "recap" ? lastRecord : undefined} onTap={onTap} registerCup={registerCup}
                  faceDown={ready} shuffling={shuffling} celebrate={!!recap?.bossCleared && !reduced} />
                {ready && (
                  <div className="pong-in" style={{ position: "absolute", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    {shuffling ? (
                      <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 22, color: INK, background: `${CREAM}cc`, padding: "6px 14px", borderRadius: 999 }}>Shuffling…</div>
                    ) : (
                      <button type="button" onClick={onBegin} className="pong-cta" style={{ pointerEvents: "auto", fontSize: 17, padding: "14px 30px" }}>Begin →</button>
                    )}
                  </div>
                )}
                <div ref={launchRef} style={{ height: run.phase === "playing" ? 84 : 22, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4, transition: "height 250ms" }}>
                  {run.phase === "playing" && (
                    <>
                      <GoldBall size={Math.max(18, layout.cup * 0.22)} heat={run.multiplier} still />
                      {ws.showRemaining && armed && (
                        <div style={{ fontSize: 12, color: INK_MUTED, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>{remainingCorrect(run)} to sink</div>
                      )}
                    </>
                  )}
                </div>
                <BallLayer balls={balls.current} now={now} radius={Math.max(9, layout.cup * 0.12)} />
              </div>

              {lastWrong && <WrongNote key={lastWrong.id} cup={lastWrong} />}

              {recap && lastRecord && <RecapPanel recap={recap} record={lastRecord} onContinue={onContinue} onQuit={onQuit} />}
            </>
          )}

          {run.phase === "results" && section && (
            <Results run={run} section={section} best={best} onRestart={onRestart} onLobby={onLobby} onSolutions={() => setPanel("solutions")} />
          )}
        </main>
      </section>

      {panel === "board" && <Modal title="Leaderboard" onClose={() => setPanel(null)}><LeaderboardPanel total={records.total} bests={records.bests} /></Modal>}
      {panel === "how" && <Modal title="How to play" onClose={() => setPanel(null)}><HowToPlay /></Modal>}
      {panel === "guide" && <Modal title="Account guide" onClose={() => setPanel(null)}><AccountGuide /></Modal>}
      {panel === "solutions" && <Modal title="Solutions" onClose={() => setPanel(null)}><Solutions run={run} /></Modal>}

      {!embedded && <div style={{ height: 96 }} />}
    </div>
  );
}

// ---- pieces -------------------------------------------------------------------------------

function IconButton({ children, label, onClick, active }: { children: ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      style={{ width: 36, height: 36, borderRadius: 999, border: `1px solid ${active ? NAVY_TEXT : NAVY_BORDER}`, background: active ? "rgba(255,255,255,0.1)" : "transparent", color: NAVY_TEXT, fontSize: 16, cursor: "pointer", flexShrink: 0 }}>
      {children}
    </button>
  );
}

/** THE LOBBY: the title, one line, five full-width challenge rows, the secondary actions. */
function Lobby({ onPlay, records, onPanel }: { onPlay: (id: string) => void; records: { total: number; bests: Record<string, number> }; onPanel: (p: Panel) => void }) {
  const [note, setNote] = useState(false);
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(false), 2500);
    return () => window.clearTimeout(t);
  }, [note]);
  const anyScore = Object.values(records.bests).some((b) => b > 0) || records.total > 0;
  const linkStyle: CSSProperties = { background: "none", border: 0, padding: 0, color: INK, fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: SANS, textDecoration: "underline", textUnderlineOffset: 3 };
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h2 style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "clamp(28px, 6vw, 36px)", lineHeight: 1, margin: "6px 0 0", letterSpacing: "-0.01em", color: INK }}>Accounting Pong</h2>
      <p style={{ margin: "8px 0 0", fontSize: 15, color: INK_MUTED }}>Pick the right cups before time runs out.</p>
      <div style={{ marginTop: 6, position: "relative", display: "inline-block" }}>
        {WATCH_LEE_URL ? (
          <a href={WATCH_LEE_URL} target="_blank" rel="noopener" style={{ ...linkStyle, textDecoration: "none" }}>Watch Lee play ↗</a>
        ) : (
          <button type="button" onClick={() => setNote((n) => !n)} style={{ ...linkStyle, textDecoration: "none", color: INK_MUTED }}>Watch Lee play ↗</button>
        )}
        {note && <span className="pong-pop" role="status" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 5, padding: "6px 10px", borderRadius: 8, background: CREAM_SURFACE, border: `1px solid ${CREAM_BORDER}`, fontSize: 12, color: INK_MUTED, whiteSpace: "nowrap" }}>Lee’s playthrough video is coming.</span>}
      </div>

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        {PONG_SECTIONS.map((s, i) => {
          const best = records.bests[s.id] ?? 0;
          const first = i === 0;
          return (
            <button key={s.id} type="button" onClick={() => onPlay(s.id)} className="pong-row"
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${first ? ACCENT : CREAM_BORDER}`, borderLeft: `4px solid ${first ? ACCENT : CREAM_BORDER}`, background: CREAM_SURFACE, color: INK, cursor: "pointer", textAlign: "left", fontFamily: SANS, boxShadow: "0 6px 16px -14px rgba(20,33,61,0.5)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 16, lineHeight: 1.15 }}>{s.title}</div>
                {s.blurb && <div style={{ fontSize: 12.5, color: first ? ACCENT : INK_MUTED, marginTop: 2, fontWeight: first ? 700 : 500 }}>{s.blurb}</div>}
              </div>
              {best > 0 && <div style={{ fontSize: 12.5, color: INK_MUTED, whiteSpace: "nowrap" }}>Best <b style={{ color: INK, fontFamily: DISPLAY, fontWeight: 900, fontSize: 14 }}>{formatScore(best)}</b></div>}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "7px 12px", borderRadius: 999, background: first ? ACCENT : "transparent", color: first ? NAVY_TEXT : INK, border: `1.5px solid ${first ? ACCENT : CREAM_BORDER}`, fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>Play →</span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => onPanel("board")} style={linkStyle}>Leaderboard</button>
        <span aria-hidden style={{ color: INK_MUTED }}>·</span>
        <button type="button" onClick={() => onPanel("how")} style={linkStyle}>How to play</button>
        <span aria-hidden style={{ color: INK_MUTED }}>·</span>
        <button type="button" onClick={() => onPanel("guide")} style={linkStyle}>Account guide</button>
      </div>
      {anyScore && <div style={{ marginTop: 8, fontSize: 12, color: INK_MUTED }}>Scores saved on this device.</div>}
    </div>
  );
}

/** A modal over the page: backdrop, card, close. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(13,23,48,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="pong-in" style={{ width: "100%", maxWidth: 560, maxHeight: "86vh", overflowY: "auto", borderRadius: 16, background: CREAM, color: INK, border: `1px solid ${CREAM_BORDER}`, boxShadow: "0 30px 60px -30px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 10px", borderBottom: `1px solid ${CREAM_BORDER}`, position: "sticky", top: 0, background: CREAM, zIndex: 1 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 18 }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: 0, color: INK_MUTED, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: "12px 16px 16px" }}>{children}</div>
      </div>
    </div>
  );
}

/** Phase 1, honest: the board is TOTAL POINTS. Only this device's row exists until the
 *  campus board (a game_scores table + sign-in) ships. Never a ranking that isn't real. */
function LeaderboardPanel({ total, bests }: { total: number; bests: Record<string, number> }) {
  const [name, setName] = useState("");
  useEffect(() => { setName(readStr(K.name)); }, []);
  const save = (v: string) => { setName(v); try { localStorage.setItem(K.name, v); } catch { /* private window */ } };
  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, color: INK }}>
        <tbody>
          <tr style={{ borderBottom: `1px solid ${CREAM_BORDER}` }}>
            <td style={{ padding: "8px 6px", fontFamily: DISPLAY, fontWeight: 900, color: ACCENT, width: 28 }}>1</td>
            <td style={{ padding: "8px 6px" }}>
              <input value={name} onChange={(e) => save(e.target.value)} placeholder="Your name" aria-label="Your name on the board"
                style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, color: INK, background: "transparent", border: 0, borderBottom: `1px dashed ${CREAM_BORDER}`, padding: "2px 0", width: "100%", maxWidth: 220 }} />
            </td>
            <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: DISPLAY, fontWeight: 900, fontSize: 18 }}>{formatScore(total)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 12, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: INK_MUTED }}>Best per challenge</div>
      <div style={{ marginTop: 4, display: "grid", gridTemplateColumns: "1fr auto", rowGap: 4, columnGap: 12, fontSize: 13.5 }}>
        {PONG_SECTIONS.map((s) => (
          <div key={s.id} style={{ display: "contents" }}>
            <span>{s.title}</span>
            <span style={{ textAlign: "right", fontFamily: DISPLAY, fontWeight: 900 }}>{bests[s.id] > 0 ? formatScore(bests[s.id]) : "—"}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.5, color: INK_MUTED }}>
        Every point from every rack counts toward the total. The campus board is coming — this is your device’s row until then. Scores saved on this device.
      </p>
    </div>
  );
}

function HowToPlay() {
  const li: CSSProperties = { margin: "0 0 8px", fontSize: 14, lineHeight: 1.5 };
  return (
    <ul style={{ margin: 0, paddingLeft: 18, color: INK }}>
      <li style={li}>Read the instruction, then hit <b>Begin</b>. The clock starts when you do.</li>
      <li style={li}><b>Sink every cup</b> that fits — tap it and the ball flies. Every cup you sink adds 2 seconds.</li>
      <li style={li}>A wrong cup just locks and tells you why. It resets your heat, that’s all.</li>
      <li style={li}>Run out of time and you lose one of your <b>three lives</b>, then try that rack again.</li>
      <li style={li}>Racks grow: 2-1, 3-2-1, 3-2-1, 4-3-2-1, then the <b>final boss</b> (5-4-3-2-1) keeps coming.</li>
      <li style={li}>Perfect racks heat you up: <b>2× HEATING UP!</b> then <b>3× ON FIRE!</b> — 100 points a cup, times your heat.</li>
      <li style={li}>Cash out any time to bank your score. Every point counts toward your total.</li>
    </ul>
  );
}

/** THE ACCOUNT GUIDE — the T's from the v4 slides: "+ | −" for assets, expenses and
 *  dividends (debit grows them), "− | +" for liabilities, equity and revenues. */
const GUIDE: readonly { name: string; debit: boolean; note: string }[] = [
  { name: "Assets", debit: true, note: "own it" },
  { name: "Liabilities", debit: false, note: "owe it" },
  { name: "Equity", debit: false, note: "owners’ piece" },
  { name: "Revenues", debit: false, note: "earned" },
  { name: "Expenses", debit: true, note: "cost" },
  { name: "Dividends", debit: true, note: "contra equity" },
];

function MiniT({ name, debit, note }: { name: string; debit: boolean; note: string }) {
  const color = debit ? DEBIT_INK : CREDIT_INK;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 92 }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 14, color, whiteSpace: "nowrap" }}>{name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", width: 76, borderTop: `2px solid ${INK}`, marginTop: 3 }}>
        <div style={{ borderRight: `2px solid ${INK}`, textAlign: "center", fontFamily: DISPLAY, fontWeight: 900, fontSize: 22, color: debit ? GREEN : RED, lineHeight: 1.2 }}>{debit ? "+" : "−"}</div>
        <div style={{ textAlign: "center", fontFamily: DISPLAY, fontWeight: 900, fontSize: 22, color: debit ? RED : GREEN, lineHeight: 1.2 }}>{debit ? "−" : "+"}</div>
      </div>
      <div style={{ fontSize: 11.5, color: INK_MUTED, marginTop: 3 }}>{note}</div>
    </div>
  );
}

function AccountGuide() {
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 10px", justifyContent: "center" }}>
        {GUIDE.map((g) => <MiniT key={g.name} {...g} />)}
      </div>
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 6, columnGap: 12, fontSize: 13.5, color: INK }}>
        <b style={{ color: DEBIT_INK }}>Debit ↑</b><span>assets, expenses, dividends — normal balance on the left</span>
        <b style={{ color: CREDIT_INK }}>Credit ↑</b><span>liabilities, equity, revenues — normal balance on the right</span>
        <b>Balance sheet</b><span>assets, liabilities, equity</span>
        <b>Income statement</b><span>revenues, expenses</span>
        <b>Closed</b><span>revenues, expenses, dividends (temporary). Everything else stays.</span>
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 12.5, color: INK_MUTED }}>Cheat codes: “Receivable” = asset · “Payable” = liability · “Unearned” = liability · “Prepaid” = asset · anything “expense” = expense.</p>
    </div>
  );
}

/** SOLUTIONS: every rack of the run; open one for the quick answers and whys. */
function Solutions({ run }: { run: RunState }) {
  const [open, setOpen] = useState<number>(run.history.length - 1);
  if (!run.history.length) return <p style={{ fontSize: 14, color: INK_MUTED }}>No racks yet.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {run.history.map((rec, i) => {
        const isOpen = open === i;
        const correct = rec.rack.cups.filter((c) => c.correct);
        const wrongTapped = rec.rack.cups.filter((c) => cupOutcome(rec, c) === "wrong");
        const color = rec.result === "perfect" ? GREEN : rec.result === "cleared" ? INK : RED;
        return (
          <div key={`${rec.index}-${rec.attempt}`} style={{ borderRadius: 10, border: `1px solid ${CREAM_BORDER}`, background: CREAM_SURFACE }}>
            <button type="button" onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", padding: "10px 12px", background: "none", border: 0, cursor: "pointer", textAlign: "left", fontFamily: SANS, color: INK }}>
              <span style={{ fontSize: 13.5 }}><b>Rack {rec.index + 1}</b>{rec.attempt > 0 ? ` · try ${rec.attempt + 1}` : ""} · {rec.rack.rule.shortTitle} · {rec.rack.size} cups</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color, whiteSpace: "nowrap" }}>{rec.result} · +{formatScore(rec.points)} {isOpen ? "▴" : "▾"}</span>
            </button>
            {isOpen && (
              <div style={{ padding: "0 12px 12px", fontSize: 13.5, color: INK }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: INK_MUTED, marginBottom: 4 }}>{rec.rack.rule.instruction}</div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 10, rowGap: 3 }}>
                  {correct.map((c) => (
                    <div key={c.id} style={{ display: "contents" }}>
                      <span style={{ color: cupOutcome(rec, c) === "hit" ? GREEN : ARC_GOLD, fontWeight: 900 }}>{cupOutcome(rec, c) === "hit" ? "✓" : "○"}</span>
                      <span><b>{c.label}</b> <span style={{ color: INK_MUTED }}>— {c.why}</span></span>
                    </div>
                  ))}
                  {wrongTapped.map((c) => (
                    <div key={c.id} style={{ display: "contents" }}>
                      <span style={{ color: RED, fontWeight: 900 }}>✕</span>
                      <span><b>{c.label}</b> <span style={{ color: INK_MUTED }}>— {c.why}</span></span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 12.5, color: ACCENT, fontWeight: 700 }}>{recapFor(run, rec).cheat}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Hud({ run }: { run: RunState }) {
  const heat = run.multiplier;
  const heatColor = heat >= 3 ? RED : heat >= 2 ? HEAT_BLUE : INK_MUTED;
  const section = currentSection(run);
  const bosses = bossesCleared(run);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "2px 0 8px", fontSize: 11.5, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
      <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }} title="Racks you can still miss" aria-label={`${run.lives} racks you can still miss`}>
        {Array.from({ length: run.cfg.lives }).map((_, i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: 999, background: i < run.lives ? `radial-gradient(circle at 35% 30%, ${CTA_RED_LIT}, ${CTA_RED} 55%, ${CTA_RED_DEEP})` : "transparent", border: i < run.lives ? "none" : `1.5px solid ${CREAM_BORDER}`, transition: "all 200ms" }} />
        ))}
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 22, color: INK, flexShrink: 0 }}>{formatScore(run.score)}</div>
      <div style={{ padding: "3px 8px", borderRadius: 6, border: `1.5px solid ${heatColor}`, color: heatColor, fontWeight: 900, whiteSpace: "nowrap", fontSize: 11, boxShadow: heat >= 2 ? `0 0 12px ${heatColor}55` : "none", transition: "all 250ms", flexShrink: 0 }}>
        {heat}×{heat >= 3 ? " ON FIRE!" : heat >= 2 ? " HEATING UP!" : ""}
      </div>
      {section && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }} title={`Rack ${run.rackNo + 1}`}>
          {section.ramp.map((_, i) => {
            const doneIt = run.rackNo > i || (run.phase === "recap" && run.rackNo === i && run.history[run.history.length - 1]?.result !== "timeout");
            const cur = run.rackNo === i && !doneIt;
            const boss = i === section.ramp.length - 1;
            return <span key={i} aria-hidden style={{ width: boss ? 18 : 10, height: 10, borderRadius: 999, border: `1.5px solid ${doneIt ? GREEN : cur ? ACCENT : CREAM_BORDER}`, background: doneIt ? GREEN : cur ? ACCENT : "transparent", color: NAVY_TEXT, fontSize: 7, lineHeight: 1, display: "grid", placeItems: "center" }}>{boss ? "★" : ""}</span>;
          })}
          {bosses > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: GREEN, marginLeft: 2 }}>×{bosses}</span>}
        </span>
      )}
    </div>
  );
}

function Clock({ run, now, flash, bonusS }: { run: RunState; now: number; flash: number; bonusS: number }) {
  const stopped = run.phase !== "playing";
  const total = limitMs(run);
  const rec = run.history[run.history.length - 1];
  const left = stopped ? (rec && rec.index === run.rackNo ? Math.max(0, total - rec.elapsedMs) : total) : run.clockStartedAt == null ? total : remainingMs(run, now);
  const frac = total ? left / total : 1;
  const urgent = !stopped && frac < 0.25;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
      <div style={{ flex: 1, height: 8, borderRadius: 999, background: CREAM_SURFACE2, overflow: "hidden", border: `1px solid ${CREAM_BORDER}` }}>
        <div style={{ height: "100%", width: "100%", transformOrigin: "left center", transform: `scaleX(${frac})`, background: urgent ? RED : ACCENT, borderRadius: 999, willChange: "transform" }} />
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontVariantNumeric: "tabular-nums", minWidth: 46, textAlign: "right", color: urgent ? RED : INK, fontSize: 16 }}>
        {(left / 1000).toFixed(1)}s
      </div>
      {flash > 0 && !stopped && (
        <span key={flash} className="pong-float" aria-hidden style={{ position: "absolute", right: 0, top: -18, fontFamily: DISPLAY, fontWeight: 900, fontSize: 14, color: GREEN }}>+{bonusS}s</span>
      )}
    </div>
  );
}

/** "Sink every cup that is an ASSET" — the CAPS run takes the accent. */
function Instruction({ text, boss, retry, toSink, ready }: { text: string; boss: boolean; retry: boolean; toSink: number; ready: boolean }) {
  const parts = text.split(/([A-Z]{2,}(?: [A-Z]{2,})*)/);
  return (
    <div className="pong-in">
      {(boss || retry) && (
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: retry ? RED : ACCENT, marginBottom: 4 }}>
          {retry ? "Same rack, new scramble" : "★ Final boss"}
        </div>
      )}
      <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: ready ? "clamp(26px, 7vw, 36px)" : "clamp(24px, 6.4vw, 32px)", lineHeight: 1.1, letterSpacing: "-0.01em", color: INK, transition: "font-size 200ms" }}>
        {parts.map((p, i) => (/^[A-Z]{2,}(?: [A-Z]{2,})*$/.test(p) ? <span key={i} style={{ color: ACCENT }}>{p}</span> : <span key={i}>{p}</span>))}
      </div>
      {ready && (
        <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: INK_MUTED }}>
          <span style={{ color: INK }}>{toSink}</span> to sink
        </div>
      )}
    </div>
  );
}

function Banner({ streak, recap }: { streak: number; recap: Recap | null }) {
  if (!recap) return null;
  if (recap.bossCleared) {
    return (
      <div className="pong-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div className="pong-arcade" style={{ color: INK, textShadow: `0 0 22px ${GREEN_LIT}` }}>Boss cleared!</div>
        <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: GREEN }}>{recap.perfect ? heatLabel(streak) ?? "Perfect" : "Keep it rolling"} · next rack: {recap.nextSize} cups</div>
      </div>
    );
  }
  const heat = recap.result === "perfect" ? heatLabel(streak) : recap.result === "timeout" ? "TIME!" : "CLEARED";
  const fire = heat === "ON FIRE!";
  const warm = heat === "HEATING UP!";
  const sub = recap.retry ? "Try this rack again" : recap.nextSize ? `Next rack: ${recap.nextSize} cups` : null;
  return (
    <div className="pong-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      {heat && (
        <div className="pong-arcade" style={{ color: fire ? RED : warm ? HEAT_BLUE : INK, textShadow: fire ? `0 0 18px ${CTA_RED_LIT}88` : warm ? `0 0 18px ${ARC_BLUE}` : "none" }}>{heat}</div>
      )}
      {sub && <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: recap.retry ? RED : INK_MUTED }}>{sub}</div>}
    </div>
  );
}

// ---- the rack -------------------------------------------------------------------------------

interface RackViewProps {
  rack: Rack;
  layout: Layout;
  mode: "play" | "recap" | "mini";
  run?: RunState;
  record?: RoundRecord;
  onTap?: (id: string) => void;
  registerCup?: (id: string, el: HTMLElement | null) => void;
  faceDown?: boolean;
  shuffling?: boolean;
  celebrate?: boolean;
}

function RackView({ rack, layout, mode, run, record, onTap, registerCup, faceDown, shuffling, celebrate }: RackViewProps) {
  const height = rackHeight(rack, layout);
  return (
    <div style={{ position: "relative", width: layout.width, height, margin: "0 auto" }}>
      {celebrate && <Confetti width={layout.width} height={height} />}
      {rack.cups.map((c, i) => {
        const tapped = run ? isTapped(run, c.id) : false;
        const outcome: CupOutcome | null = record ? cupOutcome(record, c) : null;
        return (
          <CupView key={c.id} cup={c} layout={layout} pos={cupPos(rack, layout, c)} z={c.row + 1} mode={mode} index={i}
            tapped={tapped} outcome={outcome} onTap={onTap} registerCup={registerCup} faceDown={!!faceDown} shuffling={!!shuffling} />
        );
      })}
    </div>
  );
}

const OUTCOME: Record<CupOutcome, { sym: string; color: string; dashed?: boolean; dimmed?: boolean; green?: boolean }> = {
  hit: { sym: "✓", color: GREEN, green: true },
  wrong: { sym: "✕", color: RED, dimmed: true },
  missed: { sym: "○", color: ARC_GOLD, dashed: true },
  left: { sym: "·", color: INK_MUTED, dimmed: true },
};

/** A Solo cup from the front: a lip wider than the foot, the white inside wall (where the name
 *  is written), a tapered body with three faint ridges and a rounded foot, a powder-blue bolt. */
function CupView({ cup, layout, pos, z, mode, index, tapped, outcome, onTap, registerCup, faceDown, shuffling }: {
  cup: Cup; layout: Layout; pos: { x: number; y: number }; z: number; mode: "play" | "recap" | "mini"; index: number;
  tapped: boolean; outcome: CupOutcome | null; onTap?: (id: string) => void; registerCup?: (id: string, el: HTMLElement | null) => void;
  faceDown: boolean; shuffling: boolean;
}) {
  const play = mode === "play";
  const W = layout.cup, H = layout.h, R = layout.rim;
  const wrongNow = play && tapped && !cup.correct;
  const hitNow = play && tapped && cup.correct;
  const o = outcome ? OUTCOME[outcome] : null;
  const dimmed = wrongNow || o?.dimmed;
  const green = hitNow || o?.green;
  const stops = dimmed ? ["#5a5a5a", "#7a7a7a", "#8d8d8d", "#7a7a7a", "#4a4a4a"]
    : green ? ["#14785a", "#22A97F", "#5FD9B3", "#22A97F", "#0f5d45"]
      : [CTA_RED_DEEP, CTA_RED, CTA_RED_LIT, CTA_RED, "#8f1d14"];
  const gid = `pong-cup-${dimmed ? "g" : green ? "s" : "r"}`;
  const lipW = Math.max(3, Math.round(W * 0.05));
  const shuffleVars = shuffling ? {
    ["--sx1" as string]: `${(seededOffset(index, 1) - 0.5) * W * 2.2}px`, ["--sy1" as string]: `${(seededOffset(index, 2) - 0.5) * H * 1.2}px`,
    ["--sx2" as string]: `${(seededOffset(index, 3) - 0.5) * W * 1.6}px`, ["--sy2" as string]: `${(seededOffset(index, 4) - 0.5) * H * 0.9}px`,
  } : {};
  const wrapper: CSSProperties = {
    position: "absolute", left: pos.x, top: pos.y, width: W, height: H, zIndex: z, padding: 0, border: "none", background: "none",
    cursor: play ? (tapped || faceDown ? "default" : "pointer") : "default", touchAction: "manipulation", userSelect: "none",
    opacity: dimmed ? 0.75 : 1, transform: hitNow ? "scale(0.98)" : "none", transition: "transform 120ms, opacity 200ms",
    filter: green ? `drop-shadow(0 0 ${Math.round(W * 0.16)}px ${GREEN_LIT}99)` : `drop-shadow(0 ${Math.round(W * 0.05)}px ${Math.round(W * 0.08)}px rgba(20,33,61,0.35))`,
    ...shuffleVars,
  };
  const bodyTop = R * 0.5;
  const bodyH = H - bodyTop;
  const content = (
    <>
      {/* THE BODY — an SVG so the taper and the rounded foot are real: 100 wide at the lip, 64 at the foot. */}
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", left: 0, top: bodyTop, width: W, height: bodyH, display: "block" }}>
        <defs>
          <linearGradient id={gid} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={stops[0]} /><stop offset="0.3" stopColor={stops[1]} /><stop offset="0.46" stopColor={stops[2]} /><stop offset="0.64" stopColor={stops[3]} /><stop offset="1" stopColor={stops[4]} />
          </linearGradient>
        </defs>
        <path d="M0,0 H100 L83,93 Q82,100 75,100 H25 Q18,100 17,93 Z" fill={`url(#${gid})`} />
        {/* three faint ridges — two under the lip, one above the foot */}
        <path d="M1.5,9 H98.5" stroke="rgba(0,0,0,0.13)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M1.5,10.5 H98.5" stroke="rgba(255,255,255,0.14)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M2.5,16 H97.5" stroke="rgba(0,0,0,0.11)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M2.5,17.5 H97.5" stroke="rgba(255,255,255,0.12)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M18.5,86 H81.5" stroke="rgba(0,0,0,0.12)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M18.5,87.5 H81.5" stroke="rgba(255,255,255,0.1)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <span aria-hidden style={{ position: "absolute", left: "50%", top: bodyTop + bodyH * 0.5, transform: "translate(-50%, -50%)", opacity: dimmed ? 0.45 : 0.95 }}>
        <BoltBoil height={W * 0.34} red={ARC_BLUE} blue={BRAND_BLUE} boilFrame={0} />
      </span>
      {/* THE LIP + INSIDE WALL. Registered as the cup's target for the ball. */}
      <span ref={(el) => registerCup?.(cup.id, el)} aria-hidden style={{ position: "absolute", left: 0, top: 0, width: W, height: R, borderRadius: "50%", background: dimmed ? "radial-gradient(ellipse at 50% 30%, #DAD7D0, #B9B5AC 75%)" : "radial-gradient(ellipse at 50% 30%, #FFFFFF, #ECE8DE 78%)", boxShadow: `inset 0 0 0 ${lipW}px ${dimmed ? "#CFCBC2" : "#F7F4EE"}, inset 0 0 0 ${lipW + 1}px rgba(20,33,61,0.16), inset 0 ${Math.round(R * 0.3)}px ${Math.round(R * 0.45)}px rgba(20,33,61,0.2)`, transition: "background 200ms" }} />
      <span style={{ position: "absolute", left: lipW + 2, top: lipW + 1, width: W - lipW * 2 - 4, height: R - lipW * 2 - 2, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: green ? GREEN : INK, fontFamily: DISPLAY, fontWeight: 900, fontSize: layout.font, lineHeight: 0.98, letterSpacing: "-0.01em", opacity: faceDown ? 0 : 1, transition: "opacity 250ms", overflowWrap: "normal", hyphens: "none" }}>
        {layout.short ? cup.shortLabel : cup.label}
      </span>
      {hitNow && <span style={{ position: "absolute", left: "50%", top: R * 0.8, transform: "translate(-50%, -50%)" }}><GoldBall size={W * 0.2} heat={1} still /></span>}
      {(wrongNow || o) && (
        <span aria-hidden style={{ position: "absolute", top: -6, right: -2, width: Math.max(18, W * 0.24), height: Math.max(18, W * 0.24), borderRadius: 999, background: CREAM, color: wrongNow ? RED : o!.color, border: `1.5px solid ${wrongNow ? RED : o!.color}`, fontSize: Math.max(11, W * 0.15), fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, zIndex: 2 }}>
          {wrongNow ? "✕" : o!.sym}
        </span>
      )}
      {o?.dashed && <span aria-hidden style={{ position: "absolute", left: -3, top: -3, width: W + 6, height: R + 6, borderRadius: "50%", border: `2px dashed ${ARC_GOLD}` }} />}
    </>
  );
  if (play) {
    return (
      <button type="button" disabled={tapped || faceDown} aria-pressed={tapped} aria-label={faceDown ? "Cup" : cup.label}
        className={shuffling ? "pong-shuffle" : undefined}
        onPointerDown={(e) => { if (e.button === 0 && !tapped && !faceDown) onTap?.(cup.id); }}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !tapped && !faceDown) { e.preventDefault(); onTap?.(cup.id); } }}
        style={wrapper}>
        {content}
      </button>
    );
  }
  return <div title={`${cup.label} — ${cup.why}`} style={wrapper}>{content}</div>;
}

/** "Rent Earned, Fees Earned — earned = revenue": cups that share a reason share a line. */
function groupByWhy(cups: Cup[]): [string, Cup[]][] {
  const m = new Map<string, Cup[]>();
  for (const c of cups) m.set(c.why, [...(m.get(c.why) ?? []), c]);
  return [...m.entries()];
}

/** A stable per-cup pseudo-random in 0..1 for the shuffle and confetti keyframes. */
function seededOffset(i: number, k: number): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A short burst when the boss falls. Pure CSS particles. */
function Confetti({ width, height }: { width: number; height: number }) {
  const bits = Array.from({ length: 26 }, (_, i) => i);
  const colors = [ACCENT, GREEN, ARC_GOLD, ARC_BLUE];
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 40, pointerEvents: "none", overflow: "visible" }}>
      {bits.map((i) => (
        <span key={i} className="pong-confetti" style={{
          position: "absolute", left: width / 2, top: height / 2, width: 6 + seededOffset(i, 9) * 6, height: 8 + seededOffset(i, 8) * 8,
          background: colors[i % colors.length], borderRadius: 2,
          ["--cx" as string]: `${(seededOffset(i, 5) - 0.5) * width * 1.3}px`, ["--cy" as string]: `${-40 - seededOffset(i, 6) * height * 0.9}px`,
          ["--cr" as string]: `${seededOffset(i, 7) * 720 - 360}deg`, animationDelay: `${seededOffset(i, 10) * 120}ms`,
        }} />
      ))}
    </div>
  );
}

function GoldBall({ size, heat, still }: { size: number; heat: number; still?: boolean }) {
  const glow = heat >= 3 ? `0 0 ${size}px ${CTA_RED_LIT}` : heat >= 2 ? `0 0 ${size * 0.8}px ${ARC_BLUE}` : `0 ${size * 0.15}px ${size * 0.3}px rgba(20,33,61,0.35)`;
  return (
    <div style={{ width: size, height: size, borderRadius: 999, background: `radial-gradient(circle at 35% 30%, #FFD777, ${ARC_GOLD} 55%, #C77A00)`, boxShadow: glow, display: "flex", alignItems: "center", justifyContent: "center", transition: still ? "box-shadow 300ms" : "none" }}>
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} aria-hidden>
        <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill={INK} />
      </svg>
    </div>
  );
}

function BallLayer({ balls, now, radius }: { balls: Ball[]; now: number; radius: number }) {
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", zIndex: 50 }} aria-hidden>
      <defs>
        <filter id="pong-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation={radius * 0.6} /></filter>
        <radialGradient id="pong-ball" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFD777" /><stop offset="55%" stopColor={ARC_GOLD} /><stop offset="100%" stopColor="#C77A00" />
        </radialGradient>
      </defs>
      {balls.map((b) => {
        const f = b.flight.at(now - b.startedAt);
        if (!f) return null;
        const r = radius * f.scale;
        const trailColor = b.heat >= 3 ? CTA_RED_LIT : ARC_BLUE;
        return (
          <g key={b.id} opacity={f.opacity}>
            {b.trail.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={r * (0.35 + 0.5 * (i / b.trail.length))} fill={i === b.trail.length - 1 ? ARC_CORE : trailColor} opacity={0.08 + 0.5 * (i / b.trail.length)} />
            ))}
            {b.heat >= 3 && <circle cx={f.x} cy={f.y} r={r * 1.6} fill={CTA_RED_LIT} opacity={0.7} filter="url(#pong-glow)" />}
            {b.heat === 2 && <circle cx={f.x} cy={f.y} r={r * 1.5} fill={ARC_BLUE} opacity={0.5} filter="url(#pong-glow)" />}
            <circle cx={f.x} cy={f.y + r * 0.9} r={r * 0.9} fill="rgba(20,33,61,0.25)" />
            <circle cx={f.x} cy={f.y} r={r} fill="url(#pong-ball)" />
            <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill={INK} transform={`translate(${f.x - r * 0.62} ${f.y - r * 0.62}) scale(${(r * 1.24) / 24})`} />
          </g>
        );
      })}
    </svg>
  );
}

/** Pops in under the rack the moment a wrong cup is tapped. A few words, no more. */
function WrongNote({ cup }: { cup: Cup }) {
  return (
    <div className="pong-pop" role="status" style={{ margin: "2px auto 0", maxWidth: MAX_FIELD, padding: "9px 14px", borderRadius: 12, background: CREAM_SURFACE, border: `1px solid ${RED}55`, fontSize: 15, lineHeight: 1.4, textAlign: "center" }}>
      <span style={{ color: RED, fontWeight: 900 }}>✕ {cup.label}</span>
      <span style={{ color: INK, fontWeight: 700 }}> — {cup.why}</span>
    </div>
  );
}

function RecapPanel({ recap, record, onContinue, onQuit }: { recap: Recap; record: RoundRecord; onContinue: () => void; onQuit: () => void }) {
  const title = recap.bossCleared ? "Boss cleared" : recap.perfect ? "Perfect rack" : recap.result === "timeout" ? "Out of time" : "Cleared, with a miss";
  const cta = recap.retry ? "Try again →" : "Next rack →";
  return (
    <div className="pong-in" style={{ margin: "8px auto 0", maxWidth: MAX_FIELD, padding: "14px 16px", borderRadius: 14, background: CREAM_SURFACE, border: `1px solid ${recap.bossCleared ? GREEN : CREAM_BORDER}`, boxShadow: "0 8px 20px -14px rgba(20,33,61,0.4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 18, letterSpacing: "-0.01em", color: recap.perfect || recap.bossCleared ? GREEN : recap.result === "timeout" ? RED : INK }}>{title}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 22, color: ACCENT }}>+{formatScore(recap.points)}</div>
      </div>
      {/* THE WHY — every cup that mattered, a few words each: wrong taps, then misses, then the
          cups you sank grouped by their reason (Lee: "feedback when you're correct should just
          remind them why it's correct, same concise format as the cheat codes"). */}
      <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: CREAM, border: `1px solid ${ACCENT}`, fontSize: 14, lineHeight: 1.5, color: INK }}>
        <span style={{ color: ACCENT, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 11 }}>Why</span>
        <div style={{ marginTop: 2, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 8, rowGap: 2 }}>
          {recap.wrong.map((c) => (
            <div key={c.id} style={{ display: "contents" }}><span style={{ color: RED, fontWeight: 900 }}>✕</span><span><b>{c.label}</b> — {c.why}</span></div>
          ))}
          {recap.missed.map((c) => (
            <div key={c.id} style={{ display: "contents" }}><span style={{ color: ARC_GOLD, fontWeight: 900 }}>○</span><span><b>{c.label}</b> — {c.why}</span></div>
          ))}
          {groupByWhy(record.rack.cups.filter((c) => cupOutcome(record, c) === "hit")).map(([why, cups]) => (
            <div key={why} style={{ display: "contents" }}><span style={{ color: GREEN, fontWeight: 900 }}>✓</span><span><b>{cups.map((c) => c.label).join(", ")}</b> — {why}</span></div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: INK_MUTED }}>
          <span>{(record.elapsedMs / 1000).toFixed(1)}s · {record.multiplier}×</span>
          <button type="button" onClick={onQuit} style={{ background: "none", border: 0, color: INK_MUTED, cursor: "pointer", fontSize: 12, textDecoration: "underline", textUnderlineOffset: 3, fontFamily: SANS }}>Cash out</button>
        </div>
        <button type="button" onClick={onContinue} className="pong-cta">{cta}</button>
      </div>
    </div>
  );
}

function Results({ run, section, best, onRestart, onLobby, onSolutions }: {
  run: RunState; section: { id: string; title: string }; best: { best: number; isNew: boolean } | null;
  onRestart: () => void; onLobby: () => void; onSolutions: () => void;
}) {
  const [shared, setShared] = useState<"idle" | "copied" | "manual">("idle");
  const text = `I scored ${formatScore(run.score)} on ${section.title} in Accounting Pong. Can you beat me? ${SHARE_URL}`;
  const share = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && window.innerWidth < 720) {
      try { await navigator.share({ text }); track("share_link_copied", { source: "pong" }); return; }
      catch (e) { if (e instanceof Error && e.name === "AbortError") return; }
    }
    if (await copyToClipboard(text)) { setShared("copied"); track("share_link_copied", { source: "pong" }); window.setTimeout(() => setShared("idle"), 2500); }
    else setShared("manual");
  };
  return (
    <div className="pong-in" style={{ textAlign: "center", padding: "16px 0", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTED }}>{run.quit ? "Cashed out" : "Out of lives"} · {section.title}</div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "clamp(56px, 18vw, 88px)", lineHeight: 1, color: ACCENT, margin: "6px 0" }}>{formatScore(run.score)}</div>
      {best?.isNew && <div className="pong-arcade" style={{ fontSize: 24, color: INK }}>New best for this challenge!</div>}
      <div style={{ marginTop: 10, fontSize: 15, color: INK_MUTED }}>
        {racksCleared(run)} racks cleared · {bossesCleared(run)} boss{bossesCleared(run) === 1 ? "" : "es"}
        {best && !best.isNew && best.best > 0 ? ` · best ${formatScore(best.best)}` : ""}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
        <button type="button" onClick={onRestart} className="pong-cta">Play again</button>
        <button type="button" onClick={onSolutions} className="pong-cta pong-cta--ghost">Solutions</button>
        <button type="button" onClick={onLobby} className="pong-cta pong-cta--ghost">Lobby</button>
        <button type="button" onClick={share} className="pong-cta pong-cta--ghost">{shared === "copied" ? "✓ Link copied!" : "Share"}</button>
      </div>
      {shared === "copied" && <div className="pong-pop" style={{ marginTop: 10, fontSize: 13, color: GREEN, fontWeight: 700 }}>Copied — paste it to a friend.</div>}
      {shared === "manual" && (
        <div className="pong-pop" style={{ marginTop: 10, fontSize: 13, color: INK_MUTED }}>
          Couldn’t reach your clipboard. Copy this:
          <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, background: CREAM_SURFACE, border: `1px solid ${CREAM_BORDER}`, color: INK, userSelect: "all", fontSize: 13 }}>{text}</div>
        </div>
      )}
      <div style={{ marginTop: 14, fontSize: 12, color: INK_MUTED }}>Scores saved on this device.</div>
    </div>
  );
}

function Workshop({ ws, setWs, onClose, seed }: { ws: WorkshopSettings; setWs: (f: (w: WorkshopSettings) => WorkshopSettings) => void; onClose: () => void; seed: number }) {
  const row: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 13 };
  const sel: CSSProperties = { background: NAVY_SURFACE, color: NAVY_TEXT, border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, padding: "4px 8px", fontSize: 13, fontFamily: SANS };
  return (
    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${NAVY_BORDER}`, background: NAVY, color: NAVY_TEXT, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ ...row, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 12, color: ARC_GOLD }}>
        Workshop <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: NAVY_TEXT, cursor: "pointer" }}>✕</button>
      </div>
      <label style={row}>Clock
        <select style={sel} value={ws.clock} onChange={(e) => setWs((w) => ({ ...w, clock: e.target.value as WorkshopSettings["clock"] }))}>
          <option value="default">15 s every rack · 20 s on the boss · +2 s per cup sunk</option>
          <option value="scaled">10 s + 0.75 s per cup over 3 · +2 s per cup sunk</option>
        </select>
      </label>
      <label style={row}>Miss style
        <select style={sel} value={ws.missStyle} onChange={(e) => setWs((w) => ({ ...w, missStyle: e.target.value as WorkshopSettings["missStyle"] }))}>
          <option value="random">Random (rim 3 · swirl 2 · skip 2 · stuck 1)</option>
          {MISS_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
      <label style={row}>Show “N to sink” during the rack
        <input type="checkbox" checked={ws.showRemaining} onChange={(e) => setWs((w) => ({ ...w, showRemaining: e.target.checked }))} />
      </label>
      <div style={{ fontSize: 11, color: NAVY_MUTED }}>Changing the clock resets the run. Seed {seed}.</div>
    </div>
  );
}

const CSS = `
@keyframes pong-in { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes pong-pop { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
@keyframes pong-float { 0% { opacity: 0; transform: translateY(6px); } 20% { opacity: 1; } 100% { opacity: 0; transform: translateY(-16px); } }
@keyframes pong-shuffle { 0% { transform: translate(var(--sx1), var(--sy1)) rotate(-6deg); } 50% { transform: translate(var(--sx2), var(--sy2)) rotate(5deg); } 100% { transform: none; } }
@keyframes pong-confetti { 0% { opacity: 1; transform: translate(0, 0) rotate(0); } 100% { opacity: 0; transform: translate(var(--cx), var(--cy)) rotate(var(--cr)); } }
.pong-in { animation: pong-in 400ms cubic-bezier(.2,.8,.2,1) both; }
.pong-pop { animation: pong-pop 260ms cubic-bezier(.2,.8,.2,1) both; }
.pong-float { animation: pong-float 900ms ease-out both; }
.pong-shuffle { animation: pong-shuffle ${SHUFFLE_MS}ms cubic-bezier(.3,.7,.2,1) both; }
.pong-confetti { animation: pong-confetti 1100ms cubic-bezier(.2,.7,.3,1) both; }
.pong-arcade { font-family: ${DISPLAY}; font-weight: 900; font-size: clamp(32px, 9vw, 44px); line-height: 1; letter-spacing: -0.01em; text-transform: uppercase; }
.pong-row { transition: transform 120ms, box-shadow 120ms; }
.pong-row:hover { transform: translateY(-1px); box-shadow: 0 10px 22px -14px rgba(20,33,61,0.6) !important; }
.pong-cta { font-family: ${SANS}; font-weight: 800; font-size: 15px; letter-spacing: 0.01em; color: ${NAVY_TEXT};
  background: linear-gradient(180deg, ${CTA_RED_LIT}, ${CTA_RED} 60%, ${CTA_RED_DEEP}); border: none; border-radius: 999px; padding: 12px 24px; cursor: pointer;
  box-shadow: 0 6px 18px rgba(230,59,45,0.35), inset 0 1px 0 rgba(255,255,255,0.25); transition: transform 120ms, box-shadow 120ms; }
.pong-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(230,59,45,0.45), inset 0 1px 0 rgba(255,255,255,0.25); }
.pong-cta:active { transform: translateY(1px); }
.pong-cta--ghost { background: transparent; color: ${INK}; box-shadow: inset 0 0 0 2px ${CREAM_BORDER}; }
.pong-cta--ghost:hover { box-shadow: inset 0 0 0 2px ${INK_MUTED}; }
@media (prefers-reduced-motion: reduce) { .pong-in, .pong-pop, .pong-float { animation: pong-fade 300ms both; } .pong-shuffle, .pong-confetti { animation: none; } @keyframes pong-fade { from { opacity: 0 } to { opacity: 1 } } }
`;
