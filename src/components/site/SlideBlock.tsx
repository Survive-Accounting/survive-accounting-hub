// THE MEETING SLIDE BLOCK (K2, 2026-08-28) — the share kit's third tier.
//
// SAME GENERATOR AS THE COUNCIL KIT. The 16:9 projector slide is produced by flyer.server's
// slideSvg/slidePdf through the existing /api/flyer/<school>/<chapter> endpoint (?f=slide for the
// preview, ?f=slide&pdf=1 for the file) — there is exactly one slide design in this codebase and
// the council partner kit ships the identical artwork. Do not add a second one.
//
// Its QR carries ?via=slide, so a scan from a chapter-meeting projector is distinguishable from a
// flyer on a wall. Graceful failure mirrors FlyerBlock: if the endpoint cannot render, the whole
// block (title included) removes itself rather than labelling a missing thing.
import { useEffect, useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { logGreekEvent } from "@/lib/greek-go.functions";

export function SlideBlock({ schoolSlug, chapterSlug, chapterName, title, subtitle, onShared }: {
  schoolSlug: string;
  chapterSlug: string;
  chapterName?: string;
  title?: string;
  subtitle?: string;
  /** Fires when the visitor downloads the slide — feeds the K4.3 nudge. */
  onShared?: () => void;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const base = `/api/flyer/${schoolSlug}/${chapterSlug}`;
  const preview = `${base}?f=slide`;
  const pdf = `${base}?f=slide&pdf=1`;
  const filename = `survive-${schoolSlug}-${chapterSlug}-slide.pdf`;

  // Inline SVG, not <img src>, for the same reason FlyerBlock does it: an SVG in an <img> is its
  // own document and cannot reach the page's already-loaded Poppins.
  useEffect(() => {
    let live = true;
    void fetch(preview)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => { if (live) setSvg(t); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [preview]);

  if (failed || !svg) return null;

  const BTN: React.CSSProperties = {
    minHeight: 46, background: "rgba(245,239,230,0.06)",
    border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)",
  };

  return (
    <div className="mx-auto mt-3 w-full max-w-sm" style={{ fontFamily: BRAND_SANS }}>
      {title && (
        <div className="mb-2.5 mt-4 text-center">
          <p className="text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>{title}</p>
          {subtitle && <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
        </div>
      )}
      <a
        href={pdf}
        target="_blank"
        rel="noreferrer"
        className="mx-auto block overflow-hidden rounded-lg"
        aria-label={`Open the ${chapterName ?? "chapter"} meeting slide as a PDF`}
        style={{ width: 263, border: "1px solid rgba(245,239,230,0.18)", boxShadow: "0 18px 40px -18px rgba(0,0,0,0.7)" }}
      >
        <div aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
      </a>

      <div className="mt-2">
        <a
          href={pdf}
          download={filename}
          onClick={() => { onShared?.(); void logGreekEvent({ data: { kind: "flyer_download", schoolSlug, chapterSlug, via: "slide" } }).catch(() => {}); }}
          className="flex items-center justify-center gap-1.5 rounded-xl px-3 text-[13.5px] font-bold"
          style={BTN}
        >
          <span aria-hidden>⬇</span> Download slide
        </a>
      </div>

      <p className="mt-2 text-center text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        For chapter meetings — one slide, one QR.
      </p>
    </div>
  );
}
