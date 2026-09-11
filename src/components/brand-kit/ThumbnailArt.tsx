// THE THUMBNAIL ART — one SVG composition, both outputs of the thumbnail system
// (lib/brand-kit/thumbnail.ts has the rules and the boxes):
//
//   site    series label · one big visual · the small campus bolt in the corner
//   social  the same, plus the lesson title in the lower third and a small wordmark
//
// The preview on the page IS the artwork: export clones this very node (lib/brand-kit/export-png).
// Anything marked data-kit-guide — the crop guides, the "pick a frame" placeholder — is for the
// editor only and never reaches a file.
import { forwardRef, useId, type CSSProperties, type ReactNode } from "react";

import { BOLT_RATIO } from "@/components/canvas/brand";
import { KIT_LIVE_CSS, KitBolt, KitBoltCentered, KitLiveContext, KitWordmark } from "@/components/brand-kit/KitMarks";
import { variantBadge } from "@/components/brand-kit/variant";
import { measureText } from "@/lib/brand-kit/measure";
import {
  conceptParts, containRect, coverRect, eyebrowOf, fitSocialTitle, GRID_CROPS, LAYOUT, socialLowerThird, THUMB_H, THUMB_W, TITLE_CAP, TITLE_TRACKING,
  type Box, type ConceptKind, type ThumbMode, type ThumbSpec,
} from "@/lib/brand-kit/thumbnail";
import { KIT, type Colorway } from "@/lib/brand-kit/tokens";

const CREAM_SOFT = "rgba(245,239,230,0.07)";

function display(size: number, tracking: number = TITLE_TRACKING): CSSProperties {
  return { fontFamily: KIT.display, fontWeight: 900, fontSize: size, letterSpacing: size * tracking };
}
function sans(size: number, weight: 800 | 600, trackingEm = 0): CSSProperties {
  return { fontFamily: KIT.sans, fontWeight: weight, fontSize: size, letterSpacing: size * trackingEm };
}
function displayWidth(text: string, size: number, tracking: number = TITLE_TRACKING): number {
  return measureText(text, size, 900, KIT.display, tracking);
}

export interface ThumbnailArtProps {
  spec: ThumbSpec;
  colorway: Colorway;
  mode: ThumbMode;
  /** The editor's crop guides and placeholders. Never exported either way. */
  guides?: boolean;
  /** CSS width of the preview; the art itself is always 1080×1920 units. */
  width?: number;
  /** The bolts boil while the art is hovered (KitMarks). Exports still show the dry mark. */
  live?: boolean;
}

export const ThumbnailArt = forwardRef<SVGSVGElement, ThumbnailArtProps>(function ThumbnailArt({ spec, colorway, mode, guides = false, width, live = false }, ref) {
  const uid = `k${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const ground = spec.ground === "black" ? KIT.black : KIT.navy;
  const badge = variantBadge(spec.variant);
  const accent = colorway.accent;
  /** The variant's colour where there is one (hairline, concept keylines); the campus's otherwise. */
  const lineAccent = badge?.accent ?? accent;
  const isFrame = spec.visualType === "frame";
  const vis: Box = mode === "social" ? LAYOUT.social.visual : LAYOUT.site.visual;
  const full: Box = { x: 0, y: 0, w: THUMB_W, h: THUMB_H };

  let visual: ReactNode;
  if (spec.visualType === "frame") {
    if (spec.frame) {
      const r = coverRect(spec.frame, full, spec.frameZoom, spec.frameY);
      visual = <image href={spec.frame.src} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />;
    } else visual = <Placeholder box={vis} text="pick a frame of the take" />;
  } else if (spec.visualType === "illustration") {
    if (spec.illustration) {
      const r = containRect(spec.illustration, vis, spec.illustrationZoom);
      visual = <g clipPath={`url(#${uid}-vis)`}><image href={spec.illustration.src} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" /></g>;
    } else visual = <Placeholder box={vis} text="pick an illustration" />;
  } else {
    visual = <Concept kind={spec.concept.kind} text={spec.concept.text} box={vis} accent={lineAccent} colorway={colorway} />;
  }

  const siteBolt = LAYOUT.site.bolt;
  const siteBoltX = THUMB_W - siteBolt.inset - siteBolt.h * BOLT_RATIO;
  const siteBoltY = THUMB_H - siteBolt.inset - siteBolt.h;

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} width={width} height={width ? (width * THUMB_H) / THUMB_W : undefined}
      role="img" aria-label={mode === "social" ? `Social cover — ${spec.title}` : "Site thumbnail"} className={live ? "kit-live" : undefined} style={{ display: "block" }}>
      <KitLiveContext.Provider value={live}>
      <defs>
        {live && <style>{KIT_LIVE_CSS}</style>}
        <linearGradient id={`${uid}-top`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.62" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-bot`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="0.42" stopColor="#000" stopOpacity="0.74" />
          <stop offset="1" stopColor="#000" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`}>
          <stop offset="0" stopColor={accent} stopOpacity="0.3" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}-vis`}><rect x={vis.x} y={vis.y} width={vis.w} height={vis.h} rx={36} /></clipPath>
      </defs>

      <rect x={0} y={0} width={THUMB_W} height={THUMB_H} fill={ground} />
      {spec.glow && !isFrame && <ellipse cx={vis.x + vis.w / 2} cy={vis.y + vis.h / 2} rx={vis.w * 0.62} ry={vis.h * 0.52} fill={`url(#${uid}-glow)`} />}
      {visual}
      {isFrame && spec.frame && <rect x={0} y={0} width={THUMB_W} height={520} fill={`url(#${uid}-top)`} />}
      {isFrame && spec.frame && mode === "social" && <rect x={0} y={880} width={THUMB_W} height={THUMB_H - 880} fill={`url(#${uid}-bot)`} />}

      <SeriesRow x={(mode === "social" ? LAYOUT.social.pill : LAYOUT.site.pill).x} y={(mode === "social" ? LAYOUT.social.pill : LAYOUT.site.pill).y}
        label={eyebrowOf(spec)} accent={accent} overPicture={isFrame && !!spec.frame} badge={badge} />

      {mode === "social" && <SocialLowerThird spec={spec} colorway={colorway} lineAccent={lineAccent} guides={guides} />}

      {mode === "site" && (
        <>
          {spec.glow && <circle cx={siteBoltX + (siteBolt.h * BOLT_RATIO) / 2} cy={siteBoltY + siteBolt.h / 2} r={siteBolt.h * 0.95} fill={`url(#${uid}-glow)`} />}
          <KitBolt x={siteBoltX} y={siteBoltY} h={siteBolt.h} c1={colorway.c1} c2={colorway.c2} />
        </>
      )}

      {guides && (mode === "social" ? <SocialGuides /> : <SiteGuides />)}
      </KitLiveContext.Provider>
    </svg>
  );
});

/** EXAM 1 · 03 in a quiet pill with the campus dot, and the variant's badge beside it — or under
 *  it, when a long label and a long badge would run past the margin. */
function SeriesRow({ x, y, label, accent, overPicture, badge }: { x: number; y: number; label: string; accent: string; overPicture: boolean; badge: { label: string; accent: string } | null }) {
  const H = 66, fs = 32, tr = 0.14;
  const w = 28 + 14 + 16 + measureText(label, fs, 800, KIT.sans, tr) + 24;
  const bfs = 28;
  const bw = badge ? 26 + measureText(badge.label, bfs, 800, KIT.sans, tr) + 22 : 0;
  const stacked = !!badge && w + 14 + bw > THUMB_W - x * 2;
  const bx = stacked ? x : x + w + 14;
  const by = stacked ? y + H + 12 : y;
  return (
    <g>
      <rect x={x} y={y} width={w} height={H} rx={H / 2} fill={overPicture ? "rgba(0,0,0,0.5)" : "rgba(245,239,230,0.08)"} stroke="rgba(245,239,230,0.16)" strokeWidth={2} />
      <circle cx={x + 28 + 7} cy={y + H / 2} r={7} fill={accent} />
      <text x={x + 28 + 14 + 16} y={y + H / 2 + fs * 0.36} fill={KIT.cream} style={sans(fs, 800, tr)}>{label}</text>
      {badge && (
        <>
          <rect x={bx} y={by} width={bw} height={H} rx={H / 2} fill={badge.accent} />
          <text x={bx + 26} y={by + H / 2 + bfs * 0.36} fill={KIT.navy} style={sans(bfs, 800, tr)}>{badge.label}</text>
        </>
      )}
    </g>
  );
}

function SocialLowerThird({ spec, colorway, lineAccent, guides }: { spec: ThumbSpec; colorway: Colorway; lineAccent: string; guides: boolean }) {
  const S = LAYOUT.social;
  const L3 = socialLowerThird(spec);
  const kicker = spec.kicker.trim().toUpperCase();
  const sub = spec.subtitle.trim();
  const t = fitSocialTitle(spec, (s, size) => displayWidth(s, size));
  const blockH = t.lines.length ? t.size * TITLE_CAP + (t.lines.length - 1) * t.size * S.title.leading : 0;
  const hasTitle = t.lines.length > 0;
  // Kicker, title and subtitle are centred in the band as ONE group; the hairline sits over it.
  const groupH = (kicker ? L3.kickerH : 0) + blockH + (sub && hasTitle ? L3.subtitleH : 0);
  const groupTop = L3.top + (L3.bottom - L3.top - groupH) / 2;
  const top = groupTop + (kicker ? L3.kickerH : 0);
  const band = { top: L3.top, bottom: L3.bottom };
  const cx = THUMB_W / 2;
  const K = S.kicker;
  const kw = kicker ? measureText(kicker, K.size, 800, KIT.sans, K.tracking) : 0;
  const ks = kw > S.title.maxWidth ? (K.size * S.title.maxWidth) / kw : K.size;
  return (
    <g>
      {(hasTitle || kicker) && <rect x={cx - S.accentLine.w / 2} y={groupTop - S.accentLine.gap - S.accentLine.h} width={S.accentLine.w} height={S.accentLine.h} rx={S.accentLine.h / 2} fill={lineAccent} />}
      {kicker && (
        <text x={cx + (ks * K.tracking) / 2} y={groupTop + K.size * 0.72} textAnchor="middle" fill={KIT.cream} fillOpacity={0.8} style={sans(ks, 800, K.tracking)}>{kicker}</text>
      )}
      {t.lines.map((line, i) => (
        <text key={i} x={cx} y={top + t.size * TITLE_CAP + i * t.size * S.title.leading} textAnchor="middle" fill={KIT.cream} style={display(t.size)}>{line}</text>
      ))}
      {sub && t.lines.length > 0 && (
        <text x={cx} y={top + blockH + S.subtitle.gap + S.subtitle.size * 0.72} textAnchor="middle" fill={KIT.cream} fillOpacity={0.82} style={sans(S.subtitle.size, 800)}>{sub}</text>
      )}
      {!t.lines.length && guides && (
        <g data-kit-guide="1">
          <text x={cx} y={(band.top + band.bottom) / 2} textAnchor="middle" fill="rgba(245,239,230,0.5)" style={sans(40, 600)}>the title goes here</text>
        </g>
      )}
      {!t.fits && guides && (
        <g data-kit-guide="1">
          <rect x={40} y={band.top - 10} width={THUMB_W - 80} height={band.bottom - band.top + 20} fill="none" stroke="#FF8B7E" strokeWidth={5} strokeDasharray="14 10" />
        </g>
      )}
      {spec.socialMark === "wordmark"
        ? <KitWordmark x={cx} baseline={S.mark.baseline} size={S.mark.wordmark} anchor="middle" c1={colorway.c1} c2={colorway.c2} />
        : <KitBolt x={cx - (S.mark.bolt * BOLT_RATIO) / 2} y={S.mark.baseline - S.mark.bolt + 12} h={S.mark.bolt} c1={colorway.c1} c2={colorway.c2} />}
    </g>
  );
}

function Placeholder({ box, text }: { box: Box; text: string }) {
  return (
    <g data-kit-guide="1">
      <rect x={box.x + 8} y={box.y + 8} width={box.w - 16} height={box.h - 16} rx={36} fill="rgba(245,239,230,0.03)" stroke="rgba(245,239,230,0.35)" strokeWidth={4} strokeDasharray="20 16" />
      <text x={box.x + box.w / 2} y={box.y + box.h / 2} textAnchor="middle" fill="rgba(245,239,230,0.6)" style={sans(40, 600)}>{text}</text>
    </g>
  );
}

function Concept({ kind, text, box, accent, colorway }: { kind: ConceptKind; text: string; box: Box; accent: string; colorway: Colorway }) {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const parts = conceptParts(kind, text);
  if (!parts) return <Placeholder box={box} text="type the concept" />;

  if (parts.kind === "bolt") {
    return <KitBoltCentered cx={cx} cy={cy} inkH={box.h * 0.74} c1={colorway.c1} c2={colorway.c2} />;
  }

  if (parts.kind === "stat") {
    const size = Math.min(box.h * 0.56, (box.w * 0.9) / Math.max(0.01, displayWidth(parts.value, 100) / 100));
    const capSize = 60, capTr = 0.2, capGap = 44;
    const capH = parts.caption ? capGap + capSize * 0.72 : 0;
    const top = cy - (size * TITLE_CAP + capH) / 2;
    return (
      <g>
        <text x={cx} y={top + size * TITLE_CAP} textAnchor="middle" fill={KIT.cream} style={display(size)}>{parts.value}</text>
        {parts.caption && (
          <text x={cx + (capSize * capTr) / 2} y={top + size * TITLE_CAP + capGap + capSize * 0.72} textAnchor="middle" fill={accent} style={sans(capSize, 800, capTr)}>{parts.caption}</text>
        )}
      </g>
    );
  }

  if (parts.kind === "equation") {
    const f0 = 150, inner = 0.82;
    const widths = parts.tokens.map((t) => (t.op ? f0 * 0.7 : Math.max(f0 * 1.15, displayWidth(t.text, f0 * inner, 0) + f0 * 0.55)));
    const gap = f0 * 0.1;
    const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
    const k = Math.min(1, box.w / total, (box.h * 0.8) / (f0 * 1.3));
    const f = f0 * k, th = f * 1.3;
    let x = cx - (total * k) / 2;
    return (
      <g>
        {parts.tokens.map((t, i) => {
          const w = widths[i] * k;
          const left = x;
          x += w + gap * k;
          return t.op ? (
            <text key={i} x={left + w / 2} y={cy + f * 0.34} textAnchor="middle" fill={accent} style={display(f * 0.9, 0)}>{t.text}</text>
          ) : (
            <g key={i}>
              <rect x={left} y={cy - th / 2} width={w} height={th} rx={th * 0.2} fill={CREAM_SOFT} stroke={accent} strokeWidth={Math.max(3, f * 0.035)} />
              <text x={left + w / 2} y={cy + (f * inner * TITLE_CAP) / 2} textAnchor="middle" fill={KIT.cream} style={display(f * inner, 0)}>{t.text}</text>
            </g>
          );
        })}
      </g>
    );
  }

  if (parts.kind === "list") {
    const n = parts.items.length, gap = 18;
    const rowH = Math.min(128, (box.h - gap * (n - 1)) / n);
    const rowW = Math.min(box.w, 820);
    const rx = cx - rowW / 2;
    const top = cy - (n * rowH + (n - 1) * gap) / 2;
    return (
      <g>
        {parts.items.map((item, i) => {
          const y = top + i * (rowH + gap);
          const fs = Math.min(rowH * 0.46, (rowW - 110) / Math.max(0.01, displayWidth(item, 100, 0) / 100));
          return (
            <g key={i}>
              <rect x={rx} y={y} width={rowW} height={rowH} rx={rowH * 0.22} fill={CREAM_SOFT} />
              <circle cx={rx + 38} cy={y + rowH / 2} r={10} fill={accent} />
              <text x={rx + 70} y={y + rowH / 2 + fs * 0.36} fill={KIT.cream} style={display(fs, 0)}>{item}</text>
            </g>
          );
        })}
      </g>
    );
  }

  // vs
  const size = (w: string) => Math.min(box.h * 0.26, (box.w * 0.86) / Math.max(0.01, displayWidth(w, 100) / 100));
  const sa = size(parts.a), sb = size(parts.b), vf = 52, vtr = 0.2, gap = 46;
  const top = cy - (sa * TITLE_CAP + gap + vf * 0.72 + gap + sb * TITLE_CAP) / 2;
  const aBase = top + sa * TITLE_CAP;
  const vBase = aBase + gap + vf * 0.72;
  const bBase = vBase + gap + sb * TITLE_CAP;
  const vW = measureText("VS", vf, 800, KIT.sans, vtr);
  return (
    <g>
      <text x={cx} y={aBase} textAnchor="middle" fill={KIT.cream} style={display(sa)}>{parts.a}</text>
      <rect x={cx - vW / 2 - 30 - 110} y={vBase - vf * 0.36 - 3} width={110} height={6} rx={3} fill={accent} />
      <text x={cx + (vf * vtr) / 2} y={vBase} textAnchor="middle" fill={accent} style={sans(vf, 800, vtr)}>VS</text>
      <rect x={cx + vW / 2 + 30} y={vBase - vf * 0.36 - 3} width={110} height={6} rx={3} fill={accent} />
      <text x={cx} y={bBase} textAnchor="middle" fill={KIT.cream} style={display(sb)}>{parts.b}</text>
    </g>
  );
}

function SocialGuides() {
  const [grid34, grid11] = GRID_CROPS;
  return (
    <g data-kit-guide="1" fill="none">
      <rect x={6} y={grid34.box.y} width={THUMB_W - 12} height={grid34.box.h} stroke="#7DD3FC" strokeWidth={4} strokeDasharray="18 14" />
      <text x={24} y={grid34.box.y - 14} fill="#7DD3FC" style={sans(26, 800, 0.1)}>PROFILE GRID · 3:4</text>
      <rect x={16} y={grid11.box.y} width={THUMB_W - 32} height={grid11.box.h} stroke="#FCA311" strokeWidth={4} strokeDasharray="6 10" />
      <text x={THUMB_W - 24} y={grid11.box.y - 14} textAnchor="end" fill="#FCA311" style={sans(26, 800, 0.1)}>SQUARE · 1:1</text>
    </g>
  );
}

/** What /learn's card lays over the picture: its duration chip top-right, and the title over a
 *  gradient along the bottom 45% (learn-theme .lk-short). */
function SiteGuides() {
  const y = THUMB_H * 0.55;
  return (
    <g data-kit-guide="1">
      <rect x={0} y={y} width={THUMB_W} height={THUMB_H - y} fill="rgba(125,211,252,0.07)" stroke="#7DD3FC" strokeWidth={4} strokeDasharray="18 14" />
      <text x={36} y={y + 52} fill="#7DD3FC" style={sans(30, 800, 0.08)}>/learn prints the title over this band</text>
      <rect x={THUMB_W - 250} y={40} width={210} height={84} rx={14} fill="rgba(125,211,252,0.08)" stroke="#7DD3FC" strokeWidth={4} strokeDasharray="10 8" />
      <text x={THUMB_W - 145} y={94} textAnchor="middle" fill="#7DD3FC" style={sans(28, 800)}>0:42</text>
    </g>
  );
}
