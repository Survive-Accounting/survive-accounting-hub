// THE ASKS BAR (learn v3, 09-03) — full width, sticky, cycles three asks, one ✕.
//
// In the school's colours when we know the school ("it's cool how it's asking if you're in a
// fraternity or sorority using their colors"). Each ask is one sentence + one button:
//   1 fraternity / sorority  → the CTA bar's chapter picker → share sheet (existing flow)
//   2 campus rep             → /rep/join
//   3 syllabus               → a small sheet that files a `syllabus` intake (there is no upload
//                              route yet; the chapter list + a contact is what Lee needs)
// Dismiss hides it for the session and leaves nothing behind — the asks are also in the rows.
import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { INK, type LearnTheme } from "@/components/learn/learn-theme";
import { submitIntake } from "@/lib/intake.functions";

type Ask = { key: "greek" | "rep" | "syllabus"; title: string; sub: string; cta: string };
const asks = (campusName: string | null): Ask[] => [
  { key: "greek", title: "In a fraternity or sorority?", sub: "Exam 1 is free for your whole chapter.", cta: "Pick your chapter →" },
  { key: "rep", title: `Want to run Survive at ${campusName ?? "your campus"}?`, sub: "Campus reps get paid per chapter they sign.", cta: "Become a campus rep →" },
  { key: "syllabus", title: "Got your syllabus?", sub: "Send me the chapter list and I'll line these videos up with your professor.", cta: "Send my syllabus →" },
];

const DISMISS_KEY = "sa-asks-dismissed";

export function LearnAsksBar({ theme, campusName, campusId, campusSlug, courseCode, greekEnabled, onGreek, narrow, demo }: {
  theme: LearnTheme;
  campusName: string | null;
  campusId: string | null;
  campusSlug: string | null;
  courseCode: string | null;
  /** The chapter picker exists only when a campus is known. */
  greekEnabled: boolean;
  onGreek: () => void;
  narrow: boolean;
  demo: boolean;
}) {
  const [hidden, setHidden] = useState(true);
  const [i, setI] = useState(0);
  const [syllabus, setSyllabus] = useState(false);
  useEffect(() => { try { setHidden(sessionStorage.getItem(DISMISS_KEY) === "1"); } catch { setHidden(false); } }, []);
  const list = asks(campusName).filter((a) => a.key !== "greek" || greekEnabled);
  useEffect(() => {
    if (list.length < 2) return;
    const iv = window.setInterval(() => setI((n) => n + 1), 10_000);
    return () => window.clearInterval(iv);
  }, [list.length]);
  if (hidden || list.length === 0) return null;
  const ask = list[i % list.length];
  const bg = theme.primary ?? INK.surface;
  const ink = theme.primary ? theme.primaryInk : INK.text;
  const act = () => { if (ask.key === "greek") onGreek(); else if (ask.key === "rep") window.location.assign("/rep/join"); else setSyllabus(true); };
  const dismiss = () => { setHidden(true); try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } };

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 px-4 py-2.5 sm:gap-5 sm:px-8" style={{ background: bg, color: ink, borderTop: `1px solid rgba(255,255,255,0.08)` }}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-extrabold sm:text-[15px]">{ask.title}</div>
          {!narrow && <div className="truncate text-[12.5px]" style={{ opacity: 0.85 }}>{ask.sub}</div>}
        </div>
        <button type="button" onClick={act} className="lk-btn" style={{ background: theme.schoolAccent ? theme.accent : INK.lime, color: theme.schoolAccent ? theme.accentInk : "#111", fontSize: narrow ? 10.5 : 12 }}>{narrow ? ask.cta.replace(" →", "") : ask.cta}</button>
        {!narrow && list.length > 1 && (
          <div className="flex gap-1.5" aria-hidden>
            {list.map((a, k) => <span key={a.key} className="h-1.5 w-1.5 rounded-full" style={{ background: k === i % list.length ? (theme.schoolAccent ? theme.accent : INK.lime) : "rgba(255,255,255,0.3)" }} />)}
          </div>
        )}
        <button type="button" onClick={dismiss} className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "rgba(0,0,0,0.25)", color: ink, border: 0, cursor: "pointer" }} aria-label="Dismiss"><X className="h-4 w-4" /></button>
      </div>
      {syllabus && <SyllabusSheet campusName={campusName} campusId={campusId} campusSlug={campusSlug} courseCode={courseCode} demo={demo} onClose={() => setSyllabus(false)} />}
    </>
  );
}

function SyllabusSheet({ campusName, campusId, campusSlug, courseCode, demo, onClose }: { campusName: string | null; campusId: string | null; campusSlug: string | null; courseCode: string | null; demo: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.trim());
  const isPhone = contact.trim().replace(/\D/g, "").length >= 10;
  const ok = text.trim().length > 10 && (isEmail || isPhone);
  const send = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      if (!demo) await submitIntake({ data: { kind: "syllabus", email: isEmail ? contact.trim() : null, phone: isPhone && !isEmail ? contact.trim() : null, campusId, campusName, campusSlug, courseCode, note: text.trim(), source: "learn-asks-bar", sourcePath: "/learn" } });
      setDone(true);
    } catch { setErr("Couldn't send that — try again in a minute."); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="lk-in w-full rounded-t-2xl p-5 sm:max-w-[440px] sm:rounded-2xl" style={{ background: INK.surface, border: `1px solid ${INK.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="lk-disp" style={{ fontSize: 20 }}>Your syllabus</div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full" style={{ background: INK.border, color: INK.text, border: 0, cursor: "pointer" }} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {done ? (
          <div className="rounded-xl px-4 py-4 text-center" style={{ background: "rgba(78,232,180,0.12)", border: `1px solid ${INK.green}` }}>
            <Check className="mx-auto h-6 w-6" style={{ color: INK.green }} />
            <p className="mt-1 text-[14px] font-bold">Got it. I'll line the videos up with your chapters.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <p className="text-[13px]" style={{ color: INK.muted }}>Paste the chapter list from your syllabus, or the textbook name and your professor. Whatever you've got.</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Ch 1 Intro to Accounting, Ch 2 Analyzing Transactions… · Wild, Financial Accounting 11e · Prof. Smith" className="lk-field" style={{ resize: "vertical" }} />
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="your number or email, so I can reply" className="lk-field" />
            <button type="button" onClick={() => void send()} disabled={!ok || busy} className="lk-btn lk-btn-acc disabled:opacity-40" style={{ minHeight: 46, fontSize: 13 }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send</button>
            {err && <p role="alert" className="text-[12.5px]" style={{ color: INK.red }}>{err}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
