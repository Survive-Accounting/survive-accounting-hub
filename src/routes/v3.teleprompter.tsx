// /v3/teleprompter — THE PROMPTER WINDOW. Two modes:
//
// ?set=<deckId> (2026-09-03, the v3 film surface): the lines Lee kept on the
// Review step (frame.prompter on the Blast Off plan — since 2026-09-07 those lines are made on
// Rehearse & Film, rounds + the rehearsal review, not on the Editor) for whichever frame is
// UP — the Studio publishes the active frame to localStorage "sa-film-active"
// and this window follows it. Nothing to click; it just keeps up. Since
// 2026-09-04 /film publishes the same record (capture/prompter-sync.ts), and
// since 2026-09-06 this is the window capture/teleprompter-popout.ts opens
// beside the 9:16 film pop-out, which hides its own in-page prompter panel.
//
// KEYWORD MODE (2026-09-07). Lee: "we're putting together a teleprompter, with literal lines,
// but a quick bullet list, or even just a handful of single words, that capture the main point
// of what the line is saying (e.g. Internal = inside) or whatever, so I can scan a teleprompter
// and get what I need. If I am really stuck, then I can just read verbatim, all chill." So a
// "lines | keywords" toggle in the corner (localStorage sa-prompter-mode): keywords shows
// frame.prompterKeys one fragment per row, big, with the hand-off (frame.prompterTransition)
// last in gold; lines is the verbatim view, unchanged. Untouched, the toggle defaults to
// keywords whenever the slide has them — that's the scan Lee asked for — and lines otherwise.
//
// THE TIMING MARKS (2026-09-07). Lee: "With the teleprompter, I can even highlight pieces of a
// line that are like when the transition takes place. A big part of my teaching style that hits
// so hard is my TIMING for moving a slide at the perfect emphasis moment… I can have the
// teleprompter have a certain piece highlighted, so already know it's coming and I can really
// make it land. I could even 'double highlight' the word I want to transition on. So it's like
// transition phrase is yellow but the word itself is orange." frame.prompterMarks, painted by
// lib/prompter-marks.ts (the same painter the review and the /film panel use): in lines mode
// the phrase is gold behind the words and the cue word solid orange, navy, bold; in keywords
// mode the hand-off row stays gold and the cue word is orange wherever it appears — in that
// row or in a fragment.
//
// No ?set: the older phrase-bank mirror — the results board's banked script
// lines, one at a time, Enter / Shift+Enter / ` to walk them.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import {
  clampIndex, phraseBankDoc, phraseBankError, sayPhrases, startPhraseBank, stepIndex,
  subscribePhraseBank, type PhraseBankDoc,
} from "@/components/canvas/phrase-bank";
import { isTypingTarget } from "@/components/canvas/film-lock";
import { loadBlastPlan, type BlastFrameRow } from "@/lib/blastoff.functions";
import { markStyle, paintLine } from "@/lib/prompter-marks";
import { FRAME_LABEL, type PrompterMarks } from "@/components/blastoff/plan";

/** A prompter row with its marks painted — every renderer here goes through this. */
function Marked({ text, marks }: { text: string; marks: PrompterMarks | undefined }) {
  return <>{paintLine(text, marks).map((s, i) => <span key={i} style={markStyle(s.tone)}>{s.text}</span>)}</>;
}

export const Route = createFileRoute("/v3/teleprompter")({
  validateSearch: (s: Record<string, unknown>): { set?: string } => (typeof s.set === "string" && s.set ? { set: s.set } : {}),
  component: () => <AdminGate><TeleprompterRoute /></AdminGate>,
  head: () => ({ meta: [{ title: "Teleprompter" }, { name: "robots", content: "noindex" }] }),
});

function TeleprompterRoute() {
  const { set } = Route.useSearch();
  return set ? <FramePrompter setId={set} /> : <Teleprompter />;
}

/** Lee films from a few feet back. 4rem was the brief's floor; the phrase
 *  starts bigger and steps DOWN only when it is long enough that the big size
 *  would push it off the window. Change BASE_REM if the distance changes. */
const BASE_REM = 6;
const MIN_REM = 3;
function fontRem(text: string): number {
  const n = text.length;
  if (n <= 40) return BASE_REM;
  if (n <= 80) return 5;
  if (n <= 140) return 4;
  return MIN_REM;
}

// ---------------------------------------------------- the v3 frame prompter

interface FilmActive { setId: string; qId: string | null; at: number }
const readActive = (): FilmActive | null => {
  try { const v = JSON.parse(localStorage.getItem("sa-film-active") ?? "null") as FilmActive | null; return v && typeof v.setId === "string" ? v : null; } catch { return null; }
};

type PrompterMode = "lines" | "keywords";
const MODE_KEY = "sa-prompter-mode";
const readMode = (): PrompterMode | null => {
  try { const v = localStorage.getItem(MODE_KEY); return v === "lines" || v === "keywords" ? v : null; } catch { return null; }
};

/** The mode that shows — Lee's saved choice, else keywords when the slide has any. */
function prompterModeFor(stored: PrompterMode | null, keys: readonly string[] | undefined): PrompterMode {
  if (stored) return stored;
  return keys && keys.length > 0 ? "keywords" : "lines";
}

/** The plan frame behind a canvas node id: a set card by ceqId, an insert by
 *  the node the sync wrote for it ("blast-<frame id>"). */
export function frameForNode(frames: readonly BlastFrameRow[], qId: string | null): BlastFrameRow | null {
  if (!qId) return null;
  return frames.find((f) => (f.kind === "ceq" && f.ceqId === qId) || `blast-${f.id}` === qId) ?? null;
}

function FramePrompter({ setId }: { setId: string }) {
  const [frames, setFrames] = useState<BlastFrameRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<FilmActive | null>(() => readActive());

  // POPOUT (2026-09-06, Lee: "prompter appears in the popped out one, it's in the way of
  // filming. Can we have a popout for teleprompter too?"). Opened as its own window now, so it
  // sits open through a whole rehearse → review → film session — a one-shot load would go stale
  // the moment Lee commits a new line via Review after this window was already up. Cheap (a
  // read) and small (a few seconds), so a plain poll beats wiring a second live-update channel.
  useEffect(() => {
    let live = true;
    const load = () => loadBlastPlan({ data: { setId } })
      // A poll that succeeds clears whatever the last failed one raised — otherwise one Wi-Fi
      // blip left the red banner up for the rest of the filming session (audit 2026-09-06).
      .then((p) => { if (live) { setFrames(p?.frames ?? []); setErr(null); } })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    load();
    const id = window.setInterval(load, 4000);
    return () => { live = false; window.clearInterval(id); };
  }, [setId]);

  // Follow the Studio: the storage event fires across windows; the poll
  // covers the same-window case and a missed event.
  useEffect(() => {
    const tick = () => setActive((prev) => { const n = readActive(); return n && (!prev || n.at !== prev.at || n.qId !== prev.qId) ? n : prev; });
    const id = window.setInterval(tick, 500);
    window.addEventListener("storage", tick);
    return () => { window.clearInterval(id); window.removeEventListener("storage", tick); };
  }, []);

  const frame = frames && active && active.setId === setId ? frameForNode(frames, active.qId) : null;
  const lines = frame?.prompter ?? [];
  const keys = frame?.prompterKeys ?? [];
  const idx = frame && frames ? frames.indexOf(frame) : -1;
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const rem = Math.max(MIN_REM, Math.min(BASE_REM, fontRem(" ".repeat(longest)) - Math.max(0, lines.length - 2) * 0.6));

  // THE MODE: Lee's saved pick, else keywords when this slide has them. A slide without
  // keywords in keywords mode falls back to its lines rather than showing nothing.
  const [stored, setStored] = useState<PrompterMode | null>(() => readMode());
  const mode = prompterModeFor(stored, keys);
  const setMode = (m: PrompterMode) => { setStored(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } };
  const showKeys = mode === "keywords" && keys.length > 0;
  const transition = frame?.prompterTransition ?? "";
  const marks = frame?.prompterMarks;
  // Keywords mode paints ONLY the cue word (the phrase belongs to the verbatim line; the gold
  // hand-off row already is the phrase's job there).
  const cueOnly: PrompterMarks | undefined = marks?.word ? { word: marks.word } : undefined;
  // Keywords are short by design (≤ 6 words each) — they hold the big size until the list is
  // long enough that it would run off the window.
  const keyRem = Math.max(MIN_REM, BASE_REM - Math.max(0, keys.length + (transition ? 1 : 0) - 3) * 0.7);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#FFFFFF", color: "#000000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4vh 4vw", textAlign: "center", userSelect: "none" }}>
      {err && <div style={{ position: "absolute", top: 10, left: 12, right: 12, color: "#B91C1C", fontSize: 14, fontWeight: 700 }}>⚠ {err}</div>}
      <div style={{ position: "absolute", top: 10, right: 12, display: "flex", gap: 2, fontSize: 12, fontWeight: 700, color: "#9CA3AF" }} title="lines = read it verbatim · keywords = scan the main points">
        {(["lines", "keywords"] as const).map((m, k) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            style={{ font: "inherit", border: "1px solid #E5E7EB", borderRadius: k === 0 ? "6px 0 0 6px" : "0 6px 6px 0", padding: "2px 8px", cursor: "pointer", background: mode === m ? "#111827" : "#FFFFFF", color: mode === m ? "#FFFFFF" : "#9CA3AF" }}>
            {m}
          </button>
        ))}
      </div>
      {frames === null && !err && <div style={{ fontSize: "1.5rem", color: "#9CA3AF" }}>loading the film draft…</div>}
      {frames && !frame && (
        <div style={{ fontSize: "1.75rem", fontWeight: 600, color: "#6B7280" }}>
          {active && active.setId === setId ? "No slide up yet" : "Waiting for the Studio"}
          <div style={{ fontSize: "1rem", fontWeight: 400, marginTop: 10, color: "#9CA3AF" }}>Walk to a slide in the Studio or the capture window and its lines appear here.</div>
        </div>
      )}
      {frame && lines.length === 0 && (
        <div style={{ fontSize: "1.75rem", fontWeight: 600, color: "#6B7280" }}>
          Nothing kept for this slide
          <div style={{ fontSize: "1rem", fontWeight: 400, marginTop: 10, color: "#9CA3AF" }}>Keep lines in a rehearsal round on Rehearse &amp; Film and they show up here.</div>
        </div>
      )}
      {frame && showKeys && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35em", maxWidth: "100%", alignItems: "center" }}>
          {keys.map((k, i) => (
            <div key={i} style={{ fontSize: `${keyRem}rem`, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.01em", overflowWrap: "break-word" }}><Marked text={k} marks={cueOnly} /></div>
          ))}
          {transition && (
            <div style={{ fontSize: `${Math.max(MIN_REM, keyRem - 1)}rem`, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.01em", color: "#D97706", marginTop: "0.3em", overflowWrap: "break-word" }}>→ <Marked text={transition} marks={cueOnly} /></div>
          )}
        </div>
      )}
      {frame && !showKeys && lines.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6em", maxWidth: "100%" }}>
          {lines.map((l, k) => (
            <div key={k} style={{ fontSize: `${rem}rem`, lineHeight: 1.2, fontWeight: 800, letterSpacing: "-0.01em", overflowWrap: "break-word" }}><Marked text={l} marks={marks} /></div>
          ))}
          {transition && <div style={{ fontSize: `${Math.max(MIN_REM, rem - 1.5)}rem`, lineHeight: 1.15, fontWeight: 800, color: "#D97706", overflowWrap: "break-word" }}>→ <Marked text={transition} marks={cueOnly} /></div>}
        </div>
      )}
      <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, color: "#9CA3AF", fontSize: 13, display: "flex", justifyContent: "center", gap: 18 }}>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{frame && frames ? `slide ${idx + 1} / ${frames.length}` : "—"}</span>
        <span>{frame ? FRAME_LABEL[frame.kind] : "follows the Studio"}</span>
        {frame && mode === "keywords" && keys.length === 0 && lines.length > 0 && <span>no keywords on this slide — showing its lines</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------ the phrase-bank prompter

function Teleprompter() {
  const [bank, setBank] = useState<PhraseBankDoc>(() => phraseBankDoc());
  const [index, setIndex] = useState(0);

  useEffect(() => {
    startPhraseBank();
    return subscribePhraseBank(setBank);
  }, []);

  const phrases = sayPhrases(bank, bank.activeSessionId);
  const err = phraseBankError();
  // A line re-marked blue on the board shortens the list under us; never point
  // past the end. New phrases land at the END, so the index does NOT move.
  const safeIndex = clampIndex(index, phrases.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget()) return;
      if (e.key === "Enter") {
        e.preventDefault();
        setIndex((i) => stepIndex(clampIndex(i, phrases.length), phrases.length, e.shiftKey ? -1 : 1));
        return;
      }
      if (e.key === "`" || e.code === "Backquote") {
        e.preventDefault();
        setIndex(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phrases.length]);

  const current = phrases[safeIndex] ?? null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#FFFFFF", color: "#000000",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "4vh 4vw", textAlign: "center", userSelect: "none",
      }}
    >
      {err && (
        <div style={{ position: "absolute", top: 10, left: 12, right: 12, color: "#B91C1C", fontSize: 14, fontWeight: 700 }}>
          ⚠ {err}
        </div>
      )}

      {current ? (
        <div style={{ fontSize: `${fontRem(current.text)}rem`, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.01em", maxWidth: "100%", overflowWrap: "break-word" }}>
          {current.text}
        </div>
      ) : (
        <div style={{ fontSize: "1.75rem", fontWeight: 600, color: "#6B7280" }}>
          No phrases banked yet
          <div style={{ fontSize: "1rem", fontWeight: 400, marginTop: 10, color: "#9CA3AF" }}>
            Click a script line on the results board to bank it as SAY IT.
          </div>
        </div>
      )}

      {/* The only chrome: where you are, and the three keys. Small and grey so
          it never competes with the phrase on camera. */}
      <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, color: "#9CA3AF", fontSize: 13, display: "flex", justifyContent: "center", gap: 18 }}>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
          {phrases.length ? `${safeIndex + 1} / ${phrases.length}` : "0 / 0"}
        </span>
        <span>Enter → next</span>
        <span>Shift+Enter → back</span>
        <span>` → top</span>
      </div>
    </div>
  );
}
