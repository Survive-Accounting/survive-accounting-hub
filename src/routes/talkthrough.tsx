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
// it: sessions, review, the bank, exhibits, style memory.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Wand2, X } from "lucide-react";

import { AdminGate } from "@/components/AdminGate";
import { attachOneTakeBlast, loadBoothBank, runTalkthroughPass, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";
import {
  BOARD_KIND_LABELS, BOARD_KINDS, BOARD_STATUSES, canonicalStamp, stampLabel,
  boardForCeq, listSessions, makeSession, makeTag, newTTId, sessionBoard, sessionMeta,
  sessionSegments, sessionTags, touchRow,
  type BoardItem, type BoardStatus, type TTDoc, type TalkSession,
} from "@/components/canvas/talkthrough";
import { flushTT, pullTT, putBoardItem, putBoardItems, putSession, putTag, startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { drainWhisperQueue } from "@/components/canvas/talkthrough-audio";
import { extractJsonObject, parsePass } from "@/components/canvas/talkthrough-pass";
import { Booth, CREAM, EDGE, GOLD, GhostSweep, PANEL, PathTree, SegmentLine, archiveSegment, boothToPassCeq, setLabel } from "@/components/talkthrough/Booth";
import { PreFlight, ReviewBoardV2 } from "@/components/canvas/ReviewBoard";
import { BankView } from "@/components/canvas/BankView";
import { FilmPicksTray, openFilmMode } from "@/components/canvas/FilmPicks";
import { ExhibitRoom, exhibitSessionId } from "@/components/canvas/ExhibitRoom";
import { queueReview, regenerateReviewItem, reviewStateOf, subscribeReview, sweepStrandedReviews } from "@/components/canvas/talkthrough-review";
import { sumUsage, type AiUsage } from "@/lib/ai-registry";
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
  const label = tt.error ? `⚠ ${tt.error}` : tt.pending > 0 ? `${tt.pending} unsynced${tt.syncing ? " · syncing…" : " · tap to retry"}` : "all synced";
  const color = tt.error ? "#F87171" : tt.pending > 0 ? GOLD : "#3BF5A0";
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

/** B8 — ONE-TAKE BLAST attach: one video, staged upload → the existing Mux
 *  ingest → a DRAFT publication on the deck. No stitch, no trims. */
function AttachTake({ session, doc }: { session: TalkSession; doc: TTDoc }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const existing = doc.boardItems.find((b) => b.kind === "take" && b.sessionId === session.id && !b.archivedAt);
  const pick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setNote(null);
      try {
        setBusy("uploading…");
        const { createPipelineTestStagingUpload } = await import("@/lib/publish.functions");
        const { putSignedUpload } = await import("@/components/canvas/ceq-takes");
        const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase();
        const staged = await createPipelineTestStagingUpload({ data: { ext, folder: "one-take" } });
        const err = await putSignedUpload(staged.path, staged.token, file);
        if (err) throw new Error(err);
        setBusy("ingesting to Mux…");
        const r = await attachOneTakeBlast({ data: { sessionId: session.id, setId: session.setId, stagedUrl: staged.publicUrl, stagedPath: staged.path } });
        const iso = new Date().toISOString();
        putBoardItem({
          id: newTTId("ttb"), sessionId: session.id, runId: "take", kind: "take",
          title: `ONE-TAKE BLAST · ${file.name}`,
          payload: { assetId: r.assetId, playbackId: r.playbackId, muxStatus: r.muxStatus, path: staged.path },
          quote: "", ceqIds: [], status: "approved", comment: "",
          createdAt: iso, updatedAt: iso, syncedAt: null,
        });
        setNote(`✓ draft ONE-TAKE BLAST on the set (Mux ${r.muxStatus})`);
      } catch (e) {
        setNote(`⚠ ${e instanceof Error ? e.message : String(e)}`);
      } finally { setBusy(null); }
    };
    input.click();
  };
  return (
    <span className="flex items-center gap-2">
      <button className="rounded-xl px-3 py-1.5 text-xs font-bold" style={{ border: `1px solid #7DD3FC`, color: busy ? NEON.muted : "#7DD3FC" }} disabled={!!busy} onClick={pick}>
        {busy ?? (existing ? "Attach another take →" : "Attach take →")}
      </button>
      {existing && !note && <span style={{ color: NEON.muted, fontSize: 10.5 }}>1 draft take attached</span>}
      {note && <span style={{ color: note.startsWith("✓") ? "#3BF5A0" : "#F87171", fontSize: 10.5 }}>{note}</span>}
    </span>
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

  // B3 — honest review status + the B0 cost line (studio-only).
  const rs = reviewStateOf(tt.doc, session);
  const V2_KINDS = ["script", "ceq_edit", "idea", "vibe_plan"];
  const v2Items = board.filter((b) => V2_KINDS.includes(b.kind));
  const legacyItems = board.filter((b) => !V2_KINDS.includes(b.kind) && b.kind !== "style_note" && b.kind !== "take");
  const usage = sumUsage(board.map((b) => (b.payload as { _usage?: AiUsage })._usage).filter((u): u is AiUsage => !!u));

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
        <button className="rounded-xl px-3 py-1.5 text-xs font-bold" style={{ border: `1px solid ${GOLD}`, color: GOLD }} onClick={() => openFilmMode(session.setId)}>
          Open film mode →
        </button>
        {rs.state === "ready" && <AttachTake session={session} doc={tt.doc} />}
        <div className="ml-auto flex items-center gap-3">
          {usage.calls > 0 && (
            <span title={`${usage.calls} generation call${usage.calls === 1 ? "" : "s"}`} style={{ color: NEON.muted, fontSize: 11 }}>
              ≈${usage.costUsd.toFixed(3)} · {(usage.inputTokens / 1000).toFixed(1)}k in / {(usage.outputTokens / 1000).toFixed(1)}k out
            </span>
          )}
          {(rs.state === "queued" || rs.state === "generating") && (
            <span className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider" style={{ border: "1px solid #7DD3FC55", color: "#7DD3FC" }}>
              {rs.state === "queued" ? "QUEUED" : "GENERATING…"}
            </span>
          )}
          <button
            className="flex items-center gap-2 rounded-xl px-4 py-2"
            style={{ border: `1.5px solid ${GOLD}`, color: running || rs.state === "generating" ? NEON.muted : GOLD, fontFamily: BIG_FONT, fontWeight: 800 }}
            disabled={running || rs.state === "generating" || rs.state === "queued"}
            onClick={() => queueReview({ session, ceqs: passCeqs, excludedKinds: [], wantVibePlan: tags.some((t) => canonicalStamp(t.tag) === "review_vibe") })}
          >
            <Wand2 className="h-4 w-4" /> {v2Items.length ? "Regenerate review" : "Generate review"}
          </button>
        </div>
      </div>
      {rs.state === "error" && (
        <div className="rounded-xl px-4 py-2" style={{ border: "1px solid #F87171", color: "#F87171", fontSize: 13 }}>
          {rs.error ?? "generation failed"} — the transcript is untouched.
          <button style={{ textDecoration: "underline", marginLeft: 8 }}
            onClick={() => queueReview({ session, ceqs: passCeqs, excludedKinds: [], wantVibePlan: tags.some((t) => canonicalStamp(t.tag) === "review_vibe") })}>
            retry
          </button>
        </div>
      )}
      {passError && (
        <div className="rounded-xl px-4 py-2" style={{ border: "1px solid #F87171", color: "#F87171", fontSize: 13 }}>
          {passError} <button style={{ textDecoration: "underline", marginLeft: 8 }} onClick={() => void runPass()}>retry</button>
        </div>
      )}

      <FilmPicksTray doc={tt.doc} setId={session.setId} setName={setLabel(session.setName)} />

      <div className="flex gap-5" style={{ alignItems: "flex-start" }}>
        <section className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${EDGE}`, width: 460, flexShrink: 0, maxHeight: "70vh", overflowY: "auto" }}>
          <h3 style={{ fontSize: 10.5, letterSpacing: "0.22em", color: NEON.muted, textTransform: "uppercase", marginBottom: 8 }}>Verbatim transcript</h3>
          {segs.length === 0 && <div style={{ color: NEON.muted, fontSize: 13 }}>Nothing captured yet.</div>}
          <GhostSweep doc={tt.doc} sessionId={session.id} />
          <div className="flex flex-col gap-2">
            {segs.map((s) => <SegmentLine key={s.id} seg={s} onDelete={archiveSegment} />)}
          </div>
          {tags.length > 0 && (
            <>
              <h3 style={{ fontSize: 10.5, letterSpacing: "0.22em", color: NEON.muted, textTransform: "uppercase", margin: "14px 0 6px" }}>Moments & quick notes</h3>
              {tags.map((t) => (
                <div key={t.id} style={{ fontSize: 12, color: t.source === "ai" ? GOLD : CREAM, marginBottom: 2 }}>
                  {stampLabel(t.tag)}{t.focusedCeqLabel ? ` · ${t.focusedCeqLabel}` : ""}{t.source === "ai" ? " · AI-proposed" : ""}
                  {t.note && <span style={{ color: NEON.muted }}> — “{t.note}”</span>}
                </div>
              ))}
            </>
          )}
        </section>

        <section className="flex-1">
          {v2Items.length > 0 && (
            <ReviewBoardV2
              items={v2Items}
              ceqs={passCeqs}
              onRegen={(itemId, comment) => regenerateReviewItem(session.id, itemId, passCeqs, comment)}
              film={{ doc: tt.doc, setId: session.setId }}
            />
          )}
          {board.length === 0 ? (
            <div style={{ color: NEON.muted, fontSize: 14, padding: 20 }}>
              No board yet. {session.endedAt ? "Generate the review — every output traces to a verbatim quote." : "End the session (or generate on what's captured so far)."}
            </div>
          ) : legacyItems.length === 0 ? null : (
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
                    const items = legacyItems.filter((b) => b.kind === k);
                    if (!items.length) return null;
                    return (
                      <div key={k} className="mb-4">
                        <h3 style={{ fontSize: 11, letterSpacing: "0.2em", color: GOLD, textTransform: "uppercase", marginBottom: 6 }}>{BOARD_KIND_LABELS[k]}</h3>
                        {items.map((b) => <ItemCard key={b.id} item={b} onRegen={regenItem} />)}
                      </div>
                    );
                  })
                : perCeq
                  ? boardForCeq(legacyItems, perCeq).map((b) => <ItemCard key={b.id} item={b} onRegen={regenItem} />)
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
  pending: NEON.muted as string, approved: "#3BF5A0", archived: "#F87171", in_production: "#7DD3FC", done: "#A78BFA", final: GOLD,
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

