// THE FLYER BLOCK — a real generated preview, plus download and print.
//
// The preview is the ACTUAL rendered flyer (the PNG endpoint), not a mockup. A mockup would drift
// from the real output the first time the template changed, and the whole point of showing it is so
// someone can see what they are about to print.
//
// GRACEFUL FAILURE, as specified: if the image 404s the block removes itself. A chapter whose flyer
// cannot render shows nothing rather than a broken frame — the share buttons above it still work,
// so the page keeps its job.
//
// PRINT ON MOBILE: browser print dialogs are unreliable-to-absent on phones, so the print control
// becomes "Save flyer" below the sm breakpoint. Same URL either way; only the label and the
// behaviour differ, because promising a print dialog that never appears is worse than not offering
// it.
import { useEffect, useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { logGreekEvent } from "@/lib/greek-go.functions";

export function FlyerBlock({ schoolSlug, chapterSlug, chapterName }: {
  schoolSlug: string;
  /** "campus" for the campus-wide flyer. */
  chapterSlug: string;
  chapterName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [isPhone, setIsPhone] = useState(false);

  // Read in an effect, never during render — this route is server-rendered and matchMedia during
  // render makes the server and a phone disagree on the first paint.
  useEffect(() => { setIsPhone(!!window.matchMedia?.("(max-width: 639px)").matches); }, []);

  const base = `/api/flyer/${schoolSlug}/${chapterSlug}`;
  const pdf = base;
  const png = `${base}?f=png`;
  const filename = `survive-${schoolSlug}-${chapterSlug}-flyer.pdf`;

  const log = (action: "flyer_download" | "flyer_print") =>
    void logGreekEvent({ data: { kind: action === "flyer_download" ? "flyer_download" : "flyer_print", schoolSlug, chapterSlug } }).catch(() => {});

  const print = () => {
    log("flyer_print");
    // Open the same PDF and ask the viewer to print it. Not an iframe: cross-origin-ish PDF
    // printing from a hidden frame is blocked or silently ignored in several browsers.
    const w = window.open(pdf, "_blank");
    if (w) w.addEventListener("load", () => { try { w.print(); } catch { /* viewer handles it */ } });
  };

  if (failed) return null;

  const BTN: React.CSSProperties = {
    minHeight: 46, background: "rgba(245,239,230,0.06)",
    border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)",
  };

  return (
    <div className="mx-auto mt-3 w-full max-w-sm" style={{ fontFamily: BRAND_SANS }}>
      <a href={pdf} target="_blank" rel="noreferrer" className="block" aria-label={`Open the ${chapterName ?? "campus"} flyer as a PDF`}>
        <img
          src={png}
          alt={`Flyer for ${chapterName ?? schoolSlug}`}
          onError={() => setFailed(true)}
          loading="lazy"
          className="mx-auto block w-auto rounded-lg"
          style={{ height: 340, border: "1px solid rgba(245,239,230,0.18)", boxShadow: "0 18px 40px -18px rgba(0,0,0,0.7)" }}
        />
      </a>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <a
          href={pdf}
          download={filename}
          onClick={() => log("flyer_download")}
          className="flex items-center justify-center gap-1.5 rounded-xl px-3 text-[13.5px] font-bold"
          style={BTN}
        >
          <span aria-hidden>⬇</span> Download flyer
        </a>
        {isPhone ? (
          <a
            href={pdf}
            download={filename}
            onClick={() => log("flyer_download")}
            className="flex items-center justify-center gap-1.5 rounded-xl px-3 text-[13.5px] font-bold"
            style={BTN}
          >
            <span aria-hidden>⬇</span> Save flyer
          </a>
        ) : (
          <button type="button" onClick={print} className="flex items-center justify-center gap-1.5 rounded-xl px-3 text-[13.5px] font-bold" style={BTN}>
            <span aria-hidden>🖨</span> Print flyer
          </button>
        )}
      </div>

      <p className="mt-2 text-center text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        Print it for the house, or send it to the group chat.
      </p>
    </div>
  );
}
