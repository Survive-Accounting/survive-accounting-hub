// THE ACCOUNTING CYCLE SLIDE — the exhibit's ring on a field you can swim around.
//
// Lee, 2026-09-12: "I want to pull out the Accounting Cycle exhibit we have and maybe like, have it
// zoomed way out, but let me zoom up to it and drag around / swim around? Just to give users a
// quick tease of it. We will need this zoom functionality later, too."
//
// The ring is the Lab's own (canvas/exhibit-lab/cycle-ring.tsx — one picture, two surfaces) and the
// gestures are the map's own (capture/field-roam.ts): wheel zooms about the pointer, alt-drag
// swims, 0 goes home, O is the bird's-eye. Nothing new was invented for either half; this file is
// the field they meet on.
//
// AT REST IT IS A TEASE. Home shows the whole ring with its labels too small to read — that is the
// point, and zooming in is what pays it off. The Editor stage and the thumbnails always draw home;
// only the take moves (the roam resets with the frame, so every take starts wide).
import { CycleRing, type PillState } from "@/components/canvas/exhibit-lab/cycle-ring";
import { CYCLE_STEPS } from "@/components/canvas/exhibit-lab/cycle-model";

import { NO_ROAM, effectiveCamera, type FieldRoam } from "./capture/field-roam";
import { PHONE } from "./cluster/cluster-spec";
import { fieldTransform } from "./cluster/ClusterStage";
import { CYCLE_FIELD, cycleHome, cycleRingBox } from "./cycle-field";
import { BRAND_FONT, DISPLAY_FONT } from "./stage";

const GOLD = "#FCA311";
const MUTED = "#8C9BBA";

export function CycleFrame({ w, frame, live = false, roam }: {
  w: number;
  frame: { title?: string };
  live?: boolean;
  /** The take's camera offset over home — absent everywhere but the capture. */
  roam?: FieldRoam;
}) {
  const h = Math.round(w * 16 / 9);
  const k = w / PHONE.w;
  const cam = effectiveCamera(cycleHome(), roam ?? NO_ROAM);
  const gesture = roam?.gesture ?? "none";
  // The map's own transitions: a drag flies, a wheel tick eases, anything else settles.
  const transition = gesture === "drag" ? "none" : gesture === "wheel" ? "transform 120ms ease-out" : "transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1)";
  const box = cycleRingBox();
  const states: PillState[] = CYCLE_STEPS.map(() => "normal");
  const labels = CYCLE_STEPS.map((s) => s.text);
  const title = frame.title?.trim() || "The Accounting Cycle";
  return (
    <div data-sa-cycle="" style={{ width: w, height: h, background: "#000", position: "relative", overflow: "hidden", fontFamily: BRAND_FONT }}>
      {/* the phone-unit layer: 1080 × 1920, scaled to the CSS width like every full-frame kind */}
      <div style={{ position: "absolute", left: 0, top: 0, width: PHONE.w, height: PHONE.h, transform: `scale(${k})`, transformOrigin: "0 0", overflow: "hidden" }}>
        <div data-sa-field="" style={{ position: "absolute", left: 0, top: 0, width: CYCLE_FIELD.w, height: CYCLE_FIELD.h, transform: fieldTransform(cam), transformOrigin: "0 0", transition, willChange: "transform" }}>
          <div style={{ position: "absolute", left: box.left, top: box.top, width: box.w }}>
            <CycleRing states={states} labels={labels}
              centre={<span style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 30, color: "#F4EFE6", textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>{title}</span>} />
          </div>
        </div>
        {/* THE KICKER, fixed to the frame rather than the field, so it stays put while he swims. */}
        <div style={{ position: "absolute", left: Math.round(PHONE.w * 0.06), top: Math.round(PHONE.h * 0.1), fontWeight: 800, fontSize: 34, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD, pointerEvents: "none" }}>
          Nine steps
        </div>
        {/* HOW TO MOVE IT — authoring only. Never on the take: OBS must not see a hint. */}
        {!live && (
          <div style={{ position: "absolute", left: Math.round(PHONE.w * 0.06), bottom: Math.round(PHONE.h * 0.055), fontSize: 26, fontWeight: 700, color: MUTED, pointerEvents: "none" }}>
            wheel zooms · alt-drag swims · 0 home · O bird's-eye
          </div>
        )}
      </div>
    </div>
  );
}
