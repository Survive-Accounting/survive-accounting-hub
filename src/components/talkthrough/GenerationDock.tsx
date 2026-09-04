// THE GENERATION DOCK — bottom right, always there on V3 (Lee, 2026-09-03):
// "put a queue of this in a modal at bottom right. Use logo animated bolt for
// this. I want to track once it's done generating … a link to go review the
// result in a new tab … a constant queue in the bottom right that lets me
// know what all is being built right now."
//
// What it lists: every talkthrough session whose review is queued or
// generating, plus the ones that finished in the last day (with Review ↗).
// The review runs in the browser tab that queued it (talkthrough-review.ts),
// so this reads that store live — no polling, no server. A session generated
// in ANOTHER tab shows here once it is ready (the board syncs through the
// talkthrough store); its in-progress state does not, and the dock says so.
//
// Click the bolt to collapse to just the bolt and a count.
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { isGenerating, listSessions, progressLine, sessionBoard, type TalkSession } from "@/components/canvas/talkthrough";
import { generationProgressOf, resumeReview, reviewStateOf, subscribeReview } from "@/components/canvas/talkthrough-review";
import { startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { blastOffPath, topicOfSet, useBank } from "@/components/v3/use-bank";

// Own tokens and label helper: the Shell mounts this dock, so importing the
// Shell (or the Booth's import graph) from here would be a runtime cycle —
// the import-cycles test caught exactly that.
const V3_CREAM = "#F5EFE6";
const V3_GOLD = "#FCA311";
const V3_MUTED = "rgba(245,239,230,0.62)";
const V3_EDGE = "rgba(245,239,230,0.16)";
const setLabel = (name: string): string => name.replace(/^"|"$/g, "").replace(/\[\s*\]/g, "___");

const OPEN_KEY = "sa-gen-dock-open";
/** The sessions the dock was told to hide. It comes back the moment a set it
 *  has not seen turns up, so dismissing never loses the next pass. */
const HIDE_KEY = "sa-gen-dock-hidden";

/** "48s" · "2m 04s" — the pass's own clock, which is the number Lee is after:
 *  how long a set takes to design. */
export function elapsedLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** The window a pass ran for: from the pre-flight record (requestedAt) to
 *  completedAt, or to now while it is still going. Null when the session
 *  predates the record — an old pass simply shows no time. */
export function passMs(gen: { requestedAt?: string; completedAt?: string | null } | null | undefined, now: number): number | null {
  const started = gen?.requestedAt ? Date.parse(gen.requestedAt) : NaN;
  if (!Number.isFinite(started)) return null;
  const ended = gen?.completedAt ? Date.parse(gen.completedAt) : NaN;
  return (Number.isFinite(ended) ? ended : now) - started;
}
const DAY = 86_400_000;

/** The Booth's boothToPassCeq, inlined — importing it would pull the Booth's
 *  whole graph into the dock and reintroduce the runtime cycle the header
 *  warns about (the import-cycles test caught exactly that once). */
type DockCeq = { id: string; label: string; stem: string; draft?: boolean; noteOnly?: boolean; choices: { text: string; correct: boolean; feedback?: string }[] };
const toPassCeq = (c: DockCeq) => ({
  id: c.id, label: c.draft ? `${c.label} (draft)` : c.label, stem: c.stem,
  choices: c.choices, ...(c.noteOnly ? { noteOnly: true } : {}),
});

export function GenerationDock() {
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [, tick] = useState(0);
  const [open, setOpen] = useState(true);
  const [frame, setFrame] = useState(0);
  const [resumeNote, setResumeNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState<string[]>([]);
  const { topics } = useBank();

  useEffect(() => {
    try { setOpen(localStorage.getItem(OPEN_KEY) !== "0"); } catch { /* fine */ }
    try { setHidden(JSON.parse(localStorage.getItem(HIDE_KEY) ?? "[]") as string[]); } catch { /* fine */ }
    startTT();
    const unTT = subscribeTT(setTT);
    const unReview = subscribeReview(() => tick((n) => n + 1));
    return () => { unTT(); unReview(); };
  }, []);

  const rows = useMemo(() => {
    const now = Date.now();
    return listSessions(tt.doc)
      .map((s) => ({ s, rs: reviewStateOf(tt.doc, s), board: sessionBoard(tt.doc, s.id).filter((b) => !b.archivedAt).length }))
      .filter(({ s, rs }) => rs.state === "queued" || rs.state === "generating" || rs.state === "error"
        || (rs.state === "ready" && s.endedAt && now - new Date(s.endedAt).getTime() < DAY))
      .slice(0, 12);
  }, [tt.doc]);
  // B8: the incremental queue writes the script FIRST, so a run mid-flight
  // already reads "ready" off the board. The progress entry is the truth about
  // whether anything is still being generated.
  const busy = rows.filter((r) => r.rs.state === "queued" || r.rs.state === "generating" || isGenerating(generationProgressOf(r.s.id))).length;
  // THE SPEED OF THE TOOL (Lee, 2026-09-04): "I want to see how quickly they get
  // built … how long it actually takes to design the slides for a set." Only
  // finished passes count, and only the ones with a pre-flight record to
  // measure from — an older session simply does not vote.
  const finishedMs = rows
    .filter((r) => r.rs.state === "ready" && r.s.generation?.completedAt)
    .map((r) => passMs(r.s.generation, now))
    .filter((m): m is number => m !== null);
  const doneCount = finishedMs.length;
  const avg = doneCount ? Math.round(finishedMs.reduce((a, b) => a + b, 0) / doneCount) : null;

  // The bolt boils while something is generating; still when idle.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % 4), 140);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);

  /** Dismiss: remember exactly what is on the board now. Anything new brings
   *  the dock straight back. */
  const dismiss = () => {
    const ids = rows.map((r) => r.s.id);
    setHidden(ids);
    try { localStorage.setItem(HIDE_KEY, JSON.stringify(ids)); } catch { /* fine */ }
  };

  const toggle = () => { setOpen((v) => { try { localStorage.setItem(OPEN_KEY, v ? "0" : "1"); } catch { /* fine */ } return !v; }); };
  const resultsHref = (s: TalkSession): string | null => {
    if (!topics) return null;
    const topic = topicOfSet(topics, s.setId);
    const set = topic?.sets.find((x) => x.id === s.setId);
    return topic && set ? blastOffPath(topic, set, "results") : null;
  };

  /** RESUME an interrupted synthesis. The pre-flight choices Lee made are on
   *  the session (TalkSession.generation), so this replays that exact request
   *  — no guessing, and queueReview no-ops if the board already landed. Works
   *  for any set: the CEQs come from the bank by the session's own setId. */
  const canResume = (s: TalkSession): boolean => !!s.generation?.requestedAt && !!topics;
  const doResume = (s: TalkSession) => {
    const set = topics ? topicOfSet(topics, s.setId)?.sets.find((x) => x.id === s.setId) : null;
    if (!set) { setResumeNote(`${setLabel(s.setName)}: that set is not in the live bank — cannot resume`); return; }
    const r = resumeReview(s, set.ceqs.map(toPassCeq));
    setResumeNote(`${setLabel(s.setName)}: ${r.why}`);
  };

  if (!rows.length) return null;
  if (rows.every((r) => hidden.includes(r.s.id))) return null;

  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 60, fontFamily: "'Rubik', system-ui, sans-serif" }}>
      {open ? (
        <div style={{ width: 300, background: "rgba(16,24,44,0.97)", border: `1px solid ${busy ? V3_GOLD : V3_EDGE}`, borderRadius: 14, boxShadow: "0 18px 50px -14px rgba(0,0,0,0.9)", overflow: "hidden" }}>
          <button onClick={toggle} className="flex items-center gap-2" style={{ width: "100%", padding: "8px 12px", background: "transparent", border: "none", borderBottom: `1px solid ${V3_EDGE}`, color: V3_CREAM, cursor: "pointer", textAlign: "left" }} title="Collapse">
            <BoltBoil height={22} boilFrame={busy ? frame : 0} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>Generating</span>
            <span style={{ fontSize: 11, color: V3_MUTED }}>{busy ? `${busy} in progress` : "all done"}</span>
            <span style={{ marginLeft: "auto", color: V3_MUTED, fontSize: 12 }}>▾</span>
            <span role="button" tabIndex={0} title="Put the dock away — it comes back when a new set is queued"
              onClick={(e) => { e.stopPropagation(); dismiss(); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); dismiss(); } }}
              style={{ color: V3_MUTED, fontSize: 13, lineHeight: 1, padding: "0 2px", cursor: "pointer" }}>×</span>
          </button>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {rows.map(({ s, rs, board }) => {
              const href = resultsHref(s);
              const prog = generationProgressOf(s.id);
              const state = rs.state === "ready" ? "ready" : rs.state === "error" ? "failed" : rs.state === "queued" ? "queued" : "generating…";
              const color = rs.state === "ready" ? "#3BF5A0" : rs.state === "error" ? "#FF8B7E" : V3_GOLD;
              return (
                <div key={s.id} className="flex items-center gap-2" style={{ padding: "8px 12px", borderBottom: `1px solid ${V3_EDGE}` }}>
                  <div className="min-w-0" style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: V3_CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{setLabel(s.setName)}</div>
                    <div style={{ fontSize: 10.5, color, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {(() => {
                        const ms = passMs(s.generation, now);
                        if (ms === null) return null;
                        const done = rs.state === "ready" || rs.state === "error";
                        return <span style={{ color: V3_MUTED, marginRight: 6 }}>{done ? "took " : ""}{elapsedLabel(ms)} ·</span>;
                      })()}
                      {state}{rs.state === "ready" && board ? ` · ${board} suggestions` : ""}{rs.error ? ` · ${rs.error.slice(0, 40)}` : ""}
                    </div>
                    {/* B8 — the incremental queue's own count, item by item. */}
                    {prog && isGenerating(prog) && (
                      <div style={{ fontSize: 10, color: V3_MUTED }}>{progressLine(prog)} · {prog.completed}/{prog.total}</div>
                    )}
                  </div>
                  {/* A pass killed by a closed tab lands here as "failed".
                      Resume replays the pre-flight choices Lee actually made
                      and writes nothing twice — the board is the idempotency
                      key (talkthrough-review.reviewAlreadyLanded). */}
                  {rs.state === "error" && canResume(s) && (
                    <button onClick={() => doResume(s)} style={{ fontSize: 11.5, fontWeight: 800, color: "#0B1322", background: V3_GOLD, border: "none", borderRadius: 999, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
                      Resume
                    </button>
                  )}
                  {rs.state === "ready" && (href
                    ? <Link to={href} target="_blank" rel="noopener" style={{ fontSize: 11.5, color: "#3BF5A0", textDecoration: "underline", whiteSpace: "nowrap" }}>Review ↗</Link>
                    : <a href="/talkthrough" target="_blank" rel="noopener" style={{ fontSize: 11.5, color: "#3BF5A0", textDecoration: "underline", whiteSpace: "nowrap" }}>Review ↗</a>)}
                </div>
              );
            })}
          </div>
          {avg !== null && (
            <div style={{ padding: "6px 12px", fontSize: 10.5, color: V3_CREAM, borderTop: `1px solid ${V3_EDGE}` }}>
              {doneCount === 1 ? "that set took " : `${doneCount} sets averaged `}<b style={{ color: V3_GOLD }}>{elapsedLabel(avg)}</b>
            </div>
          )}
          <div style={{ padding: "6px 12px", fontSize: 10, color: V3_MUTED }}>
            {resumeNote ?? "Generation runs in the tab that pressed End Session; finished boards show here from any tab."}
            {topics ? "" : " Loading sets…"}
          </div>
        </div>
      ) : (
        <button onClick={toggle} className="flex items-center gap-2" style={{ background: "rgba(16,24,44,0.97)", border: `1px solid ${busy ? V3_GOLD : V3_EDGE}`, borderRadius: 999, padding: "6px 12px 6px 8px", color: V3_CREAM, cursor: "pointer", boxShadow: "0 12px 30px -12px rgba(0,0,0,0.9)" }} title="Show what is generating">
          <BoltBoil height={22} boilFrame={busy ? frame : 0} />
          <span style={{ fontSize: 11.5, fontWeight: 800 }}>{busy ? `${busy} generating` : `${rows.length} ready`}</span>
        </button>
      )}
    </div>
  );
}
