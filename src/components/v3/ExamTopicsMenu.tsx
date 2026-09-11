// THE EXAM TOPICS MENU — click the topic's name at the top left and the exam's topics open
// under it, grouped by exam behind toggles.
//
// Lee (2026-09-11): "If we click [topic name] at top left, let's let it open the topics for
// this exam. Break it up by toggles by exam. We will have exam 2, exam 3, final underneath.
// Only doing exam 1 for now."
//
// So: Exam 1 is open and holds every exam topic the bank has today (the map's own rule — every
// topic that is not a strategy topic, in bank order); each topic folds open to its sets as links,
// the topic you are in open to start, so the exam toggles stay in sight; Exam 2, Exam
// 3 and Final are the toggles underneath, empty until the bank knows an exam per topic. A set's
// link keeps the step you are on (Editor stays Editor, Film stays Film) so the menu is a way to
// change set without changing screen. Mounted in the V3 shell's crumb and the film page's crumb.
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { examTopics } from "@/components/blastoff/end-of-topic";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

import { slugOf, useBank } from "./use-bank";

// Shell.tsx's palette, copied: Shell mounts this menu, so importing from it would be a cycle.
const V3_CREAM = "#F5EFE6";
const V3_GOLD = "#FCA311";
const V3_MUTED = "rgba(245,239,230,0.62)";
const V3_EDGE = "rgba(245,239,230,0.16)";
const V3_BODY = "'Rubik', system-ui, sans-serif";

export const EXAMS = [
  { id: "exam1", label: "Exam 1" },
  { id: "exam2", label: "Exam 2" },
  { id: "exam3", label: "Exam 3" },
  { id: "final", label: "Final" },
] as const;

/** The step segment to keep when jumping to another set; absent = the set's own screen. */
export type StepSeg = "talkthrough" | "suggestions" | "results" | "film" | "improve";
export const STEP_SEGS: readonly StepSeg[] = ["talkthrough", "suggestions", "results", "film", "improve"];

export function stepSegOf(pathname: string): StepSeg | undefined {
  const m = pathname.match(/\/blast-off\/(talkthrough|suggestions|results|film|improve)\/?$/);
  return m ? (m[1] as StepSeg) : undefined;
}

/** Which exam a topic belongs to. The bank has one exam today, so every exam topic is Exam 1;
 *  when the bank learns an exam per topic this is the one place to read it. */
export function examOf(_topic: BoothTopic): (typeof EXAMS)[number]["id"] {
  return "exam1";
}

export function setPath(topic: BoothTopic, set: BoothSetInfo, step?: StepSeg): string {
  const base = `/v3/${slugOf(topic.name)}/${slugOf(set.name)}`;
  return step ? `${base}/blast-off/${step}` : base;
}

export function ExamTopicsMenu({ label, setId, step, tone = "cream" }: {
  /** The name on the button — the topic's, from the bank. */
  label: string;
  /** The set on screen, so its row is lit. */
  setId?: string;
  step?: StepSeg;
  /** The film chrome is quieter than the shell. */
  tone?: "cream" | "muted";
}) {
  const { topics, error } = useBank();
  const [open, setOpen] = useState(false);
  const [openExams, setOpenExams] = useState<Set<string>>(() => new Set(["exam1"]));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const exam = topics ? examTopics(topics) : [];
  const byExam = new Map<string, BoothTopic[]>();
  for (const t of exam) { const id = examOf(t); byExam.set(id, [...(byExam.get(id) ?? []), t]); }
  const toggle = (id: string) => setOpenExams((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // THE TOPICS FOLD TOO: the one you are in starts open, the rest shut, so Exam 2 / Exam 3 / Final
  // stay in sight under Exam 1 instead of below twenty sets.
  const [openTopics, setOpenTopics] = useState<Set<string> | null>(null);
  const hereTopic = exam.find((t) => t.sets.some((s) => s.id === setId))?.id;
  const topicsOpen = openTopics ?? new Set(hereTopic ? [hereTopic] : []);
  const toggleTopic = (id: string) => setOpenTopics(() => { const n = new Set(topicsOpen); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div ref={box} style={{ position: "relative", display: "inline-flex", fontFamily: V3_BODY }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" title="The topics on this exam — pick a set"
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: tone === "cream" ? V3_CREAM : V3_MUTED, fontSize: tone === "cream" ? 12.5 : 11.5, fontWeight: 700, whiteSpace: "nowrap", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", fontFamily: "inherit" }}>
        {label} <span aria-hidden style={{ fontSize: 9, color: V3_MUTED }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", top: "100%", left: 0, zIndex: 60, marginTop: 6, minWidth: 300, maxWidth: 420, maxHeight: "70vh", overflowY: "auto", background: "#0B1220", border: `1px solid ${V3_GOLD}66`, borderRadius: 12, padding: 8, boxShadow: "0 14px 40px rgba(0,0,0,0.6)", textAlign: "left" }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: V3_MUTED, padding: "4px 8px 6px" }}>Topics by exam</div>
          {error && <div style={{ fontSize: 12, color: "#FF8A80", padding: "4px 8px" }}>The bank didn't load: {error}</div>}
          {!topics && !error && <div style={{ fontSize: 12, color: V3_MUTED, padding: "4px 8px" }}>Loading the bank…</div>}
          {EXAMS.map((ex) => {
            const list = byExam.get(ex.id) ?? [];
            const on = openExams.has(ex.id);
            return (
              <div key={ex.id} style={{ borderTop: `1px solid ${V3_EDGE}` }}>
                <button type="button" onClick={() => toggle(ex.id)} aria-expanded={on}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", padding: "7px 8px", cursor: "pointer", color: list.length ? V3_CREAM : V3_MUTED, fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, textAlign: "left" }}>
                  <span aria-hidden style={{ fontSize: 10, width: 10, color: V3_GOLD }}>{on ? "▾" : "▸"}</span>
                  {ex.label}
                  <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: V3_MUTED }}>{topics ? (list.length ? `${list.length} topic${list.length === 1 ? "" : "s"}` : "nothing yet") : ""}</span>
                </button>
                {on && (
                  <div style={{ padding: "0 8px 8px 22px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {topics && list.length === 0 && <div style={{ fontSize: 11.5, color: V3_MUTED }}>Nothing here yet — only Exam 1 for now.</div>}
                    {list.map((t) => {
                      const here = t.sets.some((s) => s.id === setId);
                      const tOpen = topicsOpen.has(t.id);
                      return (
                        <div key={t.id}>
                          <button type="button" onClick={() => toggleTopic(t.id)} aria-expanded={tOpen}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", padding: "2px 0", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800, color: here ? V3_GOLD : V3_CREAM, textAlign: "left" }}>
                            <span aria-hidden style={{ fontSize: 9, width: 9, color: V3_MUTED }}>{tOpen ? "▾" : "▸"}</span>
                            {t.number != null ? `${t.number} · ` : ""}{t.name}
                            <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: V3_MUTED }}>{t.sets.length} set{t.sets.length === 1 ? "" : "s"}</span>
                          </button>
                          {tOpen && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "3px 0 4px 15px" }}>
                            {t.sets.map((s) => (
                              <Link key={s.id} to={setPath(t, s, step)} role="menuitem" onClick={() => setOpen(false)} aria-current={s.id === setId ? "page" : undefined}
                                style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, textDecoration: "none", whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis",
                                  border: `1px solid ${s.id === setId ? V3_GOLD : V3_EDGE}`, background: s.id === setId ? "rgba(252,163,17,0.14)" : "transparent", color: s.id === setId ? V3_GOLD : V3_MUTED }}>
                                {s.name}
                              </Link>
                            ))}
                            {t.sets.length === 0 && <span style={{ fontSize: 11, color: V3_MUTED }}>no sets</span>}
                          </div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
