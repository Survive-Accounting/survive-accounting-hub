// THE ADS — three vertical slides Lee drops into a rip like a cheat code.
//
// Lee (2026-09-04): "go ahead and go for making the ads, similar ones we have in
// /learn already — for sharing with fraternity and sorority, for campus reps,
// for sending in syllabi (surviveaccounting.com/send)." Then, after seeing them:
// "the greek ad is fantastic. Make survive up top match what we have in cold
// open … /greek is cutting off … the link itself may need a link icon, and a
// bit less font weight — it's competing with the headline." The copy below is
// his, word for word. No numbers we cannot stand behind beyond the ones he set.
//
// Black, the glow wordmark exactly as on slide one, the pitch, GO TO + the
// address (lighter, smaller, with a link mark), and the campus ticker.
import { ArrowUpRight } from "lucide-react";
import { useContext, useRef } from "react";

import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { CampusBanner, GlowWordmark, WORDMARK_SIZE } from "@/components/brand-cards/BoltZoom";
import { Editable } from "@/components/brand-cards/Editable";
import { Emph, HighlightContext, SEL_EMPH_CSS, wordRangeAtPoint } from "@/components/canvas/text-highlights";

import type { AdKind } from "./ad-kinds";

import { BRAND_FONT as FONT, DISPLAY_FONT as HEAD_FONT } from "./stage";
const GOLD = "#FCA311";

export const ADS: Record<AdKind, { label: string; headline: string; lines: string[]; url: string; banner: boolean }> = {
  greek: {
    label: "Fraternities & sororities",
    headline: "Exam 1 is free for your whole chapter",
    lines: ["Send this to your scholarship chair", "Set up chapter access in minutes", "Boost GPAs on autopilot"],
    url: "surviveaccounting.com/greek",
    banner: true,
  },
  rep: {
    label: "Campus reps",
    headline: "Get paid to share Survive on your campus",
    lines: ["Share free Exam 1 with Greek chapters", "Get 10% commissions + bonuses", "Easiest side gig imaginable"],
    url: "surviveaccounting.com/rep",
    banner: true,
  },
  // 2026-09-05 (Lee): STUDENTS CAN HELP BUILD THIS. Sending material is a contribution to
  // Survive reaching more campuses, not a support request. His words; nothing invented.
  send: {
    label: "Send me your materials",
    headline: "Send me your syllabus + study guides",
    lines: ["Helps me cover what your professor actually tests", "Helps me bring Survive to more campuses", "Send me weird questions — I love picking them apart"],
    url: "surviveaccounting.com/send",
    banner: false,
  },
  // 2026-09-05: the behind-the-scenes ad. Not a founder biography — solo founder, building
  // the teaching AND the production tools, for campuses nationwide, follow along. The CTA is
  // a PLACEHOLDER (Lee: "I will not use it for a bit"): there is no build-story route yet, so it
  // points home and is editable per frame like every other ad line. An empty url hides the
  // "go to" block entirely — see AdSlide below.
  building: {
    label: "Behind the scenes",
    headline: "I'm building this myself.",
    lines: ["Solo founder coding my own teaching tools", "Building Survive for campuses nationwide", "Follow along as I build it"],
    url: "surviveaccounting.com",
    banner: false,
  },
};

export const AD_LABEL: Record<AdKind, string> = {
  greek: "Ad · fraternity & sorority", rep: "Ad · campus reps", send: "Ad · send your materials", building: "Ad · behind the scenes",
};

/** A frame's own words for an ad — any field absent falls back to the built-in copy. */
export interface AdCopy { label?: string; headline?: string; lines?: string[]; url?: string }

export function adCopyOf(ad: AdKind, copy?: AdCopy | null): { label: string; headline: string; lines: string[]; url: string; banner: boolean } {
  const base = ADS[ad];
  const lines = copy?.lines?.map((l) => l.trim()).filter(Boolean);
  return {
    label: copy?.label?.trim() || base.label,
    headline: copy?.headline?.trim() || base.headline,
    lines: lines && lines.length ? lines : base.lines,
    url: copy?.url?.trim() || base.url,
    banner: base.banner,
  };
}

/** A WORD ON THE TAKE. Shift+click a word in the ad and it stays amber — the same
 *  store, the same gesture and the same paint as a card's stem or choice, keyed by the
 *  frame so it survives a walk and clears with the backtick. Function declaration:
 *  AdSlide is on the canvas render path (the tdz-graph ratchet). */
function Mark({ text, k }: { text: string; k: string }) {
  const hlx = useContext(HighlightContext);
  const ref = useRef<HTMLSpanElement>(null);
  function onClick(e: React.MouseEvent<HTMLSpanElement>) {
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault(); e.stopPropagation();
    const r = wordRangeAtPoint(ref.current, e.clientX, e.clientY);
    if (r) hlx.setMemo(k, r);
  }
  return <span ref={ref} onClick={onClick} style={{ display: "inline" }}><Emph text={text} range={hlx.memo(k)} /></span>;
}

export function AdSlide({ ad, w, h, live = true, copy, onEdit, hlKey }: { ad: AdKind; w: number; h: number; live?: boolean; copy?: AdCopy | null;
  /** The Review stage's click-to-edit — absent everywhere else. */
  onEdit?: (patch: AdCopy) => void;
  /** THE TAKE (polish pass, 2026-09-05): given, the headline and lines are highlightable
   *  (shift+click a word) under this key — the frame id. Absent on Review/Arrange/canvas. */
  hlKey?: string }) {
  const a = adCopyOf(ad, copy);
  const editLine = onEdit ? (i: number, v: string) => { const lines = [...a.lines]; if (v) lines[i] = v; else lines.splice(i, 1); onEdit({ lines }); } : undefined;
  const film = !!hlKey && !onEdit;
  const pad = Math.round(w * 0.09);
  const headStyle: React.CSSProperties = { fontFamily: HEAD_FONT, fontWeight: 800, fontSize: Math.round(h * 0.046), lineHeight: 1.06, letterSpacing: "0.005em", textWrap: "balance" as never };
  return (
    <div style={{ position: "relative", width: w, height: h, overflow: "hidden", background: "#000", fontFamily: FONT, color: BRAND_CREAM }}>
      {film && <style>{SEL_EMPH_CSS}</style>}
      {/* LEFT-ALIGNED (Lee, 2026-09-05): on the copy column's own left edge, so the wordmark reads as
          the editorial masthead of the ad rather than a centred logo above it — and leaves the top
          right free for the camera. The tiny negative margin cancels Rubik's side bearing so the
          "s" sits optically on the same line as the tag chip. The open/intro/summary wordmarks keep
          their own wrappers; this is the ads only. */}
      <div style={{ position: "absolute", left: pad - Math.round(h * WORDMARK_SIZE * 0.02), right: pad, top: Math.round(h * 0.10), display: "flex", justifyContent: "flex-start", pointerEvents: "none" }}>
        <GlowWordmark size={Math.round(h * WORDMARK_SIZE)} live={live} />
      </div>
      <div style={{ position: "absolute", left: pad, right: pad, top: Math.round(h * 0.245), display: "flex", flexDirection: "column", gap: Math.round(h * 0.018) }}>
        <Editable value={a.label} onEdit={onEdit ? (v) => onEdit({ label: v }) : undefined} style={{ alignSelf: "flex-start", padding: `${Math.round(h * 0.006)}px ${Math.round(h * 0.014)}px`, borderRadius: Math.round(h * 0.008), fontSize: Math.round(h * 0.016), fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, background: "rgba(252,163,17,0.14)", border: "1px solid rgba(252,163,17,0.3)" }} />
        {film
          ? <div style={headStyle}><Mark text={a.headline} k={`${hlKey}:h`} /></div>
          : <Editable value={a.headline} onEdit={onEdit ? (v) => onEdit({ headline: v }) : undefined} multiline style={headStyle} />}
        <div style={{ display: "flex", flexDirection: "column", gap: Math.round(h * 0.009), marginTop: Math.round(h * 0.008) }}>
          {a.lines.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: Math.round(h * 0.012), alignItems: "baseline", fontSize: Math.round(h * 0.024), fontWeight: 600, lineHeight: 1.3, color: "rgba(245,239,230,0.88)" }}>
              <span style={{ color: GOLD, fontWeight: 900 }}>–</span>
              {film ? <Mark text={l} k={`${hlKey}:${i}`} /> : <Editable value={l} onEdit={editLine ? (v) => editLine(i, v) : undefined} style={{ display: "inline" }} />}
            </div>
          ))}
        </div>
      </div>
      {a.url && <div style={{ position: "absolute", left: pad, right: pad, top: Math.round(h * 0.63), display: "flex", flexDirection: "column", gap: Math.round(h * 0.008) }}>
        <div style={{ fontSize: Math.round(h * 0.015), fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(245,239,230,0.55)" }}>go to</div>
        {/* lighter and smaller than the headline, so it reads as the address,
            not as a second headline; sized so "/greek" never clips */}
        <div style={{ display: "flex", alignItems: "center", gap: Math.round(h * 0.008), fontWeight: 600, fontSize: Math.round(h * 0.0235), letterSpacing: "0.005em", color: "#FFFFFF", whiteSpace: "nowrap" }}>
          <ArrowUpRight size={Math.round(h * 0.024)} strokeWidth={2.5} color={GOLD} style={{ flex: "0 0 auto" }} />
          <Editable value={a.url} onEdit={onEdit ? (v) => onEdit({ url: v }) : undefined} style={{ display: "inline" }} />
        </div>
      </div>}
      {a.banner && <CampusBanner w={w} h={h} live={live} />}
    </div>
  );
}
