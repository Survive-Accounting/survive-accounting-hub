// THE PRESENTATION — 15 slides, click or arrow-key on desktop, swipe on a phone.
//
// NO AUTOPLAY. A deck that advances on a timer takes the reading speed out of the reader's hands,
// and this deck exists to be argued with: someone who stops on the revenue slide to open its
// assumption should find it still there when they look up.
//
// THE SLIDES ARE DATA (campaign-slides.tsx). This file knows how to page through a list and
// nothing about what is in it.
//
// EVERY SLIDE IS IN THE DOM, one visible. Rendering only the current slide would mean a reader
// using find-in-page — which is exactly what a skeptical person does with a pitch — finds
// nothing. The hidden ones are `hidden` (inert to assistive tech) but present in the document.
import { useCallback, useEffect, useRef, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { CAMPAIGN_SLIDES } from "./campaign-slides";

export function CampaignDeck({ id, reportHref }: {
  id: string;
  /** The full written report. Null hides the link entirely rather than shipping a dead one. */
  reportHref?: string | null;
}) {
  const [i, setI] = useState(0);
  const last = CAMPAIGN_SLIDES.length - 1;
  const frame = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  const go = useCallback((n: number) => setI((c) => Math.min(last, Math.max(0, typeof n === "number" ? n : c))), [last]);
  const next = useCallback(() => setI((c) => Math.min(last, c + 1)), [last]);
  const prev = useCallback(() => setI((c) => Math.max(0, c - 1)), []);

  // ARROW KEYS ONLY WHILE THE DECK HAS FOCUS. A page-level key listener would hijack the arrow
  // keys from someone scrolling the page or typing in the referral form below it.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Home") { e.preventDefault(); go(0); }
      else if (e.key === "End") { e.preventDefault(); go(last); }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [next, prev, go, last]);

  const slide = CAMPAIGN_SLIDES[i];

  return (
    <section id={id} className="sa-anchor mt-16" style={{ fontFamily: BRAND_SANS }}>
      <h2 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
        The campaign
      </h2>
      <p className="mt-2 text-[14px]" style={{ color: "var(--text-muted)" }}>
        Every number has a <span aria-hidden>?</span> beside it — open it to see the assumption.
      </p>

      <div
        ref={frame}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={`Campaign presentation, slide ${i + 1} of ${CAMPAIGN_SLIDES.length}`}
        className="sa-deck mt-4 rounded-2xl focus-visible:ring-2"
        style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-default)",
          boxShadow: "0 24px 60px -30px rgba(0,0,0,0.7), 0 4px 24px -4px rgba(0,0,0,0.45)",
        }}
        onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          if (start == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? start) - start;
          // 45px, so a vertical scroll that drifts sideways does not page the deck.
          if (dx <= -45) next();
          else if (dx >= 45) prev();
        }}
      >
        <div className="flex min-h-[340px] flex-col justify-center px-5 py-8 sm:min-h-[300px] sm:px-10">
          {CAMPAIGN_SLIDES.map((s, n) => (
            <div key={s.headline} hidden={n !== i}>
              <p className="text-[11.5px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em" }}>
                {s.kicker}
              </p>
              <h3
                className="mt-3 text-[24px] font-black leading-[1.15] sm:text-[30px]"
                style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}
              >
                {s.headline}
              </h3>
              <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.82 }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>

        {/* CONTROLS — a real prev/next and a counter. The dot row is the counter on desktop and
            collapses to the plain "n / 15" on a phone, where 15 dots are 15 four-pixel targets. */}
        <div
          className="flex items-center justify-between gap-3 border-t px-4 py-3"
          style={{ borderColor: "var(--border-default)" }}
        >
          <DeckButton onClick={prev} disabled={i === 0} label="Previous slide">←</DeckButton>

          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[12.5px] tabular-nums" style={{ color: "var(--text-muted)" }} aria-live="polite">
              {i + 1} / {CAMPAIGN_SLIDES.length}
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              {CAMPAIGN_SLIDES.map((s, n) => (
                <button
                  key={s.headline}
                  type="button"
                  onClick={() => go(n)}
                  aria-label={`Slide ${n + 1}`}
                  aria-current={n === i}
                  style={{
                    width: n === i ? 18 : 7, height: 7, borderRadius: 999, border: 0, padding: 0,
                    background: n === i ? "var(--accent)" : "rgba(245,239,230,0.28)",
                    cursor: "pointer", transition: "width 160ms, background-color 160ms",
                  }}
                />
              ))}
            </span>
          </div>

          <DeckButton onClick={next} disabled={i === last} label="Next slide">→</DeckButton>
        </div>
      </div>

      {reportHref && (
        <p className="mt-3 text-[13.5px]" style={{ color: "var(--text-muted)" }}>
          <a href={reportHref} target="_blank" rel="noreferrer" className="underline underline-offset-4" style={{ color: "var(--accent)" }}>
            Read the full written report (PDF) →
          </a>
        </p>
      )}
    </section>
  );
}

function DeckButton({ onClick, disabled, label, children }: {
  onClick: () => void; disabled: boolean; label: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="shrink-0 rounded-xl focus-visible:ring-2 disabled:opacity-30"
      style={{
        minWidth: 48, minHeight: 44, background: "rgba(0,0,0,0.22)",
        border: "1px solid var(--border-default)", color: "var(--brand-cream)",
        cursor: disabled ? "default" : "pointer", fontSize: 16, fontWeight: 900,
      }}
    >
      {children}
    </button>
  );
}
