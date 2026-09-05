// CALLOUT (P1) — the standardized reading card: what a student reads in their
// head as a take opens, and what Lee recaps with. It IS the zero-choice (note)
// frame's face in the previewer/film — CeqPreviewNode renders CalloutBody when
// a card has no choices — and the /callout-demo route renders it standalone.
//
// Content model (CalloutSettings on the card, additive scene JSON):
//   showTopic     — topic kicker on/off (default on)
//   extraStems    — secondary stems: indented, smaller, grayed bullets
//   bolt          — boiling bolt on the left (off by default)
//   kind          — the type banner; unset = plain callout
//   memoIds       — dropped memos; 1 renders as a styled memo callout, 2+
//                   renders the "Highlights from this set" stack (Lookback)
//
// Film law: this file is PRESENTATION ONLY. All authoring affordances live in
// CeqPreviewNode behind the film gate — nothing here captures keys or drags.
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { BRAND_FONT, DISPLAY_FONT } from "@/components/blastoff/stage";
import { renderInline } from "../inline-md";
import { PAPER } from "../theme";
import type { CalloutKind } from "../types";

/** The five callout types — each a small on-brand badge/accent, none loud. */
export const CALLOUT_KINDS: Record<Exclude<CalloutKind, "tutor" | "found-on-exam">, { label: string; accent: string; tint: string }> = {
  "cheat-code": { label: "CHEAT CODE", accent: "#1F9D57", tint: "rgba(31,157,87,0.10)" },
  "memorize-this": { label: "MEMORIZE THIS", accent: "#C77D0A", tint: "rgba(199,125,10,0.10)" },
  "deeper-idea": { label: "DEEPER IDEA", accent: "#1D7FA8", tint: "rgba(29,127,168,0.10)" },
  recap: { label: "RECAP", accent: "#6D5BB8", tint: "rgba(109,91,184,0.10)" },
  distractor: { label: "DISTRACTOR", accent: "#C22B45", tint: "rgba(194,43,69,0.10)" },
};
/** THE TUTOR CARD (Lee, 2026-09-03): the bio slide in the detour format. Not
 *  one of the five authoring kinds (the cycler never offers it) — Blast Off's
 *  send-to-film writes it, and only for the bio frame. */
export const TUTOR_META = { label: "MEET YOUR TUTOR", accent: "#C62828", tint: "rgba(198,40,40,0.10)" } as const;
/** THE SUMMARY SLIDE (Lee, 2026-09-03: "the found on your exam should also
 *  look more like the detour cards. Keep it consistent"): the set's own
 *  note-only card, drawn in the detour skin with this label. */
export const FOUND_META = { label: "FOUND ON YOUR EXAM", accent: "#FCA311", tint: "rgba(252,163,17,0.12)" } as const;
export function calloutMeta(kind: CalloutKind): { label: string; accent: string; tint: string } {
  return kind === "tutor" ? TUTOR_META : kind === "found-on-exam" ? FOUND_META : CALLOUT_KINDS[kind];
}

/** Default kind when a memo is dropped, from its library category. */
export function calloutKindForCategory(category?: string): CalloutKind {
  const c = (category ?? "").toUpperCase();
  if (c.includes("CHEAT")) return "cheat-code";
  if (c.includes("STEP")) return "memorize-this";
  if (c.includes("TRAP")) return "distractor";
  if (c.includes("TIP")) return "deeper-idea";
  return "recap";
}

/** The kind-cycler control order: none → the five kinds → none. */
export function nextCalloutKind(k?: CalloutKind): CalloutKind | undefined {
  const order = Object.keys(CALLOUT_KINDS) as CalloutKind[];
  if (!k) return order[0];
  const i = order.indexOf(k);
  return i < 0 || i === order.length - 1 ? undefined : order[i + 1];
}

export interface CalloutBodyProps {
  scale: number;
  /** Already-resolved topic text; null/undefined = no kicker. */
  topic?: string | null;
  stem: string;
  extraStems?: string[];
  kind?: CalloutKind;
  /** Dropped-memo labels; 1 = single memo callout, 2+ = highlights stack. */
  highlights?: string[];
  bolt?: boolean;
  /** Authoring-only inline edit hook for an extra-stem bullet (never in film). */
  onEditBullet?: (idx: number) => void;
  /** A quiet last line under a gap — the bio card's domain. */
  footer?: string;
  /** Per-line spotlight (film): "title", "line:<i>", "footer". */
  lineSpot?: LineSpotOf;
  /** THE DETOUR LOOK (CalloutSettings.detour): gold label, cream ink, the
   *  ==key phrase== highlighted gold-on-navy. The shell paints the navy;
   *  this only changes the ink. */
  dark?: boolean;
  /** The kind label is drawn ABOVE the navy box by the card (GlowLabel) — skip the in-box header. */
  headerOutside?: boolean;
}

/** Detour palette — brand gold on brand navy, cream ink. */
const DETOUR = {
  gold: "#FCA311",
  ink: "#F5EFE6",
  inkMuted: "rgba(245,239,230,0.62)",
  labelBg: "rgba(252,163,17,0.14)",
  hl: { bg: "#FCA311", color: "#14213D" },
} as const;

/** The detour card's accent per kind, on navy. Gold is the default (cheat
 *  code, and anything without a kind). Used by the label, the highlight and
 *  the card's edge, so a memorize-this reads orange edge to edge. */
export function detourAccent(kind?: CalloutKind): string {
  if (kind === "memorize-this") return "#FF9F43";
  if (kind === "deeper-idea") return "#7DD3FC";
  if (kind === "tutor") return "#FF6B6B";
  if (kind === "found-on-exam") return DETOUR.gold;
  return DETOUR.gold;
}

/** THE TYPEWRITER (Lee, 2026-09-03: "Internal users typewrites in, each of the
 *  bullet points typewrite in after that … can just be the title then all
 *  three bullets after that"). LINE BY LINE: the heading is step 0, each line
 *  under it the next step, the footer last. `.sa-type` + --i; PV_CSS reveals
 *  them in order, only under .film-mode. (The first cut split every WORD into
 *  a span, which dropped words on the synced frame — gone.) */
function typeStep(i: number): React.CSSProperties { return { ["--i" as string]: i }; }

/** THE DETOUR SPOTLIGHT (Lee: "let me spotlight the title, bullet if I want to
 *  emphasize more … enlarging it and making it glow in a 20% psychedelic way …
 *  a gentle glow"). Each line is its own target; the card hands the state in. */
export interface LineSpot { state: "spot" | null; onDown: (e: React.PointerEvent) => void }
export type LineSpotOf = (key: string) => LineSpot;

/** The callout's face — cream card interior, navy text, orange corner accent.
 *  Rendered INSIDE the existing card shell (which owns width/drag/scale). */
export function CalloutBody({ scale: s, topic, stem, extraStems = [], kind, highlights = [], bolt, onEditBullet, dark = false, footer, lineSpot, headerOutside = false }: CalloutBodyProps) {
  const spotProps = (key: string): { className?: string; onPointerDownCapture?: (e: React.PointerEvent) => void } => {
    if (!lineSpot) return {};
    const ls = lineSpot(key);
    return { className: ls.state === "spot" ? "sa-detour-spot" : undefined, onPointerDownCapture: ls.onDown };
  };
  const stack = highlights.length > 1;
  const kindMeta = stack ? { label: "HIGHLIGHTS FROM THIS SET", accent: "#C77D0A", tint: "rgba(199,125,10,0.08)" } : kind ? calloutMeta(kind) : null;
  // On the dark card each kind keeps its own colour (Lee, 2026-09-03: "make
  // the cheat code stay the same, but deeper idea, memorize this are different
  // colors"): cheat code stays brand gold; memorize this is orange; deeper
  // idea is sky. The paper accents were chosen for cream and go muddy on
  // navy, so these are the on-navy versions.
  const darkAccent = detourAccent(kind);
  const meta = kindMeta && dark ? { label: kindMeta.label, accent: darkAccent, tint: `${darkAccent}24` } : kindMeta;
  const ink = dark ? DETOUR.ink : PAPER.ink;
  const inkMuted = dark ? DETOUR.inkMuted : PAPER.inkMuted;
  const hl = dark ? { bg: darkAccent, color: "#14213D" } : undefined;
  const mainText = highlights.length === 1 ? highlights[0] : stem;
  return (
    <div style={{ position: "relative" }}>
      {/* the little orange corner accent — the callout's signature, kept */}
      <span aria-hidden style={{ position: "absolute", top: -16 * s, right: -16 * s, width: 26 * s, height: 26 * s, background: dark ? darkAccent : "#FCA311", clipPath: "polygon(100% 0, 0 0, 100% 100%)", borderTopRightRadius: 13 * s, opacity: 0.9 }} />
      {meta && !dark && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 * s, marginBottom: 8 * s, padding: `${2 * s}px ${8 * s}px`, borderRadius: 6 * s, fontSize: 10.5 * s, fontWeight: 900, letterSpacing: "0.12em", color: meta.accent, background: meta.tint, border: `1px solid ${meta.accent}44` }}>
          {meta.label}
        </div>
      )}
      {meta && dark && !headerOutside && (
        // THE DETOUR MOMENT (Lee, 2026-09-03): "more eye catching than the navy
        // on navy … big labels … very scannable … a subtle flashing animation
        // on the chip/title, like a neon sign … the boiling bolt needs to make
        // an appearance … make it a real moment anytime we have a detour
        // slide". The boiling bolt sits top-left; the kind's name rides over
        // it, big, in the kind's colour, breathing like a neon tube
        // (.sa-neon-label in PV_CSS; motion only under .film-mode).
        <div style={{ display: "flex", alignItems: "center", gap: 10 * s, marginBottom: 12 * s, position: "relative" }}>
          <BoltBoil height={34 * s} style={{ flex: "0 0 auto", filter: `drop-shadow(0 0 ${8 * s}px ${meta.accent}66)` }} />
          <span className="sa-neon-label" style={{ ["--neon" as string]: meta.accent, fontSize: 15 * s, fontWeight: 900, letterSpacing: "0.24em", textTransform: "uppercase", color: meta.accent, lineHeight: 1, textShadow: `0 0 ${6 * s}px ${meta.accent}AA, 0 0 ${18 * s}px ${meta.accent}55` }}>
            {meta.label}
          </span>
        </div>
      )}
      {topic && <div style={{ fontSize: 12 * s, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: inkMuted, marginBottom: 6 * s }}>{topic}</div>}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 * s }}>
        {/* (bolt retired 08-15 — the standalone Bolt element replaced it; the
            data field stays readable, nothing renders it here) */}
        <div style={{ minWidth: 0 }}>
          {stack ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 * s }}>
              {highlights.map((h, i) => (
                <li key={i} style={{ display: "flex", gap: 8 * s, alignItems: "baseline", fontSize: 17 * s, fontWeight: 700, lineHeight: 1.3, color: ink }}>
                  <span style={{ color: "#FCA311", fontWeight: 900 }}>•</span>
                  <span>{renderInline(h, hl)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <>
              {/* THE HEADING. On the dark card: the homepage display face, phone-sized
                  (Lee: "better fonts … bigger … title can have up to 1 line break"). */}
              <div {...spotProps("title")} className={[dark ? "sa-type" : "", spotProps("title").className ?? ""].join(" ").trim() || undefined}
                style={dark
                  ? { ...typeStep(0), fontFamily: DISPLAY_FONT, fontSize: 31 * s, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.005em", color: ink, whiteSpace: "pre-wrap", textWrap: "balance" as never, borderRadius: 8 * s, padding: `${2 * s}px ${4 * s}px`, margin: `0 ${-4 * s}px` }
                  : { fontSize: 24 * s, fontWeight: 800, lineHeight: 1.25, color: ink, whiteSpace: "pre-wrap" }}>
                {renderInline(mainText || "Callout", hl)}
              </div>
              {extraStems.length > 0 && (
                <ul style={{ margin: `${10 * s}px 0 0 ${6 * s}px`, padding: 0, listStyle: "none", display: "grid", gap: 5 * s }}>
                  {extraStems.map((t, i) => (
                    <li
                      key={i}
                      {...spotProps(`line:${i}`)}
                      className={[dark ? "sa-type" : "", spotProps(`line:${i}`).className ?? ""].join(" ").trim() || undefined}
                      onDoubleClick={onEditBullet ? (e) => { e.stopPropagation(); onEditBullet(i); } : undefined}
                      // On the dark detour card the lines under the heading are
                      // UNIFORM across cheat code / memorize this / deeper idea —
                      // full ink, one weight, the brand face, phone-sized, and
                      // no line break inside a bullet (Lee, 2026-09-03).
                      style={dark
                        // Sized so a short bullet never breaks; a long one wraps
                        // rather than clipping off the card on camera.
                        ? { ...typeStep(i + 1), display: "flex", gap: 8 * s, alignItems: "baseline", fontFamily: BRAND_FONT, fontSize: 19 * s, fontWeight: 600, lineHeight: 1.3, color: ink, whiteSpace: "normal", textWrap: "pretty" as never, borderRadius: 8 * s, padding: `${2 * s}px ${4 * s}px`, margin: `0 ${-4 * s}px`, cursor: onEditBullet ? "text" : undefined }
                        : { display: "flex", gap: 7 * s, alignItems: "baseline", fontSize: 15.5 * s, fontWeight: 600, lineHeight: 1.32, color: inkMuted, cursor: onEditBullet ? "text" : undefined }}
                      title={onEditBullet ? "Double-click to edit · empty text removes it" : undefined}
                    >
                      <span style={{ opacity: 0.55 }}>–</span>
                      <span>{renderInline(t, hl)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {footer && (
                // THE FOOTER (2026-09-03): the bio card's domain — under a gap,
                // quiet, letter-spaced, so it reads as a sign-off, not a bullet.
                <div {...spotProps("footer")} className={[dark ? "sa-type" : "", spotProps("footer").className ?? ""].join(" ").trim() || undefined}
                  style={{ ...(dark ? typeStep(extraStems.length + 1) : {}), marginTop: 16 * s, fontFamily: BRAND_FONT, fontSize: 15 * s, fontWeight: 700, letterSpacing: "0.08em", color: inkMuted, borderRadius: 8 * s, padding: `${2 * s}px ${4 * s}px`, margin: `${16 * s}px ${-4 * s}px 0` }}>{footer}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** THE DETOUR HEADING (Lee, 2026-09-04, second take): "I'm wanting the found on
 *  your exam, memorize this, deeper idea, cheat code to look like the
 *  'FRATERNITIES & SORORITIES' text in that ad … different colors … too many
 *  bolts, just have them be text only. But above the navy box, in front of
 *  the black background." So: the ad label's chip — uppercase, letter-spaced,
 *  the kind's colour on its own tint with a hairline — drawn by the card above
 *  the navy box (CeqPreviewNode), no bolt. */
export function KindChip({ text, accent, scale: s }: { text: string; accent: string; scale: number }) {
  return (
    <div style={{ display: "flex", marginBottom: 10 * s, paddingLeft: 2 * s }}>
      <span style={{ display: "inline-flex", padding: `${3 * s}px ${10 * s}px`, borderRadius: 6 * s, fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 16 * s, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", lineHeight: 1.15, color: accent, background: `${accent}24`, border: `1px solid ${accent}4D`, textWrap: "balance" as never }}>{text}</span>
    </div>
  );
}
