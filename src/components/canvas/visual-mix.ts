// VISUAL MIX SUMMARY (pure, read-only) — a lesson's visual balance at a glance.
// It counts frame types, hero visuals, motion-heavy shots, frames with nothing to
// manipulate, cram frames and phone warnings, then emits plain guidance. Purely
// informational: it changes nothing, blocks nothing. The rule of thumb baked in:
// generated scenery is atmosphere, not a hero; hero visuals should stay under
// ~20–25% of frames; one high-impact moment per section is a ceiling.

/** Card kinds a student can watch you BUILD — the manipulable teaching objects. */
export const TEACHING_KINDS = new Set([
  "je", "taccount", "computation", "schedule", "ceq", "list", "memorize", "formula", "outline",
]);

export interface FrameSummary {
  id: string;
  label?: string;
  visualType?: string;
  /** A big image/video-led shot (image or video card, a bg loop, or a real-world layout). */
  heroVisual?: boolean;
  /** Playing bg loop, or a lively World. */
  motionHeavy?: boolean;
  /** Count of manipulable teaching objects in the frame. */
  teachingObjects: number;
  /** Advisory phone-check warnings for this frame. */
  phoneWarnings?: number;
}

export interface VisualMix {
  totalFrames: number;
  byType: Record<string, number>;
  heroCount: number;
  heroPct: number;
  motionCount: number;
  /** Ids of frames with nothing manipulable to teach with. */
  noObjectFrameIds: string[];
  cramCount: number;
  phoneWarnings: number;
  guidance: string[];
}

/** Compute the read-only mix for a lesson's frames. Deterministic, no side effects. */
export function computeVisualMix(frames: FrameSummary[]): VisualMix {
  const total = frames.length;
  const byType: Record<string, number> = {};
  let heroCount = 0;
  let motionCount = 0;
  let cramCount = 0;
  let phoneWarnings = 0;
  const noObjectFrameIds: string[] = [];

  for (const f of frames) {
    const t = f.visualType || "untagged";
    byType[t] = (byType[t] ?? 0) + 1;
    if (f.heroVisual) heroCount++;
    if (f.motionHeavy) motionCount++;
    if (t === "cram") cramCount++;
    if (f.teachingObjects <= 0) noObjectFrameIds.push(f.id);
    phoneWarnings += f.phoneWarnings ?? 0;
  }

  const heroPct = total > 0 ? heroCount / total : 0;

  const guidance: string[] = [];
  guidance.push("Generated scenery is atmosphere — a faint World background is NOT a hero visual.");
  if (heroPct > 0.25) {
    guidance.push(`Hero visuals are ${Math.round(heroPct * 100)}% of frames — aim under ~20–25%. Let the teaching cards carry most shots.`);
  } else if (total > 0) {
    guidance.push(`Hero visuals are ${Math.round(heroPct * 100)}% of frames — a healthy, card-led mix.`);
  }
  guidance.push("One high-impact moment per section is a ceiling, not a target.");
  if (noObjectFrameIds.length > 0) {
    guidance.push(`${noObjectFrameIds.length} frame(s) have no manipulable teaching object — consider a card students can watch you build.`);
  }
  if (total > 0 && motionCount / total > 0.5) {
    guidance.push(`${motionCount} of ${total} frames are motion-heavy — motion competes with the cards; keep most shots still.`);
  }
  if (cramCount === 0 && total >= 3) {
    guidance.push("No cram frame yet — a 'lock this in' recap gives students a clear finish line.");
  }
  if (phoneWarnings > 0) {
    guidance.push(`${phoneWarnings} phone-readability warning(s) across the lesson — open Phone check on those frames.`);
  }

  return { totalFrames: total, byType, heroCount, heroPct, motionCount, noObjectFrameIds, cramCount, phoneWarnings, guidance };
}
