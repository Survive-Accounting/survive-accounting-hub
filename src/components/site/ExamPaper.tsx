// THE HERO GRAPHIC (Pass 3) — a cream exam sheet on the navy, with the split bolt struck
// through it.
//
// It exists because the hero read as empty: centred text floating in a large navy field with
// nothing to look at. This is the visual anchor, and it is also a second door into the player —
// the whole thing is one button that does exactly what the CTA does.
//
// DECORATIVE ONLY, deliberately. The question lines are greeked strokes, not sentences, and the
// bubbles carry no letters. A student must never be able to read a real accounting question here
// and least of all a real ANSWER: the filled bubbles are chosen for rhythm, not correctness, and
// putting legible content on a marketing prop is how an answer key leaks into a screenshot.
//
// Pure SVG + CSS: no JS animation loop, no canvas, no video. The colour cycle is a CSS keyframe
// on two CSS variables, so it costs nothing per frame in JS and stops dead under reduced motion.
import { BRAND_BLUE, BRAND_RED } from "@/components/canvas/brand";

/** Greeked question rows. `w` is the stroke length as a % of the writing column — varying it is
 *  what makes the block read as language rather than as a barcode. `fill` is which bubble is
 *  inked, chosen only for visual rhythm. */
const ROWS: { w: number; fill: number }[] = [
  { w: 92, fill: 2 },
  { w: 78, fill: 0 },
  { w: 88, fill: 3 },
  { w: 64, fill: 1 },
  { w: 84, fill: 2 },
];

const BUBBLES = 4;

export function ExamPaper({ onActivate, className, style }: { onActivate: () => void; className?: string; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label="Cram Exam 1 Free"
      className={`sa-paper group relative block ${className ?? ""}`}
      style={{ WebkitTapHighlightColor: "transparent", ...style }}
    >
      <svg viewBox="0 0 300 360" role="img" aria-hidden className="w-full" style={{ overflow: "visible" }}>
        <defs>
          {/* The glow. Two stops on the SAME hue so the halo reads as light off the bolt rather
              than as a coloured ring drawn around it. */}
          <radialGradient id="sa-paper-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--sa-bolt-1)" stopOpacity="0.55" />
            <stop offset="55%" stopColor="var(--sa-bolt-1)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--sa-bolt-1)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* THE SHEET — rotated as a group so the shadow, rules and bubbles all tilt together. */}
        <g transform="rotate(-4 150 180)">
          <rect x="26" y="14" width="248" height="332" rx="10" fill="rgba(0,0,0,0.42)" />
          <rect x="22" y="10" width="248" height="332" rx="10" fill="#F5F1E8" />

          {/* header: EXAM 1 + the name/date rule */}
          <text x="42" y="42" fontFamily="'Rubik', system-ui, sans-serif" fontSize="11" fontWeight="700" letterSpacing="2.2" fill="#9AA2AF">EXAM 1</text>
          <line x1="42" y1="58" x2="160" y2="58" stroke="#C9CFDA" strokeWidth="1.4" />
          <line x1="172" y1="58" x2="250" y2="58" stroke="#C9CFDA" strokeWidth="1.4" />

          {/* question block */}
          {ROWS.map((r, i) => {
            const top = 88 + i * 50;
            return (
              <g key={i}>
                {/* greeked stem — two strokes so it reads as a wrapped sentence */}
                <rect x="42" y={top} width={(r.w / 100) * 200} height="5.5" rx="2.75" fill="#C3C9D4" />
                <rect x="42" y={top + 11} width={(r.w / 100) * 132} height="5.5" rx="2.75" fill="#D5DAE3" />
                {/* answer bubbles — exactly one inked per row */}
                {Array.from({ length: BUBBLES }, (_, b) => (
                  <circle
                    key={b}
                    cx={48 + b * 26}
                    cy={top + 30}
                    r="6.4"
                    fill={b === r.fill ? "#CE1126" : "none"}
                    stroke={b === r.fill ? "#CE1126" : "#C3C9D4"}
                    strokeWidth="1.6"
                  />
                ))}
              </g>
            );
          })}
        </g>

        {/* THE GLOW, behind the bolt and outside the rotated group so it stays optically upright */}
        <circle cx="150" cy="182" r="118" fill="url(#sa-paper-glow)" className="sa-paper-halo" />

        {/* THE BOLT — the canonical hand-traced path, scaled to ~50% of the sheet height and
            struck through the middle of the questions. Its two colours are CSS variables, which
            is what lets the cycle animate without React re-rendering anything. */}
        <g transform="translate(150 182) scale(1.42) translate(-36 -74)">
          <path d="M44.7 0 6.9 79.4h25.6L15.4 148 76 60.2H46.8L74.3 0Z" fill="var(--sa-bolt-1)" />
          <path d="M44.7 0 6.9 79.4h25.6L15.4 148 40 74Z" fill="var(--sa-bolt-2)" />
        </g>
      </svg>
    </button>
  );
}

/** The stylesheet for the graphic. Injected once by the hero rather than living in styles.css,
 *  because it is meaningless anywhere else on the site and keeps the global sheet from growing a
 *  section only one component reads.
 *
 *  The cycle drives two custom properties through four SEC colourways. Animating the VARIABLES
 *  (rather than the fills) means one animation drives the bolt and its halo in lockstep, so the
 *  light never disagrees with the object casting it. */
export const EXAM_PAPER_CSS = `
.sa-paper {
  --sa-bolt-1: ${BRAND_RED};
  --sa-bolt-2: #8C9099;
  cursor: pointer;
  border: 0;
  background: none;
  padding: 0;
  transition: transform 220ms cubic-bezier(.2,.8,.2,1), filter 220ms ease;
  filter: drop-shadow(0 18px 44px rgba(0,0,0,0.45));
}
.sa-paper:hover { transform: scale(1.02); filter: drop-shadow(0 22px 54px rgba(0,0,0,0.55)); }
.sa-paper:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 6px;
  border-radius: 14px;
}
.sa-paper-halo { transition: opacity 220ms ease; }
.sa-paper:hover .sa-paper-halo { opacity: 1.15; }

/* ~10s round trip through four colourways, eased at every stop so no transition reads as a cut.
   @property would let the browser interpolate these as real colours; without it the fallback is
   a discrete swap at each keyframe, which is why the stops sit close together. */
@property --sa-bolt-1 { syntax: "<color>"; inherits: true; initial-value: ${BRAND_RED}; }
@property --sa-bolt-2 { syntax: "<color>"; inherits: true; initial-value: #8C9099; }

@keyframes sa-bolt-cycle {
  0%   { --sa-bolt-1: ${BRAND_RED};  --sa-bolt-2: #8C9099; }
  25%  { --sa-bolt-1: ${BRAND_RED};  --sa-bolt-2: ${BRAND_BLUE}; }
  50%  { --sa-bolt-1: #E87722;       --sa-bolt-2: #0C2340; }
  75%  { --sa-bolt-1: #582C83;       --sa-bolt-2: #C5B783; }
  100% { --sa-bolt-1: ${BRAND_RED};  --sa-bolt-2: #8C9099; }
}
.sa-paper { animation: sa-bolt-cycle 10s ease-in-out infinite; }

/* Reduced motion: the bolt holds the canonical red/grey with its glow intact. The graphic is
   still the same button — only the colour cycle stops. */
@media (prefers-reduced-motion: reduce) {
  .sa-paper { animation: none; --sa-bolt-1: ${BRAND_RED}; --sa-bolt-2: #8C9099; }
  .sa-paper:hover { transform: none; }
}
`;
