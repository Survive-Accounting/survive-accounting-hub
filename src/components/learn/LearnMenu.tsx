// THE MENU (Lee, 2026-09-11, the polish brief §11, then his cuts the same night): the hamburger's
// side sheet — 360px from the right on a desk, near-full-width from the right on a phone, Survive
// navy header band over the cream body.
//
//   [survive]                                   [X]
//   Home · Set up exam reminders              (+ Leave a review on a phone, where the bar has no room)
//   SUBSCRIBE  Get notified when new content drops.   [ you@school.edu ] [Subscribe]
//   ┌ ΚΚΓ  Study with your chapter ─────────────────────────────┐
//   │      Get ACCT 200 exam prep for your sorority or fraternity. │  → the chapter picker
//   └──────────────────────────────────────────────────────────────┘
//   signed in as lee@… · sign out                                  (quiet, only when signed in)
//
// Lee: "Lose the share this and leave a review on the hamburger menu in desktop, it's showing
// those left of hamburger menu already in navbar." / "Don't have account yet. Just an email drop.
// 'Subscribe' — Get notified when new content drops." / "Programs... We don't need that text.
// maybe just make this like the behavior of the home page. 'Study with your chapter' and have the
// greek letters scrolling animation like we have on home page. 'Get ACCT 200 exam prep for your
// sorority or fraternity.' underneath (use campus course code). Don't show campus rep program yet."
//
// The subscribe drop goes through the unified intake (kind notify_exam, source learn-menu-
// subscribe) with the campus, the course and — when the student is on a chapter's page — the
// chapter, so the email is known to be that chapter's. The letters cycle the way the home page's
// door does (2.1 s a set, a 210 ms dissolve), from the campus's own chapters when they are
// known, Ole Miss's otherwise; still under reduced motion. Escape and the backdrop close; the
// close button takes focus on open and focus returns to the hamburger (LearnTop).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Check, ChevronRight, Home, Loader2, Star, X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import type { TopYou } from "@/components/learn/LearnTop";
import { EMAIL_RE, isUuid } from "@/components/learn/learn-gate";
import { LK } from "@/components/learn/learn-theme";
import { buildGreekCycle, OLE_MISS_GREEK_CYCLE } from "@/lib/greek-cycle";
import { listGoChapters } from "@/lib/greek-go.functions";
import { submitIntake } from "@/lib/intake.functions";
import { useDismiss } from "@/lib/use-dismiss";

export const LEARN_MENU_CSS = `
@keyframes lk-menu-in { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.lk-menu { position: fixed; top: 0; right: 0; bottom: 0; display: flex; flex-direction: column; background: var(--lk-surface); color: var(--lk-text); box-shadow: -18px 0 50px rgba(0,0,0,.28); animation: lk-menu-in 220ms cubic-bezier(.2,.7,.2,1); font-family: ${BRAND_SANS}; overflow-y: auto; }
.lk-menu-hd { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 14px 20px; background: var(--lk-top-bg); color: var(--lk-top-ink); border-bottom: 2px solid var(--lk-top-border); flex-shrink: 0; }
.lk-menu-sec { padding: 12px 12px 6px; }
.lk-menu-sec + .lk-menu-sec { border-top: 1px solid var(--lk-border); }
.lk-menu-eyebrow { display: block; padding: 4px 8px 6px; font-size: 10.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--lk-dim); }
.lk-menu-row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 46px; padding: 0 10px; border: 0; border-radius: 10px; background: transparent; color: var(--lk-text); font: inherit; font-size: 14.5px; font-weight: 600; text-align: left; text-decoration: none; cursor: pointer; }
.lk-menu-row svg { color: var(--lk-muted); flex-shrink: 0; }
@media (hover: hover) { .lk-menu-row:hover { background: var(--lk-surface2); } .lk-menu-row:hover svg { color: var(--lk-acc); } }
.lk-menu-row:focus-visible, .lk-menu-card:focus-visible, .lk-menu-quiet:focus-visible, .lk-menu-sub:focus-visible { outline: 2px solid var(--lk-acc); outline-offset: 2px; }
.lk-menu-card { display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px; margin: 4px 0 10px; border-radius: 14px; border: 1px solid var(--lk-border); background: var(--lk-top-bg); color: var(--lk-top-ink); text-align: left; font: inherit; cursor: pointer; transition: transform 160ms, box-shadow 160ms; }
@media (hover: hover) { .lk-menu-card:hover { transform: translateY(-1px); box-shadow: var(--lk-shadow); } }
.lk-menu-card .letters { display: grid; place-items: center; width: 64px; height: 56px; flex-shrink: 0; font-family: ${BRAND_DISPLAY}; font-weight: 900; font-size: 21px; letter-spacing: .02em; color: var(--lk-top-ink); text-shadow: 0 0 10px rgba(255,255,255,.35); transition: opacity 210ms ease; }
.lk-menu-card .t { font-family: ${BRAND_DISPLAY}; font-weight: 900; font-size: 16px; line-height: 1.15; }
.lk-menu-card .s { font-size: 12.5px; color: var(--lk-top-muted); line-height: 1.35; margin-top: 3px; }
.lk-menu-sub { display: flex; gap: 8px; margin: 6px 8px 8px; }
.lk-menu-sub input { flex: 1; min-width: 0; min-height: 42px; border-radius: 10px; border: 1px solid var(--lk-border2); background: var(--lk-bg); color: var(--lk-text); padding: 0 12px; font: inherit; font-size: 14px; }
.lk-menu-sub input:focus { outline: 2px solid var(--lk-acc); outline-offset: 1px; }
.lk-menu-sub button { min-height: 42px; padding: 0 16px; border-radius: 10px; border: 0; background: var(--lk-acc); color: var(--lk-acc-ink); font: inherit; font-size: 13.5px; font-weight: 800; cursor: pointer; white-space: nowrap; }
.lk-menu-quiet { background: transparent; border: 0; padding: 4px 6px; font: inherit; font-size: 12px; font-weight: 700; color: var(--lk-muted); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .lk-menu { animation: none; } .lk-menu-card, .lk-menu-card .letters { transition: none; } }
`;

export function LearnMenu({ narrow, you, campusId, campusSlug, courseCode, chapterSlug, demo, onClose, onReminders, onReview, onPickChapter }: {
  narrow: boolean;
  you: TopYou;
  campusId: string | null;
  campusSlug: string | null;
  courseCode: string | null;
  /** The chapter the student is on (the pretty path or the picker) — rides with the subscribe. */
  chapterSlug: string | null;
  demo: boolean;
  onClose: () => void;
  onReminders: () => void;
  onReview: () => void;
  /** Opens the chapter picker (LearnCta's "pick" sheet). */
  onPickChapter: () => void;
}) {
  const ref = useDismiss<HTMLDivElement>(onClose);
  const closeBtn = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { closeBtn.current?.focus(); }, []);
  const width = narrow ? "min(100vw - 28px, 420px)" : 360;
  const course = courseCode ?? "intro accounting";
  return (
    <div className="fixed inset-0 z-[110]" style={{ background: "rgba(10,14,26,0.45)" }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Menu" className="lk-menu" style={{ width }}>
        <div className="lk-menu-hd">
          <span style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 19, letterSpacing: "-0.01em" }}>survive</span>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-full" style={{ background: "rgba(255,255,255,0.12)", color: "inherit", border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
        </div>

        <nav className="lk-menu-sec" aria-label="Pages">
          <a href="/" className="lk-menu-row"><Home className="h-[18px] w-[18px]" aria-hidden /> Home</a>
          <button type="button" className="lk-menu-row" onClick={onReminders}><Bell className="h-[18px] w-[18px]" aria-hidden /> Set up exam reminders</button>
          {narrow && <button type="button" className="lk-menu-row" onClick={onReview}><Star className="h-[18px] w-[18px]" aria-hidden /> Leave a review</button>}
        </nav>

        <section className="lk-menu-sec" aria-label="Subscribe">
          <span className="lk-menu-eyebrow">Subscribe</span>
          <p style={{ margin: "0 8px 4px", fontSize: 14, fontWeight: 700 }}>Get notified when new content drops.</p>
          <SubscribeForm you={you} campusId={campusId} campusSlug={campusSlug} courseCode={courseCode} chapterSlug={chapterSlug} demo={demo} />
        </section>

        <section className="lk-menu-sec" aria-label="Your chapter" style={{ paddingBottom: 14 }}>
          <button type="button" className="lk-menu-card" onClick={() => { onClose(); onPickChapter(); }}>
            <CyclingLetters campusSlug={campusSlug} />
            <span className="min-w-0 flex-1">
              <span className="t block">Study with your chapter</span>
              <span className="s block">Get {course} exam prep for your sorority or fraternity.</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0" style={{ color: "var(--lk-top-muted)" }} aria-hidden />
          </button>
          {you.userId && (
            <div className="flex items-center justify-between gap-2" style={{ padding: "0 8px", fontSize: 12, color: LK.dim }}>
              <span className="truncate">signed in as {you.email ?? "you"}</span>
              <button type="button" className="lk-menu-quiet shrink-0" onClick={() => { onClose(); you.signOut(); }}>sign out</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** The email drop — one field, one button, the unified intake. */
function SubscribeForm({ you, campusId, campusSlug, courseCode, chapterSlug, demo }: { you: TopYou; campusId: string | null; campusSlug: string | null; courseCode: string | null; chapterSlug: string | null; demo: boolean }) {
  const [email, setEmail] = useState(you.email ?? "");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!EMAIL_RE.test(v)) { setState("error"); return; }
    setState("busy");
    try {
      if (!demo) await submitIntake({ data: { kind: "notify_exam", email: v, campusId: isUuid(campusId) ? campusId : null, campusSlug, courseCode, chapter: chapterSlug, sourcePath: "/learn", source: "learn-menu-subscribe" } });
      setState("done");
    } catch { setState("error"); }
  };
  if (state === "done") return <p className="flex items-center gap-2" style={{ margin: "6px 8px 10px", fontSize: 13.5, fontWeight: 700 }}><Check className="h-4 w-4" style={{ color: LK.green }} /> You're on the list.</p>;
  return (
    <form className="lk-menu-sub" onSubmit={(e) => void submit(e)}>
      <input type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu" aria-label="Email" aria-invalid={state === "error" || undefined} value={email} onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }} style={state === "error" ? { borderColor: LK.red } : undefined} />
      <button type="submit" disabled={state === "busy"}>{state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe"}</button>
    </form>
  );
}

/** The home page's door letters, at menu size: one set every 2.1 s with a 210 ms dissolve; the
 *  campus's own chapters when it has enough of them, Ole Miss's otherwise; still under reduced motion. */
function CyclingLetters({ campusSlug }: { campusSlug: string | null }) {
  const q = useQuery({ queryKey: ["go-chapters", campusSlug], queryFn: () => listGoChapters({ data: { schoolSlug: campusSlug! } }), enabled: !!campusSlug, staleTime: 300_000, networkMode: "always" });
  const cycle = (() => { const built = buildGreekCycle(q.data ?? []); return built.length >= 2 ? built : OLE_MISS_GREEK_CYCLE; })();
  const [idx, setIdx] = useState(0);
  const [vis, setVis] = useState(true);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || cycle.length < 2) return;
    let swap = 0;
    const tick = window.setInterval(() => { setVis(false); swap = window.setTimeout(() => { setIdx((i) => (i + 1) % cycle.length); setVis(true); }, 230); }, 2100);
    return () => { window.clearInterval(tick); window.clearTimeout(swap); };
  }, [cycle.length]);
  return <span className="letters" aria-hidden style={{ opacity: vis ? 1 : 0 }}>{cycle[idx % cycle.length]}</span>;
}
