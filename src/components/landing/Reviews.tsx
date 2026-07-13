// Self-hosted testimonials carousel (replaces the testimonial.to embed).
// Student-navigated with arrows/dots (no auto-scroll), 5-star rating on each,
// "Show more" for longer quotes, self-hosted avatars with an initials fallback.
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Quote, Star } from "lucide-react";
import { TESTIMONIALS, type Testimonial } from "./testimonials-data";

const NAVY = "#14213D";
const GOLD = "#F5A623";
const RED = "#CE1126";
const TRUNCATE_AT = 300;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function Stars() {
  return (
    <div className="flex items-center gap-0.5" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className="h-[18px] w-[18px]" style={{ color: GOLD, fill: GOLD }} />
      ))}
    </div>
  );
}

function Avatar({ t }: { t: Testimonial }) {
  if (t.avatar) {
    return (
      <img
        src={t.avatar}
        alt={t.name}
        loading="lazy"
        className="h-12 w-12 shrink-0 rounded-full object-cover"
        style={{ boxShadow: "0 2px 8px rgba(20,33,61,0.18)" }}
      />
    );
  }
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2A3B63 100%)` }}
      aria-hidden
    >
      {initials(t.name)}
    </span>
  );
}

export default function Reviews() {
  const items = TESTIMONIALS;
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const t = items[index];
  const isLong = t.message.length > TRUNCATE_AT;
  const shown = useMemo(() => {
    if (!isLong || expanded) return t.message;
    const cut = t.message.slice(0, TRUNCATE_AT);
    return cut.slice(0, cut.lastIndexOf(" ")).trimEnd() + "…";
  }, [t.message, isLong, expanded]);

  const go = (dir: number) => {
    setExpanded(false);
    setIndex((i) => (i + dir + items.length) % items.length);
  };

  // Keyboard arrows navigate when the section is in view / focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    const el = document.getElementById("reviews-section");
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  return (
    <section id="reviews-section" tabIndex={-1} className="relative px-4 py-16 outline-none sm:px-6 sm:py-20" style={{ background: "#FFFFFF" }}>
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <h2
          className="mb-2 text-center text-[26px] leading-tight sm:text-[34px]"
          style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400, color: NAVY }}
        >
          Hear what people have to say about Survive Accounting
        </h2>
        <p className="mb-8 text-center text-sm text-gray-500 sm:mb-10">Real students, real results.</p>

        <div className="relative">
          {/* Card */}
          <div
            key={index}
            className="rounded-3xl border bg-white px-6 py-8 sm:px-10 sm:py-10"
            style={{ borderColor: "rgba(20,33,61,0.10)", boxShadow: "0 18px 50px rgba(20,33,61,0.10)" }}
          >
            <div className="flex items-center justify-between">
              <Stars />
              <Quote className="h-8 w-8" style={{ color: "rgba(20,33,61,0.10)" }} />
            </div>

            <p className="mt-5 min-h-[132px] whitespace-pre-line text-[17px] leading-relaxed text-gray-800 sm:text-lg">
              {shown}
            </p>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 text-sm font-semibold hover:underline"
                style={{ color: RED }}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}

            <div className="mt-6 flex items-center gap-3 border-t pt-5" style={{ borderColor: "rgba(20,33,61,0.08)" }}>
              <Avatar t={t} />
              <div className="min-w-0">
                <div className="truncate font-semibold" style={{ color: NAVY }}>{t.name}</div>
                {t.school && <div className="text-sm text-gray-500">{t.school}</div>}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous testimonial"
              className="flex h-11 w-11 items-center justify-center rounded-full border bg-white transition hover:-translate-y-0.5 hover:shadow-md"
              style={{ borderColor: "rgba(20,33,61,0.15)", color: NAVY }}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-1.5">
              {items.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to testimonial ${i + 1}`}
                  onClick={() => { setExpanded(false); setIndex(i); }}
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: i === index ? 22 : 8,
                    background: i === index ? RED : "rgba(20,33,61,0.18)",
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next testimonial"
              className="flex h-11 w-11 items-center justify-center rounded-full border bg-white transition hover:-translate-y-0.5 hover:shadow-md"
              style={{ borderColor: "rgba(20,33,61,0.15)", color: NAVY }}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
