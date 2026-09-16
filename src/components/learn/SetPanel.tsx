// THE SET SCREEN — Watch · Practice (· Bonus), beside the video (2026-09-16).
//
// Lee (the student-flow wireframes, built as drawn): "Video left. Right: the whole set in order — the one playing is
// lit, watched ones are checked, tap any to jump. Under it, Try the practice questions with the count and a time
// estimate, then Ask Lee a question, which opens a bigger box when tapped. Bonus is a third tab only for sets that
// have it." On a desk the panel is always beside the video; on a phone it is the sheet the tab bar opens.
//
// Ask Lee goes into the site chat (lib/site-chat-client) — the same conversation the bubble shows and Lee's inbox
// reads — tagged "Know Your Accounts · video 3 · 0:12" so he knows exactly where the question came from.
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Lock, MessageCircle, Play, X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { BonusPanel } from "@/components/learn/BonusPanel";
import { fmtRuntime, type Prog } from "@/components/learn/cram-media";
import type { PlayerItem } from "@/components/learn/CramPlayer";
import { PracticeStage } from "@/components/site/PracticeStage";
import { practiceMinutes } from "@/lib/learn-bonus";
import { practiceScoreOf, type PracticeScore } from "@/lib/practice-score";
import { askTag, sendToLee } from "@/lib/site-chat-client";
import type { PracticeQuestion } from "@/lib/student.functions";
import { track } from "@/lib/analytics";

export type SetTab = "watch" | "practice" | "bonus";

export const PANEL_BG = "#101C39", PANEL_EDGE = "rgba(148,180,255,0.20)", PANEL_INK = "#F2EFE6";
const MUTED = "#93A0B4", GOLD = "#FCA311", MINT = "#3BF5A0", RED = "#FF5C6E";

/** The tabs a set has: Bonus only when the set carries one (Lee: "if it is [empty] then just don't show it"). */
export function tabsOf(bonus: string | null | undefined): SetTab[] { return bonus ? ["watch", "practice", "bonus"] : ["watch", "practice"]; }

/** This device's practice score on the set, re-read as answers land (PracticeStage's sa-coverage event). */
export function useSetScore(setId: string): PracticeScore | null {
  const [score, setScore] = useState<PracticeScore | null>(null);
  useEffect(() => {
    const read = () => setScore(practiceScoreOf(setId));
    read();
    window.addEventListener("sa-coverage", read);
    return () => window.removeEventListener("sa-coverage", read);
  }, [setId]);
  return score;
}

export function SetPanel({ items, index, onIndex, progress, tab, onTab, narrow, onClose, demo, demoQuestions, campusName, campusSlug, guidance, onPracticeDone }: {
  items: PlayerItem[];
  index: number;
  onIndex: (i: number) => void;
  progress: Record<string, Prog>;
  tab: SetTab;
  onTab: (t: SetTab) => void;
  narrow: boolean;
  /** The phone sheet's ×. Absent on a desk, where the panel is the set screen itself. */
  onClose?: () => void;
  demo: boolean;
  demoQuestions?: PracticeQuestion[];
  campusName: string | null;
  campusSlug: string | null;
  /** What the practice results lead on to ("Next topic →" / "Back to the videos"). */
  guidance: { nextLabel: string; onNext: () => void };
  onPracticeDone: () => void;
}) {
  const item = items[index];
  const { set, topic, n } = item;
  const mine = items.map((it, j) => ({ it, j })).filter(({ it }) => it.set.id === set.id);
  const score = useSetScore(set.id);
  const tabs = tabsOf(set.bonus);
  const bonusOpen = !!score && set.ceqCount > 0 && score.answered >= set.ceqCount && score.correct / score.answered >= 0.8;
  const label = (t: SetTab) => (t === "watch" ? "Watch" : t === "practice" ? "Practice" : "Bonus");
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1, color: PANEL_INK, fontFamily: BRAND_SANS }}>
      <div style={{ display: "flex", alignItems: "stretch", gap: 2, padding: "0 8px", borderBottom: `1px solid ${PANEL_EDGE}`, background: "rgba(255,255,255,0.03)", flexShrink: 0 }}>
        {tabs.map((t) => {
          const on = t === tab;
          return (
            <button key={t} type="button" role="tab" aria-selected={on} onClick={() => onTab(t)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 12px 10px", minHeight: 46, background: "transparent", border: 0, borderBottom: `2px solid ${on ? GOLD : "transparent"}`, color: on ? GOLD : MUTED, cursor: "pointer", fontFamily: BRAND_SANS, fontWeight: 800, fontSize: 13.5, opacity: t === "bonus" && !bonusOpen ? 0.7 : 1 }}>
              {label(t)}{t === "bonus" && !bonusOpen && <Lock className="h-3 w-3" aria-label="locked" />}
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        {onClose && <button type="button" onClick={onClose} aria-label="Close" style={{ alignSelf: "center", display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 999, background: "rgba(255,255,255,0.10)", color: PANEL_INK, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>}
      </div>
      <div style={{ minHeight: 0, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {tab === "watch" && (
          <div style={{ padding: "12px 12px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10.5, letterSpacing: "0.14em", fontWeight: 800, color: MUTED, textTransform: "uppercase" }}>{topic.name} · {set.name}{mine.length > 1 ? ` · ${mine.length} videos` : ""}</div>
            <div role="list" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {mine.map(({ it, j }, i) => {
                const now = j === index;
                const done = progress[it.part.key]?.state === "complete";
                const rt = set.shorts?.[it.part.index]?.runtimeSec ?? (mine.length === 1 ? set.runtimeSec : null);
                return (
                  <button key={it.part.key} type="button" role="listitem" aria-current={now ? "true" : undefined} onClick={() => { if (!now) onIndex(j); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 10px", minHeight: 44, borderRadius: 9, cursor: now ? "default" : "pointer", background: now ? "rgba(252,163,17,0.09)" : "rgba(255,255,255,0.05)", border: `1px solid ${now ? GOLD : PANEL_EDGE}`, color: PANEL_INK, fontFamily: BRAND_SANS, fontSize: 13.5, lineHeight: 1.3 }}>
                    <span aria-hidden style={{ display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 6, flex: "none", background: now ? "rgba(252,163,17,0.22)" : done ? "rgba(59,245,160,0.18)" : "rgba(255,255,255,0.08)", color: now ? GOLD : done ? MINT : MUTED, fontSize: 11.5, fontWeight: 800 }}>
                      {now ? <Play className="h-3 w-3" fill="currentColor" /> : done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>{it.part.name || set.name}</span>
                    {rt != null && <span style={{ color: MUTED, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtRuntime(rt)}</span>}
                  </button>
                );
              })}
            </div>
            {set.ceqCount > 0 && (
              <button type="button" onClick={() => { track("set_practice_open", { set_id: set.id, from: "watch-tab" } as never); onTab("practice"); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "12px 13px", marginTop: 4, borderRadius: 11, cursor: "pointer", background: "rgba(252,163,17,0.07)", border: `1px solid rgba(252,163,17,0.45)`, color: PANEL_INK, fontFamily: BRAND_SANS }}>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", color: GOLD, fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 15.5 }}>Try the practice questions →</span>
                  <span style={{ display: "block", color: MUTED, fontSize: 12.5, marginTop: 2 }}>{set.ceqCount} question{set.ceqCount === 1 ? "" : "s"} · ≈ {practiceMinutes(set.ceqCount)} min{score ? ` · ${score.correct} of ${score.answered} right so far` : ""}</span>
                </span>
              </button>
            )}
            <AskLeeBox topic={topic.name} setName={set.name} setId={set.id} videoN={item.part.index + 1} videoOf={item.part.of} demo={demo} campusSlug={campusSlug} />
          </div>
        )}
        {tab === "practice" && (
          <PracticeStage key={set.id}
            setId={set.id}
            questions={demo ? demoQuestions : undefined}
            reference={{ topic: topic.number, set: n }}
            setName={set.name}
            campusName={campusName}
            campusSlug={campusSlug}
            surface="learn"
            isTest={demo}
            doneLabel={guidance.nextLabel}
            onDone={onPracticeDone}
            gradeAtEnd
            bonus={set.bonus ? { kind: set.bonus, onOpen: () => onTab("bonus") } : null}
            guidance={guidance}
          />
        )}
        {tab === "bonus" && <BonusPanel set={set} demo={demo} score={score} narrow={narrow} onPractice={() => onTab("practice")} />}
      </div>
    </div>
  );
}

/** ASK LEE A QUESTION — one row; a tap opens the bigger box. The message lands in the chat, tagged with the spot. */
function AskLeeBox({ topic, setName, setId, videoN, videoOf, demo, campusSlug }: { topic: string; setName: string; setId: string; videoN: number; videoOf: number; demo: boolean; campusSlug: string | null }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) box.current?.focus(); }, [open]);
  const atS = () => document.querySelector<HTMLVideoElement>("[data-sa-cram-video]")?.currentTime ?? 0;
  const tagNow = askTag({ topic, setName, videoN, videoOf, atS: atS() });
  const send = async () => {
    const body = msg.trim();
    if (body.length < 3 || busy) return;
    setBusy(true); setErr(null);
    const tag = askTag({ topic, setName, videoN, videoOf, atS: atS() });
    try {
      if (!demo) await sendToLee(`[${tag}]\n${body}`, { page: `/learn?set=${setId}&part=${videoN}`, campus: campusSlug });
      track("ask_lee_sent", { set_id: setId, video: videoN } as never);
      setDone(true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send that — try again in a minute."); }
    finally { setBusy(false); }
  };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "11px 13px", minHeight: 46, borderRadius: 11, cursor: "pointer", background: "rgba(255,255,255,0.05)", border: `1px solid ${PANEL_EDGE}`, color: PANEL_INK, fontFamily: BRAND_SANS, fontSize: 14, fontWeight: 600 }}>
        <MessageCircle className="h-4 w-4" style={{ color: GOLD }} />
        <span style={{ flex: 1 }}>Ask Lee a question</span>
        <span style={{ color: MUTED, fontSize: 12, fontWeight: 500 }}>tap to open</span>
      </button>
    );
  }
  return (
    <div className="lk-in" style={{ padding: 12, borderRadius: 11, background: "rgba(255,255,255,0.05)", border: `1px solid ${GOLD}`, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MessageCircle className="h-4 w-4" style={{ color: GOLD }} />
        <span style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 15 }}>Ask Lee a question</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 999, background: "rgba(255,255,255,0.10)", color: PANEL_INK, border: 0, cursor: "pointer" }}><X className="h-3.5 w-3.5" /></button>
      </div>
      {done ? (
        <div style={{ padding: "12px 10px", borderRadius: 9, background: "rgba(59,245,160,0.10)", border: `1px solid rgba(59,245,160,0.5)`, fontSize: 13.5 }}>
          <Check className="mr-1 inline h-4 w-4" style={{ color: MINT }} /> Sent. Lee answers in the chat bubble on this page — usually the same day.
        </div>
      ) : (
        <>
          <textarea ref={box} value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} placeholder="What's tripping you up? Be specific — I'll answer this exact spot."
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send(); }}
            style={{ width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 120, padding: "10px 12px", borderRadius: 9, background: "rgba(0,0,0,0.25)", border: `1px solid ${PANEL_EDGE}`, color: PANEL_INK, fontFamily: BRAND_SANS, fontSize: 15, lineHeight: 1.4, outline: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void send()} disabled={msg.trim().length < 3 || busy} style={{ minHeight: 40, padding: "9px 16px", borderRadius: 999, border: 0, cursor: "pointer", background: GOLD, color: "#14213D", fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 14, opacity: msg.trim().length < 3 || busy ? 0.5 : 1 }}>
              {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : "Send"}
            </button>
            <span style={{ fontSize: 11.5, color: MUTED }}>Tagged: {tagNow}</span>
          </div>
          {err && <p role="alert" style={{ margin: 0, fontSize: 12, color: RED }}>{err}</p>}
        </>
      )}
    </div>
  );
}
