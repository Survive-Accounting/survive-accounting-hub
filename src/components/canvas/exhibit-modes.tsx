// EXHIBIT MODES — the shared exhibit-layer MODE SWITCHER (cycle-modes). An
// exhibit card that "tunes" itself to the CEQ types Lee films (the accounting
// cycle's SOURCE DOCS / DEFINITIONS / ORDER today) declares its mode chips here
// and gets the whole pattern: a chip row (authoring chrome — never on camera),
// the M film-controller key to flip modes mid-take without mousing, and — for
// an ORDER-style teaching animation — the orbit state (tick + playing) with
// Tab / Shift+Tab manual stepping, P play/pause, and the ` reset back to step 1.
//
// Same realm-shared module-store pattern as the exhibit-highlights clear bus:
// the film popout shares this JS realm, so one store keeps the authoring
// canvas, studio preview, and film surfaces on the same mode without any
// cross-window plumbing. Nothing here is persisted — a refresh returns the
// default mode (no data model changes, per the spec).
//
// Mode is PURELY ADDITIVE: highlights, film lock, and the ` sweep all keep
// working in every mode. This layer owns mode/orbit STATE only; what a mode
// looks like is the card's own render.
import { useEffect, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";

import { useOnExhibitClear } from "./exhibit-highlights";
import { useFilm } from "./film-lock";
import { NEON } from "./theme";

export interface ExhibitModeDef {
  id: string;
  label: string;
  /** True ⇒ this mode drives the orbit animation (Tab/P keys, play chip). */
  orbit?: boolean;
}

interface ModeSnap {
  mode: string;
  /** Raw orbit step counter — cards wrap it by their own step count, so the
   *  store never needs to know how many steps a ring has. Can go negative
   *  (Shift+Tab); wrap with ((tick % n) + n) % n. */
  orderTick: number;
  orderPlaying: boolean;
  /** AUTHORED REVEAL (Bible law 4): the film-surface position in an exhibit's
   *  reveal sequence, 0 = the sequence's first state. FILM SURFACES ONLY —
   *  authoring and student surfaces always render full, so ` can never strand
   *  a blank exhibit where there are no film keys to step it. */
  revealTick: number;
  /** The depth layer (e.g. the users exhibit's HOW THEY DIFFER strip). OFF by
   *  default; Cram Blasts never toggle it on. */
  depthOn: boolean;
}

let snap: ModeSnap = { mode: "source", orderTick: 0, orderPlaying: false, revealTick: 0, depthOn: false };
let modeDefs: readonly ExhibitModeDef[] = [];
const listeners = new Set<() => void>();
const emit = (p: Partial<ModeSnap>) => { snap = { ...snap, ...p }; listeners.forEach((fn) => fn()); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Pure mode advance — the M key's contract, pinned by tests. */
export function nextModeId(ids: readonly string[], cur: string): string {
  if (ids.length === 0) return cur;
  return ids[(ids.indexOf(cur) + 1) % ids.length];
}

const orbitDef = () => modeDefs.find((m) => m.orbit);

// ~620ms travel + ~1s dwell at each step — the cadence Lee narrates over.
const ORBIT_MS = 1650;
let orbitTimer: ReturnType<typeof setInterval> | undefined;
function setPlaying(on: boolean): void {
  if (orbitTimer !== undefined) { clearInterval(orbitTimer); orbitTimer = undefined; }
  if (on) orbitTimer = setInterval(() => emit({ orderTick: snap.orderTick + 1 }), ORBIT_MS);
  if (on !== snap.orderPlaying) emit({ orderPlaying: on });
}

export function setExhibitMode(id: string): void {
  if (snap.mode === id) return;
  // Leaving the orbit mode always parks the bolt — no invisible timer keeps
  // ticking behind SOURCE DOCS / DEFINITIONS.
  if (snap.mode === orbitDef()?.id) setPlaying(false);
  emit({ mode: id });
}

/** The M film-controller key. Returns false when no moded exhibit is mounted so
 *  the key stays free everywhere else. */
export function cycleExhibitModes(): boolean {
  if (listeners.size === 0 || modeDefs.length === 0) return false;
  setExhibitMode(nextModeId(modeDefs.map((m) => m.id), snap.mode));
  return true;
}

/** Orbit film-controller keys — Tab/Shift+Tab ("step"/"back") and P ("toggle").
 *  Consumes ONLY while a moded exhibit is mounted AND its orbit mode is up, so
 *  Tab stays the walk everywhere else. A manual step pauses playback — that is
 *  the point of stepping: Lee narrates at his own pace. */
export function exhibitOrderKey(action: "step" | "back" | "toggle"): boolean {
  if (listeners.size === 0 || snap.mode !== orbitDef()?.id) return false;
  if (action === "toggle") setPlaying(!snap.orderPlaying);
  else { setPlaying(false); emit({ orderTick: snap.orderTick + (action === "back" ? -1 : 1) }); }
  return true;
}

export function toggleExhibitOrderPlay(): void { setPlaying(!snap.orderPlaying); }

/** ` reset (via the exhibit clear bus): bolt back to step 1, paused. */
export function resetExhibitOrder(): void { setPlaying(false); if (snap.orderTick !== 0) emit({ orderTick: 0 }); }

// ---- AUTHORED REVEAL + DEPTH LAYER (shared; first consumer: the users
// exhibit). A card with an authored reveal sequence registers its step count
// via useExhibitReveal; Tab / Shift+Tab step the FILM rendering through it and
// fall through to the walk at either end; ` (the clear bus) resets to state 0
// and closes the depth layer. Non-film surfaces ignore revealTick entirely.

let revealMax = 0;
let revealMounts = 0;

/** Tab / Shift+Tab on a film surface. Consumes ONLY while a reveal exhibit is
 *  mounted AND there is a step left in that direction — at either end the key
 *  falls through to the walk, so CEQ stepping keeps working around it. */
export function exhibitRevealKey(action: "step" | "back"): boolean {
  if (revealMounts === 0 || revealMax <= 0) return false;
  if (action === "step") {
    if (snap.revealTick >= revealMax) return false;
    emit({ revealTick: snap.revealTick + 1 });
    return true;
  }
  if (snap.revealTick <= 0) return false;
  emit({ revealTick: snap.revealTick - 1 });
  return true;
}

/** D on a film surface: toggle the mounted exhibit's depth layer. */
export function exhibitDepthKey(): boolean {
  if (revealMounts === 0) return false;
  emit({ depthOn: !snap.depthOn });
  return true;
}

/** Direct setters for authoring chrome (buttons/chips on non-film surfaces). */
export function setExhibitDepth(on: boolean): void { if (snap.depthOn !== on) emit({ depthOn: on }); }
export function setExhibitReveal(tick: number): void { const t = Math.max(0, Math.min(revealMax, tick)); if (snap.revealTick !== t) emit({ revealTick: t }); }

export function resetExhibitReveal(): void {
  if (snap.revealTick !== 0 || snap.depthOn) emit({ revealTick: 0, depthOn: false });
}

/** A reveal-sequenced card's hook: declares its LAST state index (0-based) and
 *  subscribes. Registers the ` reset. */
export function useExhibitReveal(maxTick: number): ModeSnap {
  revealMax = maxTick; // idempotent — one reveal exhibit kind mounted at a time today
  useEffect(() => { revealMounts++; return () => { revealMounts--; }; }, []);
  useOnExhibitClear(resetExhibitReveal);
  return useSyncExternalStore(subscribe, () => snap, () => snap);
}

/** A moded card's one hook: declares its chips, subscribes to the store, and
 *  joins the ` reset. Module-stable fns keep the clear-bus Set deduped. */
export function useExhibitModes(modes: readonly ExhibitModeDef[]): ModeSnap {
  modeDefs = modes; // idempotent declaration — one moded exhibit kind today
  useOnExhibitClear(resetExhibitOrder);
  return useSyncExternalStore(subscribe, () => snap, () => snap);
}

/** The chip row — AUTHORING CHROME. Renders nothing on a film surface (the
 *  guardrail: no new chrome in Recording Mode capture; Lee flips modes before
 *  rolling, or with M on camera). `sa-chrome` is the belt-and-braces film CSS
 *  kill on top of the context gate. */
export function ExhibitModeChips({ modes }: { modes: readonly ExhibitModeDef[] }) {
  const film = useFilm();
  const st = useExhibitModes(modes);
  if (film) return null;
  const orbit = modes.find((m) => m.orbit);
  return (
    <div className="sa-chrome nodrag flex items-center gap-1">
      {modes.map((m) => {
        const on = st.mode === m.id;
        return (
          <button
            key={m.id}
            className="nodrag rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider"
            style={on
              ? { background: "#FCA311", color: "#0B1322", border: "1px solid #FCA311" }
              : { background: "rgba(11,19,34,0.85)", color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}
            title={`${m.label} mode · M cycles modes on camera`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setExhibitMode(m.id); }}
          >
            {m.label}
          </button>
        );
      })}
      {orbit && st.mode === orbit.id && (
        <button
          className="nodrag ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider"
          style={{ background: "rgba(11,19,34,0.85)", color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }}
          title="Play/pause the orbit · on camera: P plays/pauses, Tab steps, Shift+Tab back, ` resets"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); toggleExhibitOrderPlay(); }}
        >
          {st.orderPlaying ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
          {st.orderPlaying ? "Pause" : "Play"}
        </button>
      )}
    </div>
  );
}
