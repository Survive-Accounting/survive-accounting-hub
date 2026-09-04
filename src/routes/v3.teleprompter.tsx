// /v3/teleprompter — THE PROMPTER WINDOW. Two modes:
//
// ?set=<deckId> (2026-09-03, the v3 film surface): the lines Lee kept on the
// Review step (frame.prompter on the Blast Off plan) for whichever frame is
// UP — the Studio publishes the active frame to localStorage "sa-film-active"
// and this window follows it. Nothing to click; it just keeps up.
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
import { FRAME_LABEL } from "@/components/blastoff/plan";

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

  useEffect(() => {
    let live = true;
    loadBlastPlan({ data: { setId } })
      .then((p) => { if (live) setFrames(p?.frames ?? []); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
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
  const idx = frame && frames ? frames.indexOf(frame) : -1;
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const rem = Math.max(MIN_REM, Math.min(BASE_REM, fontRem(" ".repeat(longest)) - Math.max(0, lines.length - 2) * 0.6));

  return (
    <div style={{ position: "fixed", inset: 0, background: "#FFFFFF", color: "#000000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4vh 4vw", textAlign: "center", userSelect: "none" }}>
      {err && <div style={{ position: "absolute", top: 10, left: 12, right: 12, color: "#B91C1C", fontSize: 14, fontWeight: 700 }}>⚠ {err}</div>}
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
          <div style={{ fontSize: "1rem", fontWeight: 400, marginTop: 10, color: "#9CA3AF" }}>Keep lines on the Review step's teleprompter column and they show up here.</div>
        </div>
      )}
      {frame && lines.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6em", maxWidth: "100%" }}>
          {lines.map((l, k) => (
            <div key={k} style={{ fontSize: `${rem}rem`, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.01em", overflowWrap: "break-word" }}>{l}</div>
          ))}
        </div>
      )}
      <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, color: "#9CA3AF", fontSize: 13, display: "flex", justifyContent: "center", gap: 18 }}>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{frame && frames ? `slide ${idx + 1} / ${frames.length}` : "—"}</span>
        <span>{frame ? FRAME_LABEL[frame.kind] : "follows the Studio"}</span>
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
