// REVIEW BOARD (B3) — the pre-flight checklist and the v2 board renderer.
// Lives beside the booth route but in its own file: the board is a big,
// self-contained surface (script · CEQ edits · content ideas · vibe plan)
// with APPROVE / ARCHIVE (no reject — archive is recoverable), comments and
// per-item regeneration. APPROVE on a CEQ edit applies to the live bank
// (Lee's click is the authorization); OVERRIDE edits inline through the same
// door. The script card doubles as the printable/side-screen read view.
import { useEffect, useMemo, useState } from "react";
import { Check, Printer, RefreshCw, X } from "lucide-react";

import { applyCeqEdit } from "@/lib/talkthrough.functions";
import { organizeIdea, saveIdea } from "@/lib/ideas.functions";
import { getAdminWho } from "@/components/AdminGate";
import { BIG_FONT, DISPLAY_FONT, NEON } from "./theme";
import {
  STAMP_LABELS, canonicalStamp, sessionTags, stampLabel, touchRow,
  type BoardItem, type TTDoc, type TalkSession, type TalkTag,
} from "./talkthrough";
import { putBoardItem } from "./talkthrough-sync";
import { filmPickOf, toggleFilmPick } from "./FilmPicks";
import {
  clearSessionPhrases, markOf, markPhrase, phraseBankDoc, phraseBankError, sayPhrases, scriptLineId,
  setActivePhraseSession, startPhraseBank, subscribePhraseBank, type PhraseBankDoc,
} from "./phrase-bank";
import { pinStyleNote } from "./talkthrough-review";
import type { MicroEditProposal, PassCeq } from "./talkthrough-pass";

const CREAM = "#F4EFE6";
const GOLD = "#FCA311";
const PANEL = "rgba(16,24,44,0.9)";
const EDGE = "rgba(244,239,230,0.16)";

// ─────────────────────────────────────────────────────────── pre-flight

export function PreFlight({ doc, session, onGo, onCancel }: {
  doc: TTDoc; session: TalkSession;
  onGo: (excludedKinds: string[], wantVibePlan: boolean) => void;
  onCancel: () => void;
}) {
  const tags = sessionTags(doc, session.id).filter((t) => t.source === "tap");
  const counts = useMemo(() => {
    const m = new Map<string, { n: number; stars: number }>();
    for (const t of tags) {
      const k = canonicalStamp(t.tag);
      if (!k) continue;
      const e = m.get(k) ?? { n: 0, stars: 0 };
      if (t.starred) e.stars += 1; else e.n += 1;
      m.set(k, e);
    }
    return m;
  }, [tags]);
  const kinds = [...counts.keys()];
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const wantVibe = counts.has("review_vibe") && !excluded.has("review_vibe");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: "rgba(4,7,14,0.72)" }} onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: "#0b1020", border: `1px solid ${EDGE}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 17, color: CREAM }}>End Session → Review</div>
        <div style={{ color: NEON.muted, fontSize: 12, marginTop: 4 }}>
          Everything checked goes into the pass. Uncheck to exclude. The script is always generated.
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          {kinds.length === 0 && <div style={{ color: NEON.muted, fontSize: 13 }}>No stamps pressed — the pass will still draft the script from the transcript.</div>}
          {kinds.map((k) => {
            const c = counts.get(k)!;
            const off = excluded.has(k);
            return (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: off ? "transparent" : PANEL, border: `1px solid ${off ? "transparent" : EDGE}` }}>
                <input type="checkbox" checked={!off} onChange={() => setExcluded((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />
                <span style={{ color: CREAM, fontSize: 13, fontWeight: 700 }}>{STAMP_LABELS[k as never] ?? k}</span>
                <span style={{ color: NEON.muted, fontSize: 11.5 }}>× {c.n}</span>
                {c.stars > 0 && <span style={{ color: GOLD, fontSize: 11.5 }}>★ {c.stars}</span>}
              </label>
            );
          })}
        </div>
        <div className="mt-5 flex items-center gap-2">
          <button className="flex-1 rounded-xl px-4 py-2.5" style={{ background: GOLD, color: "#0B1322", fontFamily: BIG_FONT, fontWeight: 800, fontSize: 14 }}
            onClick={() => onGo([...excluded], wantVibe)}>
            GO — generate in the background
          </button>
          <button className="rounded-xl px-3 py-2.5 text-xs" style={{ border: `1px solid ${EDGE}`, color: NEON.muted }} onClick={onCancel}>Keep talking</button>
        </div>
        <div style={{ color: NEON.muted, fontSize: 10.5, marginTop: 8 }}>
          You can open the next set immediately — the sessions list shows QUEUED · GENERATING · READY.
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────── shared item chrome

function ItemShell({ item, children, onRegen, printable, film, onAddSlide }: {
  item: BoardItem; children: React.ReactNode;
  onRegen?: (comment: string) => Promise<void>;
  printable?: boolean;
  /** B5 — when set, the 🎬 INCLUDE-IN-VIDEO toggle targets this set. */
  film?: { doc: TTDoc; setId: string };
  /** THE REVIEW DECK (2026-09-03): "＋ slide" drops this idea onto the film draft. */
  onAddSlide?: () => void;
}) {
  const [slid, setSlid] = useState(false);
  const [comment, setComment] = useState(item.comment);
  const [busy, setBusy] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const saveComment = () => { if (comment !== item.comment) putBoardItem(touchRow(item, { comment } as Partial<BoardItem>)); };
  const setStatus = (s: "approved" | "archived" | "in_production") =>
    putBoardItem(touchRow(item, { status: item.status === s ? "suggested" : s } as Partial<BoardItem>));
  const archived = item.status === "archived";
  const queued = item.status === "in_production";
  // → IDEA BANK (Lee, 2026-09-03): a suggested slide, CEQ edit or content
  // idea from the talkthrough becomes an idea in the bank — AI titles and
  // files it, Obsidian gets the note, the production queue sees it. The
  // board item is untouched; the bank entry remembers where it came from.
  const [banked, setBanked] = useState<"no" | "busy" | "yes" | "err">("no");
  // → PRODUCTION (Lee, 2026-09-03): the same idea, flagged as content to
  // film — it shows under 🎬 Production queue in the bank, not Open.
  const [produced, setProduced] = useState<"no" | "busy" | "yes" | "err">("no");
  const toBank = (production = false) => {
    const setState = production ? setProduced : setBanked;
    if ((production ? produced : banked) !== "no") return;
    setState("busy");
    const p = item.payload as Record<string, unknown>;
    const detail = String(p.body ?? p.proposal ?? p.pitch ?? p.summary ?? p.meaning ?? p.instruction ?? "");
    const id = `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    saveIdea({ data: {
      id,
      title: item.title,
      body: [item.title, detail, item.quote ? `In Lee's words: "${item.quote}"` : ""].filter(Boolean).join("\n\n"),
      categories: ["AUTHORING"],
      subcategory: String(p.kind ?? item.kind).replace(/_/g, " "),
      status: "IDEA",
      sourcePath: typeof location !== "undefined" ? location.pathname : "/talkthrough",
      context: { title: typeof document !== "undefined" ? document.title : "", fromBoardItem: item.id, boardKind: String(p.kind ?? item.kind), origin: "talkthrough-review", ...(production ? { production: "1" } : {}) },
      promptMd: null, promptFilename: null,
      createdBy: getAdminWho() ?? "",
      sourceKind: "web", attachments: [], audioPath: null, transcriptStatus: null,
    } })
      .then(() => { setState("yes"); organizeIdea({ data: { id, draftPrompt: !production } }).catch(() => { /* the idea is saved; organise again from the bank */ }); })
      .catch(() => setState("err"));
  };
  return (
    <div className="mb-2 rounded-2xl p-4 tt-item" style={{ background: PANEL, border: `1px solid ${item.status === "approved" ? "rgba(59,245,160,0.4)" : EDGE}`, opacity: archived ? 0.55 : 1 }}>
      <div className="flex items-center gap-2">
        <div style={{ fontWeight: 700, fontSize: 14, color: CREAM }}>{item.title}</div>
        <div className="ml-auto flex gap-1 tt-chrome">
          {film && item.status === "approved" && (
            <button
              title={filmPickOf(item)?.setId === film.setId ? "In the film picks — click to remove" : "INCLUDE IN VIDEO for this set"}
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={filmPickOf(item)?.setId === film.setId ? { background: GOLD, color: "#0B1322" } : { border: `1px solid ${EDGE}`, color: NEON.muted }}
              onClick={() => toggleFilmPick(film.doc, item, film.setId)}
            >
              🎬
            </button>
          )}
          {printable && (
            <button title="Print / side-screen view" className="rounded-full px-2 py-0.5" style={{ border: `1px solid ${EDGE}`, color: NEON.muted }} onClick={() => window.print()}>
              <Printer className="h-3 w-3" />
            </button>
          )}
          <button className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={item.status === "approved" ? { background: "#3BF5A0", color: "#0B1322" } : { border: `1px solid ${EDGE}`, color: "#3BF5A0" }}
            onClick={() => setStatus("approved")}>
            {item.status === "approved" ? "✓ approved" : "approve"}
          </button>
          {onAddSlide && (
            <button className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              title={slid ? "On the film draft — it's a slide now (added again if you click again)" : "Add this to the film draft as a slide, after the selected one"}
              style={slid ? { background: GOLD, color: "#0B1322" } : { border: `1px solid ${GOLD}`, color: GOLD }}
              onClick={() => { onAddSlide(); setSlid(true); }}>
              {slid ? "✓ slide added" : "＋ slide"}
            </button>
          )}
          {/* → QUEUE (Lee, 2026-09-02): push an idea to the production queue
              on /v3 — status "in production", the bank's own lifecycle step. */}
          <button className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            title={queued ? "In the production queue (/v3) — click to take it back out" : "Push to the production queue on /v3"}
            style={queued ? { background: GOLD, color: "#0B1322" } : { border: `1px solid ${EDGE}`, color: GOLD }}
            onClick={() => setStatus("in_production")}>
            {queued ? "✓ queued" : "→ queue"}
          </button>
          <button className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            title={banked === "yes" ? "In the Idea Bank — AI is naming and filing it; Obsidian gets the note" : "Send to the Idea Bank (and Obsidian) as an idea to build"}
            style={banked === "yes" ? { background: "#7DD3FC", color: "#0B1322" } : { border: `1px solid ${EDGE}`, color: banked === "err" ? "#F87171" : "#7DD3FC" }}
            onClick={() => toBank(false)}>
            {banked === "busy" ? "…" : banked === "yes" ? "✓ in the bank" : banked === "err" ? "bank failed" : "→ idea bank"}
          </button>
          <button className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            title={produced === "yes" ? "In the production queue (Idea Bank → 🎬 Production queue)" : "Send to the production queue — content to film"}
            style={produced === "yes" ? { background: "#3BF5A0", color: "#0B1322" } : { border: `1px solid ${EDGE}`, color: produced === "err" ? "#F87171" : "#3BF5A0" }}
            onClick={() => toBank(true)}>
            {produced === "busy" ? "…" : produced === "yes" ? "✓ in production" : produced === "err" ? "failed" : "→ production"}
          </button>
          <button className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={archived ? { background: "#F87171", color: "#0B1322" } : { border: `1px solid ${EDGE}`, color: NEON.muted }}
            onClick={() => setStatus("archived")}>
            {archived ? "archived" : "archive"}
          </button>
        </div>
      </div>
      <div className="mt-2" style={{ fontSize: 13, lineHeight: 1.5, color: CREAM }}>{children}</div>
      {item.quote && <div className="mt-2 tt-chrome" style={{ fontSize: 12, fontStyle: "italic", color: NEON.muted, borderLeft: `2px solid ${GOLD}66`, paddingLeft: 8 }}>“{item.quote}”</div>}
      {onRegen && (
        <div className="mt-3 flex items-center gap-2 tt-chrome">
          <input value={comment} placeholder="your note on this item…" onChange={(e) => setComment(e.target.value)} onBlur={saveComment}
            style={{ flex: 1, background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 8, color: CREAM, fontSize: 12, padding: "6px 10px" }} />
          <button
            title='PIN "remember this" — distill into a standing style note for this output kind'
            className="rounded-lg px-2 py-1.5 text-xs"
            style={{ border: `1px solid ${EDGE}`, color: pinned ? GOLD : NEON.muted }}
            disabled={busy || !comment.trim()}
            onClick={() => { setBusy(true); setErr(null); pinStyleNote(item, comment).then(() => setPinned(true)).catch((e) => setErr(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false)); }}
          >
            📌
          </button>
          <button className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs" style={{ border: `1px solid ${GOLD}88`, color: busy ? NEON.muted : GOLD }} disabled={busy}
            onClick={() => { saveComment(); setBusy(true); setErr(null); onRegen(comment).catch((e) => setErr(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false)); }}>
            <RefreshCw className="h-3 w-3" /> {busy ? "regenerating…" : "Regenerate with my notes"}
          </button>
        </div>
      )}
      {err && <div className="mt-1 flex items-center gap-1 tt-chrome" style={{ color: "#F87171", fontSize: 11 }}><X className="h-3 w-3" />{err}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────── kind renders

// SAY IT / SHOW THIS — the marking layer on the script's spoken lines.
// Click a line = SAY IT (yellow); it banks, in click order, and appears in
// the teleprompter window. Shift-click = SHOW THIS (blue); a visual note that
// NEVER reaches the prompter. Marks live in phrase-bank.ts, which the
// /v3/teleprompter window mirrors.
const SAY_BG = "#FDE68A";
const SHOW_BG = "#BFDBFE";

function ScriptCard({ item, onRegen, film }: { item: BoardItem; onRegen: (c: string) => Promise<void>; film?: { doc: TTDoc; setId: string } }) {
  const p = item.payload as { beats?: { title: string; coversCeqIds: string[]; voice: string[]; emphasize: string; notes: string }[]; triggerWords?: string[]; compareContrasts?: string[] };
  const [bank, setBank] = useState<PhraseBankDoc>(() => phraseBankDoc());
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    startPhraseBank();
    setActivePhraseSession(item.sessionId);
    return subscribePhraseBank(setBank);
  }, [item.sessionId]);

  const banked = sayPhrases(bank, item.sessionId);
  const err = phraseBankError();

  const clickLine = (id: string, text: string, shift: boolean) =>
    markPhrase({ id, sessionId: item.sessionId, text, mark: shift ? "show" : "say" });

  return (
    <ItemShell item={item} onRegen={onRegen} printable film={film}>
      <div className="tt-chrome mb-2 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ border: `1px dashed ${EDGE}` }}>
        <span style={{ fontSize: 11, color: NEON.muted }}>
          Click a line → <b style={{ color: SAY_BG }}>SAY IT</b> (banks for the teleprompter) · Shift-click → <b style={{ color: SHOW_BG }}>SHOW THIS</b> (visual only, never banked)
        </span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: banked.length ? GOLD : "transparent", color: banked.length ? "#0B1322" : NEON.muted, border: banked.length ? "none" : `1px solid ${EDGE}` }}>
          {banked.length} banked
        </span>
        <button
          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ border: `1px solid ${GOLD}`, color: GOLD }}
          title="Open the mirrored teleprompter in its own window — Enter next, Shift+Enter back, ` to the top"
          onClick={() => window.open("/v3/teleprompter", "sa-teleprompter", "width=560,height=940")}
        >
          ▶ Teleprompter ↗
        </button>
        <button
          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ border: `1px solid ${confirmClear ? "#F87171" : EDGE}`, color: confirmClear ? "#F87171" : NEON.muted }}
          title="Empty this session's banked phrases so the next video starts clean"
          onClick={() => {
            if (!confirmClear) { setConfirmClear(true); return; }
            clearSessionPhrases(item.sessionId);
            setConfirmClear(false);
          }}
        >
          {confirmClear ? "click again to empty the bank" : "empty bank"}
        </button>
      </div>
      {err && <div className="tt-chrome mb-2" style={{ color: "#F87171", fontSize: 11.5 }}>⚠ {err}</div>}
      {(p.beats ?? []).map((b, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 14.5 }}>{i + 1}. {b.title} <span style={{ color: NEON.muted, fontSize: 11, fontWeight: 400 }}>({b.coversCeqIds.length} CEQs)</span></div>
          {b.voice.map((v, j) => {
            const id = scriptLineId(item.id, i, j);
            const m = markOf(bank, id);
            const order = m === "say" ? banked.findIndex((x) => x.id === id) + 1 : 0;
            return (
              <div
                key={j}
                role="button"
                tabIndex={0}
                title={m === "say" ? "SAY IT — banked for the teleprompter. Shift-click to make it SHOW THIS instead." : m === "show" ? "SHOW THIS — a visual, not spoken. Click to bank it as SAY IT instead." : "Click to bank as SAY IT · Shift-click to mark SHOW THIS"}
                onClick={(e) => clickLine(id, v, e.shiftKey)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clickLine(id, v, e.shiftKey); } }}
                style={{
                  fontSize: 13.5, margin: "3px 0 3px 10px", borderLeft: `2px solid ${GOLD}`, paddingLeft: 8,
                  cursor: "pointer", borderRadius: 4,
                  background: m === "say" ? SAY_BG : m === "show" ? SHOW_BG : "transparent",
                  color: m ? "#0B1322" : CREAM,
                  fontWeight: m === "say" ? 700 : 400,
                  paddingTop: m ? 2 : 0, paddingRight: m ? 6 : 0, paddingBottom: m ? 2 : 0,
                }}
              >
                {order > 0 && <span className="tt-chrome" style={{ fontSize: 10, fontWeight: 900, marginRight: 5, opacity: 0.55 }}>{order}.</span>}
                “{v}”
              </div>
            );
          })}
          {b.emphasize && <div style={{ color: GOLD, fontSize: 12, marginLeft: 10 }}>▲ emphasize: {b.emphasize}</div>}
          {b.notes && <div style={{ color: NEON.muted, fontSize: 12, marginLeft: 10 }}>{b.notes}</div>}
        </div>
      ))}
      {!!p.triggerWords?.length && <div style={{ fontSize: 12 }}><b style={{ color: GOLD }}>Trigger words:</b> {p.triggerWords.join(" · ")}</div>}
      {!!p.compareContrasts?.length && <div style={{ fontSize: 12, marginTop: 2 }}><b style={{ color: "#7DD3FC" }}>Compare/contrast:</b> {p.compareContrasts.join(" · ")}</div>}
    </ItemShell>
  );
}

function CeqEditCard({ item, ceq, onRegen }: { item: BoardItem; ceq: PassCeq | null; onRegen: (c: string) => Promise<void> }) {
  const p = item.payload as { state?: string; error?: string; instruction?: string; proposed?: MicroEditProposal; current?: { stem: string; choices: { text: string; correct: boolean; feedback?: string | null }[] } };
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [stem, setStem] = useState<string>(p.proposed?.proposedStem ?? p.current?.stem ?? ceq?.stem ?? "");
  const [choices, setChoices] = useState(() => (p.proposed?.proposedChoices ?? p.current?.choices ?? ceq?.choices ?? []).map((c) => ({ text: c.text, correct: c.correct, feedback: (c as { feedback?: string | null }).feedback ?? null })));

  const apply = async (s: string | null, ch: typeof choices | null) => {
    if (!item.ceqIds[0]) return;
    setApplying(true); setErr(null);
    try {
      await applyCeqEdit({ data: { ceqNodeId: item.ceqIds[0], ...(s ? { stem: s } : {}), ...(ch ? { choices: ch } : {}) } });
      putBoardItem(touchRow(item, { status: "approved", payload: { ...item.payload, state: "applied" } } as Partial<BoardItem>));
      setApplied(true);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setApplying(false); }
  };

  return (
    <ItemShell item={item} onRegen={onRegen}>
      {p.instruction && <div style={{ fontSize: 11.5, color: NEON.muted, marginBottom: 6 }}>Lee said: “{p.instruction}”</div>}
      {p.state === "drafting" && <div style={{ color: "#7DD3FC", fontSize: 12 }}>✎ drafting in the background…</div>}
      {p.state === "error" && <div style={{ color: "#F87171", fontSize: 12 }}>{p.error} — use Regenerate below.</div>}
      {(p.state === "ready" || p.state === "applied" || p.proposed) && p.proposed && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: "0.18em", color: NEON.muted, textTransform: "uppercase", fontWeight: 900 }}>Current</div>
            <div style={{ fontSize: 12.5, marginTop: 3 }}>{p.current?.stem ?? ceq?.stem}</div>
            {(p.current?.choices ?? ceq?.choices ?? []).map((c, i) => (
              <div key={i} style={{ fontSize: 11.5, color: c.correct ? "#3BF5A0" : NEON.muted }}>{String.fromCharCode(65 + i)}. {c.text}{c.correct ? " ✓" : ""}</div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: "0.18em", color: GOLD, textTransform: "uppercase", fontWeight: 900 }}>Proposed</div>
            {!editing ? (
              <>
                <div style={{ fontSize: 12.5, marginTop: 3, cursor: "pointer" }} title="Click to override" onClick={() => setEditing(true)}>
                  {p.proposed.proposedStem ?? <span style={{ color: NEON.muted }}>(stem unchanged)</span>}
                </div>
                {(p.proposed.proposedChoices ?? []).map((c, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: c.correct ? "#3BF5A0" : CREAM, cursor: "pointer" }} title="Click to override" onClick={() => setEditing(true)}>
                    {String.fromCharCode(65 + i)}. {c.text}{c.correct ? " ✓" : ""}
                  </div>
                ))}
                {!p.proposed.proposedChoices && <div style={{ fontSize: 11, color: NEON.muted }}>(choices unchanged)</div>}
                {p.proposed.note && <div style={{ fontSize: 10.5, color: NEON.muted, marginTop: 3 }}>{p.proposed.note}</div>}
              </>
            ) : (
              <div className="mt-1 flex flex-col gap-1">
                <textarea value={stem} rows={2} onChange={(e) => setStem(e.target.value)}
                  style={{ background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 8, color: CREAM, fontSize: 12, padding: "4px 8px" }} />
                {choices.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input type="radio" name={`correct-${item.id}`} checked={c.correct} onChange={() => setChoices((p2) => p2.map((x, j) => ({ ...x, correct: j === i })))} title="Correct answer" />
                    <input value={c.text} onChange={(e) => setChoices((p2) => p2.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                      style={{ flex: 1, background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 6, color: CREAM, fontSize: 11.5, padding: "3px 6px" }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {(p.proposed || editing) && !applied && (
        <div className="mt-3 flex items-center gap-2">
          {!editing ? (
            <button className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: "#3BF5A0", color: "#0B1322", opacity: applying ? 0.6 : 1 }} disabled={applying}
              onClick={() => void apply(p.proposed?.proposedStem ?? null, p.proposed?.proposedChoices ?? null)}>
              <Check className="h-3 w-3" /> {applying ? "applying…" : "APPROVE — apply to the bank"}
            </button>
          ) : (
            <>
              <button className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: GOLD, color: "#0B1322", opacity: applying ? 0.6 : 1 }} disabled={applying}
                onClick={() => void apply(stem, choices)}>
                {applying ? "saving…" : "Save override → bank"}
              </button>
              <button className="text-xs" style={{ color: NEON.muted, textDecoration: "underline" }} onClick={() => setEditing(false)}>cancel</button>
            </>
          )}
        </div>
      )}
      {applied && <div className="mt-2" style={{ color: "#3BF5A0", fontSize: 12 }}>✓ applied to the bank</div>}
      {err && <div className="mt-1" style={{ color: "#F87171", fontSize: 11 }}>{err}</div>}
    </ItemShell>
  );
}

function IdeaCard({ item, onRegen, film, onAddSlide }: {
  item: BoardItem; onRegen: (c: string) => Promise<void>; film?: { doc: TTDoc; setId: string };
  onAddSlide?: (kind: string, text: string, itemId: string) => void;
}) {
  const p = item.payload as { kind?: string; body?: string; origin?: string; visualKind?: string };
  const ai = p.origin === "ai";
  return (
    <ItemShell item={item} onRegen={onRegen} film={film} onAddSlide={onAddSlide ? () => onAddSlide(p.kind ?? "idea", p.body ?? item.title, item.id) : undefined}>
      {/* WHO IT CAME FROM (Lee, 2026-09-03): a person for his stamps, the AI
          mark for the model's own suggestions — "some way to know who it came from". */}
      <span title={ai ? "AI suggested — not from a stamp" : "From your stamp, cleaned up"} style={{ marginRight: 6, fontSize: 12 }}>{ai ? "✨" : "🧑‍🏫"}</span>
      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ border: `1px solid ${EDGE}`, color: GOLD, marginRight: 6 }}>{stampLabel(p.kind ?? "idea")}</span>
      {p.visualKind && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ border: `1px solid ${EDGE}`, color: NEON.muted, marginRight: 6 }}>{p.visualKind}</span>}
      {p.body ?? ""}
    </ItemShell>
  );
}

function VibePlanCard({ item, onRegen }: { item: BoardItem; onRegen: (c: string) => Promise<void> }) {
  const p = item.payload as { beats?: { title: string; why: string; talkPrompt: string; quote: string }[] };
  return (
    <ItemShell item={item} onRegen={onRegen}>
      {(p.beats ?? []).map((b, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <b>{i + 1}. {b.title}</b>
          <div style={{ color: NEON.muted, fontSize: 12 }}>{b.why}</div>
          {b.talkPrompt && <div style={{ color: "#3BF5A0", fontSize: 12 }}>TALK: “{b.talkPrompt}”</div>}
        </div>
      ))}
    </ItemShell>
  );
}

// ───────────────────────────────────────────────────────────── the board

export function ReviewBoardV2({ items, ceqs, onRegen, film, onAddSlide }: {
  items: BoardItem[];
  ceqs: PassCeq[];
  onRegen: (itemId: string, comment: string) => Promise<void>;
  /** B5 — enables the 🎬 pick toggle, targeting this set. */
  film?: { doc: TTDoc; setId: string };
  /** THE REVIEW DECK (2026-09-03): idea cards get "＋ slide". */
  onAddSlide?: (kind: string, text: string, itemId: string) => void;
}) {
  const script = items.filter((b) => b.kind === "script");
  const edits = items.filter((b) => b.kind === "ceq_edit");
  const ideas = items.filter((b) => b.kind === "idea");
  const vibes = items.filter((b) => b.kind === "vibe_plan");
  // Lee's stamps on top, grouped by kind; the model's own suggestions in one
  // fold at the bottom (Lee, 2026-09-03: "a separate sort of toggle at the
  // bottom of AI suggested stuff").
  const isAi = (i: BoardItem) => (i.payload as { origin?: string }).origin === "ai";
  const byKind = new Map<string, BoardItem[]>();
  for (const i of ideas.filter((x) => !isAi(x))) {
    const k = String((i.payload as { kind?: string }).kind ?? "idea");
    byKind.set(k, [...(byKind.get(k) ?? []), i]);
  }
  const aiIdeas = ideas.filter(isAi);
  const regen = (id: string) => (c: string) => onRegen(id, c);
  const ceqOf = (b: BoardItem) => ceqs.find((c) => c.id === b.ceqIds[0]) ?? null;
  return (
    <>
      {script.map((b) => (
        <div key={b.id} className="mb-4">
          <h3 style={{ fontSize: 11, letterSpacing: "0.2em", color: GOLD, textTransform: "uppercase", marginBottom: 6 }}>The Script</h3>
          <ScriptCard item={b} onRegen={regen(b.id)} film={film} />
        </div>
      ))}
      {edits.length > 0 && (
        <div className="mb-4">
          <h3 style={{ fontSize: 11, letterSpacing: "0.2em", color: GOLD, textTransform: "uppercase", marginBottom: 6 }}>CEQ edits</h3>
          {edits.map((b) => <CeqEditCard key={b.id} item={b} ceq={ceqOf(b)} onRegen={regen(b.id)} />)}
        </div>
      )}
      {[...byKind.entries()].map(([k, list]) => (
        <div key={k} className="mb-4">
          <h3 style={{ fontSize: 11, letterSpacing: "0.2em", color: GOLD, textTransform: "uppercase", marginBottom: 6 }}>{stampLabel(k)}s</h3>
          {list.map((b) => <IdeaCard key={b.id} item={b} onRegen={regen(b.id)} film={film} onAddSlide={onAddSlide} />)}
        </div>
      ))}
      {aiIdeas.length > 0 && (
        <details className="mb-4" style={{ border: `1px solid ${EDGE}`, borderRadius: 12, padding: "8px 12px" }}>
          <summary style={{ cursor: "pointer", fontSize: 11, letterSpacing: "0.2em", color: NEON.muted, textTransform: "uppercase" }}>
            ✨ AI suggested ({aiIdeas.length}) — not from a stamp; take them or leave them
          </summary>
          <div style={{ marginTop: 8 }}>
            {aiIdeas.map((b) => <IdeaCard key={b.id} item={b} onRegen={regen(b.id)} film={film} onAddSlide={onAddSlide} />)}
          </div>
        </details>
      )}
      {vibes.length > 0 && (
        <div className="mb-4">
          <h3 style={{ fontSize: 11, letterSpacing: "0.2em", color: GOLD, textTransform: "uppercase", marginBottom: 6 }}>Vibe plan</h3>
          {vibes.map((b) => <VibePlanCard key={b.id} item={b} onRegen={regen(b.id)} />)}
        </div>
      )}
      {/* PRINT: the script is the page; board chrome disappears (B5.4 read view). */}
      <style>{`@media print {
        body * { visibility: hidden; }
        .tt-item, .tt-item * { visibility: visible; }
        .tt-item .tt-chrome, .tt-item .tt-chrome * { display: none !important; }
        .tt-item { position: static !important; background: #fff !important; color: #000 !important; border: none !important; }
      }`}</style>
    </>
  );
}

