// REHEARSAL — Lee, 2026-09-06: "give me a rehearsal option. I can run through it and just talk
// out what I plan to say... generate a suggested line for each slide... it knows which slide
// I'm talking about, and I can then just go through each slide and approve or revise or edit...
// let it have an optional leave comment. I think even a 1-5 rating?" The quick way to fill the
// teleprompter (prompter.ts's own column) from a mock run-through instead of typing it by hand.
//
// TWO STAGES: WALK (live dictation, spacebar through the deck, exactly like Capture but nothing
// is recorded and there's a visible status line, since no take is at stake) accumulates one raw
// transcript per slide; REVIEW turns each into a suggested line (rehearsal-brief.ts, with the
// best-rated past decisions riding along as real style examples) that Lee approves, revises, or
// edits — every decision optionally rated and commented, which is what actually teaches the
// suggester Lee's own voice over time.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { runMicro } from "@/lib/talkthrough.functions";
import { logTeleprompterFeedback, topRehearsalExamples, type RehearsalAction } from "@/lib/rehearsal.functions";
import { useDictation } from "@/lib/use-dictation";

import { usePlan } from "./BlastOffEditor";
import { PhoneFrame } from "./PhoneFrame";
import { FRAME_LABEL, filmFrames, insertStem, patchFrame, type BlastFrame } from "./plan";
import { buildRehearsalMessages, parseRehearsalSuggestion, type StyleExample } from "./rehearsal-brief";

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)", INK = "#05070D", MINT = "#3BF5A0", ORANGE = "#FF9F43";

function slideContextFor(f: BlastFrame, ceqById: Map<string, { stem: string }>): string {
  if (f.kind === "ceq" && f.ceqId) return ceqById.get(f.ceqId)?.stem ?? "";
  return insertStem(f) || (f.bullets ?? []).join("; ") || "";
}

export function Rehearsal({ set, topicName, onExit }: { set: BoothSetInfo; topicName?: string; onExit: () => void }) {
  const { plan, commit } = usePlan(set);
  const ceqById = useMemo(() => new Map(set.ceqs.map((c) => [c.id, c])), [set.ceqs]);
  const frames = useMemo(() => filmFrames(plan?.frames ?? []), [plan]);
  const [stage, setStage] = useState<"walk" | "review">("walk");
  const [idx, setIdx] = useState(0);
  const [segments, setSegments] = useState<Record<string, string>>({});
  const idxRef = useRef(0);
  const framesRef = useRef(frames);
  idxRef.current = idx; framesRef.current = frames;
  const frame = frames[idx] as BlastFrame | undefined;

  const dictation = useDictation((final) => {
    const f = framesRef.current[idxRef.current];
    if (!final.trim() || !f) return;
    setSegments((s) => ({ ...s, [f.id]: (s[f.id] ? s[f.id] + " " : "") + final.trim() }));
  });
  useEffect(() => {
    if (stage !== "walk" || !dictation.supported) return;
    dictation.start();
    return () => dictation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);
  useEffect(() => {
    if (stage !== "walk") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setStage("review"); return; }
      if (e.code === "Space") { e.preventDefault(); setIdx((i) => Math.max(0, Math.min(framesRef.current.length - 1, i + (e.shiftKey ? -1 : 1)))); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [stage]);

  if (!plan) return <div style={{ minHeight: "100vh", background: INK, color: MUTED, display: "grid", placeItems: "center" }}>Loading…</div>;
  if (frames.length === 0) return <div style={{ minHeight: "100vh", background: INK, color: MUTED, display: "grid", placeItems: "center" }}>Every slide is skipped — nothing to rehearse.</div>;

  if (stage === "walk") {
    const said = (segments[frame?.id ?? ""] ?? "").trim();
    return (
      <div className="film-mode" style={{ minHeight: "100vh", background: "#000", display: "grid", placeItems: "center", position: "relative" }}>
        <PhoneFrame frame={frame!} frames={frames} index={idx} set={set} topicName={topicName} rounded={false} />
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "14px 20px", background: "rgba(5,7,13,0.92)", borderTop: `1px solid ${EDGE}`, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: dictation.on ? MINT : ORANGE, fontWeight: 800 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: dictation.on ? MINT : ORANGE }} />
              {dictation.supported ? (dictation.on ? "listening — talk it out" : "not listening") : "dictation unsupported in this browser — try Chrome"}
            </span>
            <span style={{ color: MUTED }}>Rehearsal — nothing is being recorded</span>
            <span style={{ marginLeft: "auto", color: MUTED }}>Slide {idx + 1} of {frames.length} · {FRAME_LABEL[frame!.kind]}</span>
            <span style={{ color: MUTED }}>space next · shift+space back · esc review</span>
          </div>
          {said && <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.4, opacity: 0.85, maxHeight: 60, overflowY: "auto" }}>{said}</div>}
        </div>
      </div>
    );
  }

  return (
    <RehearsalReview set={set} frames={frames} ceqById={ceqById} segments={segments}
      onResume={() => setStage("walk")}
      onCommitLine={(frameId, line) => commit(patchFrame(plan.frames, frameId, { prompter: [line] }))}
      onExit={onExit} />
  );
}

interface SlideSuggestion { status: "loading" | "ready" | "error"; suggestion: string; error?: string }

function RehearsalReview({ set, frames, ceqById, segments, onResume, onCommitLine, onExit }: {
  set: BoothSetInfo; frames: readonly BlastFrame[]; ceqById: Map<string, { stem: string }>; segments: Record<string, string>;
  onResume: () => void; onCommitLine: (frameId: string, line: string) => void; onExit: () => void;
}) {
  const candidates = useMemo(() => frames.filter((f) => (segments[f.id] ?? "").trim()), [frames, segments]);
  const [examples, setExamples] = useState<StyleExample[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, SlideSuggestion>>({});
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => { topRehearsalExamples().then(setExamples).catch(() => setExamples([])); }, []);

  const suggest = useCallback(async (f: BlastFrame, revision?: string, previous?: string) => {
    setSuggestions((s) => ({ ...s, [f.id]: { status: "loading", suggestion: s[f.id]?.suggestion ?? "" } }));
    try {
      const m = buildRehearsalMessages({
        slideLabel: FRAME_LABEL[f.kind], slideContext: slideContextFor(f, ceqById),
        rawTranscript: segments[f.id] ?? "", styleExamples: examples, previous: previous ?? null, revision: revision ?? null,
      });
      const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput: 300 } });
      const line = parseRehearsalSuggestion(r.text);
      if (!line) throw new Error("The suggestion didn't come back clean — try again.");
      setSuggestions((s) => ({ ...s, [f.id]: { status: "ready", suggestion: line } }));
    } catch (e) {
      setSuggestions((s) => ({ ...s, [f.id]: { status: "error", suggestion: s[f.id]?.suggestion ?? "", error: e instanceof Error ? e.message : String(e) } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceqById, segments, examples]);

  // Suggest every slide at once, the moment the style examples are in — this is meant to be
  // fast: Lee shouldn't wait on one slide before seeing the next.
  useEffect(() => {
    if (!candidates.length) return;
    for (const f of candidates) if (!suggestions[f.id]) void suggest(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, examples]);

  return (
    <div style={{ minHeight: "100vh", background: INK, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Rehearsal review</h1>
          <span style={{ fontSize: 12.5, color: MUTED }}>{done.size} of {candidates.length} slides done</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onResume} style={btn()}>← back to rehearsing</button>
          <button type="button" onClick={onExit} style={btn(GOLD)}>Done — exit</button>
        </div>
        {candidates.length === 0 && <p style={{ color: MUTED, fontSize: 13.5, marginTop: 20 }}>Nothing was said yet — go back and talk through a few slides first.</p>}
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {candidates.map((f) => (
            <SlideCard key={f.id} frame={f} raw={segments[f.id] ?? ""} suggestion={suggestions[f.id]}
              isDone={done.has(f.id)}
              onRevise={(note) => void suggest(f, note, suggestions[f.id]?.suggestion)}
              onConfirm={(finalLine, action, rating, comment) => {
                onCommitLine(f.id, finalLine);
                setDone((d) => new Set(d).add(f.id));
                void logTeleprompterFeedback({ data: {
                  setId: set.id, frameId: f.id, rawTranscript: segments[f.id] ?? "", suggestedLine: suggestions[f.id]?.suggestion ?? "",
                  finalLine, action, rating: rating ?? null, comment: comment?.trim() || null, who: getAdminWho(),
                } });
              }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideCard({ frame, raw, suggestion, isDone, onRevise, onConfirm }: {
  frame: BlastFrame; raw: string; suggestion: SlideSuggestion | undefined; isDone: boolean;
  onRevise: (note: string) => void;
  onConfirm: (finalLine: string, action: RehearsalAction, rating: number | null, comment: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [revision, setRevision] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [pendingAction, setPendingAction] = useState<RehearsalAction | null>(null);

  const line = suggestion?.suggestion ?? "";
  const confirm = (finalLine: string, action: RehearsalAction) => {
    if (!finalLine.trim()) return;
    onConfirm(finalLine.trim(), action, rating, comment);
  };

  return (
    <div style={{ border: `1px solid ${isDone ? MINT + "55" : EDGE}`, borderRadius: 12, padding: "12px 14px", opacity: isDone ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD }}>{FRAME_LABEL[frame.kind]}</span>
        {isDone && <span style={{ fontSize: 11, color: MINT }}>✓ kept</span>}
      </div>
      <details style={{ marginTop: 4 }}>
        <summary style={{ fontSize: 10.5, color: MUTED, cursor: "pointer" }}>what you actually said</summary>
        <div style={{ marginTop: 4, fontSize: 12, color: MUTED, lineHeight: 1.4 }}>{raw}</div>
      </details>

      {suggestion?.status === "loading" && <div style={{ marginTop: 8, fontSize: 13, color: MUTED }}>Prepping a line…</div>}
      {suggestion?.status === "error" && <div style={{ marginTop: 8, fontSize: 12.5, color: ORANGE }}>{suggestion.error}</div>}
      {suggestion?.status === "ready" && !editing && (
        <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.4 }}>{line}</div>
      )}
      {editing && (
        <textarea autoFocus rows={2} value={draft} onChange={(e) => setDraft(e.target.value)}
          style={{ marginTop: 8, width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: `1px solid ${EDGE}`, borderRadius: 8, padding: "6px 8px", color: CREAM, font: "inherit", fontSize: 13.5, resize: "vertical" }} />
      )}

      {!isDone && suggestion?.status === "ready" && (
        <>
          <div className="flex" style={{ gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            {!editing ? (
              <>
                <button type="button" onClick={() => { setPendingAction("approved"); setShowFeedback(true); }} style={btn(MINT)}>✓ Approve</button>
                <input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="or: what to change…"
                  onKeyDown={(e) => { if (e.key === "Enter" && revision.trim()) { onRevise(revision.trim()); setRevision(""); } }}
                  style={{ flex: 1, minWidth: 140, background: "rgba(255,255,255,0.04)", border: `1px solid ${EDGE}`, borderRadius: 8, padding: "5px 8px", fontSize: 12.5, color: CREAM, font: "inherit" }} />
                <button type="button" disabled={!revision.trim()} onClick={() => { onRevise(revision.trim()); setRevision(""); }} style={{ ...btn(), opacity: revision.trim() ? 1 : 0.5 }}>Revise</button>
                <button type="button" onClick={() => { setDraft(line); setEditing(true); }} style={btn()}>Edit</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => { setPendingAction("edited"); setShowFeedback(true); }} style={btn(MINT)}>✓ Keep this</button>
                <button type="button" onClick={() => setEditing(false)} style={btn()}>Cancel</button>
              </>
            )}
          </div>
          {showFeedback && pendingAction && (
            <div style={{ marginTop: 10, padding: "8px 10px", border: `1px solid ${EDGE}`, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Optional — how was this one, and anything worth telling the suggester?</div>
              <div className="flex" style={{ gap: 4, marginBottom: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(rating === n ? null : n)}
                    style={{ ...btn(rating === n ? GOLD : undefined), padding: "4px 10px" }}>{n}</button>
                ))}
              </div>
              <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="a line on what worked or didn't (optional)"
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: `1px solid ${EDGE}`, borderRadius: 8, padding: "5px 8px", fontSize: 12.5, color: CREAM, font: "inherit", marginBottom: 6 }} />
              <button type="button" onClick={() => confirm(editing ? draft : line, pendingAction)} style={btn(MINT)}>Save and next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function btn(color = CREAM): React.CSSProperties {
  return { font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: `1px solid ${EDGE}`, background: "transparent", color, cursor: "pointer" };
}
