// HOUSE ADS — THE CONTAINER, NOT THE CAMPAIGN (section 8, scaffold only).
//
// Two slots, both deliberately empty of strategy:
//
//   LearnMenu       — the /learn hamburger. Three destinations, no pitch copy, no imagery.
//   PromoSlider     — a horizontal strip pinned at the bottom of a scroll. FLAGGED OFF.
//
// ── WHY THE SLIDER SHIPS OFF ──────────────────────────────────────────────────────────────────
// The brief says to build the container and flag it off, and that is exactly right for this one:
// a promo strip on a study surface is the kind of thing that is obviously fine in a mock and
// obviously wrong at 11pm the night before an exam. Shipping it dark means the layout question
// ("does anything break when a strip appears at the bottom of the scroll?") is answered now and
// the judgement call ("should it?") is answered later, by Lee, with one constant.
//
// INTERSPERSING PROMOS INTO THE STUDY PATH IS EXPLICITLY NOT BUILT. It was named as a later
// thing, and building it now — even behind a flag — would put ad-insertion logic inside the
// component that decides what a student studies next. That is a seam worth not opening early.
import { ArrowRight, Users, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { useScrollLock } from "@/lib/use-scroll-lock";

/** THE FLAG. Flip to true to show the bottom slider everywhere it is mounted.
 *
 *  A module constant rather than an env var on purpose: an env var implies per-environment
 *  behaviour, and the question here is not "on in preview, off in prod" — it is "has Lee decided
 *  yet". One line, one place, greppable. */
export const HOUSE_ADS_SLIDER_ENABLED = false;

type Promo = { id: string; label: string; sub: string; href: string; icon: typeof Zap };

/** The three house destinations. Same list in the menu and the slider — a promo the student
 *  dismissed in one place should not be a different offer in the other. */
export const HOUSE_PROMOS: Promo[] = [
  { id: "greek", label: "Set up your Greek chapter", sub: "Everyone in the house, one link", href: "/chapters", icon: Users },
  { id: "rep", label: "Become a campus rep", sub: "Run Survive on your campus", href: "/rep/join", icon: Zap },
  { id: "access", label: "Get full access", sub: "Exams 2, 3 and the Final", href: "/#exam1", icon: ArrowRight },
];

/** THE /learn HAMBURGER. Deliberately not the marketing menu: these are the three things a
 *  student on this surface could go and do, and nothing else. No Reviews, no Meet-your-tutor —
 *  a student who is here has already decided. */
export function LearnMenu({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-start justify-end"
      style={{ background: "rgba(4,7,14,0.7)" }}
      onMouseDown={(e) => { if (!panel.current?.contains(e.target as Node)) onClose(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="m-2 w-[276px] overflow-hidden rounded-2xl"
        style={{
          marginTop: "calc(8px + env(safe-area-inset-top, 0px))",
          background: "var(--lm-surface, #101728)",
          border: "1px solid var(--lm-border)",
          boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)",
          fontFamily: BRAND_SANS,
        }}
      >
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--lm-muted)" }}>More</span>
          <button onClick={onClose} aria-label="Close" className="-mr-1 grid place-items-center rounded-full hover:bg-white/10" style={{ height: 36, width: 36, color: "var(--lm-muted)", background: "none", border: 0, cursor: "pointer" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {HOUSE_PROMOS.map((p) => (
          <a
            key={p.id}
            href={p.href}
            className="flex items-center gap-3 px-4 hover:bg-white/5"
            style={{ minHeight: 56, color: "var(--lm-text)", borderTop: "1px solid var(--lm-border)" }}
          >
            <p.icon className="h-4 w-4 shrink-0" style={{ color: "var(--lm-accent)" }} />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-black">{p.label}</span>
              <span className="block truncate text-[11.5px]" style={{ color: "var(--lm-muted)" }}>{p.sub}</span>
            </span>
          </a>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** THE BOTTOM SLIDER — a horizontal strip for whoever reaches the end of a scroll.
 *
 *  Renders NOTHING while the flag is off, rather than rendering hidden: an element with
 *  `display: none` still occupies the DOM, still gets measured by anything walking the tree, and
 *  is exactly the thing that turns up on a page six months later doing something unexpected.
 *
 *  It is mountable on marketing pages too — the styling reads from --lm-* with marketing-token
 *  fallbacks, so one component serves both shells. */
export function PromoSlider({ enabled = HOUSE_ADS_SLIDER_ENABLED }: { enabled?: boolean } = {}) {
  if (!enabled) return null;
  return (
    <div className="w-full" style={{ fontFamily: BRAND_SANS }} aria-label="More from Survive">
      <p className="px-1 pb-2 text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--lm-muted, var(--text-muted))" }}>
        More from Survive
      </p>
      <div
        className="flex gap-3 overflow-x-auto pb-1"
        style={{ scrollSnapType: "x mandatory", overscrollBehaviorX: "contain" }}
      >
        {HOUSE_PROMOS.map((p) => (
          <a
            key={p.id}
            href={p.href}
            className="flex shrink-0 flex-col justify-between rounded-xl px-4 py-3"
            style={{
              width: 232, scrollSnapAlign: "start",
              background: "var(--lm-surface, var(--bg-surface))",
              border: "1px solid var(--lm-border, var(--border-default))",
              color: "var(--lm-text, var(--brand-cream))",
            }}
          >
            <p.icon className="h-4 w-4" style={{ color: "var(--lm-accent, var(--accent))" }} />
            <span className="mt-2 block text-[13.5px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY }}>{p.label}</span>
            <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--lm-muted, var(--text-muted))" }}>{p.sub}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
