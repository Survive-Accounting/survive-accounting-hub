// VISUAL MIX PANEL (Phase 8, read-only) — a non-blocking summary of a lesson's
// visual balance. Derives per-frame facts from the live nodes, runs the pure
// computeVisualMix, and renders counts + guidance. Changes nothing.
import { useReactFlow } from "@xyflow/react";
import { X } from "lucide-react";

import { frameCellLabel, framesInLesson } from "./frames";
import { baseTextPxForKind, phoneChecks, type PhoneEl } from "./phone-check";
import { NEON } from "./theme";
import { FRAME_CARD_SCALE, FRAME_H, FRAME_W, type FrameBox, type LessonBox } from "./types";
import { computeVisualMix, TEACHING_KINDS } from "./visual-mix";

export function VisualMixPanel({ lessonId, onClose }: { lessonId: string | null; onClose: () => void }) {
  const rf = useReactFlow();
  const lessons = rf.getNodes().filter((n) => n.type === "lesson");
  // Prefer the passed lesson; else the lesson with the most frames; else the first.
  const pick =
    (lessonId && lessons.find((l) => l.id === lessonId)) ||
    [...lessons].sort((a, b) => framesInLesson(rf.getNodes() as never, b.id).length - framesInLesson(rf.getNodes() as never, a.id).length)[0] ||
    null;

  const lessonLabel = pick ? ((pick.data as unknown as LessonBox).label || "Lesson") : "No lesson";
  const frames = pick ? framesInLesson(rf.getNodes() as never, pick.id) : [];

  const summaries = frames.map((fr) => {
    const fb = fr.data as unknown as FrameBox;
    const kids = rf.getNodes().filter((n) => n.parentId === fr.id);
    const kinds = kids.map((k) => ((k.data as { kind?: string }).kind ?? k.type ?? "card") as string);
    const teaching = kinds.filter((k) => TEACHING_KINDS.has(k)).length;
    const hero = kinds.some((k) => k === "image" || k === "video") || !!fb.bgSrc || fb.visualType === "real_world";
    const motion = !!fb.bgPlaying || (!!fb.world && (fb.worldMotion ?? 0) > 0.3);
    // quick phone-warning estimate (same model as the frame overlay)
    const els: PhoneEl[] = kids.map((n) => {
      const cd = n.data as { kind?: string; w?: number; h?: number; scale?: number };
      const kind = cd.kind ?? n.type ?? "card";
      const cs = typeof cd.scale === "number" ? cd.scale : FRAME_CARD_SCALE;
      return { id: n.id, kind, x: n.position.x, y: n.position.y, w: (n.width ?? cd.w ?? 240) * cs, h: (n.height ?? cd.h ?? 180) * cs, textPx: baseTextPxForKind(kind) * cs };
    });
    const warns = phoneChecks({ frameW: fb.w ?? FRAME_W, frameH: fb.h ?? FRAME_H, elements: els }).filter((f) => f.level === "warn").length;
    return { id: fr.id, label: frameCellLabel(fr as never), visualType: fb.visualType, heroVisual: hero, motionHeavy: motion, teachingObjects: teaching, phoneWarnings: warns };
  });

  const mix = computeVisualMix(summaries);
  const stat = (label: string, value: string | number, tone?: string) => (
    <div className="flex items-center justify-between rounded px-2 py-1" style={{ background: NEON.bg2, border: `1px solid ${NEON.borderSoft}` }}>
      <span style={{ color: NEON.muted }}>{label}</span>
      <span className="font-bold tabular-nums" style={{ color: tone ?? NEON.text }}>{value}</span>
    </div>
  );

  return (
    <div
      className="absolute bottom-16 left-1/2 z-50 max-h-[70vh] w-80 -translate-x-1/2 overflow-y-auto rounded-xl p-3 text-[11.5px]"
      style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text, boxShadow: "0 20px 50px -18px rgba(0,0,0,0.8)" }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: NEON.yellow }}>Visual mix</span>
        <span className="min-w-0 flex-1 truncate" style={{ color: NEON.muted }}>{lessonLabel}</span>
        <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} onClick={onClose} title="Close"><X className="h-3 w-3" /></button>
      </div>

      {mix.totalFrames === 0 ? (
        <p style={{ color: NEON.muted }}>This lesson has no frames yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1">
            {stat("Frames", mix.totalFrames)}
            {stat("Hero visuals", `${mix.heroCount} · ${Math.round(mix.heroPct * 100)}%`, mix.heroPct > 0.25 ? "#FF8B9E" : "#7EF3C0")}
            {stat("Motion-heavy", mix.motionCount, mix.motionCount / mix.totalFrames > 0.5 ? "#F5D48F" : NEON.text)}
            {stat("Cram frames", mix.cramCount)}
            {stat("No teaching object", mix.noObjectFrameIds.length, mix.noObjectFrameIds.length ? "#F5D48F" : "#7EF3C0")}
            {stat("Phone warnings", mix.phoneWarnings, mix.phoneWarnings ? "#FF8B9E" : "#7EF3C0")}
          </div>

          <div className="mt-2">
            <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Frame types</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(mix.byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <span key={t} className="rounded px-1.5 py-0.5 text-[10px]" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}>{t} · {n}</span>
              ))}
            </div>
          </div>

          <div className="mt-2 border-t pt-2" style={{ borderColor: NEON.borderSoft }}>
            <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Guidance</div>
            <ul className="space-y-1">
              {mix.guidance.map((g, i) => (
                <li key={i} className="flex gap-1.5 leading-snug" style={{ color: NEON.text }}>
                  <span style={{ color: NEON.muted }}>·</span><span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-2 text-[9px] italic" style={{ color: NEON.muted }}>Read-only — nothing here changes your scene.</p>
        </>
      )}
    </div>
  );
}
