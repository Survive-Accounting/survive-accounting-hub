// TELEPROMPTER MIRROR (/v3/teleprompter) — the second window Lee films from.
//
// It shows ONE banked "say it" phrase at a time: black on white, huge,
// centred, no chrome to read past. The phrases come from the phrase bank —
// the lines Lee clicked yellow on the results board — mirrored through
// localStorage, so a new click shows up here within a second.
//
// KEYS (the whole interface):
//   Enter        next phrase (wraps to the first at the end)
//   Shift+Enter  previous phrase (wraps to the last at the first)
//   `            back to the top
//
// Nothing here writes to the bank. Blue "show this" lines never arrive.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import {
  clampIndex, phraseBankDoc, phraseBankError, sayPhrases, startPhraseBank, stepIndex,
  subscribePhraseBank, type PhraseBankDoc,
} from "@/components/canvas/phrase-bank";
import { isTypingTarget } from "@/components/canvas/film-lock";

export const Route = createFileRoute("/v3/teleprompter")({
  component: () => <AdminGate><Teleprompter /></AdminGate>,
  head: () => ({ meta: [{ title: "Teleprompter" }, { name: "robots", content: "noindex" }] }),
});

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
