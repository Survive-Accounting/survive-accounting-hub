// ONE TESTIMONIAL, under the copy button (Build 2, section 2). A council exec is about to put her
// own name behind a link; a single real student outcome is the proof that makes that feel safe.
//
// Uses the self-hosted testimonial data (never the testimonial.to embed) and the brand palette.
// One compact card — not the slider — because the panel is a focused ask, not a proof wall.
import { useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { TESTIMONIALS } from "@/components/landing/testimonials-data";

const CREAM = "#F5F1E8";
const MUTED = "#8B97BD";
const AMBER = "#F5A623";

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/** The lead testimonial — first in the best-first list, and a concrete outcome ("45% → 84.5%"). */
const T = TESTIMONIALS[0];

export function ChairTestimonial() {
  const [broken, setBroken] = useState(false);
  return (
    <figure
      className="mt-3 flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left"
      style={{ background: "rgba(0,0,0,0.22)", border: "1px solid rgba(245,239,230,0.12)", fontFamily: BRAND_SANS }}
    >
      {T.avatar && !broken ? (
        <img
          src={T.avatar}
          alt={T.name}
          onError={() => setBroken(true)}
          className="h-8 w-8 shrink-0 rounded-full object-cover"
          style={{ border: "1px solid rgba(245,239,230,0.16)" }}
        />
      ) : (
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-black"
          style={{ background: "rgba(245,166,35,0.14)", color: AMBER }}
        >
          {initials(T.name)}
        </span>
      )}
      <div className="min-w-0">
        <blockquote className="text-[12px] leading-snug" style={{ color: CREAM }}>
          “{T.message}”
        </blockquote>
        <figcaption className="mt-1 text-[11px] font-bold" style={{ color: MUTED }}>
          {T.name}{T.school ? ` · ${T.school}` : ""}
        </figcaption>
      </div>
    </figure>
  );
}
