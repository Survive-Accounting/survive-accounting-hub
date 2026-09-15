// THE RECAP'S LOCK SCREEN — over the last video of a set until the work is done.
//
// Lee, 2026-09-15: "we want to lock the recap video at the end (video #11) until they have completed all videos
// and all practice questions and earned at least an 80% on it. Give them the option to skip to the next topic
// if they'd like."
//
// It is a door, not a wall: the practice is one tap away, and the next topic is always open.
import { gateLines, PRACTICE_PASS, type GateState } from "@/lib/practice-score";

const CREAM = "#F5EFE6", GOLD = "#FCA311", MUTED = "#9FB2CE", MINT = "#3BF5A0", RED = "#EF4B3F";

export function RecapLock({ state, onPractice, onSkipTopic, lastTopic }: {
  state: GateState;
  onPractice: () => void;
  onSkipTopic: () => void;
  lastTopic: boolean;
}) {
  const l = gateLines(state);
  const row = (ok: boolean, text: string) => (
    <div style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 14, color: ok ? MINT : CREAM }}>
      <span aria-hidden style={{ width: 18, textAlign: "center", fontWeight: 900 }}>{ok ? "✓" : "○"}</span>
      <span>{text}</span>
    </div>
  );
  return (
    <div role="dialog" aria-label="The recap is locked" style={{
      position: "absolute", inset: 0, zIndex: 6, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
      gap: 14, padding: "0 10%", textAlign: "center", background: "rgba(6,10,22,0.93)", color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif",
    }}>
      <div aria-hidden style={{ fontSize: 30 }}>🔒</div>
      <div style={{ fontFamily: "'League Spartan', 'Rubik', system-ui, sans-serif", fontWeight: 900, fontSize: 26, lineHeight: 1.05 }}>Earn the recap</div>
      <div style={{ fontSize: 14, color: MUTED, maxWidth: 320 }}>
        Watch the videos and get {Math.round(PRACTICE_PASS * 100)}% on the practice questions. Then this one ties it all together.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", margin: "4px 0 2px" }}>
        {row(l.videosOk, l.videos)}
        {row(l.practiceOk, l.practice)}
      </div>
      <button type="button" autoFocus onClick={onPractice} style={{
        width: "100%", maxWidth: 300, padding: "13px 18px", borderRadius: 999, border: 0, cursor: "pointer",
        background: RED, color: "#fff", fontFamily: "'League Spartan', 'Rubik', system-ui, sans-serif", fontWeight: 800, fontSize: 17,
        boxShadow: "0 0 24px rgba(239,75,63,0.45)",
      }}>{state.score?.answered ? "Keep practicing →" : "Start practice →"}</button>
      <button type="button" onClick={onSkipTopic} style={{ background: "none", border: 0, cursor: "pointer", color: CREAM, opacity: 0.75, fontSize: 13, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {lastTopic ? "Back to the videos" : "Skip to the next topic"}
      </button>
      <div style={{ fontSize: 11.5, letterSpacing: "0.08em", fontWeight: 700, color: GOLD }}>THE RECAP UNLOCKS WHEN BOTH ARE DONE</div>
    </div>
  );
}
