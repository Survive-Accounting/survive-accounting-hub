// F3 — SCRAP THIS ATTEMPT (2026-09-13). Lee, deciding how an abandoned line gets recorded: "I say
// something I don't like, so I hit a button and then discuss why. I would say F3 is a good key for
// me to use." And later: "The point being, if we keep that take, is to auto-edit out that portion."
//
// THE FLOW, one slide at a time, with OBS still recording:
//   F3        → scrapping. A red bar says so; dictation listens for why.
//   (talk)    → the reason, live in the bar.
//   (walk)    → optional: go back to the slide you want to restart FROM. The scrap stays open.
//   F3 again  → saved as a `take_abandoned` event (frame-events.ts), the slide you're on goes back to
//               its top (the same wipe as `), and the retake starts. The cut runs from when you last
//               arrived on that slide before the scrap (restartAttemptStart) to this press — so a
//               range of slides filmed together comes out together.
//   Esc       → never mind: nothing saved, nothing reset.
// Lee, 2026-09-13: "I will plan to start that slide over … maybe it's best to scrap, then let me go
// back to a slide where I want to restart from."
//
// WHICH WINDOW. The pop-out is what OBS records, so the pop-out owns the scrap: its slide resets,
// its bar shows (inside the stretch that gets cut, so it never reaches the video). F3 in the main
// window while a pop-out take is live is passed over to it (the same localStorage hand-off as F4);
// with no pop-out, the main window scraps itself.
import { useCallback, useEffect, useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { logFrameEvents } from "@/lib/frame-events.functions";
import { useDictation } from "@/lib/use-dictation";

import { restartAttemptStart, rollAtFor, scrapReason, scrapTimes, takeRefOf } from "../frame-events";
import { readRoll } from "./prompter-sync";

export const FILM_SCRAP_KEY = "sa-film-scrap";
type ScrapAction = "press" | "cancel";
interface ScrapSignal { setId: string; at: number; action: ScrapAction }

/** Main window → pop-out. False when storage is unavailable (the caller says so). */
export function signalScrap(setId: string, action: ScrapAction): boolean {
  try { localStorage.setItem(FILM_SCRAP_KEY, JSON.stringify({ setId, at: Date.now(), action } satisfies ScrapSignal)); return true; } catch { return false; }
}

export interface ScrapState { frameId: string; startedAt: number; attemptStartedAt: number; heard: string; interim: string }

export function useScrap({ setId, takeIndex, frameId, owns, onRestart }: {
  setId: string;
  /** ?take=N — which split the recording is of; undefined films the whole set. */
  takeIndex: number | undefined;
  frameId: string | null;
  /** This window holds the scrap: the pop-out, or the main window when no pop-out is live. */
  owns: boolean;
  /** Put the slide back to its top — the ` wipe. */
  onRestart: () => void;
}) {
  const [scrap, setScrap] = useState<ScrapState | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const scrapRef = useRef(scrap);
  scrapRef.current = scrap;
  // WHEN THIS ATTEMPT BEGAN: arriving on the slide, or the last restart. (A roll after that is the
  // earlier bound — scrapTimes clamps to the recording's own start.)
  const attemptAt = useRef(Date.now());
  // Every slide arrival this session (trimmed) — where a restart elsewhere starts its cut.
  const arrivals = useRef<{ frameId: string; at: number }[]>(frameId ? [{ frameId, at: Date.now() }] : []);
  const frameIdRef = useRef(frameId);
  frameIdRef.current = frameId;
  const heardRef = useRef({ heard: "", interim: "" });
  const dictation = useDictation((final, live) => {
    heardRef.current = { heard: final.trim() ? `${heardRef.current.heard} ${final}`.trim() : heardRef.current.heard, interim: live };
    setScrap((s) => (s ? { ...s, ...heardRef.current } : s));
  });
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;

  const flash = useCallback((msg: string) => { setNote(msg); window.setTimeout(() => setNote((m) => (m === msg ? null : m)), 4000); }, []);

  /** Save the open scrap. `restart`: the slide goes back to its top and a new attempt begins. */
  const finish = useCallback((restart: boolean) => {
    const s = scrapRef.current;
    if (!s) return;
    const now = Date.now();
    dictationRef.current.stop();
    setScrap(null);
    const rollAt = rollAtFor(readRoll(), setId, now);
    const restartId = frameIdRef.current;
    const from = restartAttemptStart(arrivals.current, restartId, s.startedAt, s.attemptStartedAt);
    const times = scrapTimes(rollAt, from, s.startedAt, now);
    const reason = scrapReason(heardRef.current.heard, heardRef.current.interim, dictationRef.current.supported);
    heardRef.current = { heard: "", interim: "" };
    void logFrameEvents({ data: { events: [{
      frameId: s.frameId, setId, event: "take_abandoned", reason,
      takeRef: rollAt !== null ? takeRefOf(setId, takeIndex, rollAt) : null,
      takeOffsetMs: times?.scrapMs ?? null,
      after: times ? { ...times, ...(restartId && restartId !== s.frameId ? { restartFrameId: restartId } : {}) } : { rehearsal: true },
    }], who: getAdminWho() } })
      .then((r) => { if (!r.ok) flash(`⚠ scrap not saved — ${r.error ?? "unknown error"}`); })
      .catch((e) => flash(`⚠ scrap not saved — ${e instanceof Error ? e.message : String(e)}`));
    flash(times ? "✗ scrapped — cut marked · go again from this slide" : "✗ scrapped (nothing recording — reason kept, nothing to cut)");
    if (restart) { onRestart(); attemptAt.current = Date.now(); }
  }, [setId, takeIndex, onRestart, flash]);

  const cancel = useCallback(() => {
    if (!scrapRef.current) return;
    dictationRef.current.stop();
    heardRef.current = { heard: "", interim: "" };
    setScrap(null);
    flash("scrap cancelled — nothing saved");
  }, [flash]);

  const press = useCallback(() => {
    if (scrapRef.current) { finish(true); return; }
    if (!frameId) return;
    heardRef.current = { heard: "", interim: "" };
    setScrap({ frameId, startedAt: Date.now(), attemptStartedAt: attemptAt.current, heard: "", interim: "" });
    if (dictationRef.current.supported) { try { dictationRef.current.start(); } catch { /* the bar says not listening */ } }
  }, [frameId, finish]);

  // A new slide is a new attempt. Mid-scrap, walking just moves to where he'll restart — the scrap
  // stays open until F3.
  const lastFrame = useRef(frameId);
  useEffect(() => {
    if (lastFrame.current === frameId) return;
    lastFrame.current = frameId;
    if (frameId) { arrivals.current.push({ frameId, at: Date.now() }); if (arrivals.current.length > 400) arrivals.current.splice(0, 100); }
    if (!scrapRef.current) attemptAt.current = Date.now();
  }, [frameId]);

  // The pop-out hears the main window's F3 / Esc.
  const pressRef = useRef(press); pressRef.current = press;
  const cancelRef = useRef(cancel); cancelRef.current = cancel;
  useEffect(() => {
    if (!owns) return;
    let seen = Date.now();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== FILM_SCRAP_KEY || !e.newValue) return;
      let sig: ScrapSignal | null = null;
      try { sig = JSON.parse(e.newValue) as ScrapSignal; } catch { return; }
      if (!sig || sig.setId !== setId || sig.at <= seen || Math.abs(Date.now() - sig.at) > 4000) return;
      seen = sig.at;
      if (sig.action === "press") pressRef.current(); else cancelRef.current();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [owns, setId]);

  return { scrap, note, press, cancel, listening: dictation.on, supported: dictation.supported, flash };
}

/** The bar: red while scrapping (with what's being heard), then a short confirmation. */
export function ScrapBar({ scrap, note, listening, supported, inShot }: {
  scrap: ScrapState | null; note: string | null; listening: boolean; supported: boolean;
  /** This window is the recording (the pop-out). The red bar is fine there — it sits inside the
   *  stretch that gets cut — but the confirmation after F3 lands AFTER the cut, in the kept video,
   *  so only a failure is shown there. */
  inShot: boolean;
}) {
  if (!scrap && (!note || (inShot && !note.startsWith("⚠")))) return null;
  const said = scrap ? `${scrap.heard} ${scrap.interim}`.trim() : "";
  return (
    <div data-sa-film-chrome style={{
      position: "fixed", left: "50%", top: 14, transform: "translateX(-50%)", zIndex: 70, maxWidth: "min(92vw, 640px)",
      background: scrap ? "rgba(120,14,20,0.94)" : "rgba(7,11,20,0.9)", border: `1px solid ${scrap ? "#FF5A5F" : "rgba(244,239,230,0.25)"}`,
      borderRadius: 12, padding: "8px 14px", color: "#F4EFE6", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 13, lineHeight: 1.35,
      boxShadow: "0 8px 30px rgba(0,0,0,0.5)", pointerEvents: "none",
    }}>
      {scrap ? (
        <>
          <div style={{ fontWeight: 800, letterSpacing: "0.04em" }}>
            ✗ SCRAPPING — say why · walk to the slide to restart from · <span style={{ color: "#FFD1D1" }}>F3</span> restarts there · <span style={{ color: "#FFD1D1" }}>Esc</span> cancels
          </div>
          <div style={{ marginTop: 4, color: said ? "#F4EFE6" : "#FFB3B3", fontStyle: said ? "normal" : "italic" }}>
            {said || (supported ? (listening ? "listening…" : "not listening — the reason will be blank") : "dictation needs Chrome — the reason will say so")}
          </div>
        </>
      ) : (
        <div style={{ fontWeight: 700 }}>{note}</div>
      )}
    </div>
  );
}
