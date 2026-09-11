// THE MENU (Lee, 2026-09-11, the polish brief §11): the hamburger's centred box "feels like a
// generic centered modal". Now it is a side sheet anchored to the hamburger — 360px from the right
// edge on a desk, near-full-width from the right on a phone — sliding in, Survive navy header
// band over the cream body, groups with small eyebrows and hairlines:
//
//   [survive]                                   [X]
//   ──────────────────────────────────────────────
//   Home · Set up exam reminders · Share this · Leave a review          (PRIMARY, icon + label)
//   ACCOUNT   Signed in as lee@…   Sign out (quiet)  |  Sign in
//   PROGRAMS  ⚡ Greek Chapter Program — Get Survive for your chapter →   (two small CTA cards)
//             👋 Campus Rep Program — Bring Survive to your school →     (drawn icons, no emoji)
//
// Sign out is lower-emphasis account functionality, not a highlighted row. Escape and a click on
// the backdrop close it; the close button takes focus on open and focus returns to the hamburger
// after (LearnTop). prefers-reduced-motion: no slide. Copy rule: no "run" / "blast" / "pledge".
import { useEffect, useRef, type ReactNode } from "react";
import { Bell, ChevronRight, Home, Link2, Megaphone, Star, X, Zap } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import type { TopYou } from "@/components/learn/LearnTop";
import { LK } from "@/components/learn/learn-theme";
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
.lk-menu-row:focus-visible, .lk-menu-card:focus-visible, .lk-menu-quiet:focus-visible { outline: 2px solid var(--lk-acc); outline-offset: 2px; }
.lk-menu-card { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px; margin-top: 8px; border-radius: 12px; border: 1px solid var(--lk-border); background: var(--lk-bg); color: var(--lk-text); text-decoration: none; cursor: pointer; transition: transform 160ms, border-color 160ms, box-shadow 160ms; }
@media (hover: hover) { .lk-menu-card:hover { transform: translateY(-1px); border-color: var(--lk-acc); box-shadow: var(--lk-shadow); } }
.lk-menu-card .ic { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; background: var(--lk-acc); color: var(--lk-acc-ink); flex-shrink: 0; }
.lk-menu-card .t { font-size: 14px; font-weight: 800; line-height: 1.2; }
.lk-menu-card .s { font-size: 12.5px; color: var(--lk-muted); line-height: 1.3; margin-top: 2px; }
.lk-menu-quiet { background: transparent; border: 1px solid var(--lk-border); border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--lk-muted); cursor: pointer; }
@media (hover: hover) { .lk-menu-quiet:hover { color: var(--lk-text); border-color: var(--lk-border2); } }
@media (prefers-reduced-motion: reduce) { .lk-menu { animation: none; } .lk-menu-card { transition: none; } }
`;

export function LearnMenu({ narrow, you, onClose, onShare, onReminders, onReview }: {
  narrow: boolean;
  you: TopYou;
  onClose: () => void;
  onShare: () => void;
  onReminders: () => void;
  onReview: () => void;
}) {
  const ref = useDismiss<HTMLDivElement>(onClose);
  const closeBtn = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { closeBtn.current?.focus(); }, []);
  const width = narrow ? "min(100vw - 28px, 420px)" : 360;
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
          <button type="button" className="lk-menu-row" onClick={onShare}><Link2 className="h-[18px] w-[18px]" aria-hidden /> Share this</button>
          <button type="button" className="lk-menu-row" onClick={onReview}><Star className="h-[18px] w-[18px]" aria-hidden /> Leave a review</button>
        </nav>

        <section className="lk-menu-sec" aria-label="Account">
          <span className="lk-menu-eyebrow">Account</span>
          {you.userId ? (
            <div className="flex items-center justify-between gap-3" style={{ padding: "4px 8px 8px" }}>
              <div className="min-w-0">
                <div className="text-[11.5px] font-semibold" style={{ color: LK.dim }}>Signed in as</div>
                <div className="truncate text-[13.5px] font-bold">{you.email ?? "you"}</div>
              </div>
              <button type="button" className="lk-menu-quiet shrink-0" onClick={() => { onClose(); you.signOut(); }}>Sign out</button>
            </div>
          ) : (
            <div style={{ padding: "2px 8px 8px" }}>
              <button type="button" className="lk-btn lk-btn-acc w-full" style={{ minHeight: 42 }} onClick={() => { onClose(); you.onSignIn(); }}>Sign in</button>
              <p className="text-[12px]" style={{ color: LK.muted, margin: "8px 0 0", lineHeight: 1.4 }}>Sign in to keep your progress on every device.</p>
            </div>
          )}
        </section>

        <section className="lk-menu-sec" aria-label="Programs" style={{ paddingBottom: 18 }}>
          <span className="lk-menu-eyebrow">Programs</span>
          <ProgramCard href="/chapters" icon={<Zap className="h-5 w-5" aria-hidden />} title="Greek Chapter Program" sub="Get Survive for your chapter" />
          <ProgramCard href="/rep/join" icon={<Megaphone className="h-5 w-5" aria-hidden />} title="Campus Rep Program" sub="Bring Survive to your school" />
        </section>
      </div>
    </div>
  );
}

function ProgramCard({ href, icon, title, sub }: { href: string; icon: ReactNode; title: string; sub: string }) {
  return (
    <a href={href} className="lk-menu-card">
      <span className="ic">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="t block">{title}</span>
        <span className="s block">{sub}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0" style={{ color: LK.muted }} aria-hidden />
    </a>
  );
}
