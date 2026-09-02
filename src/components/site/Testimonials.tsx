// STUDENT PROOF — the review slider, shared by the landing pages and the partner pages.
//
// Lifted out of routes/landing so a component can import it: partner pages carry the SAME student
// testimonials as the student pages (a council officer is being asked to trust the same product),
// and nothing about the data or the slider changed in the move.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";

// ---- TESTIMONIALS (own slider — navy/cream/bolt; no white cards / stars / verified badges) ----
// Curated top-10 from testimonials.csv, best-first. long=1 → truncate + "show more". Auto-advances
// 6s; ANY interaction stops it permanently; reduced-motion = manual only. `avatar` is our RE-HOSTED
// Supabase URL (testimonial-avatars bucket) — the original testimonial.to Firebase avatars are never
// hotlinked; a person with no source avatar (or a broken load) falls back to initials.
const AV = "https://unvxagsledbsdoremqeb.supabase.co/storage/v1/object/public/testimonial-avatars";
// `code` is the student's OWN course code, optional. None of the current rows have one, so they
// all render campus-only. Do NOT backfill it from the campus: the code a student took in 2019 is
// not necessarily the code that campus uses now, and that is a fact about a real person.
type Testimonial = { name: string; school: string; long: boolean; quote: string; avatar?: string; code?: string };
const TESTIMONIALS: Testimonial[] = [
  { name: "Zach Parker", school: "Ole Miss", long: false, quote: "Lee your videos saved me on multiple choice. Everything you thought would be on there was." },
  { name: "George L.", school: "Ole Miss", long: false, quote: "If it weren’t for Lee, I wouldn’t have made A’s in both intro courses.", avatar: `${AV}/george-l.jpg` },
  { name: "Tyler K.", school: "Ole Miss", long: false, quote: "Lee's exam prep videos are better than any tutor I’ve ever had.", avatar: `${AV}/tyler-k.jpg` },
  { name: "James L.", school: "Ole Miss", long: false, quote: "Feel like I got an A purely because of Lee's videos." },
  { name: "Claire Ficek", school: "Ole Miss", long: false, quote: "Survive Accounting is literally the only reason that I got through Accounting 201! A bunch of my friends used it and said it was so helpful." },
  { name: "Ryan M.", school: "Ole Miss", long: false, quote: "Lee's videos were a lifesaver. I would've failed without them.", avatar: `${AV}/ryan-m.jpg` },
  { name: "Nic Ripson", school: "Ole Miss", long: false, quote: "Survive Accounting helped me better understand the content I needed to learn. My quiz average was a 45% and after using this platform to study I got an 84.5% on my first intermediate exam." },
  { name: "Brace R.", school: "Ole Miss", long: false, quote: "I enjoyed how he broke everything down to very simple terms that weren’t necessarily explained in class.", avatar: `${AV}/brace-r.jpg` },
  { name: "Nate K.", school: "Ole Miss", long: true, quote: "Survive accounting is the sole reason that I got through both accounting courses at ole miss. Lee does an exceptional job breaking every little piece down as much as possible and makes it super easy to follow along. He is very enthusiastic and not only is he a great accounting tutor but he is also a genuinely great guy. If you need assistance in your accounting class I highly recommend Survive Accounting.", avatar: `${AV}/nate-k.jpg` },
  { name: "Daniel B.", school: "Ole Miss", long: true, quote: "Survive Accounting helped with my homework, test preparation, and the overall understanding of accounting. Having the ability to see how Lee went step by step in problems helped me grasp super confusing concepts. He was also very friendly over email and even gave me specific pointers about assignments I emailed to him which was a huge help. If you are going to dedicate time to studying, I would highly recommend using Survive Accounting to optimize your understanding of the material and give yourself a greater chance of receiving a high grade in the class!", avatar: `${AV}/daniel-b.jpg` },
];
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** Truncate to whole SENTENCES within a character budget — never mid-word (p6 §11). Most people
 *  never expand, so the visible portion has to read as the whole testimonial. Returns whether
 *  anything was cut, so "Read more" only shows when it genuinely adds. */
function truncateAtSentence(text: string, budget: number): { shown: string; truncated: boolean } {
  const full = text.trim();
  if (full.length <= budget) return { shown: full, truncated: false };
  const sentences = full.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [full];
  let out = "";
  for (const s of sentences) {
    if (out && (out + s).trim().length > budget) break;
    out += s;
  }
  out = out.trim();
  if (!out) out = sentences[0].trim(); // a first sentence longer than the budget stays whole
  return { shown: out, truncated: out.length < full.length };
}

// Avatar: our re-hosted image when present, initials otherwise (and on any load error — never a
// hotlink, never a broken image).
function TestimonialAvatar({ name, src }: { name: string; src?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    // Eager (not lazy): the slider translates cards off-screen, and lazy never fires for a
    // transformed off-screen <img>. These are 2–5KB each, so eager load is cheap and reliable.
    return <img src={src} alt={name} onError={() => setBroken(true)} className="h-12 w-12 shrink-0 rounded-full object-cover" style={{ border: "1px solid var(--border-default)" }} />;
  }
  return <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-[14px] font-black" style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--accent)" }}>{initialsOf(name)}</span>;
}

/** THREE-UP review cards (one-up below sm), paged. The heading lives in SocialProofSection so it
 *  sits on the same baseline as "Meet your tutor" beside it. Auto-advances by PAGE every 7s;
 *  any interaction stops it for good; reduced motion never starts it. No star RATING is quoted —
 *  five brand stars + the real "1,000+ students helped" number, nothing invented. */
export function TestimonialsSlider() {
  const reduce = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  const n = TESTIMONIALS.length;
  // Per-page count is read in an effect (SSR renders 3-up; a phone drops to 1-up after mount).
  const [per, setPer] = useState(3);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setPer(mq.matches ? 1 : 3);
    apply(); mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  // NEVER A LONE CARD. 10 testimonials three-up left the last page showing one card and two empty
  // slots. The track is padded by wrapping the FIRST cards back onto the end, so the final page is
  // a full row that loops around (…, 9, 1, 2) instead of a single orphan. Exact multiples pad
  // nothing, and the one-up phone layout never needs it.
  const track = useMemo(() => {
    const rem = n % per;
    return rem === 0 ? TESTIMONIALS : [...TESTIMONIALS, ...TESTIMONIALS.slice(0, per - rem)];
  }, [per, n]);
  const total = track.length;
  const pages = Math.ceil(n / per);
  const [page, setPage] = useState(0);
  const [auto, setAuto] = useState(!reduce);
  const [hover, setHover] = useState(false);
  // Expanded quotes, keyed by TRACK INDEX (a wrapped card appears twice; keying by name would
  // expand both copies). Once open, it stays open — collapsing is optional (p6 §11).
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const stop = () => setAuto(false);
  const go = (d: -1 | 1) => setPage((p) => (p + d + pages) % pages);
  useEffect(() => { setPage((p) => Math.min(p, pages - 1)); }, [pages]);
  useEffect(() => {
    if (!auto || hover || reduce || pages < 2) return;
    const t = window.setInterval(() => setPage((p) => (p + 1) % pages), 7000);
    return () => window.clearInterval(t);
  }, [auto, hover, reduce, pages]);

  // pointer drag / swipe; past threshold advances AND stops auto-play.
  const start = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  const onDown = (e: RPointerEvent) => { start.current = e.clientX; };
  const onMove = (e: RPointerEvent) => { if (start.current != null) setDx(e.clientX - start.current); };
  const end = () => { const d = dx; start.current = null; setDx(0); if (Math.abs(d) > 40) { go(d < 0 ? 1 : -1); stop(); } };

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="mb-4 flex items-center gap-2 text-[14px]" style={{ color: "var(--brand-cream)" }}>
        <span aria-hidden style={{ color: "var(--accent)", letterSpacing: "0.08em" }}>★★★★★</span>
        <span style={{ opacity: 0.7 }}>1,000+ students helped</span>
      </div>

      <div className="relative select-none overflow-hidden" style={{ touchAction: "pan-y" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={end} onPointerLeave={() => { if (start.current != null) { start.current = null; setDx(0); } }}>
        <div className="flex" style={{ width: `${(total / per) * 100}%`, transform: `translateX(calc(-${page * (per / total) * 100}% + ${dx}px))`, transition: start.current != null ? "none" : "transform 420ms ease" }}>
          {track.map((t, i) => {
            // Clean truncation at a sentence boundary (never the old mid-word CSS clamp). The card
            // grows in place on expand; on mobile per=1 so there is no neighbour to shift.
            const { shown, truncated } = truncateAtSentence(t.quote, 185);
            const open = expanded.has(i);
            return (
            // Index in the key: a wrapped card appears twice in the track and names are not unique.
            <figure key={`${t.name}-${i}`} className="px-1.5" style={{ width: `${100 / total}%` }} aria-hidden={i >= n ? true : undefined}>
              <div className="flex h-full flex-col rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", minHeight: 168 }}>
                <blockquote className="text-[14px] leading-relaxed" style={{ color: "var(--brand-cream)" }}>
                  &ldquo;{open ? t.quote : shown}&rdquo;
                  {truncated && !open && (
                    <button
                      type="button"
                      onClick={() => { setExpanded((s) => new Set(s).add(i)); stop(); }}
                      className="ml-1 whitespace-nowrap font-bold underline underline-offset-2"
                      style={{ color: "var(--accent)", background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit" }}
                    >
                      Read more
                    </button>
                  )}
                </blockquote>
                <figcaption className="mt-auto flex items-center gap-2.5 pt-3">
                  <TestimonialAvatar name={t.name} src={t.avatar} />
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>{t.name}</span>
                    <span className="block text-[11.5px]" style={{ color: "var(--text-muted)" }}>{[t.school, t.code].filter(Boolean).join(" · ")}</span>
                  </span>
                </figcaption>
              </div>
            </figure>
            );
          })}
        </div>
      </div>

      {/* controls — every one stops auto-play permanently */}
      {pages > 1 && (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={() => { go(-1); stop(); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[20px] hover:bg-white/5" style={{ color: "var(--brand-cream)", border: "1px solid var(--border-default)" }} aria-label="Previous reviews">‹</button>
          {/* Each dot is an 8px mark inside a 44px button — the target is thumb-sized, the
              indicator stays a dot. Dots are 24px apart so ten of them fit a phone. */}
          {/* Below sm the pager is a counter: ten thumb-sized dots are 440px wide, which a phone
              cannot hold, and 8px dots were the smallest targets on the page. */}
          <span className="text-[14px] font-bold tabular-nums sm:hidden" style={{ color: "var(--text-muted)" }} aria-live="polite">{page + 1} / {pages}</span>
          <div className="hidden items-center sm:flex">
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} onClick={() => { setPage(i); stop(); }} aria-label={`Go to reviews page ${i + 1}`} aria-current={i === page ? "true" : undefined} className="grid place-items-center" style={{ width: i === page ? 34 : 24, height: 44 }}>
                <span className="block h-2 rounded-full transition-all" style={{ width: i === page ? 18 : 8, background: i === page ? "var(--accent)" : "rgba(245,239,230,0.3)" }} />
              </button>
            ))}
          </div>
          <button onClick={() => { go(1); stop(); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[20px] hover:bg-white/5" style={{ color: "var(--brand-cream)", border: "1px solid var(--border-default)" }} aria-label="Next reviews">›</button>
        </div>
      )}
    </div>
  );
}

// ---- CHAPTER BANNER + CLAIM (on /go/<school>/<chapter> links) --------------------------------
// The chapter strip + an optional claim (name + phone -> member row). Never gates:
// the player already works; claiming just registers the member so the chapter dashboard counts them.
// ChapterBanner and ClaimModal were DELETED here.
//
// The banner repeated what the chapter header now says in type (chapter, school, course code),
// and its "Claim your free access" modal was the only thing that opened ClaimModal. Member
// attribution did not go with them — it moved to the "Start Exam 1 free" press, which is the
// same signal without a form in front of the free product.

// ---- SECTION RHYTHM — a quiet 1px breath between major sections (my-12 → ~96px gap) --------------