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
//
// 2026-09-02: the Booth itself (path tree, capture surface, stamp board,
// transcript import) lives in components/talkthrough/Booth.tsx so V3 can mount
// it at /v3/$topic/$set/blast-off/talkthrough. This route is the studio around
// it: sessions, review, the bank, exhibits, style memory. The session read-back
// (SessionView) lives beside it and is V3's Step 2.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { AdminGate } from "@/components/AdminGate";
import { loadBoothBank, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";
import { listSessions, makeSession, sessionBoard, sessionMeta, touchRow, type BoardItem, type TTDoc, type TalkSession } from "@/components/canvas/talkthrough";
import { flushTT, pullTT, putBoardItem, putSession, startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { Booth, CREAM, EDGE, GOLD, PANEL, PathTree, boothToPassCeq, setLabel } from "@/components/talkthrough/Booth";
import { SessionView } from "@/components/talkthrough/SessionView";
import { PreFlight } from "@/components/canvas/ReviewBoard";
import { BankView } from "@/components/canvas/BankView";
import { ExhibitRoom, exhibitSessionId } from "@/components/canvas/ExhibitRoom";
import { queueReview, reviewStateOf, subscribeReview, sweepStrandedReviews } from "@/components/canvas/talkthrough-review";
import { BIG_FONT, DISPLAY_FONT, NEON } from "@/components/canvas/theme";

export const Route = createFileRoute("/talkthrough")({
  head: () => ({ meta: [{ title: "🎙 Talkthrough Booth — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGate>
      <TalkthroughApp />
    </AdminGate>
  ),
});


// ------------------------------------------------------------------- shell

type View = { mode: "home" } | { mode: "bank" } | { mode: "exhibits" } | { mode: "style" } | { mode: "booth"; sessionId: string } | { mode: "session"; sessionId: string };

function TalkthroughApp() {
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [topics, setTopics] = useState<BoothTopic[] | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ mode: "home" });
  const [preflight, setPreflight] = useState<TalkSession | null>(null);
  const [, forceReview] = useState(0);

  useEffect(() => { startTT(); sweepStrandedReviews(); const un = subscribeReview(() => forceReview((n) => n + 1)); return () => { un(); }; }, []);
  useEffect(() => subscribeTT(setTT), []);
  useEffect(() => {
    loadBoothBank().then((b) => setTopics(b.topics)).catch((e) => setBankError(e instanceof Error ? e.message : String(e)));
  }, []);

  const session = view.mode === "booth" || view.mode === "session" ? tt.doc.sessions.find((s) => s.id === view.sessionId) ?? null : null;
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
        {/* B4 — the content bank lives beside the booth. */}
        <button className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
          style={view.mode === "bank" ? { background: GOLD, color: "#0B1322" } : { border: `1px solid ${EDGE}`, color: NEON.muted }}
          onClick={() => setView(view.mode === "bank" ? { mode: "home" } : { mode: "bank" })}>
          The Bank
        </button>
        <button className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
          style={view.mode === "exhibits" ? { background: GOLD, color: "#0B1322" } : { border: `1px solid ${EDGE}`, color: NEON.muted }}
          onClick={() => setView(view.mode === "exhibits" ? { mode: "home" } : { mode: "exhibits" })}>
          Exhibits
        </button>
        <button className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
          style={view.mode === "style" ? { background: GOLD, color: "#0B1322" } : { border: `1px solid ${EDGE}`, color: NEON.muted }}
          onClick={() => setView(view.mode === "style" ? { mode: "home" } : { mode: "style" })}>
          Style
        </button>
        <SyncBadge tt={tt} />
      </header>

      {bankError && <div style={{ color: "#F87171", fontSize: 13, marginBottom: 10 }}>Could not load the bank: {bankError}</div>}

      {view.mode === "home" && <Home tt={tt} topics={topics} onOpenSet={openSet} onOpenSession={(id) => setView({ mode: "session", sessionId: id })} />}
      {view.mode === "bank" && <BankView doc={tt.doc} topics={topics} />}
      {view.mode === "style" && <StyleView doc={tt.doc} />}
      {view.mode === "exhibits" && (
        <ExhibitRoom
          doc={tt.doc}
          topics={topics}
          onDictate={(item) => {
            // B6.2 — an exhibit card carries its own dictation session; the
            // Booth's capture mechanics are unchanged (no set = general talk).
            const sid = exhibitSessionId(item.id);
            const open = tt.doc.sessions.find((x) => x.id.startsWith("tts-") && x.setId === sid && !x.endedAt);
            if (open) { setView({ mode: "booth", sessionId: open.id }); return; }
            const ses = makeSession(sid, `Exhibit · ${item.title}`);
            putSession(ses);
            setView({ mode: "booth", sessionId: ses.id });
          }}
        />
      )}
      {view.mode === "booth" && session && (
        <Booth
          key={session.id}
          tt={tt} session={session} set={boothSet} topics={topics} onSwitchSet={openSet}
          onEnd={() => setPreflight(session)}
        />
      )}
      {preflight && (
        <PreFlight
          doc={tt.doc}
          session={preflight}
          onCancel={() => setPreflight(null)}
          onGo={(excludedKinds, wantVibePlan) => {
            const ses = preflight;
            setPreflight(null);
            putSession(touchRow(ses, { endedAt: new Date().toISOString() } as Partial<TalkSession>));
            const ceqs = (allSets.find((x) => x.id === ses.setId)?.ceqs ?? []).map(boothToPassCeq);
            queueReview({ session: ses, ceqs, excludedKinds, wantVibePlan });
            // Lee immediately opens the next set — back to the path.
            setView({ mode: "home" });
          }}
        />
      )}
      {view.mode === "session" && session && (
        <SessionView tt={tt} session={session} set={boothSet} onResume={() => setView({ mode: "booth", sessionId: session.id })} />
      )}
      {(view.mode === "booth" || view.mode === "session") && !session && <div style={{ color: NEON.muted }}>Session not found locally yet — syncing…</div>}
    </div>
  );
}

function SyncBadge({ tt }: { tt: TTState }) {
  // B1.5 — the badge is also the RETRY NOW tap.
  // A WARNING is a sync that succeeded while dropping something on the floor
  // (a column its migration has not created yet) — louder than "all synced",
  // quieter than a failure, and never hidden.
  const label = tt.error ? `⚠ ${tt.error}` : tt.warning ? `⚠ ${tt.warning}` : tt.pending > 0 ? `${tt.pending} unsynced${tt.syncing ? " · syncing…" : " · tap to retry"}` : "all synced";
  const color = tt.error || tt.warning ? "#F87171" : tt.pending > 0 ? GOLD : "#3BF5A0";
  return (
    <button
      type="button"
      className="ml-auto rounded-full px-3 py-1 text-[11px]"
      style={{ border: `1px solid ${color}55`, color, background: "transparent", cursor: "pointer" }}
      title={"SYNCED = copied to the server (safe even if this device dies).\nEverything you say is saved ON THIS DEVICE the instant you say it — 'N unsynced' means N rows are still waiting to copy up. It retries by itself; tap to retry right now."}
      onClick={() => { void pullTT(); void flushTT(); }}
    >
      {label}
    </button>
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
            const rs = reviewStateOf(tt.doc, s);
            const chip = rs.state === "capturing" ? { t: "CAPTURING", c: "#3BF5A0" }
              : rs.state === "stale" ? { t: "IDLE", c: NEON.muted as string }
              : rs.state === "queued" ? { t: "QUEUED", c: NEON.muted as string }
              : rs.state === "generating" ? { t: "GENERATING…", c: "#7DD3FC" }
              : rs.state === "ready" ? { t: "READY", c: GOLD }
              : rs.state === "error" ? { t: "ERROR", c: "#F87171" } : null;
            return (
              <button key={s.id} className="flex items-center gap-4 rounded-xl px-4 py-2 text-left" style={{ background: PANEL, border: `1px solid ${EDGE}` }} onClick={() => onOpenSession(s.id)}>
                <div style={{ fontWeight: 700, fontSize: 13, minWidth: 240 }}>{setLabel(s.setName)}</div>
                <div style={{ color: NEON.muted, fontSize: 12 }}>{new Date(s.startedAt).toLocaleString()}</div>
                <div style={{ color: NEON.muted, fontSize: 12 }}>{Math.round(m.durationMs / 60000)}m · {m.segments} segments · {m.words} words</div>
                {board.length > 0 && <div style={{ color: GOLD, fontSize: 11 }}>board: {board.length}</div>}
                {chip && <div className="rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider" style={{ border: `1px solid ${chip.c}55`, color: chip.c }} title={rs.error ?? (rs.state === "stale" ? "Open but nothing captured for over an hour — click to resume; it picks up exactly where you left off." : undefined)}>{chip.t}</div>}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** B7.2 — the style-memory view: one line per note, per output kind, prunable
 *  (archive = prune; never deleted). Pinned comments distill into these. */
function StyleView({ doc }: { doc: TTDoc }) {
  const notes = doc.boardItems.filter((b) => b.kind === "style_note" && !b.archivedAt && b.status !== "archived");
  const kinds = ["script", "exhibit", "memo", "short", "general"];
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ color: NEON.muted, fontSize: 12.5, marginBottom: 14 }}>
        Pinned "remember this" comments distill into these standing rules. Every generation call carries its kind's notes (plus up to 3 recent approved items as examples). Prune freely — archive never deletes.
      </div>
      {notes.length === 0 && <div style={{ color: NEON.muted, fontSize: 14 }}>No style notes yet — 📌 pin a comment on any generated item.</div>}
      {kinds.map((k) => {
        const list = notes.filter((n) => String((n.payload as { forKind?: string }).forKind) === k);
        if (!list.length) return null;
        return (
          <div key={k} className="mb-4">
            <h3 style={{ fontSize: 11, letterSpacing: "0.2em", color: GOLD, textTransform: "uppercase", marginBottom: 6 }}>{k}</h3>
            {list.map((n) => (
              <div key={n.id} className="mb-1 flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: PANEL, border: `1px solid ${EDGE}` }}>
                <div className="min-w-0 flex-1">
                  <div style={{ fontSize: 13, color: CREAM }}>{String((n.payload as { line?: string }).line ?? n.title)}</div>
                  {!!(n.payload as { sourceComment?: string }).sourceComment && (
                    <div style={{ fontSize: 10.5, color: NEON.muted, marginTop: 2 }}>from: “{String((n.payload as { sourceComment?: string }).sourceComment)}”</div>
                  )}
                </div>
                <button className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase" style={{ border: `1px solid ${EDGE}`, color: NEON.muted }}
                  onClick={() => putBoardItem(touchRow(n, { status: "archived" } as Partial<BoardItem>))}>
                  prune
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
