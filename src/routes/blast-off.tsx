// /blast-off — the filming room. Pick a set, EDIT the running order, then
// CAPTURE it: one vertical frame at a time, spacebar forward, and talk.
//
// Deliberately NOT the study canvas. The canvas is an authoring surface with
// 41 node types and a whole stage; a Blast Off is a list of nine-by-sixteen
// cards Lee talks over. Putting the frames on the canvas made them elements
// floating inside a CEQ frame, which is not what they are.
//
// The plan lives ON THE SET (deck.blastOff in scene JSON), so it travels with
// the questions it films and reconciles against them every time it loads: add
// a question to the bank and it shows up here rather than going unfilmed.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Clapperboard, Pencil, Plus, X } from "lucide-react";

import { AdminGate } from "@/components/AdminGate";
import { loadBoothBank, type BoothCeq, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";
import { loadBlastPlan, saveBlastPlan } from "@/lib/blastoff.functions";
import { CheatCodeFrame, PhraseFrame, TipFrame } from "@/components/blastoff/ContentFrames";
import { CeqFrame } from "@/components/blastoff/CeqFrame";
import { FoundOnYourExam } from "@/components/blastoff/FoundOnYourExam";
import { SurviveIntro } from "@/components/blastoff/SurviveIntro";
import { SurviveOutro } from "@/components/blastoff/SurviveOutro";
import { V } from "@/components/blastoff/stage";
import {
  FRAME_LABEL, INSERT_KINDS, insertFrame, moveFrame, newFrameId, reconcilePlan, removeFrame,
  type BlastFrame, type BlastFrameKind, type BlastPlan,
} from "@/components/blastoff/plan";
import { BankPicker } from "@/components/blastoff/BankPicker";

export const Route = createFileRoute("/blast-off")({
  component: BlastOffRoute,
  head: () => ({ meta: [{ title: "Blast Off — Survive" }, { name: "robots", content: "noindex" }] }),
});

const GOLD = "#FCA311";
const CREAM = "#F4EFE6";
const MUTED = "#9AA3B8";
const PANEL = "rgba(16,24,44,0.92)";
const EDGE = "rgba(244,239,230,0.16)";
const BG = "#070B14";

type View = { mode: "home" } | { mode: "edit" | "capture"; setId: string };

function BlastOffRoute() {
  return <AdminGate><BlastOff /></AdminGate>;
}

function BlastOff() {
  const [topics, setTopics] = useState<BoothTopic[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>({ mode: "home" });

  useEffect(() => {
    loadBoothBank().then((r) => setTopics(r.topics)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const set = useMemo(() => {
    if (view.mode === "home" || !topics) return null;
    for (const t of topics) for (const s of t.sets) if (s.id === view.setId) return s;
    return null;
  }, [topics, view]);

  if (view.mode === "capture" && set) {
    return <Capture set={set} onExit={() => setView({ mode: "edit", setId: set.id })} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "20px 26px 70px" }}>
      <header className="flex items-center gap-3" style={{ marginBottom: 20, flexWrap: "wrap" }}>
        {view.mode !== "home" && (
          <button onClick={() => setView({ mode: "home" })}
            style={{ border: `1px solid ${EDGE}`, color: CREAM, background: "transparent", borderRadius: 10, padding: "5px 11px", fontSize: 12, cursor: "pointer" }}>
            ← All sets
          </button>
        )}
        <h1 style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 21, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>
          ⚡ Blast Off
        </h1>
        <span style={{ fontSize: 12, color: MUTED }}>
          {view.mode === "home" ? "pick a set — edit the running order, then capture it" : set?.name}
        </span>
      </header>

      {err && <div style={{ color: "#F87171", fontSize: 13, marginBottom: 12 }}>Could not load the bank: {err}</div>}
      {!topics && !err && <div style={{ color: MUTED, fontSize: 13 }}>Loading the Exam 1 path…</div>}

      {view.mode === "home" && topics && (
        <SetList topics={topics}
          onEdit={(s) => setView({ mode: "edit", setId: s.id })}
          onCapture={(s) => setView({ mode: "capture", setId: s.id })} />
      )}
      {view.mode === "edit" && set && (
        <Editor set={set} onCapture={() => setView({ mode: "capture", setId: set.id })} />
      )}
      {view.mode === "edit" && !set && topics && <div style={{ color: MUTED }}>Set not found.</div>}
    </div>
  );
}

// ------------------------------------------------------------------ home

function SetList({ topics, onEdit, onCapture }: {
  topics: BoothTopic[]; onEdit: (s: BoothSetInfo) => void; onCapture: (s: BoothSetInfo) => void;
}) {
  return (
    <div style={{ maxWidth: 900 }}>
      {topics.map((t) => (
        <section key={t.id} style={{ marginBottom: 26 }}>
          <h2 style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 12.5, letterSpacing: "0.2em", color: MUTED, textTransform: "uppercase", marginBottom: 9 }}>
            {t.name}
          </h2>
          <div className="flex flex-col gap-1.5">
            {t.sets.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                style={{ background: PANEL, border: `1px solid ${EDGE}` }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, minWidth: 260 }}>{s.name}</div>
                <div style={{ color: MUTED, fontSize: 12 }}>{s.liveCount} q</div>
                <button className="ml-auto flex items-center gap-1.5 rounded-xl px-3 py-1.5"
                  style={{ border: `1px solid ${EDGE}`, color: CREAM, background: "transparent", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  onClick={() => onEdit(s)}>
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
                  style={{ background: GOLD, color: "#0B1322", fontSize: 12, fontWeight: 800, border: "none", cursor: "pointer" }}
                  onClick={() => onCapture(s)}>
                  <Clapperboard className="h-3 w-3" /> Capture
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ plan

/** Load + reconcile the stored plan for a set. */
function usePlan(set: BoothSetInfo) {
  const [plan, setPlan] = useState<BlastPlan | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    let live = true;
    loadBlastPlan({ data: { setId: set.id } })
      .then((stored) => { if (live) setPlan(reconcilePlan(stored as BlastPlan | null, set.ceqs)); })
      .catch(() => { if (live) setPlan(reconcilePlan(null, set.ceqs)); });
    return () => { live = false; };
  }, [set.id, set.ceqs]);

  const commit = useCallback((frames: BlastFrame[]) => {
    setPlan({ frames, updatedAt: new Date().toISOString() });
    dirty.current = true;
    setSaving("saving…");
    saveBlastPlan({ data: { setId: set.id, frames } })
      .then(() => setSaving("saved"))
      .catch((e) => setSaving(`⚠ ${e instanceof Error ? e.message : String(e)}`));
  }, [set.id]);

  return { plan, commit, saving };
}

// ---------------------------------------------------------------- editor

function Editor({ set, onCapture }: { set: BoothSetInfo; onCapture: () => void }) {
  const { plan, commit, saving } = usePlan(set);
  const [picker, setPicker] = useState<BlastFrameKind | null>(null);
  const [at, setAt] = useState<number>(0);
  const ceqById = useMemo(() => new Map(set.ceqs.map((c) => [c.id, c])), [set.ceqs]);

  if (!plan) return <div style={{ color: MUTED, fontSize: 13 }}>Loading the running order…</div>;

  const add = (kind: BlastFrameKind, patch: Partial<BlastFrame> = {}) => {
    commit(insertFrame(plan.frames, { id: newFrameId(kind), kind, ...patch }, at || plan.frames.length - 2));
    setPicker(null);
  };

  return (
    <div className="flex gap-6" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 520px", minWidth: 420, maxWidth: 760 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: MUTED }}>{plan.frames.length} frames</span>
          {saving && <span style={{ fontSize: 11, color: saving.startsWith("⚠") ? "#F87171" : saving === "saved" ? "#3BF5A0" : MUTED }}>{saving}</span>}
          <button className="ml-auto flex items-center gap-1.5 rounded-xl px-4 py-2"
            style={{ background: GOLD, color: "#0B1322", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer" }}
            onClick={onCapture}>
            <Clapperboard className="h-3.5 w-3.5" /> Capture →
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
            inserts land after frame {(at || plan.frames.length - 2) + 1}
          </span>
        </div>

        {picker && (
          <BankPicker kind={picker} setId={set.id} setName={set.name}
            onPick={(patch) => add(picker, patch)} onClose={() => setPicker(null)} />
        )}

        <div className="flex flex-col gap-1.5">
          {plan.frames.map((f, i) => {
            const fixed = f.kind === "intro" || f.kind === "outro";
            const ceq = f.ceqId ? ceqById.get(f.ceqId) : undefined;
            return (
              <div key={f.id} onClick={() => setAt(i)}
                className="flex items-center gap-3 rounded-xl px-3 py-2"
                style={{
                  background: PANEL,
                  border: `1px solid ${at === i ? GOLD : EDGE}`,
                  cursor: "pointer",
                }}>
                <span style={{ color: MUTED, fontSize: 11, fontWeight: 800, minWidth: 24, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: fixed ? MUTED : GOLD, minWidth: 128 }}>
                  {FRAME_LABEL[f.kind]}
                </span>
                <span style={{ fontSize: 12.5, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {f.kind === "ceq" ? (ceq ? `${ceq.label} · ${ceq.stem}` : "— question missing from the bank —")
                    : f.kind === "intro" ? (f.topic || set.name)
                    : f.kind === "outro" ? (f.tagline || "Cram what's on your exam.")
                    : f.kind === "foye" ? (f.canonical || "generated from this set")
                    : f.kind === "cheat" ? `${f.title ?? ""}${f.body ? " — " + f.body : ""}`
                    : (f.text ?? "")}
                </span>
                {!fixed && (
                  <>
                    <button title="Up" style={{ color: MUTED, background: "none", border: "none", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); commit(moveFrame(plan.frames, i, i - 1)); }}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button title="Down" style={{ color: MUTED, background: "none", border: "none", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); commit(moveFrame(plan.frames, i, i + 1)); }}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button title="Remove" style={{ color: MUTED, background: "none", border: "none", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); commit(removeFrame(plan.frames, f.id)); }}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
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
        <div style={{ border: `1px solid ${EDGE}`, borderRadius: 10, overflow: "hidden", lineHeight: 0 }}>
          <FrameView frame={plan.frames[Math.min(at, plan.frames.length - 1)]} set={set} scale={0.26} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------- one frame, drawn

function FrameView({ frame, set, scale, progress, showAnswer }: {
  frame: BlastFrame; set: BoothSetInfo; scale: number; progress?: number; showAnswer?: boolean;
}) {
  const stems = useMemo(() => set.ceqs.filter((c) => !c.noteOnly && !c.draft).map((c) => c.stem), [set.ceqs]);
  const ceq: BoothCeq | undefined = frame.ceqId ? set.ceqs.find((c) => c.id === frame.ceqId) : undefined;

  switch (frame.kind) {
    case "intro":
      return <SurviveIntro topic={frame.topic || set.name} scale={scale} progress={progress} />;
    case "foye":
      return <FoundOnYourExam stems={stems} canonical={frame.canonical} variations={frame.variations} scale={scale} progress={progress} />;
    case "outro":
      return <SurviveOutro tagline={frame.tagline} scale={scale} progress={progress} />;
    case "phrase":
      return <PhraseFrame text={frame.text ?? ""} scale={scale} progress={progress} />;
    case "cheat":
      return <CheatCodeFrame title={frame.title ?? ""} body={frame.body} scale={scale} progress={progress} />;
    case "tip":
      return <TipFrame text={frame.text ?? ""} scale={scale} progress={progress} />;
    case "ceq":
      return ceq
        ? <CeqFrame label={ceq.label} stem={ceq.stem} choices={ceq.choices} showAnswer={showAnswer} scale={scale} progress={progress} />
        : <CeqFrame stem="This question is no longer in the bank." scale={scale} progress={progress} />;
    case "exhibit":
      return <CeqFrame label="Exhibit" stem={frame.exhibitRef ? `Exhibit: ${frame.exhibitRef}` : "Exhibit — film it from Exhibit Lab"} scale={scale} progress={progress} />;
    default:
      return <CeqFrame stem={frame.text ?? ""} scale={scale} progress={progress} />;
  }
}

// --------------------------------------------------------------- capture

/** CAPTURE — one frame, full height, spacebar forward. Nothing else on screen:
 *  OBS captures this window and anything that is not the frame is in the shot. */
function Capture({ set, onExit }: { set: BoothSetInfo; onExit: () => void }) {
  const { plan } = usePlan(set);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState(false);
  const [chrome, setChrome] = useState(true);

  const frames = plan?.frames ?? [];
  const n = frames.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === " ") {
        e.preventDefault();
        if (e.shiftKey) { setI((v) => Math.max(0, v - 1)); setAnswer(false); }
        else { setI((v) => Math.min(n - 1, v + 1)); setAnswer(false); }
      } else if (e.key === "Enter") { e.preventDefault(); setAnswer((v) => !v); }
      else if (e.key === "Escape") { e.preventDefault(); onExit(); }
      else if (e.key.toLowerCase() === "h") { e.preventDefault(); setChrome((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onExit]);

  // Fit a 1080x1920 frame to the window height — OBS crops to the frame itself.
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerHeight / V.h, window.innerWidth / V.w));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  if (!plan) return <div style={{ minHeight: "100vh", background: BG, color: MUTED, display: "grid", placeItems: "center" }}>Loading the running order…</div>;

  const frame = frames[Math.min(i, n - 1)];
  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "grid", placeItems: "center", position: "relative" }}>
      <FrameView frame={frame} set={set} scale={scale} showAnswer={answer} />
      {chrome && (
        <div style={{
          position: "fixed", left: 12, bottom: 12, display: "flex", gap: 12, alignItems: "center",
          background: "rgba(7,11,20,0.86)", border: `1px solid ${EDGE}`, borderRadius: 10,
          padding: "7px 12px", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 11.5, color: MUTED,
        }}>
          <span style={{ color: GOLD, fontWeight: 800 }}>{i + 1} / {n}</span>
          <span>{FRAME_LABEL[frame.kind]}</span>
          <span>space next · shift+space back · enter answer · H hide this · esc exit</span>
        </div>
      )}
    </div>
  );
}
