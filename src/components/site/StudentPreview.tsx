// STUDENT PREVIEW — "What your chapters get", the product shown instead of described.
//
// WHY A PREVIEW AND NOT THE REAL PLAYER. The live ExamPlayer in landing.tsx is 700+ lines wired to
// server data, a school picker, a professor picker, a video gate, notify modals and theater mode —
// none of which a partner page wants, and all of which would fetch on load. So this is the
// "lightweight rendering/preview mode sharing the same visual components/data" the brief calls for:
// the same exam tabs, the same "What's on Exam 1?" outline, the same topic list (imported from
// lib/exam-preview, the one source the real player also reads), the same campus bolt and the same
// surface tokens — but static, non-interactive, and needing no auth to view.
//
// ITS JOB is to make a council or national officer SEE, in one glance, exactly what they are being
// asked to share: their campus, their course code, Exam 1 free with the later exams alongside it,
// the topics on Exam 1, and one worked practice question. A national page can pass several campuses
// and the officer flips between them — which demonstrates "tailored per campus" without a paragraph
// claiming it.
import { useEffect, useRef, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS, Bolt } from "@/components/canvas/brand";
import { getBoltPalette } from "@/components/site/bolt";
import { EXAM_PREVIEW_TABS, PREVIEW_QUESTION, STATIC_EXAM1, estTopicMin } from "@/lib/exam-preview";

/** One campus the preview can wear. Colours are the school's raw stored hex — the light-colour
 *  rule is applied here, exactly as the bolt applies it, so a preview and the school's real bolt
 *  are never different colours. */
export type PreviewCampus = {
  /** Stable key for the selector. */
  key: string;
  /** "Arizona" — the display name. */
  name: string;
  /** "ACCT 200", or null → the outline still shows, headed generically. */
  code: string | null;
  primary: string;
  secondary: string;
  /** The campus page — "Open the full student experience →". No auth to view. */
  href: string;
};

/** Build a PreviewCampus from a school table row's fields — keeps callers from re-deriving colours. */
export function previewCampus(o: { key: string; name: string; code: string | null; primary: string; secondary: string; href: string }): PreviewCampus {
  return o;
}

export function StudentPreview({ campuses, label = "Student preview" }: {
  /** One campus (a council page) or several (a national page → a campus switcher appears). */
  campuses: PreviewCampus[];
  label?: string;
}) {
  const [i, setI] = useState(0);
  const idx = Math.min(i, campuses.length - 1);
  const c = campuses[idx];
  if (!c) return null;

  const pal = getBoltPalette({ id: c.key, name: c.name, primary: c.primary, secondary: c.secondary });
  const codeLine = [c.code, c.name.toUpperCase()].filter(Boolean).join(" · ");

  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS }}>
      {/* IDENTITY STRIP — the campus bolt + "CODE · SCHOOL", the same block the player calls
          PlayerIdentity. On a page whose whole argument is "this is built for YOUR campus", this is
          the line that proves it. The switcher (national only) and the preview label sit opposite. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3" style={{ borderColor: "var(--border-default)", background: "rgba(0,0,0,0.18)" }}>
        <span className="inline-block shrink-0" style={{ height: 34, width: 21 }}><Bolt c1={pal.leftColor} c2={pal.rightColor} title={`${c.name} bolt`} /></span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-black" style={{ color: "var(--brand-cream)" }}>{codeLine || c.name.toUpperCase()}</span>
        {campuses.length > 1 && <CampusSwitcher campuses={campuses} idx={idx} onPick={setI} />}
        <span className="rounded-full px-2.5 py-1 text-[10.5px] font-black uppercase" style={{ background: "rgba(0,107,166,0.28)", color: "var(--accent-info-text)", letterSpacing: "0.1em" }}>{label}</span>
      </div>

      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* LEFT — the exam menu + Exam 1 outline. */}
        <div className="border-b md:border-b-0 md:border-r" style={{ borderColor: "var(--border-default)" }}>
          <PreviewTabs />
          <div className="p-3">
            <div className="mb-2 px-1">
              <span className="text-[10.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>What&apos;s on Exam 1?</span>
            </div>
            {STATIC_EXAM1.map((t) => (
              <div key={t} className="mb-0.5 flex items-center gap-1.5 rounded-lg px-2 py-2" style={{ opacity: 0.9 }}>
                <span aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-muted)" }}>▸</span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>{t}</span>
                <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>~{estTopicMin(t)} min</span>
              </div>
            ))}
            <div className="mt-2 border-t px-1 pt-2 text-[10.5px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
              {STATIC_EXAM1.length} topics · cram videos + practice questions
            </div>
          </div>
        </div>

        {/* RIGHT — one worked practice question, shown ANSWERED so the payoff (the reason) is what
            the officer sees, not just a quiz prompt. */}
        <PreviewQuestion />
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: "var(--border-default)" }}>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Exam 1 is free for every member.</span>
        <a href={c.href} className="text-[13px] font-black underline underline-offset-4" style={{ color: "var(--accent)" }}>
          Open the full student experience →
        </a>
      </div>
    </div>
  );
}

/** The four exam tabs — Exam 1 free and selected, the rest alongside it. Mirrors the live
 *  ExamTabs' two-line label (name over FREE/lock) so the preview reads as the same control, minus
 *  the interactivity a preview has no use for. */
function PreviewTabs() {
  return (
    <div className="flex items-stretch" style={{ background: "rgba(0,0,0,0.22)", borderBottom: "1px solid var(--border-default)" }} role="tablist" aria-label="Exams">
      {EXAM_PREVIEW_TABS.map((e) => {
        const on = e.num === 1;
        return (
          <div key={e.num} role="tab" aria-selected={on} className="shrink-0 grow basis-0 px-2 py-2.5 text-center" style={{ borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`, opacity: on ? 1 : 0.62 }}>
            <span className="block text-[11.5px] font-black uppercase tracking-wide" style={{ color: on ? "var(--accent)" : "var(--brand-cream)" }}>{e.label}</span>
            <span className="mt-0.5 block text-[10.5px] font-black leading-tight" style={{ color: on ? "var(--accent)" : "var(--brand-cream)", opacity: on ? 0.9 : 0.7 }}>
              {e.free ? "FREE" : "🔒"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PreviewQuestion() {
  const q = PREVIEW_QUESTION;
  return (
    <div className="p-4" style={{ background: "var(--sa-surface-2, rgba(0,0,0,0.12))" }}>
      <span className="inline-block rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide" style={{ background: "var(--accent)", color: "#0B1220" }}>{q.topic}</span>
      <p className="mt-3 text-[14px] font-black leading-snug" style={{ color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY }}>{q.stem}</p>
      <div className="mt-3 grid gap-1.5">
        {q.choices.map((ch, n) => (
          <div
            key={n}
            className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-[12.5px]"
            style={{
              background: ch.correct ? "rgba(52,168,83,0.16)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${ch.correct ? "rgba(52,168,83,0.5)" : "var(--border-subtle)"}`,
              color: "var(--brand-cream)",
            }}
          >
            <span aria-hidden className="shrink-0 font-black" style={{ color: ch.correct ? "#69DB7C" : "var(--text-muted)" }}>{ch.correct ? "✓" : String.fromCharCode(65 + n)}</span>
            <span className="min-w-0" style={{ opacity: ch.correct ? 1 : 0.7 }}>{ch.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{q.memo}</p>
    </div>
  );
}

/** The national-page campus switcher — "Preview a campus [Arizona ▼]". A small native-feeling
 *  listbox rather than a <select> so the open panel matches the site instead of the OS. */
function CampusSwitcher({ campuses, idx, onPick }: { campuses: PreviewCampus[]; idx: number; onPick: (i: number) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={wrap} className="relative">
      <button
        type="button" onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox" aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-black"
        style={{ minHeight: 34, background: "var(--bg-overlay, #1A2948)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
      >
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Preview a campus</span>
        <span className="truncate" style={{ maxWidth: 120 }}>{campuses[idx].name}</span>
        <span aria-hidden style={{ color: "var(--accent)", fontSize: 10 }}>▼</span>
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 z-30 mt-1 max-h-[280px] w-[220px] overflow-y-auto rounded-xl py-1" style={{ background: "var(--bg-overlay, #1A2948)", border: "1px solid var(--border-default)", boxShadow: "0 24px 56px -18px rgba(0,0,0,0.8)" }}>
          {campuses.map((c, n) => (
            <button
              key={c.key} role="option" aria-selected={n === idx}
              onClick={() => { onPick(n); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 px-3 text-left text-[13px]"
              style={{ minHeight: 40, background: n === idx ? "var(--accent)" : "transparent", color: n === idx ? "#0B1220" : "var(--brand-cream)", fontWeight: n === idx ? 800 : 500 }}
            >
              <span className="min-w-0 truncate">{c.name}</span>
              {c.code && <span className="shrink-0 text-[11px]" style={{ opacity: 0.7 }}>{c.code}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
