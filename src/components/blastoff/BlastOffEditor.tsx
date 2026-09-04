// BLAST OFF — the arrangement editor, the frame preview and the in-page capture.
//
// Extracted from routes/blast-off.tsx (2026-09-02) so the SAME screens mount
// under /v3/$topic/$set/blast-off/{arrange,film}. Lee, on the move: "the design
// is right, the route is wrong" — so nothing here is redesigned; the route just
// stopped owning it. /blast-off still mounts these for its own set list.
//
// The plan lives ON THE SET (deck.blastOff in scene JSON), so it travels with
// the questions it films and reconciles against them every time it loads: add
// a question to the bank and it shows up here rather than going unfilmed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Clapperboard, Plus, X } from "lucide-react";

import type { BoothCeq, BoothSetInfo } from "@/lib/talkthrough.functions";
import { loadBlastPlan, saveBlastPlan } from "@/lib/blastoff.functions";
import { syncBlastPlanToSet } from "@/lib/blastoff-sync.functions";
import { openFilmMode } from "./FilmHandoff";
import { PhoneFrame } from "./PhoneFrame";
import { layoutOf } from "./layout";
import {
  FRAME_LABEL, INSERT_KINDS, filmFrames, insertFrame, isInsert, isStandard, moveFrame, newFrameId, reconcilePlan, removeFrame,
  type BlastFrame, type BlastFrameKind, type BlastPlan,
} from "./plan";
import { BankPicker } from "./BankPicker";

export const GOLD = "#FCA311";
export const CREAM = "#F4EFE6";
export const MUTED = "#9AA3B8";
export const PANEL = "rgba(16,24,44,0.92)";
export const EDGE = "rgba(244,239,230,0.16)";
export const BG = "#070B14";

// ------------------------------------------------------------------ plan

/** Load + reconcile the stored plan for a set. */
export function usePlan(set: BoothSetInfo) {
  const [plan, setPlan] = useState<BlastPlan | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    let live = true;
    loadBlastPlan({ data: { setId: set.id } })
      .then((stored) => { if (live) { const s = stored as BlastPlan | null; setPlan({ ...reconcilePlan(s, set.ceqs), ...(s?.layout ? { layout: s.layout } : {}) }); } })
      .catch(() => { if (live) setPlan(reconcilePlan(null, set.ceqs)); });
    return () => { live = false; };
  }, [set.id, set.ceqs]);

  // DEBOUNCED SAVE (2026-09-03, the review deck types into frames): the
  // screen updates on every keystroke; the server gets the plan once the
  // typing pauses. Whatever is pending is flushed when the screen unmounts.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFrames = useRef<BlastFrame[] | null>(null);
  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const frames = pendingFrames.current;
    if (!frames) return;
    pendingFrames.current = null;
    saveBlastPlan({ data: { setId: set.id, frames } })
      .then(() => setSaving("saved"))
      .catch((e) => setSaving(`⚠ ${e instanceof Error ? e.message : String(e)}`));
  }, [set.id]);
  const commit = useCallback((frames: BlastFrame[]) => {
    setPlan((prev) => ({ frames, updatedAt: new Date().toISOString(), ...(prev?.layout ? { layout: prev.layout } : {}) }));
    dirty.current = true;
    setSaving("saving…");
    pendingFrames.current = frames;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  }, [flush]);
  useEffect(() => () => { if (pendingFrames.current) flush(); }, [flush]);

  // THE TEMPLATE (2026-09-05): pass 1 / pass 2, chosen on the set screen; saved at once.
  const setLayout = useCallback((layout: "pass1" | "pass2") => {
    setPlan((prev) => {
      if (!prev) return prev;
      setSaving("saving…");
      saveBlastPlan({ data: { setId: set.id, frames: prev.frames, layout } })
        .then(() => setSaving("saved"))
        .catch((e) => setSaving(`⚠ ${e instanceof Error ? e.message : String(e)}`));
      return { ...prev, layout };
    });
  }, [set.id]);

  return { plan, commit, saving, setLayout };
}

// ---------------------------------------------------------------- editor

export function BlastOffEditor({ set, topicName, onCapture }: { set: BoothSetInfo; topicName?: string; onCapture: () => void }) {
  const { plan, commit, saving } = usePlan(set);
  const [picker, setPicker] = useState<BlastFrameKind | null>(null);
  const [at, setAt] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const ceqById = useMemo(() => new Map(set.ceqs.map((c) => [c.id, c])), [set.ceqs]);
  const progressById = useMemo(
    () => questionProgress(plan?.frames ?? [], ceqById),
    [plan?.frames, ceqById],
  );

  // SPACE / SHIFT+SPACE walk the frames here too (Lee, 2026-09-03: "if I'm in
  // filming mode / arranging, let me flip through slides quickly"). Never
  // while typing in a field.
  const nFrames = plan?.frames.length ?? 0;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const a = document.activeElement as HTMLElement | null;
      const typing = (el: HTMLElement | null) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key !== " " || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !nFrames || typing(t) || typing(a)) return;
      e.preventDefault();
      setAt((v) => (e.shiftKey ? Math.max(0, v - 1) : Math.min(nFrames - 1, v + 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nFrames]);

  if (!plan) return <div style={{ color: MUTED, fontSize: 13 }}>Loading the running order…</div>;

  const add = (kind: BlastFrameKind, patch: Partial<BlastFrame> = {}) => {
    commit(insertFrame(plan.frames, { id: newFrameId(kind), kind, ...patch }, at));
    setPicker(null);
  };

  return (
    <div className="flex gap-6" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 520px", minWidth: 420, maxWidth: 760 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: MUTED }}>{filmFrames(plan.frames).length} frames{plan.frames.length - filmFrames(plan.frames).length ? ` · ${plan.frames.length - filmFrames(plan.frames).length} skipped in review` : ""}</span>
          {saving && <span style={{ fontSize: 11, color: saving.startsWith("⚠") ? "#F87171" : saving === "saved" ? "#3BF5A0" : MUTED }}>{saving}</span>}
          {syncNote && <span style={{ fontSize: 11, color: syncNote.startsWith("⚠") ? "#F87171" : syncNote.startsWith("✓") ? "#3BF5A0" : MUTED }}>{syncNote}</span>}
          {/* THE HANDOFF. Blast-off plans; the canvas films. This writes the
              running order into the set as real frames, then opens the film
              surface that already has the bolt cursor, yellow highlighting,
              spotlight and identical frame geometry. */}
          <button className="ml-auto flex items-center gap-1.5 rounded-xl px-4 py-2"
            style={{ background: GOLD, color: "#0B1322", fontSize: 13, fontWeight: 800, border: "none", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
            disabled={busy}
            onClick={() => {
              setBusy(true); setSyncNote("Writing frames into the set…");
              // Every frame goes over, skipped ones included: the sync stamps
              // a skipped set card filmSkip so the canvas walk leaves it out.
              syncBlastPlanToSet({ data: { setId: set.id, frames: plan.frames, vertical: true } })
                .then((r) => {
                  setSyncNote(`✓ ${r.reordered + r.wrote} frames ordered${r.staged ? ` · ${r.staged} exhibit${r.staged > 1 ? "s" : ""} staged` : ""}${r.missing ? ` · ${r.missing} missing` : ""} — opening film`);
                  openFilmMode(set.id);
                })
                .catch((e) => setSyncNote(`⚠ ${e instanceof Error ? e.message : String(e)}`))
                .finally(() => setBusy(false));
            }}>
            <Clapperboard className="h-3.5 w-3.5" /> Send to film →
          </button>
        </div>

        {/* INSERT TOOLBAR — a phrase, a cheat code, a tip, an exhibit, a blank.
            Each picker lists what the Talk Through bank already holds. */}
        <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 14 }}>
          {(INSERT_KINDS as BlastFrameKind[]).map((k) => (
            <button key={k} className="flex items-center gap-1 rounded-xl px-3 py-1.5"
              style={{ border: `1.5px solid ${picker === k ? GOLD : EDGE}`, color: picker === k ? GOLD : CREAM, background: "transparent", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              onClick={() => (k === "blank" ? add("blank") : setPicker(picker === k ? null : k))}>
              <Plus className="h-3 w-3" /> {FRAME_LABEL[k]}
            </button>
          ))}
          <span style={{ fontSize: 10.5, color: MUTED, alignSelf: "center", marginLeft: 6 }}>
            inserts land after frame {Math.min(at, plan.frames.length - 1) + 1}
          </span>
        </div>

        {picker && (
          <BankPicker kind={picker} setId={set.id} setName={set.name}
            onPick={(patch) => add(picker, patch)} onClose={() => setPicker(null)} />
        )}

        <div className="flex flex-col gap-1.5">
          {plan.frames.map((f, i) => {
            // Only inserts can be deleted here — a card the set owns stays,
            // because the set still has it and it still has to be filmed.
            const insert = isInsert(f.kind);
            const ceq = f.ceqId ? ceqById.get(f.ceqId) : undefined;
            const note = f.kind === "ceq" && !!ceq?.noteOnly;
            return (
              <div key={f.id} onClick={() => setAt(i)}
                className="flex items-center gap-3 rounded-xl px-3 py-2"
                title={f.skipped ? "Skipped in Review — not filmed, not sent to film. Un-skip it on the Review step." : undefined}
                style={{
                  background: PANEL,
                  border: `1px solid ${at === i ? GOLD : EDGE}`,
                  cursor: "pointer",
                  // SKIPPED IN REVIEW (Lee, 2026-09-03: "CEQ's I skipped in review
                  // still got through") — shown struck through here so the
                  // running order reads honestly; filmFrames() keeps it out of
                  // capture and out of the send-to-film handoff.
                  opacity: f.skipped ? 0.4 : 1,
                  textDecoration: f.skipped ? "line-through" : "none",
                }}>
                <span style={{ color: MUTED, fontSize: 11, fontWeight: 800, minWidth: 24, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                {f.skipped && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "#F87171" }}>SKIPPED</span>}
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: insert ? GOLD : isStandard(f.kind) ? "#7DD3FC" : MUTED, minWidth: 128 }}>
                  {note ? "Note frame" : FRAME_LABEL[f.kind]}
                </span>
                <span style={{ fontSize: 12.5, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {isStandard(f.kind) ? (f.kind === "intro" ? (f.text?.trim() || set.name) : f.kind === "bio" ? "Lee Ingram · BAccy · MAccy — Ole Miss" : (f.text?.trim() || "Cram what's on your exam."))
                    : f.kind === "ceq" ? (ceq ? (note ? ceq.stem : `${ceq.label} · ${ceq.stem}`) : "— card missing from the set —")
                    : f.kind === "cheat" ? `${f.title ?? ""}${f.body ? " — " + f.body : ""}`
                    : f.kind === "exhibit" ? (f.exhibitRef ? `Exhibit: ${f.exhibitRef}` : "Exhibit")
                    : (f.text ?? "")}
                </span>
                {/* Everything reorders — the set's own intro is just a card, and
                    if Lee wants a cheat code to open the rip that is his call. */}
                <button title="Up" style={{ color: MUTED, background: "none", border: "none", cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); commit(moveFrame(plan.frames, i, i - 1)); }}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button title="Down" style={{ color: MUTED, background: "none", border: "none", cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); commit(moveFrame(plan.frames, i, i + 1)); }}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                {insert && (
                  <button title="Remove this insert" style={{ color: MUTED, background: "none", border: "none", cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); commit(removeFrame(plan.frames, f.id)); }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* live preview of the selected frame */}
      <div style={{ flex: "0 0 auto" }}>
        <div style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD, fontWeight: 800, marginBottom: 7 }}>
          Frame {Math.min(at, plan.frames.length - 1) + 1} preview
        </div>
        {/* THE SAME PHONE as Review and /film (2026-09-04: "/arrange should also show the slide"). */}
        <PhoneFrame frame={plan.frames[Math.min(at, plan.frames.length - 1)]} frames={plan.frames} index={Math.min(at, plan.frames.length - 1)} set={set} w={270} layout={layoutOf(plan)}
          topicName={topicName} progress={progressById.get(plan.frames[Math.min(at, plan.frames.length - 1)]?.id)} />
      </div>
    </div>
  );
}

// FrameView, questionProgress and the capture surface moved out (2026-09-04) so
// PhoneFrame can draw the arrange preview here without an import cycle.
export { FrameView, questionProgress } from "./frame-view";
import { questionProgress } from "./frame-view";
