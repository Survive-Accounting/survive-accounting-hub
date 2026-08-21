// MOBILE STICKY CTA — "Exam 1 Free | Chapter Access", pinned to the bottom on phones.
//
// Phones lost both hero buttons the moment they scrolled: the navbar CTA is hidden below md, so
// the only conversion controls on a pocket screen lived inside the hamburger. This bar keeps the
// page's two intents one thumb away — and ONLY once the hero (which carries the same two
// buttons) has scrolled off, so the CTAs are never on screen twice.
//
// It also hides while any field on the page is focused: a fixed bar riding on top of the iOS
// keyboard would sit exactly where the claim form's inputs are, and covering the form it exists
// to promote would be self-defeating. Safe-area padding keeps it clear of the iPhone home bar.
//
// Rendered only by the /go/ chapter route; the plain landing page keeps its single-CTA hero.
import { useEffect, useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { scrollToId } from "@/lib/ui-scroll";

export function ChapterStickyCta({ heroId, examAnchor, accessAnchor, onStartExam }: {
  /** The hero element to watch — the bar shows only after it leaves the viewport. */
  heroId: string;
  examAnchor: string;
  accessAnchor: string;
  /** Same member attribution the hero's Start button fires. */
  onStartExam?: () => void;
}) {
  const [pastHero, setPastHero] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const hero = document.getElementById(heroId);
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting), { threshold: 0 });
    io.observe(hero);
    return () => io.disconnect();
  }, [heroId]);

  // focusin/focusout bubble (focus/blur don't) — one document listener covers every field the
  // page will ever have, including ones mounted later.
  //
  // THE STUCK-FLAG TRAP: unmounting a focused element fires NO focusout (spec focus fixup), so a
  // form that swaps its inputs for a success card while one is focused would leave `typing` true
  // forever and the bar hidden for the rest of the visit. Two guards close it: any focusin sets
  // the flag from what actually got focus (a button clears it), and any pointerup re-reads
  // document.activeElement, which falls back to <body> after such an unmount.
  useEffect(() => {
    const isField = (t: unknown) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA");
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = (e: FocusEvent) => { if (isField(e.target)) setTyping(false); };
    const onUp = () => setTyping(isField(document.activeElement));
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      document.removeEventListener("pointerup", onUp);
    };
  }, []);

  if (!pastHero || typing) return null;

  const BTN = "flex-1 rounded-xl text-[14.5px] font-black focus-visible:ring-2";

  return (
    // md:hidden, not sm:hidden — the navbar's own CTA only appears at md, so hiding this bar at
    // sm would leave 640-767px viewports (landscape phones) with no persistent CTA at all.
    <div
      className="fixed inset-x-0 bottom-0 z-[190] px-3 pt-2 md:hidden"
      style={{
        fontFamily: BRAND_SANS,
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 10px)",
        background: "color-mix(in srgb, var(--sa-surface-nav, #0F1A2E) 94%, transparent)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid var(--border-default)",
      }}
    >
      <div className="mx-auto flex w-full max-w-sm gap-2">
        <button
          type="button"
          onClick={() => { onStartExam?.(); scrollToId(examAnchor); }}
          className={BTN}
          style={{ minHeight: 48, background: "var(--accent)", color: "#0B1220" }}
        >
          Exam 1 Free
        </button>
        <button
          type="button"
          onClick={() => scrollToId(accessAnchor)}
          className={BTN}
          style={{ minHeight: 48, color: "var(--brand-cream)", background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
        >
          Chapter Access
        </button>
      </div>
    </div>
  );
}
