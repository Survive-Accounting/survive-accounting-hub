// THE TALKTHROUGH BOOTH — /talkthrough. Open a set, talk freely, and the
// system captures everything: verbatim transcript segments anchored to
// {session, focused CEQ, time}, moment tags, and — on the button — the AI
// pass's DRAFT BOARD of starting points.
//
// Studio scope only. AdminGate'd, noindexed, no student-facing changes, and
// NO edits to the live CEQ bank from this tool: the board is a staging area;
// Lee's hands make the real edits. Raw transcripts are first-class artifacts —
// the verbatim view is the default view, and nothing here can rewrite one.
//
// Capture is bulletproof by construction (talkthrough.ts / -sync / -audio):
// local-first writes, background Supabase sync, visible unsynced indicator,
// retry on reconnect, soft-delete only, survives hard refresh mid-session.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Mic, Shuffle, Square, Wand2, X } from "lucide-react";

import { AdminGate } from "@/components/AdminGate";
import { loadSetPool } from "@/lib/set-files.functions";
import { runTalkthroughPass } from "@/lib/talkthrough.functions";
import {
  BOARD_KIND_LABELS, BOARD_KINDS, BOARD_STATUSES, MOMENT_TAGS, TAG_LABELS,
  boardForCeq, listSessions, makeSession, makeTag, newTTId, sessionBoard, sessionMeta,
  sessionSegments, sessionTags, touchRow,
  type BoardItem, type BoardKind, type BoardStatus, type TalkSegment, type TalkSession,
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

// The prompter's rotating nudges — subtle, never blocking (the prompt's list).
const NUDGES = [
  "What's tricky here?", "What's interesting?", "Real-world example?",
  "How does this connect to NOW?", "What's funny about it?", "Why is this on the exam?",
  "What's the pattern?", "What's the trick / cheat code?", "Where should a student TALK back?",
  "Short? Nerd Out?", "What order should these really go in?",
] as const;

// ---------------------------------------------------------- set extraction

interface BoothSet { deckId: string; name: string; ceqs: PassCeq[] }

/** Pool doc → the booth's set list. Teaching order = data.stageOrder (the
 *  same field the Studio deals by); note frames ride along, labeled. */
function extractSets(poolJson: string): BoothSet[] {
  try {
    const pool = JSON.parse(poolJson) as { decks?: { id: string; name: string }[]; nodes?: { id: string; type?: string; data?: Record<string, unknown> }[] };
    const nodes = pool.nodes ?? [];
    return (pool.decks ?? []).map((deck) => {
      const cards = nodes
        .filter((n) => n.type === "ceq" && (n.data as Record<string, unknown> | undefined)?.deckId === deck.id)
        .map((n) => ({ n, d: (n.data ?? {}) as Record<string, unknown> }))
        .sort((a, b) => (Number(a.d.stageOrder) || 0) - (Number(b.d.stageOrder) || 0));
      const ceqs: PassCeq[] = cards.map(({ n, d }, i) => ({
        id: n.id,
        label: String(d.shorthand || d.title || `Q${i + 1}`),
        stem: String(d.prompt ?? ""),
        choices: (Array.isArray(d.choices) ? (d.choices as { text?: string; correct?: boolean; feedback?: string }[]) : [])
          .map((c) => ({ text: String(c.text ?? ""), correct: !!c.correct, ...(c.feedback ? { feedback: String(c.feedback) } : {}) })),
        ...(d.noteOnly ? { noteOnly: true } : {}),
      }));
      return { deckId: deck.id, name: deck.name, ceqs };
    }).filter((s) => s.ceqs.length > 0);
  } catch { return []; }
}

// ------------------------------------------------------------------- shell

type View = { mode: "home" } | { mode: "booth"; sessionId: string } | { mode: "session"; sessionId: string };

function TalkthroughApp() {
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [sets, setSets] = useState<BoothSet[] | null>(null);
  const [setsError, setSetsError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ mode: "home" });

  useEffect(() => { startTT(); return subscribeTT(setTT); }, []);
  useEffect(() => {
    loadSetPool().then((p) => setSets(extractSets(p.pool_json))).catch((e) => setSetsError(e instanceof Error ? e.message : String(e)));
  }, []);

  const session = view.mode !== "home" ? tt.doc.sessions.find((s) => s.id === view.sessionId) ?? null : null;
  const boothSet = session ? sets?.find((s) => s.deckId === session.setId) ?? null : null;

  return (
    <div style={{ minHeight: "100vh", background: "#080D18", color: CREAM, fontFamily: DISPLAY_FONT, padding: "18px 22px" }}>
      <header className="flex items-center gap-3" style={{ marginBottom: 14 }}>
        {view.mode !== "home" && (
          <button className="flex items-center gap-1 rounded-full px-3 py-1 text-xs" style={{ border: `1px solid ${EDGE}`, color: NEON.muted }} onClick={() => setView({ mode: "home" })}>
            <ArrowLeft className="h-3 w-3" /> Booth home
          </button>
        )}
        <div style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 20, letterSpacing: "0.04em" }}>
          🎙 TALKTHROUGH BOOTH
        </div>
        <SyncBadge tt={tt} />
      </header>

      {view.mode === "home" && (
        <Home
          tt={tt} sets={sets} setsError={setsError}
          onStart={(s) => {
            const ses = makeSession(s.deckId, s.name);
            putSession(ses);
            setView({ mode: "booth", sessionId: ses.id });
          }}
          onOpen={(id) => setView({ mode: "session", sessionId: id })}
        />
      )}
      {view.mode === "booth" && session && (
        <Booth
          tt={tt} session={session} set={boothSet}
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
  const label = tt.error
    ? `⚠ ${tt.error}`
    : tt.pending > 0
      ? `${tt.pending} unsynced${tt.syncing ? " · syncing…" : " · will retry"}`
      : "all synced";
  const color = tt.error ? "#F87171" : tt.pending > 0 ? GOLD : "#3BF5A0";
  return (
    <div className="ml-auto rounded-full px-3 py-1 text-[11px]" style={{ border: `1px solid ${color}55`, color }} title="Local-first: every word is already saved on this device; this shows the server copy.">
      {label}
    </div>
  );
}

// -------------------------------------------------------------------- home

function Home({ tt, sets, setsError, onStart, onOpen }: {
  tt: TTState; sets: BoothSet[] | null; setsError: string | null;
  onStart: (s: BoothSet) => void; onOpen: (sessionId: string) => void;
}) {
  const sessions = listSessions(tt.doc);
  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: 1100 }}>
      <section>
        <h2 style={{ fontFamily: BIG_FONT, fontSize: 14, letterSpacing: "0.18em", color: NEON.muted, textTransform: "uppercase", marginBottom: 8 }}>Talk through a set</h2>
        {setsError && <div style={{ color: "#F87171", fontSize: 13 }}>Could not load sets: {setsError}</div>}
        {!sets && !setsError && <div style={{ color: NEON.muted }}>Loading sets…</div>}
        <div className="flex flex-wrap gap-2">
          {sets?.map((s) => (
            <button key={s.deckId} className="rounded-2xl px-4 py-3 text-left" style={{ background: PANEL, border: `1px solid ${EDGE}`, minWidth: 220 }} onClick={() => onStart(s)}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
              <div style={{ color: NEON.muted, fontSize: 11, marginTop: 2 }}>{s.ceqs.filter((c) => !c.noteOnly).length} CEQs · start talking</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontFamily: BIG_FONT, fontSize: 14, letterSpacing: "0.18em", color: NEON.muted, textTransform: "uppercase", marginBottom: 8 }}>Sessions</h2>
        {sessions.length === 0 && <div style={{ color: NEON.muted, fontSize: 13 }}>No sessions yet — pick a set above and talk.</div>}
        <div className="flex flex-col gap-1.5">
          {sessions.map((s) => {
            const m = sessionMeta(tt.doc, s);
            const board = sessionBoard(tt.doc, s.id);
            return (
              <button key={s.id} className="flex items-center gap-4 rounded-xl px-4 py-2 text-left" style={{ background: PANEL, border: `1px solid ${EDGE}` }} onClick={() => onOpen(s.id)}>
                <div style={{ fontWeight: 700, fontSize: 13, minWidth: 220 }}>{s.setName}</div>
                <div style={{ color: NEON.muted, fontSize: 12 }}>{new Date(s.startedAt).toLocaleString()}</div>
                <div style={{ color: NEON.muted, fontSize: 12 }}>{Math.round(m.durationMs / 60000)}m · {m.segments} segments · {m.words} words</div>
                {board.length > 0 && <div style={{ color: GOLD, fontSize: 11 }}>board: {board.length} items</div>}
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

function Booth({ tt, session, set, onEnd }: { tt: TTState; session: TalkSession; set: BoothSet | null; onEnd: () => void }) {
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
  const status: BoothStatus = rec.status();

  // Prompter rotation — ambient, keyboard-free.
  useEffect(() => { const t = setInterval(() => setNudge((n) => (n + 1) % NUDGES.length), 18_000); return () => clearInterval(t); }, []);
  // Retry any whisper-pending chunks from an earlier sitting of this session.
  useEffect(() => { void drainWhisperQueue(session.id).then(bump); }, [session.id, bump]);
  // Leaving the booth stops the mic — the session itself stays open.
  useEffect(() => () => rec.stop(), [rec]);

  const focused = set?.ceqs.find((c) => c.id === focusId) ?? null;
  const focusPayload = { ceqId: focused?.id ?? null, label: focused?.label ?? null };
  const segs = sessionSegments(tt.doc, session.id);
  const recent = segs.slice(-4);

  const clickCeq = (id: string | null, label: string | null) => {
    setFocusId(id);
    rec.setFocus(id, label); // never interrupts recording — closes the chunk at a natural boundary
  };
  const tap = (tag: (typeof MOMENT_TAGS)[number]) => {
    putTag(makeTag(session.id, tag, focusPayload));
    setTagFlash(tag);
    setTimeout(() => setTagFlash(null), 700);
  };

  return (
    <div className="flex gap-4" style={{ alignItems: "stretch", minHeight: "78vh" }}>
      {/* LEFT — the set's CEQs in teaching order */}
      <div className="flex flex-col gap-1" style={{ width: 270, flexShrink: 0, overflowY: "auto", maxHeight: "82vh" }}>
        <button
          className="rounded-xl px-3 py-2 text-left text-[12px]"
          style={{ background: focusId === null ? "rgba(252,163,17,0.14)" : PANEL, border: `1px solid ${focusId === null ? GOLD : EDGE}` }}
          onClick={() => clickCeq(null, null)}
        >
          General set talk
        </button>
        {set?.ceqs.map((c) => (
          <button
            key={c.id}
            className="rounded-xl px-3 py-2 text-left"
            style={{
              background: focusId === c.id ? "rgba(252,163,17,0.14)" : PANEL,
              border: `1px solid ${focusId === c.id ? GOLD : EDGE}`,
              boxShadow: focusId === c.id ? `0 0 14px ${GOLD}44` : undefined,
              opacity: c.noteOnly ? 0.65 : 1,
            }}
            onClick={() => clickCeq(c.id, c.label)}
          >
            <div style={{ fontSize: 12, fontWeight: 700 }}>{c.label}{c.noteOnly ? " · note" : ""}</div>
            <div style={{ fontSize: 10.5, color: NEON.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.stem}</div>
          </button>
        ))}
        {!set && <div style={{ color: NEON.muted, fontSize: 12 }}>Set not loaded — you can still talk; segments anchor to the session.</div>}
      </div>

      {/* CENTER — the focused CEQ, large */}
      <div className="flex-1 rounded-2xl p-6" style={{ background: PANEL, border: `1px solid ${EDGE}`, overflowY: "auto", maxHeight: "82vh" }}>
        <div style={{ color: NEON.muted, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 8 }}>
          {session.setName} · {focused ? focused.label : "general set talk"}
        </div>
        {focused ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.35, whiteSpace: "pre-wrap" }}>{focused.stem}</div>
            <div className="mt-5 flex flex-col gap-2">
              {focused.choices.map((ch, i) => (
                <div key={i} className="rounded-xl px-4 py-2.5" style={{ border: `1.5px solid ${ch.correct ? "#3BF5A0" : EDGE}`, background: "rgba(9,13,26,0.6)" }}>
                  <div style={{ fontSize: 15 }}>{ch.correct ? "✔ " : ""}{ch.text}</div>
                  {ch.feedback && <div style={{ fontSize: 12, color: NEON.muted, marginTop: 3 }}>{ch.feedback}</div>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 18, color: NEON.muted, marginTop: 20 }}>
            Talking about the set as a whole. Click a CEQ on the left to anchor what you say to it — clicking never interrupts the recording.
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

      {/* RIGHT — prompter card + controls */}
      <div className="flex flex-col gap-3" style={{ width: 300, flexShrink: 0 }}>
        {/* record control */}
        <button
          className="flex items-center justify-center gap-2 rounded-2xl px-4 py-4"
          style={{ background: status.recording ? "rgba(248,113,113,0.16)" : "rgba(59,245,160,0.12)", border: `1.5px solid ${status.recording ? "#F87171" : "#3BF5A0"}`, fontFamily: BIG_FONT, fontWeight: 800, fontSize: 16 }}
          onClick={() => {
            if (status.recording) { rec.stop(); }
            else { setMicError(null); rec.start().catch((e) => setMicError(e instanceof Error ? e.message : String(e))); }
          }}
        >
          {status.recording ? <><Square className="h-4 w-4" /> STOP</> : <><Mic className="h-4 w-4" /> START TALKING</>}
        </button>
        {micError && <div style={{ color: "#F87171", fontSize: 12 }}>{micError}</div>}
        {!speechRecognitionAvailable() && (
          <div style={{ color: NEON.muted, fontSize: 10.5 }}>Live captions unavailable in this browser — chunked Whisper alone (text lands within seconds).</div>
        )}

        {/* prompter card */}
        <div className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${EDGE}` }}>
          <div className="flex items-center justify-between">
            <div style={{ fontSize: 10, letterSpacing: "0.22em", color: NEON.muted, textTransform: "uppercase" }}>Prompter</div>
            <button title="Shuffle" style={{ color: NEON.muted }} onClick={() => setNudge((n) => (n + 1 + Math.floor(Math.random() * (NUDGES.length - 1))) % NUDGES.length)}>
              <Shuffle className="h-3.5 w-3.5" />
            </button>
          </div>
          <div style={{ fontFamily: BIG_FONT, fontSize: 19, fontWeight: 700, lineHeight: 1.3, marginTop: 6, minHeight: 52 }}>{NUDGES[nudge]}</div>
        </div>

        {/* moment tags — six large tap targets */}
        <div className="grid grid-cols-2 gap-2">
          {MOMENT_TAGS.map((t) => (
            <button
              key={t}
              className="rounded-xl px-2 py-3"
              style={{
                background: tagFlash === t ? "rgba(252,163,17,0.3)" : PANEL,
                border: `1.5px solid ${tagFlash === t ? GOLD : EDGE}`,
                fontFamily: BIG_FONT, fontWeight: 800, fontSize: 13, transition: "background 150ms ease, border-color 150ms ease",
              }}
              onClick={() => tap(t)}
            >
              {TAG_LABELS[t]}
            </button>
          ))}
        </div>
        <div style={{ color: NEON.muted, fontSize: 10.5 }}>{sessionTags(tt.doc, session.id).length} moments stamped</div>

        {/* status + end */}
        <div className="mt-auto flex flex-col gap-2">
          {(status.uploadQueue > 0 || status.transcribeQueue > 0) && (
            <div style={{ color: NEON.muted, fontSize: 11 }}>
              background: {status.uploadQueue} uploading · {status.transcribeQueue} awaiting Whisper
            </div>
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

function SessionView({ tt, session, set, onResume }: { tt: TTState; session: TalkSession; set: BoothSet | null; onResume: () => void }) {
  const segs = sessionSegments(tt.doc, session.id);
  const tags = sessionTags(tt.doc, session.id);
  const board = sessionBoard(tt.doc, session.id);
  const meta = sessionMeta(tt.doc, session);
  const [running, setRunning] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [boardView, setBoardView] = useState<"index" | "perceq">("index");
  const [perCeq, setPerCeq] = useState<string | null>(null);

  // Reopened sessions keep retrying their Whisper queue.
  useEffect(() => { void drainWhisperQueue(session.id); }, [session.id]);

  const passContext = useCallback(() => ({
    setName: session.setName,
    ceqs: set?.ceqs ?? [],
    segments: segs.map((s) => ({ id: s.id, seq: s.seq, text: s.text, focusedCeqId: s.focusedCeqId ?? null, focusedCeqLabel: s.focusedCeqLabel ?? null, source: s.source, whisperPending: s.whisperPending })),
    tags: tags.map((t) => ({ tag: t.tag, at: t.at, focusedCeqLabel: t.focusedCeqLabel ?? null, source: t.source })),
  }), [session.setName, set, segs, tags]);

  const runPass = async () => {
    setRunning(true);
    setPassError(null);
    try {
      const { text } = await runTalkthroughPass({ data: passContext() });
      const raw = extractJsonObject(text);
      if (!raw) throw new Error("The pass returned something that isn't the board JSON — retry (the transcript is untouched).");
      const runId = newTTId("run");
      const parsed = parsePass(raw, session.id, runId, (set?.ceqs ?? []).map((c) => c.id));
      if (!parsed.items.length) throw new Error("The pass parsed to zero items — retry.");
      putBoardItems(parsed.items);
      // AI-proposed moment tags — spoken cues Lee didn't tap, quoted verbatim.
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
    const parsed = parsePass(
      // single-key replies parse through the same door
      Object.keys(raw).length ? raw : {}, session.id, runId, (set?.ceqs ?? []).map((c) => c.id),
    );
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
          <div style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 18 }}>{session.setName}</div>
          <div style={{ color: NEON.muted, fontSize: 12 }}>
            {new Date(session.startedAt).toLocaleString()} · {Math.round(meta.durationMs / 60000)}m · {meta.segments} segments · {meta.words} words · {tags.length} moments
          </div>
        </div>
        {!session.endedAt && (
          <button className="rounded-xl px-3 py-1.5 text-xs" style={{ border: `1px solid #3BF5A0`, color: "#3BF5A0" }} onClick={onResume}>
            ● resume talking
          </button>
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
        {/* TRANSCRIPT — verbatim, the default view, always visible */}
        <section className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${EDGE}`, width: 460, flexShrink: 0, maxHeight: "70vh", overflowY: "auto" }}>
          <h3 style={{ fontSize: 10.5, letterSpacing: "0.22em", color: NEON.muted, textTransform: "uppercase", marginBottom: 8 }}>Verbatim transcript</h3>
          {segs.length === 0 && <div style={{ color: NEON.muted, fontSize: 13 }}>Nothing captured yet.</div>}
          <div className="flex flex-col gap-2">
            {segs.map((s) => <SegmentLine key={s.id} seg={s} />)}
          </div>
          {tags.length > 0 && (
            <>
              <h3 style={{ fontSize: 10.5, letterSpacing: "0.22em", color: NEON.muted, textTransform: "uppercase", margin: "14px 0 6px" }}>Moments</h3>
              {tags.map((t) => (
                <div key={t.id} style={{ fontSize: 12, color: t.source === "ai" ? GOLD : CREAM }}>
                  {TAG_LABELS[t.tag]}{t.focusedCeqLabel ? ` · ${t.focusedCeqLabel}` : ""}{t.source === "ai" ? " · AI-proposed" : ""}
                  {t.note && <span style={{ color: NEON.muted }}> — “{t.note}”</span>}
                </div>
              ))}
            </>
          )}
        </section>

        {/* THE DRAFT BOARD */}
        <section className="flex-1">
          {board.length === 0 ? (
            <div style={{ color: NEON.muted, fontSize: 14, padding: 20 }}>
              No board yet. {session.endedAt ? "Push the button — the pass runs in the background and every output traces to a verbatim quote." : "End the session (or just run the pass on what's captured so far)."}
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

      {/* kind-shaped payload */}
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

      {/* the verbatim quote that earned it — traceability is law */}
      {item.quote && <div className="mt-2" style={{ fontSize: 12, fontStyle: "italic", color: NEON.muted, borderLeft: `2px solid ${GOLD}66`, paddingLeft: 8 }}>“{item.quote}”</div>}

      {/* the conversation loop */}
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

