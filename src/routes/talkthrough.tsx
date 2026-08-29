// THE TALKTHROUGH BOOTH — /talkthrough. Open a set, talk freely, and the
// system captures everything: verbatim transcript segments anchored to
// {session, focused CEQ, time}, moment tags, quick-action notes, and — on the
// button — the AI pass's DRAFT BOARD of starting points.
//
// D2 — THE PLAYER'S CLOTHES: the booth browses the bank EXACTLY the way a
// student browses the exam tab — left rail is the Exam 1 path (topics → sets,
// from loadBoothBank, which reads THE SAME live decks the student player
// reads), center is the focused CEQ rendered player-style. Booth-only chrome
// (prompter, moment tags, quick actions, recorder) stays in the right rail.
// DRAFT questions are visible here with a chip — never to students.
//
// D3 — THE LAST-PASS TOOLKIT: quick actions on the focused CEQ (REWORD ·
// NEW CEQ · CUT · EXHIBIT SPEC · HOW I'D TEACH IT) stamp {ceq, timestamp}
// notes onto the same tags store; the master sheet's needs_exhibit and notes
// render muted on the focused CEQ so Lee's prior notes are in view while he
// talks. The AI pass's BANK CHANGES section proposes adds/rewords/cuts —
// staged only; nothing auto-applies to the bank.
//
// Studio scope only. AdminGate'd, noindexed. Raw transcripts are first-class:
// the verbatim view is the default and nothing here can rewrite one.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Copy, Mic, Shuffle, Square, Wand2, X } from "lucide-react";

import { AdminGate } from "@/components/AdminGate";
import { loadBoothBank, runTalkthroughPass, type BoothCeq, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";
import {
  BOARD_KIND_LABELS, BOARD_KINDS, BOARD_STATUSES, INTERACTION_VOCAB, MOMENT_TAGS, QUICK_KINDS, TAG_LABELS,
  boardForCeq, listSessions, makeSession, makeTag, newTTId, sessionBoard, sessionMeta,
  sessionSegments, sessionTags, touchRow,
  type BoardItem, type BoardStatus, type QuickKind, type TalkSegment, type TalkSession,
} from "@/components/canvas/talkthrough";
import { putBoardItem, putBoardItems, putSession, putTag, startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { TalkthroughRecorder, drainWhisperQueue, speechRecognitionAvailable, type BoothStatus } from "@/components/canvas/talkthrough-audio";
import { extractJsonObject, parsePass, type PassCeq } from "@/components/canvas/talkthrough-pass";
import { BIG_FONT, DISPLAY_FONT, NEON } from "@/components/canvas/theme";

export const Route = createFileRoute("/talkthrough")({
  head: () => ({ meta: [{ title: "🎙 Talkthrough Booth — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGate>
      <TalkthroughApp />
    </AdminGate>
  ),
});

const CREAM = "#F4EFE6";
const GOLD = "#FCA311";
const PANEL = "rgba(16,24,44,0.9)";
const EDGE = "rgba(244,239,230,0.16)";

const NUDGES = [
  "What's tricky here?", "What's interesting?", "Real-world example?",
  "How does this connect to NOW?", "What's funny about it?", "Why is this on the exam?",
  "What's the pattern?", "What's the trick / cheat code?", "Where should a student TALK back?",
  "Short? Nerd Out?", "What order should these really go in?",
] as const;

/** Player-style label: strip wrapping quotes, blanks become ___ (the same
 *  treatment exam-path's setLabel applies). */
const setLabel = (name: string): string => name.replace(/^"|"$/g, "").replace(/\[\s*\]/g, "___").replace(/\[\s+\]/g, "___");

const boothToPassCeq = (c: BoothCeq): PassCeq => ({
  id: c.id, label: c.draft ? `${c.label} (draft)` : c.label, stem: c.stem,
  choices: c.choices, ...(c.noteOnly ? { noteOnly: true } : {}),
});

// ------------------------------------------------------------------- shell

type View = { mode: "home" } | { mode: "booth"; sessionId: string } | { mode: "session"; sessionId: string };

function TalkthroughApp() {
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [topics, setTopics] = useState<BoothTopic[] | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ mode: "home" });

  useEffect(() => { startTT(); return subscribeTT(setTT); }, []);
  useEffect(() => {
    loadBoothBank().then((b) => setTopics(b.topics)).catch((e) => setBankError(e instanceof Error ? e.message : String(e)));
  }, []);

  const session = view.mode !== "home" ? tt.doc.sessions.find((s) => s.id === view.sessionId) ?? null : null;
  const allSets = (topics ?? []).flatMap((t) => t.sets);
  const boothSet = session ? allSets.find((s) => s.id === session.setId) ?? null : null;

  /** Click a set anywhere: reuse its open session or start a fresh one. */
  const openSet = (s: BoothSetInfo) => {
    const open = listSessions(tt.doc).find((x) => x.setId === s.id && !x.endedAt);
    if (open) { setView({ mode: "booth", sessionId: open.id }); return; }
    const ses = makeSession(s.id, s.name);
    putSession(ses);
    setView({ mode: "booth", sessionId: ses.id });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080D18", color: CREAM, fontFamily: DISPLAY_FONT, padding: "18px 22px" }}>
      <header className="flex items-center gap-3" style={{ marginBottom: 14 }}>
        {view.mode !== "home" && (
          <button className="flex items-center gap-1 rounded-full px-3 py-1 text-xs" style={{ border: `1px solid ${EDGE}`, color: NEON.muted }} onClick={() => setView({ mode: "home" })}>
            <ArrowLeft className="h-3 w-3" /> Booth home
          </button>
        )}
        <div style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 20, letterSpacing: "0.04em" }}>🎙 TALKTHROUGH BOOTH</div>
        <SyncBadge tt={tt} />
      </header>

      {bankError && <div style={{ color: "#F87171", fontSize: 13, marginBottom: 10 }}>Could not load the bank: {bankError}</div>}

      {view.mode === "home" && <Home tt={tt} topics={topics} onOpenSet={openSet} onOpenSession={(id) => setView({ mode: "session", sessionId: id })} />}
      {view.mode === "booth" && session && (
        <Booth
          key={session.id}
          tt={tt} session={session} set={boothSet} topics={topics} onSwitchSet={openSet}
          onEnd={() => {
            putSession(touchRow(session, { endedAt: new Date().toISOString() } as Partial<TalkSession>));
            setView({ mode: "session", sessionId: session.id });
          }}
        />
      )}
      {view.mode === "session" && session && (
        <SessionView tt={tt} session={session} set={boothSet} onResume={() => setView({ mode: "booth", sessionId: session.id })} />
      )}
      {view.mode !== "home" && !session && <div style={{ color: NEON.muted }}>Session not found locally yet — syncing…</div>}
    </div>
  );
}

function SyncBadge({ tt }: { tt: TTState }) {
  const label = tt.error ? `⚠ ${tt.error}` : tt.pending > 0 ? `${tt.pending} unsynced${tt.syncing ? " · syncing…" : " · will retry"}` : "all synced";
  const color = tt.error ? "#F87171" : tt.pending > 0 ? GOLD : "#3BF5A0";
  return (
    <div className="ml-auto rounded-full px-3 py-1 text-[11px]" style={{ border: `1px solid ${color}55`, color }} title="Local-first: every word is already saved on this device; this shows the server copy.">
      {label}
    </div>
  );
}

// ------------------------------------------------------ the exam-path tree

function PathTree({ topics, activeSetId, activeCeqs, focusId, onSet, onCeq }: {
  topics: BoothTopic[] | null;
  activeSetId: string | null;
  /** The active set's CEQs — rendered inside the tree under that set. */
  activeCeqs: BoothCeq[] | null;
  focusId: string | null;
  onSet: (s: BoothSetInfo) => void;
  onCeq?: (c: BoothCeq | null) => void;
}) {
  const [openTopics, setOpenTopics] = useState<Set<string>>(new Set());
  // The topic holding the active set opens itself.
  useEffect(() => {
    if (!activeSetId || !topics) return;
    const t = topics.find((x) => x.sets.some((s) => s.id === activeSetId));
    if (t) setOpenTopics((p) => (p.has(t.id) ? p : new Set(p).add(t.id)));
  }, [activeSetId, topics]);

  if (!topics) return <div style={{ color: NEON.muted, fontSize: 12 }}>Loading the Exam 1 path…</div>;
  return (
    <div className="flex flex-col gap-1" style={{ overflowY: "auto", maxHeight: "82vh", paddingRight: 4 }}>
      {topics.map((t) => {
        const open = openTopics.has(t.id);
        const qCount = t.sets.reduce((n, s) => n + s.liveCount, 0);
        const dCount = t.sets.reduce((n, s) => n + s.draftCount, 0);
        return (
          <div key={t.id}>
            <button
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left"
              style={{ background: "transparent", border: "none", color: CREAM }}
              onClick={() => setOpenTopics((p) => { const n = new Set(p); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
            >
              {open ? <ChevronDown className="h-3.5 w-3.5" style={{ color: NEON.muted }} /> : <ChevronRight className="h-3.5 w-3.5" style={{ color: NEON.muted }} />}
              <span style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 13 }}>{t.name}</span>
              <span className="ml-auto" style={{ fontSize: 10.5, color: NEON.muted }}>
                {qCount} q{dCount > 0 ? ` · ${dCount} draft` : ""}
              </span>
            </button>
            {open && t.sets.map((s) => {
              const active = s.id === activeSetId;
              return (
                <div key={s.id} style={{ marginLeft: 14 }}>
                  <button
                    className="w-full rounded-lg px-2.5 py-1.5 text-left"
                    style={{
                      background: active ? "rgba(252,163,17,0.12)" : "transparent",
                      border: `1px solid ${active ? GOLD : "transparent"}`,
                      color: CREAM,
                    }}
                    onClick={() => onSet(s)}
                  >
                    <span style={{ fontSize: 12 }}>{setLabel(s.name)}</span>
                    <span style={{ fontSize: 10, color: NEON.muted, marginLeft: 6 }}>
                      {s.liveCount}{s.draftCount ? ` +${s.draftCount}d` : ""}
                    </span>
                  </button>
                  {/* the active set expands: its CEQ list lives INSIDE the tree */}
                  {active && activeCeqs && onCeq && (
                    <div className="flex flex-col" style={{ marginLeft: 10, borderLeft: `1px solid ${EDGE}`, paddingLeft: 6, marginTop: 2, marginBottom: 4 }}>
                      <button
                        className="rounded-md px-2 py-1 text-left"
                        style={{ background: focusId === null ? "rgba(252,163,17,0.14)" : "transparent", border: "none", color: focusId === null ? GOLD : NEON.muted, fontSize: 11 }}
                        onClick={() => onCeq(null)}
                      >
                        General set talk
                      </button>
                      {activeCeqs.map((c, i) => (
                        <button
                          key={c.id}
                          className="rounded-md px-2 py-1 text-left"
                          style={{
                            background: focusId === c.id ? "rgba(252,163,17,0.14)" : "transparent",
                            border: "none", color: focusId === c.id ? CREAM : NEON.muted, fontSize: 11,
                            opacity: c.noteOnly ? 0.6 : 1,
                          }}
                          onClick={() => onCeq(c)}
                        >
                          <span style={{ fontWeight: 700 }}>Q{i + 1}</span> · {(c.stem || c.label).slice(0, 44)}
                          {c.draft && <DraftChip />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function DraftChip() {
  return (
    <span className="rounded-full px-1.5 py-[1px]" style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.12em", color: "#7DD3FC", border: "1px solid rgba(125,211,252,0.4)", marginLeft: 5, verticalAlign: "middle" }}>
      DRAFT
    </span>
  );
}

// -------------------------------------------------------------------- home

function Home({ tt, topics, onOpenSet, onOpenSession }: {
  tt: TTState; topics: BoothTopic[] | null;
  onOpenSet: (s: BoothSetInfo) => void; onOpenSession: (id: string) => void;
}) {
  const sessions = listSessions(tt.doc);
  return (
    <div className="flex gap-8" style={{ alignItems: "flex-start" }}>
      <section style={{ width: 380, flexShrink: 0 }}>
        <h2 style={{ fontFamily: BIG_FONT, fontSize: 13, letterSpacing: "0.18em", color: NEON.muted, textTransform: "uppercase", marginBottom: 8 }}>Exam 1 path — pick a set, start talking</h2>
        <PathTree topics={topics} activeSetId={null} activeCeqs={null} focusId={null} onSet={onOpenSet} />
      </section>
      <section className="flex-1">
        <h2 style={{ fontFamily: BIG_FONT, fontSize: 13, letterSpacing: "0.18em", color: NEON.muted, textTransform: "uppercase", marginBottom: 8 }}>Sessions</h2>
        {sessions.length === 0 && <div style={{ color: NEON.muted, fontSize: 13 }}>No sessions yet — pick a set on the left and talk.</div>}
        <div className="flex flex-col gap-1.5">
          {sessions.map((s) => {
            const m = sessionMeta(tt.doc, s);
            const board = sessionBoard(tt.doc, s.id);
            return (
              <button key={s.id} className="flex items-center gap-4 rounded-xl px-4 py-2 text-left" style={{ background: PANEL, border: `1px solid ${EDGE}` }} onClick={() => onOpenSession(s.id)}>
                <div style={{ fontWeight: 700, fontSize: 13, minWidth: 240 }}>{setLabel(s.setName)}</div>
                <div style={{ color: NEON.muted, fontSize: 12 }}>{new Date(s.startedAt).toLocaleString()}</div>
                <div style={{ color: NEON.muted, fontSize: 12 }}>{Math.round(m.durationMs / 60000)}m · {m.segments} segments · {m.words} words</div>
                {board.length > 0 && <div style={{ color: GOLD, fontSize: 11 }}>board: {board.length}</div>}
                {!s.endedAt && <div style={{ color: "#3BF5A0", fontSize: 11 }}>● open</div>}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------- booth

function Booth({ tt, session, set, topics, onSwitchSet, onEnd }: {
  tt: TTState; session: TalkSession; set: BoothSetInfo | null; topics: BoothTopic[] | null;
  onSwitchSet: (s: BoothSetInfo) => void; onEnd: () => void;
}) {
  const [, force] = useState(0);
  const bump = useCallback(() => force((n) => n + 1), []);
  const recRef = useRef<TalkthroughRecorder | null>(null);
  if (!recRef.current) {
    recRef.current = new TalkthroughRecorder(session.id, sessionSegments(ttState().doc, session.id).length, bump);
  }
  const rec = recRef.current;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [tagFlash, setTagFlash] = useState<string | null>(null);
  const [nudge, setNudge] = useState(0);
  const [quickOpen, setQuickOpen] = useState<QuickKind | null>(null);
  const [quickText, setQuickText] = useState("");
  const [quickVocab, setQuickVocab] = useState<string | null>(null);
  const status: BoothStatus = rec.status();

  useEffect(() => { const t = setInterval(() => setNudge((n) => (n + 1) % NUDGES.length), 18_000); return () => clearInterval(t); }, []);
  useEffect(() => { void drainWhisperQueue(session.id).then(bump); }, [session.id, bump]);
  useEffect(() => () => rec.stop(), [rec]);

  const ceqs = set?.ceqs ?? null;
  const focused = ceqs?.find((c) => c.id === focusId) ?? null;
  const focusIndex = focused && ceqs ? ceqs.indexOf(focused) : -1;
  const focusPayload = { ceqId: focused?.id ?? null, label: focused ? `Q${focusIndex + 1} · ${focused.label}` : null };
  const segs = sessionSegments(tt.doc, session.id);
  const recent = segs.slice(-3);

  const clickCeq = (c: BoothCeq | null) => {
    setFocusId(c?.id ?? null);
    setQuickOpen(null);
    const idx = c && ceqs ? ceqs.indexOf(c) : -1;
    rec.setFocus(c?.id ?? null, c ? `Q${idx + 1} · ${c.label}` : null); // never interrupts the stream
  };
  const tap = (tag: (typeof MOMENT_TAGS)[number]) => {
    putTag(makeTag(session.id, tag, focusPayload));
    setTagFlash(tag);
    setTimeout(() => setTagFlash(null), 700);
  };
  const saveQuick = () => {
    if (!quickOpen) return;
    const note = quickOpen === "EXHIBIT_SPEC" && quickVocab ? `[${quickVocab}] ${quickText}`.trim() : quickText.trim();
    if (!note) { setQuickOpen(null); return; }
    const t = makeTag(session.id, quickOpen, focusPayload);
    putTag({ ...t, note });
    setQuickOpen(null); setQuickText(""); setQuickVocab(null);
  };
  /** D2: switching SETS mid-booth is a deliberate context boundary — the
   *  recorder flushes and stops (this session stays open); the new set gets
   *  its own session. Clicking CEQs inside the set never touches the stream. */
  const switchSet = (s: BoothSetInfo) => {
    if (s.id === session.setId) return;
    rec.stop();
    onSwitchSet(s);
  };

  return (
    <div className="flex gap-4" style={{ alignItems: "stretch", minHeight: "78vh" }}>
      {/* LEFT — the Exam 1 path, exactly the player's shape */}
      <div style={{ width: 330, flexShrink: 0 }}>
        <PathTree topics={topics} activeSetId={session.setId} activeCeqs={ceqs} focusId={focusId} onSet={switchSet} onCeq={clickCeq} />
        {!set && <div style={{ color: NEON.muted, fontSize: 12, marginTop: 8 }}>Set not in the live bank — you can still talk; segments anchor to the session.</div>}
      </div>

      {/* CENTER — the focused CEQ, player-style */}
      <div className="flex-1 rounded-2xl p-6" style={{ background: PANEL, border: `1px solid ${EDGE}`, overflowY: "auto", maxHeight: "82vh" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <span style={{ color: NEON.muted, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" }}>{setLabel(session.setName)}</span>
          {focused ? (
            <span className="rounded-full px-2.5 py-0.5" style={{ background: GOLD, color: "#0B1322", fontFamily: BIG_FONT, fontWeight: 800, fontSize: 12 }}>
              Q{focusIndex + 1} / {ceqs?.length ?? "?"}
            </span>
          ) : (
            <span style={{ color: GOLD, fontSize: 11, fontWeight: 700 }}>GENERAL SET TALK</span>
          )}
          {focused?.draft && <DraftChip />}
        </div>

        {focused ? (
          <>
            <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.35, whiteSpace: "pre-wrap" }}>{focused.stem}</div>
            <div className="mt-4 flex flex-col gap-2" style={{ maxWidth: 640 }}>
              {focused.choices.map((ch, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl px-4 py-2.5" style={{ border: `1.5px solid ${ch.correct ? "#3BF5A0" : EDGE}`, background: "rgba(9,13,26,0.6)" }}>
                  <span style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 13, color: ch.correct ? "#3BF5A0" : NEON.muted, paddingTop: 1 }}>{String.fromCharCode(65 + i)}</span>
                  <div>
                    <div style={{ fontSize: 15 }}>{ch.text}{ch.correct ? "  ✓" : ""}</div>
                    {ch.feedback && <div style={{ fontSize: 12, color: NEON.muted, marginTop: 2 }}>{ch.feedback}</div>}
                  </div>
                </div>
              ))}
            </div>
            {/* D3.3 — Lee's own prior notes from the master sheet, in view while he talks */}
            {(focused.needsExhibit || focused.masterNotes) && (
              <div className="mt-4 rounded-xl px-3 py-2" style={{ border: `1px dashed ${EDGE}`, maxWidth: 640 }}>
                {focused.needsExhibit && <div style={{ fontSize: 11, color: GOLD }}>needs_exhibit: {focused.needsExhibit}</div>}
                {focused.masterNotes && <div style={{ fontSize: 11, color: NEON.muted }}>notes: {focused.masterNotes}</div>}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 17, color: NEON.muted, marginTop: 16 }}>
            Talking about the set as a whole. Click a question in the path to anchor what you say to it — clicking never interrupts the recording.
          </div>
        )}

        {/* live transcript ticker */}
        <div className="mt-6 flex flex-col gap-1.5">
          {recent.map((s) => <SegmentLine key={s.id} seg={s} />)}
          {status.recording && (
            <div style={{ fontSize: 13, color: GOLD, fontStyle: "italic", minHeight: 20 }}>
              {status.interim || (status.liveAvailable ? "…" : "listening (Whisper text lands in seconds)…")}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — booth chrome: recorder, prompter, tags, quick actions */}
      <div className="flex flex-col gap-3" style={{ width: 300, flexShrink: 0, overflowY: "auto", maxHeight: "82vh" }}>
        <button
          className="flex items-center justify-center gap-2 rounded-2xl px-4 py-4"
          style={{ background: status.recording ? "rgba(248,113,113,0.16)" : "rgba(59,245,160,0.12)", border: `1.5px solid ${status.recording ? "#F87171" : "#3BF5A0"}`, fontFamily: BIG_FONT, fontWeight: 800, fontSize: 16 }}
          onClick={() => {
            if (status.recording) rec.stop();
            else { setMicError(null); rec.start().catch((e) => setMicError(e instanceof Error ? e.message : String(e))); }
          }}
        >
          {status.recording ? <><Square className="h-4 w-4" /> STOP</> : <><Mic className="h-4 w-4" /> START TALKING</>}
        </button>
        {micError && <div style={{ color: "#F87171", fontSize: 12 }}>{micError}</div>}
        {!speechRecognitionAvailable() && <div style={{ color: NEON.muted, fontSize: 10.5 }}>Live captions unavailable — chunked Whisper alone (text lands within seconds).</div>}

        {/* prompter */}
        <div className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${EDGE}` }}>
          <div className="flex items-center justify-between">
            <div style={{ fontSize: 10, letterSpacing: "0.22em", color: NEON.muted, textTransform: "uppercase" }}>Prompter</div>
            <button title="Shuffle" style={{ color: NEON.muted }} onClick={() => setNudge((n) => (n + 1 + Math.floor(Math.random() * (NUDGES.length - 1))) % NUDGES.length)}>
              <Shuffle className="h-3.5 w-3.5" />
            </button>
          </div>
          <div style={{ fontFamily: BIG_FONT, fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginTop: 6, minHeight: 48 }}>{NUDGES[nudge]}</div>
        </div>

        {/* moment tags */}
        <div className="grid grid-cols-3 gap-1.5">
          {MOMENT_TAGS.map((t) => (
            <button
              key={t}
              className="rounded-xl px-1 py-2.5"
              style={{
                background: tagFlash === t ? "rgba(252,163,17,0.3)" : PANEL,
                border: `1.5px solid ${tagFlash === t ? GOLD : EDGE}`,
                fontFamily: BIG_FONT, fontWeight: 800, fontSize: 11, transition: "background 150ms ease",
              }}
              onClick={() => tap(t)}
            >
              {TAG_LABELS[t]}
            </button>
          ))}
        </div>

        {/* D3 — quick actions on the focused CEQ */}
        <div className="rounded-2xl p-3" style={{ background: PANEL, border: `1px solid ${EDGE}` }}>
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: NEON.muted, textTransform: "uppercase", marginBottom: 6 }}>
            Quick actions {focused ? `· Q${focusIndex + 1}` : "· set"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_KINDS.map((k) => (
              <button
                key={k}
                className="rounded-full px-2.5 py-1"
                style={{
                  fontSize: 10.5, fontWeight: 800,
                  background: quickOpen === k ? GOLD : "rgba(9,13,26,0.7)",
                  color: quickOpen === k ? "#0B1322" : CREAM,
                  border: `1px solid ${quickOpen === k ? GOLD : EDGE}`,
                }}
                onClick={() => { setQuickOpen(quickOpen === k ? null : k); setQuickText(""); setQuickVocab(null); }}
              >
                {TAG_LABELS[k]}
              </button>
            ))}
          </div>
          {quickOpen && (
            <div className="mt-2 flex flex-col gap-1.5">
              {quickOpen === "EXHIBIT_SPEC" && (
                <div className="flex flex-wrap gap-1">
                  {INTERACTION_VOCAB.map((v) => (
                    <button key={v} className="rounded-full px-2 py-0.5" style={{ fontSize: 9, fontWeight: 800, background: quickVocab === v ? "rgba(252,163,17,0.25)" : "transparent", color: quickVocab === v ? GOLD : NEON.muted, border: `1px solid ${quickVocab === v ? GOLD : EDGE}` }} onClick={() => setQuickVocab(quickVocab === v ? null : v)}>
                      {v}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                value={quickText}
                autoFocus
                rows={2}
                placeholder={{ REWORD: "this stem/choice should say…", NEWCEQ: "we need a question here about…", CUT: "doesn't earn its slot because…", EXHIBIT_SPEC: "here's the exhibit this needs…", TEACH: "the beat / order / analogy…" }[quickOpen]}
                onChange={(e) => setQuickText(e.target.value)}
                style={{ background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 8, color: CREAM, fontSize: 12, padding: "6px 8px", resize: "vertical" }}
              />
              <button className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: GOLD, color: "#0B1322" }} onClick={saveQuick}>
                Stamp it — keep talking
              </button>
            </div>
          )}
        </div>
        <div style={{ color: NEON.muted, fontSize: 10.5 }}>{sessionTags(tt.doc, session.id).length} moments stamped</div>

        <div className="mt-auto flex flex-col gap-2">
          {(status.uploadQueue > 0 || status.transcribeQueue > 0) && (
            <div style={{ color: NEON.muted, fontSize: 11 }}>background: {status.uploadQueue} uploading · {status.transcribeQueue} awaiting Whisper</div>
          )}
          {status.lastError && <div style={{ color: "#F87171", fontSize: 11 }}>retrying: {status.lastError}</div>}
          <button className="rounded-xl px-4 py-2.5" style={{ border: `1.5px solid ${GOLD}`, color: GOLD, fontFamily: BIG_FONT, fontWeight: 800 }} onClick={() => { rec.stop(); onEnd(); }}>
            END SESSION → review
          </button>
        </div>
      </div>
    </div>
  );
}

function SegmentLine({ seg }: { seg: TalkSegment }) {
  if (!seg.text) return null;
  return (
    <div style={{ fontSize: 13, lineHeight: 1.45 }}>
      <span style={{ color: NEON.muted, fontSize: 10.5 }}>[S{seg.seq}]{seg.focusedCeqLabel ? ` ${seg.focusedCeqLabel} · ` : " "}</span>
      {seg.text}
      {seg.whisperPending && <span title="Live text — Whisper canonical copy pending" style={{ color: GOLD, fontSize: 10, marginLeft: 6 }}>◌ pending</span>}
    </div>
  );
}

// ----------------------------------------------------------------- session

function SessionView({ tt, session, set, onResume }: { tt: TTState; session: TalkSession; set: BoothSetInfo | null; onResume: () => void }) {
  const segs = sessionSegments(tt.doc, session.id);
  const tags = sessionTags(tt.doc, session.id);
  const board = sessionBoard(tt.doc, session.id);
  const meta = sessionMeta(tt.doc, session);
  const [running, setRunning] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [boardView, setBoardView] = useState<"index" | "perceq">("index");
  const [perCeq, setPerCeq] = useState<string | null>(null);

  useEffect(() => { void drainWhisperQueue(session.id); }, [session.id]);

  const passCeqs = (set?.ceqs ?? []).map(boothToPassCeq);
  const passContext = useCallback(() => ({
    setName: session.setName,
    ceqs: passCeqs,
    segments: segs.map((s) => ({ id: s.id, seq: s.seq, text: s.text, focusedCeqId: s.focusedCeqId ?? null, focusedCeqLabel: s.focusedCeqLabel ?? null, source: s.source, whisperPending: s.whisperPending })),
    tags: tags.map((t) => ({ tag: t.tag, at: t.at, focusedCeqLabel: t.focusedCeqLabel ?? null, source: t.source, note: t.note ?? null })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [session.setName, set, segs, tags]);

  const runPass = async () => {
    setRunning(true);
    setPassError(null);
    try {
      const { text } = await runTalkthroughPass({ data: passContext() });
      const raw = extractJsonObject(text);
      if (!raw) throw new Error("The pass returned something that isn't the board JSON — retry (the transcript is untouched).");
      const runId = newTTId("run");
      const parsed = parsePass(raw, session.id, runId, passCeqs.map((c) => c.id));
      if (!parsed.items.length) throw new Error("The pass parsed to zero items — retry.");
      putBoardItems(parsed.items);
      for (const p of parsed.proposedTags) {
        const seg = segs.find((s) => s.seq === p.seq);
        const t = makeTag(session.id, p.tag, { ceqId: seg?.focusedCeqId ?? null, label: seg?.focusedCeqLabel ?? null });
        putTag({ ...t, source: "ai", note: p.quote, at: seg?.startedAt ?? t.at });
      }
    } catch (e) {
      setPassError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const regenItem = async (item: BoardItem, comment: string) => {
    const { text } = await runTalkthroughPass({ data: { ...passContext(), regen: { kind: item.kind, previous: item.payload, comment } } });
    const raw = extractJsonObject(text);
    if (!raw) throw new Error("Regenerate returned non-JSON — the item is unchanged; retry.");
    const runId = newTTId("run");
    const parsed = parsePass(raw, session.id, runId, passCeqs.map((c) => c.id));
    const fresh = parsed.items.find((i) => i.kind === item.kind);
    if (!fresh) throw new Error("Regenerate produced nothing for this item — unchanged; retry.");
    putBoardItem(touchRow(item, {
      runId, title: fresh.title, payload: fresh.payload, quote: fresh.quote || item.quote,
      ceqIds: fresh.ceqIds.length ? fresh.ceqIds : item.ceqIds, status: "suggested", comment,
    } as Partial<BoardItem>));
  };

  const ceqsWithItems = (set?.ceqs ?? []).filter((c) => boardForCeq(board, c.id).length > 0);

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 1200 }}>
      <div className="flex items-center gap-4">
        <div>
          <div style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 18 }}>{setLabel(session.setName)}</div>
          <div style={{ color: NEON.muted, fontSize: 12 }}>
            {new Date(session.startedAt).toLocaleString()} · {Math.round(meta.durationMs / 60000)}m · {meta.segments} segments · {meta.words} words · {tags.length} moments
          </div>
        </div>
        {!session.endedAt && (
          <button className="rounded-xl px-3 py-1.5 text-xs" style={{ border: `1px solid #3BF5A0`, color: "#3BF5A0" }} onClick={onResume}>● resume talking</button>
        )}
        <button
          className="ml-auto flex items-center gap-2 rounded-xl px-4 py-2"
          style={{ border: `1.5px solid ${GOLD}`, color: running ? NEON.muted : GOLD, fontFamily: BIG_FONT, fontWeight: 800 }}
          disabled={running}
          onClick={() => void runPass()}
        >
          <Wand2 className="h-4 w-4" /> {running ? "Drafting… (keep working)" : board.length ? "Re-draft the starting points" : "Draft the starting points"}
        </button>
      </div>
      {passError && (
        <div className="rounded-xl px-4 py-2" style={{ border: "1px solid #F87171", color: "#F87171", fontSize: 13 }}>
          {passError} <button style={{ textDecoration: "underline", marginLeft: 8 }} onClick={() => void runPass()}>retry</button>
        </div>
      )}

      <div className="flex gap-5" style={{ alignItems: "flex-start" }}>
        <section className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${EDGE}`, width: 460, flexShrink: 0, maxHeight: "70vh", overflowY: "auto" }}>
          <h3 style={{ fontSize: 10.5, letterSpacing: "0.22em", color: NEON.muted, textTransform: "uppercase", marginBottom: 8 }}>Verbatim transcript</h3>
          {segs.length === 0 && <div style={{ color: NEON.muted, fontSize: 13 }}>Nothing captured yet.</div>}
          <div className="flex flex-col gap-2">
            {segs.map((s) => <SegmentLine key={s.id} seg={s} />)}
          </div>
          {tags.length > 0 && (
            <>
              <h3 style={{ fontSize: 10.5, letterSpacing: "0.22em", color: NEON.muted, textTransform: "uppercase", margin: "14px 0 6px" }}>Moments & quick notes</h3>
              {tags.map((t) => (
                <div key={t.id} style={{ fontSize: 12, color: t.source === "ai" ? GOLD : CREAM, marginBottom: 2 }}>
                  {TAG_LABELS[t.tag] ?? t.tag}{t.focusedCeqLabel ? ` · ${t.focusedCeqLabel}` : ""}{t.source === "ai" ? " · AI-proposed" : ""}
                  {t.note && <span style={{ color: NEON.muted }}> — “{t.note}”</span>}
                </div>
              ))}
            </>
          )}
        </section>

        <section className="flex-1">
          {board.length === 0 ? (
            <div style={{ color: NEON.muted, fontSize: 14, padding: 20 }}>
              No board yet. {session.endedAt ? "Push the button — every output traces to a verbatim quote." : "End the session (or run the pass on what's captured so far)."}
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                {(["index", "perceq"] as const).map((v) => (
                  <button key={v} className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
                    style={v === boardView ? { background: GOLD, color: "#0B1322" } : { border: `1px solid ${EDGE}`, color: NEON.muted }}
                    onClick={() => setBoardView(v)}>
                    {v === "index" ? "Index (prep sheet)" : "Per-CEQ"}
                  </button>
                ))}
                {boardView === "perceq" && (
                  <select value={perCeq ?? ""} onChange={(e) => setPerCeq(e.target.value || null)}
                    style={{ background: PANEL, color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 8, fontSize: 12, padding: "4px 8px" }}>
                    <option value="">pick a question…</option>
                    {ceqsWithItems.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                )}
              </div>
              {boardView === "index"
                ? BOARD_KINDS.map((k) => {
                    const items = board.filter((b) => b.kind === k);
                    if (!items.length) return null;
                    return (
                      <div key={k} className="mb-4">
                        <h3 style={{ fontSize: 11, letterSpacing: "0.2em", color: GOLD, textTransform: "uppercase", marginBottom: 6 }}>{BOARD_KIND_LABELS[k]}</h3>
                        {items.map((b) => <ItemCard key={b.id} item={b} onRegen={regenItem} />)}
                      </div>
                    );
                  })
                : perCeq
                  ? boardForCeq(board, perCeq).map((b) => <ItemCard key={b.id} item={b} onRegen={regenItem} />)
                  : <div style={{ color: NEON.muted, fontSize: 13 }}>Pick a question to see everything about it.</div>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- item card

const STATUS_COLORS: Record<BoardStatus, string> = {
  suggested: NEON.muted as string, accepted: "#3BF5A0", edited: "#7DD3FC", rejected: "#F87171", built: GOLD, filmed: "#A78BFA",
};

function ItemCard({ item, onRegen }: { item: BoardItem; onRegen: (item: BoardItem, comment: string) => Promise<void> }) {
  const [comment, setComment] = useState(item.comment);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const setStatus = (s: BoardStatus) => putBoardItem(touchRow(item, { status: item.status === s ? "suggested" : s } as Partial<BoardItem>));
  const saveComment = () => { if (comment !== item.comment) putBoardItem(touchRow(item, { comment } as Partial<BoardItem>)); };

  const p = item.payload as Record<string, unknown>;
  const copyPrompt = async () => {
    await navigator.clipboard.writeText(String(p.prompt ?? ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="mb-2 rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${item.status === "rejected" ? "rgba(248,113,113,0.35)" : EDGE}`, opacity: item.status === "rejected" ? 0.6 : 1 }}>
      <div className="flex items-center gap-2">
        <div style={{ fontWeight: 700, fontSize: 14 }}>{item.title}</div>
        <div className="ml-auto flex gap-1">
          {BOARD_STATUSES.filter((s) => s !== "suggested").map((s) => (
            <button key={s} className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
              style={item.status === s ? { background: STATUS_COLORS[s], color: "#0B1322" } : { border: `1px solid ${EDGE}`, color: NEON.muted }}
              onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {item.kind === "ceq_order" && (
          <>
            {(p.proposed as { ceqId: string; label: string; why: string }[] | undefined)?.map((x, i) => (
              <div key={i}>{i + 1}. <b>{x.label}</b> <span style={{ color: NEON.muted }}>— {x.why}</span></div>
            ))}
            {(p.wordingFlags as { flag: string; quote: string }[] | undefined)?.map((f, i) => (
              <div key={`f${i}`} style={{ color: "#7DD3FC", marginTop: 4 }}>✎ {f.flag}</div>
            ))}
          </>
        )}
        {item.kind === "outline" && (p.beats as { title: string; exhibitMoment: string; notes: string; coversCeqIds: string[] }[] | undefined)?.map((b, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            <b>{i + 1}. {b.title}</b> <span style={{ color: NEON.muted, fontSize: 11 }}>({b.coversCeqIds.length} CEQs)</span>
            {b.exhibitMoment && <div style={{ color: GOLD, fontSize: 12 }}>⚡ {b.exhibitMoment}</div>}
            {b.notes && <div style={{ color: NEON.muted, fontSize: 12 }}>{b.notes}</div>}
          </div>
        ))}
        {item.kind === "exhibit" && (
          <>
            <div>{String(p.summary ?? "")}</div>
            <div className="mt-2 flex items-center gap-2">
              <button className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: GOLD, color: "#0B1322" }} onClick={() => void copyPrompt()}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "COPY exhibit prompt"}
              </button>
              <button className="text-xs" style={{ color: NEON.muted, textDecoration: "underline" }} onClick={() => setShowPrompt((v) => !v)}>
                {showPrompt ? "hide" : "view"} prompt
              </button>
            </div>
            {showPrompt && <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", background: "rgba(9,13,26,0.7)", borderRadius: 10, padding: 10, marginTop: 8, maxHeight: 300, overflowY: "auto" }}>{String(p.prompt ?? "")}</pre>}
          </>
        )}
        {item.kind === "bank" && (
          <div>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ border: `1px solid ${EDGE}`, color: String(p.action) === "cut" ? "#F87171" : String(p.action) === "add" ? "#3BF5A0" : "#7DD3FC", marginRight: 6 }}>
              {String(p.action ?? "reword")}
            </span>
            {String(p.proposal ?? "")}
          </div>
        )}
        {item.kind === "vibe" && (
          <>
            <div>{String(p.why ?? "")}</div>
            {!!p.talkPrompt && <div style={{ color: "#3BF5A0", marginTop: 3 }}>TALK: “{String(p.talkPrompt)}”</div>}
          </>
        )}
        {item.kind === "short" && (
          <div><span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ border: `1px solid ${EDGE}`, color: GOLD, marginRight: 6 }}>{String(p.format ?? "short")}</span>{String(p.pitch ?? "")}</div>
        )}
        {item.kind === "phrase" && <div style={{ color: NEON.muted }}>{String(p.meaning ?? "")}</div>}
        {item.kind === "accuracy" && <div style={{ color: "#F87171" }}>{String(p.why ?? "")}</div>}
      </div>

      {item.quote && <div className="mt-2" style={{ fontSize: 12, fontStyle: "italic", color: NEON.muted, borderLeft: `2px solid ${GOLD}66`, paddingLeft: 8 }}>“{item.quote}”</div>}

      <div className="mt-3 flex items-center gap-2">
        <input
          value={comment}
          placeholder="your note on this item…"
          onChange={(e) => setComment(e.target.value)}
          onBlur={saveComment}
          style={{ flex: 1, background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 8, color: CREAM, fontSize: 12, padding: "6px 10px" }}
        />
        <button
          className="rounded-lg px-3 py-1.5 text-xs"
          style={{ border: `1px solid ${GOLD}88`, color: busy ? NEON.muted : GOLD }}
          disabled={busy}
          onClick={() => { saveComment(); setBusy(true); setErr(null); onRegen(item, comment).catch((e) => setErr(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false)); }}
        >
          {busy ? "regenerating…" : "Regenerate with my notes"}
        </button>
      </div>
      {err && <div className="mt-1 flex items-center gap-1" style={{ color: "#F87171", fontSize: 11 }}><X className="h-3 w-3" />{err}</div>}
    </div>
  );
}

