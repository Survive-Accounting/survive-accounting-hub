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
import { syncBlastPlanToSet } from "@/lib/blastoff-sync.functions";
import { openFilmMode } from "@/components/blastoff/FilmHandoff";
import { SetCard } from "@/components/blastoff/SetCard";
import { SurviveBio } from "@/components/blastoff/SurviveBio";
import { SurviveIntro } from "@/components/blastoff/SurviveIntro";
import { SurviveOutro } from "@/components/blastoff/SurviveOutro";
import { NOTE_EYEBROW } from "@/components/canvas/frame-copy";
import { HighlightContext, useTextHighlights } from "@/components/canvas/text-highlights";
import {
  FRAME_LABEL, INSERT_CALLOUT, INSERT_KINDS, insertFrame, isInsert, isStandard, moveFrame, newFrameId, reconcilePlan, removeFrame,
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

  // The set AND the topic it lives under — the topic name is the kicker the
  // canvas prints above a question stem ("EASY POINTS"), so the preview needs it.
  const found = useMemo(() => {
    if (view.mode === "home" || !topics) return null;
    for (const t of topics) for (const s of t.sets) if (s.id === view.setId) return { set: s, topicName: t.name };
    return null;
  }, [topics, view]);
  const set = found?.set ?? null;

  if (view.mode === "capture" && set) {
    return <Capture set={set} topicName={found?.topicName} onExit={() => setView({ mode: "edit", setId: set.id })} />;
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
        <Editor set={set} topicName={found?.topicName} onCapture={() => setView({ mode: "capture", setId: set.id })} />
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

function Editor({ set, topicName, onCapture }: { set: BoothSetInfo; topicName?: string; onCapture: () => void }) {
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

  if (!plan) return <div style={{ color: MUTED, fontSize: 13 }}>Loading the running order…</div>;

  const add = (kind: BlastFrameKind, patch: Partial<BlastFrame> = {}) => {
    commit(insertFrame(plan.frames, { id: newFrameId(kind), kind, ...patch }, at));
    setPicker(null);
  };

  return (
    <div className="flex gap-6" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 520px", minWidth: 420, maxWidth: 760 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: MUTED }}>{plan.frames.length} frames</span>
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
              syncBlastPlanToSet({ data: { setId: set.id, frames: plan.frames } })
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
                style={{
                  background: PANEL,
                  border: `1px solid ${at === i ? GOLD : EDGE}`,
                  cursor: "pointer",
                }}>
                <span style={{ color: MUTED, fontSize: 11, fontWeight: 800, minWidth: 24, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
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
        <div style={{ border: `1px solid ${EDGE}`, borderRadius: 10, overflow: "hidden" }}>
          <FrameView frame={plan.frames[Math.min(at, plan.frames.length - 1)]} set={set} scale={0.62}
            topicName={topicName} progress={progressById.get(plan.frames[Math.min(at, plan.frames.length - 1)]?.id)} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------- one frame, drawn

/** Is this plan frame a QUESTION, as opposed to one of the set's note frames?
 *  The canvas's own rule: a note frame is breath — it neither counts toward the
 *  "Q 3/8" counter nor is counted by it. */
const isQuestion = (f: BlastFrame, byId: Map<string, BoothCeq>): boolean =>
  f.kind === "ceq" && !!f.ceqId && !byId.get(f.ceqId)?.noteOnly;

/** frame id → "Q 3/8", questions only. Built once per plan. */
function questionProgress(frames: readonly BlastFrame[], byId: Map<string, BoothCeq>): Map<string, { x: number; y: number }> {
  const y = frames.filter((f) => isQuestion(f, byId)).length;
  const out = new Map<string, { x: number; y: number }>();
  let x = 0;
  for (const f of frames) if (isQuestion(f, byId)) out.set(f.id, { x: ++x, y });
  return out;
}

/** ONE FRAME, drawn by the canvas's own card. Nothing here re-implements a
 *  card — a set frame renders its stem and choices, an insert renders as the
 *  callout kind it will become when it lands in the set. */
function FrameView({ frame, set, scale, topicName, progress }: {
  frame: BlastFrame; set: BoothSetInfo; scale: number; topicName?: string | null;
  progress?: { x: number; y: number } | null;
}) {
  // THE STANDARD SPINE renders as the vertical 9:16 frame it actually is —
  // these are brand cards, not CEQ cards, and showing them in the silver card
  // shell would be the same mistake the first Blast Off preview made.
  if (isStandard(frame.kind)) {
    const s = scale * 0.34; // a 1080-wide frame, sized to sit beside the list
    if (frame.kind === "intro") return <SurviveIntro topic={frame.text?.trim() || set.name} scale={s} />;
    if (frame.kind === "bio") return <SurviveBio scale={s} />;
    return <SurviveOutro tagline={frame.text?.trim() || undefined} scale={s} />;
  }

  if (frame.kind === "ceq") {
    const ceq: BoothCeq | undefined = frame.ceqId ? set.ceqs.find((c) => c.id === frame.ceqId) : undefined;
    if (!ceq) return <SetCard stem="This card is no longer in the set." scale={scale} />;
    return (
      <SetCard
        id={ceq.id}
        stem={ceq.stem}
        choices={ceq.choices}
        // The set's own note cards ARE the "found on your exam" card — that is
        // what NOTE_EYEBROW says. Questions get the topic name instead.
        topic={ceq.noteOnly ? NOTE_EYEBROW : topicName ?? null}
        progress={progress ?? null}
        scale={scale}
      />
    );
  }

  const kindTag = INSERT_CALLOUT[frame.kind];
  const stem =
    frame.kind === "cheat" ? [frame.title?.trim(), frame.body?.trim()].filter(Boolean).join(" — ")
    : frame.kind === "exhibit" ? (frame.exhibitRef ? `Exhibit: ${frame.exhibitRef}` : "Exhibit")
    : (frame.text ?? "");
  return (
    <SetCard
      id={frame.id}
      stem={stem}
      scale={scale}
      // "blank" is a BARE frame — card hidden, so Lee builds on it from scratch.
      callout={frame.kind === "blank" ? { hidden: true } : kindTag ? { kind: kindTag } : undefined}
    />
  );
}

// --------------------------------------------------------------- capture

/** CAPTURE — one frame, full height, spacebar forward. Nothing else on screen:
 *  OBS captures this window and anything that is not the frame is in the shot. */
function Capture({ set, topicName, onExit }: { set: BoothSetInfo; topicName?: string; onExit: () => void }) {
  const { plan } = usePlan(set);
  const [i, setI] = useState(0);
  const [chrome, setChrome] = useState(true);
  const ceqById = useMemo(() => new Map(set.ceqs.map((c) => [c.id, c])), [set.ceqs]);
  // The SHARED highlight store (canvas/text-highlights) — same gesture, same
  // offsets, same gold as the canvas. Session-scoped, so marks survive walking
  // between frames within a rip and die only on ` or leaving capture.
  const { api: hlApi, clearAll: clearAllTextHls } = useTextHighlights();

  const frames = plan?.frames ?? [];
  const n = frames.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === " ") {
        e.preventDefault();
        if (e.shiftKey) setI((v) => Math.max(0, v - 1));
        else setI((v) => Math.min(n - 1, v + 1));
      }
      // ` = the full wipe, same mental model as every other filming surface:
      // temporary state goes, nothing saved is touched. Lee reaches for this
      // without thinking, so it has to exist the moment highlighting does.
      else if (e.code === "Backquote" || e.key === "`") { e.preventDefault(); clearAllTextHls(); }
      else if (e.key === "Escape") { e.preventDefault(); onExit(); }
      else if (e.key.toLowerCase() === "h") { e.preventDefault(); setChrome((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onExit]);

  // Fit the CARD to the window. The card is the canvas's own 560-wide card, so
  // this scales that box rather than a 1080x1920 vertical frame — Blast Off is
  // an arrangement surface now, and the real takes happen on the canvas.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.max(0.5, Math.min(2.4, Math.min(window.innerHeight / 760, window.innerWidth / 700))));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  if (!plan) return <div style={{ minHeight: "100vh", background: BG, color: MUTED, display: "grid", placeItems: "center" }}>Loading the running order…</div>;

  const frame = frames[Math.min(i, n - 1)];
  return (
    <HighlightContext.Provider value={hlApi}>
    <div style={{ minHeight: "100vh", background: "#000", display: "grid", placeItems: "center", position: "relative" }}>
      <FrameView frame={frame} set={set} scale={scale} topicName={topicName}
        progress={questionProgress(frames, ceqById).get(frame.id)} />
      {chrome && (
        <div style={{
          position: "fixed", left: 12, bottom: 12, display: "flex", gap: 12, alignItems: "center",
          background: "rgba(7,11,20,0.86)", border: `1px solid ${EDGE}`, borderRadius: 10,
          padding: "7px 12px", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 11.5, color: MUTED,
        }}>
          <span style={{ color: GOLD, fontWeight: 800 }}>{i + 1} / {n}</span>
          <span>{FRAME_LABEL[frame.kind]}</span>
          <span>space next · shift+space back · ` resets · H hide this · esc exit</span>
        </div>
      )}
    </div>
    </HighlightContext.Provider>
  );
}
