// CAPTURE — /v3/$topic/$set/blast-off/film. The phone, full height, spacebar
// forward. Nothing else on screen: OBS captures this window and anything that
// is not the frame is in the shot.
//
// Since 2026-09-04 this draws the SAME PhoneFrame the Review stage draws (Lee:
// "these easy points ones can get away with just the /film possibly?"), so the
// slide Lee approved on /results is, pixel for pixel at a bigger size, the slide
// that films — black surround, the wordmark watermark, the summary glow, the
// campus banner, all by the same rules.
import { useEffect, useMemo, useState } from "react";

import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { HighlightContext, useTextHighlights } from "@/components/canvas/text-highlights";

import { BG, CREAM, EDGE, GOLD, MUTED, usePlan } from "./BlastOffEditor";
import { questionProgress } from "./frame-view";
import { PhoneFrame } from "./PhoneFrame";
import { FRAME_LABEL, filmFrames } from "./plan";

export function BlastOffCapture({ set, topicName, onExit }: { set: BoothSetInfo; topicName?: string; onExit: () => void }) {
  const { plan } = usePlan(set);
  const [i, setI] = useState(0);
  const [chrome, setChrome] = useState(true);
  const ceqById = useMemo(() => new Map(set.ceqs.map((c) => [c.id, c])), [set.ceqs]);
  // The SHARED highlight store (canvas/text-highlights) — same gesture, same
  // offsets, same gold as the canvas. Session-scoped, so marks survive walking
  // between frames within a rip and die only on ` or leaving capture.
  const { api: hlApi, clearAll: clearAllTextHls } = useTextHighlights();
  // THE PROMPTER (2026-09-03): the lines Lee kept on the review deck, beside
  // the slide they belong to. P hides and shows it.
  const [prompter, setPrompter] = useState(true);

  // Skipped cards never reach a take.
  const frames = useMemo(() => filmFrames(plan?.frames ?? []), [plan]);
  const n = frames.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (e.shiftKey) setI((v) => Math.max(0, v - 1));
        else setI((v) => Math.min(n - 1, v + 1));
      }
      // ` = the full wipe, same mental model as every other filming surface:
      // temporary state goes, nothing saved is touched.
      else if (e.code === "Backquote" || e.key === "`") { e.preventDefault(); clearAllTextHls(); }
      else if (e.key === "Escape") { e.preventDefault(); onExit(); }
      else if (e.key.toLowerCase() === "h") { e.preventDefault(); setChrome((v) => !v); }
      else if (e.key.toLowerCase() === "p") { e.preventDefault(); setPrompter((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onExit, clearAllTextHls]);

  // FIT THE PHONE to the window: as tall as the window allows, 9:16. Size the
  // browser window to 9:16 (or crop in OBS) and the phone IS the window.
  const [w, setW] = useState(540);
  useEffect(() => {
    const fit = () => setW(Math.max(240, Math.min(window.innerWidth, Math.floor(window.innerHeight * 9 / 16))));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  if (!plan) return <div style={{ minHeight: "100vh", background: BG, color: MUTED, display: "grid", placeItems: "center" }}>Loading the running order…</div>;
  if (n === 0) return <div style={{ minHeight: "100vh", background: "#000", color: MUTED, display: "grid", placeItems: "center" }}>Every slide is skipped — nothing to film.</div>;

  const idx = Math.min(i, n - 1);
  const frame = frames[idx];
  return (
    <HighlightContext.Provider value={hlApi}>
    <div style={{ minHeight: "100vh", background: "#000", display: "grid", placeItems: "center", position: "relative" }}>
      <PhoneFrame frame={frame} frames={frames} index={idx} set={set} topicName={topicName} w={w} rounded={false}
        progress={questionProgress(frames, ceqById).get(frame.id)} />
      {chrome && (
        <div style={{
          position: "fixed", left: 12, bottom: 12, display: "flex", gap: 12, alignItems: "center",
          background: "rgba(7,11,20,0.86)", border: `1px solid ${EDGE}`, borderRadius: 10,
          padding: "7px 12px", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 11.5, color: MUTED,
        }}>
          <span style={{ color: GOLD, fontWeight: 800 }}>{idx + 1} / {n}</span>
          <span>{FRAME_LABEL[frame.kind]}</span>
          <span>space next · shift+space back · ` resets · H hide this · P prompter · esc exit</span>
        </div>
      )}
      {prompter && (frame.prompter?.length ?? 0) > 0 && (
        <div style={{
          position: "fixed", right: 16, top: "50%", transform: "translateY(-50%)", width: 300, maxHeight: "80vh", overflowY: "auto",
          background: "rgba(7,11,20,0.88)", border: `1px solid ${EDGE}`, borderRadius: 12, padding: "10px 14px",
          fontFamily: "'Rubik', system-ui, sans-serif", color: CREAM,
        }}>
          <div style={{ fontSize: 10, color: GOLD, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>Prompter</div>
          {frame.prompter!.map((line, k) => (
            <div key={k} style={{ fontSize: 17, lineHeight: 1.35, fontWeight: 600, padding: "5px 0", borderTop: k ? `1px solid ${EDGE}` : "none" }}>{line}</div>
          ))}
        </div>
      )}
    </div>
    </HighlightContext.Provider>
  );
}
