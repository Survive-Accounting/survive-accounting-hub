// A FIGURE AND ITS ASSUMPTION — the `?` marker beside every number on the deck.
//
// A MODAL, NOT A HOVER BUBBLE. This page is read on a phone, in an email, and a hover tooltip
// does not exist on a phone: it either never opens or opens on a tap that also counts as a click
// on whatever is underneath. So the marker is a real button and it opens a real dialog —
// focusable, Escape-closable, scrim-dismissable, and the same overlay treatment every other sheet
// on the site uses.
//
// The number and its marker never wrap apart from each other.
import { useEffect, useRef, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { CAMPAIGN_FIGURES, type CampaignFigureKey } from "./campaign-figures";

export function Figure({ k, className, style }: {
  k: CampaignFigureKey;
  className?: string;
  style?: React.CSSProperties;
}) {
  const fig = CAMPAIGN_FIGURES[k];
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    // Focus moves INTO the dialog, or a keyboard user is left behind on the page under it.
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!fig) return null;

  return (
    <>
      <span className={className} style={{ whiteSpace: "nowrap", ...style }}>
        {fig.label}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`What's behind ${fig.title}`}
          className="sa-fig-mark focus-visible:ring-2"
          style={{
            marginLeft: 5, verticalAlign: "super", fontSize: "0.5em", lineHeight: 1,
            width: "1.9em", height: "1.9em", borderRadius: "999px",
            background: "rgba(252,163,17,0.16)", color: "var(--accent)",
            border: "1px solid rgba(252,163,17,0.5)", cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontFamily: BRAND_SANS, fontWeight: 900,
          }}
        >
          ?
        </button>
      </span>

      {open && (
        <div
          className="fixed inset-0 z-[260] flex items-end justify-center overflow-y-auto sm:items-center sm:px-4"
          style={{ background: "rgba(5,8,16,0.72)" }}
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={fig.title}
            className="w-full max-w-[440px] rounded-t-2xl p-5 text-left sm:rounded-2xl"
            style={{
              background: "var(--bg-overlay)", border: "1px solid var(--border-default)",
              boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)",
              paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))",
              fontFamily: BRAND_SANS,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
                {fig.title}
              </h3>
              <button
                ref={closeRef}
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10"
                style={{ color: "var(--brand-cream)", background: "none", border: 0, cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            <p className="text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>
              {fig.body}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export const FIGURE_CSS = `
.sa-fig-mark { transition: background-color 140ms, transform 140ms; }
.sa-fig-mark:hover { background: rgba(252,163,17,0.3); transform: translateY(-1px); }
@media (prefers-reduced-motion: reduce) { .sa-fig-mark:hover { transform: none; } }
`;
