// THE SOCIAL ART — the master avatar and the YouTube banner, as SVG (lib/brand-kit/social.ts has
// the numbers). Same rule as the thumbnails: the preview is the artwork, export clones the node,
// and anything marked data-kit-guide stays in the editor.
import { forwardRef } from "react";

import { KitBolt, KitBoltCentered, KitWordmark } from "@/components/brand-kit/KitMarks";
import { measureText } from "@/lib/brand-kit/measure";
import { AVATAR, avatarClearance, BANNER, BANNER_COPY, BANNER_SAFE, BANNER_TYPE, BANNER_VIEWS, bannerStack, bannerTrail, type Rect } from "@/lib/brand-kit/social";
import { colorwayFor, KIT } from "@/lib/brand-kit/tokens";

/** Navy, the real house bolt centred on its own ink, nothing else — no wordmark, no text. */
export const AvatarArt = forwardRef<SVGSVGElement, { fill: number; width?: number; guides?: boolean }>(function AvatarArt({ fill, width, guides = false }, ref) {
  const S = AVATAR.size, c = S / 2;
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${S} ${S}`} width={width} height={width} role="img" aria-label="Survive Accounting avatar" style={{ display: "block" }}>
      <rect x={0} y={0} width={S} height={S} fill={KIT.navy} />
      <KitBoltCentered cx={c} cy={c} inkH={fill * S} c1={KIT.boltLit} c2={KIT.boltShade} />
      {guides && (
        <g data-kit-guide="1" fill="none">
          <circle cx={c} cy={c} r={c - 4} stroke="#7DD3FC" strokeWidth={8} strokeDasharray="34 24" />
          <circle cx={c} cy={c} r={avatarClearance(fill).reach} stroke="#FCA311" strokeWidth={6} strokeDasharray="10 16" />
        </g>
      )}
    </svg>
  );
});

const VIEW_COLOR = { desktop: "#7DD3FC", tablet: "#C4B5FD", mobile: "#3BF5A0", tv: "#9AA3B8" } as const;

/** 2560×1440 — the wordmark, the line, the free-exam line, and a faint campus trail at the edges.
 *  `crop` shows only that rect (the device previews); the export is always the whole banner. */
export const BannerArt = forwardRef<SVGSVGElement, { width?: number; guides?: boolean; crop?: Rect }>(function BannerArt({ width, guides = false, crop }, ref) {
  const vb = crop ?? { x: 0, y: 0, w: BANNER.w, h: BANNER.h };
  const T = BANNER_TYPE;
  const st = bannerStack();
  const cx = BANNER.w / 2;

  // EXAM 1 IS FREE → SURVIVEACCOUNTING.COM — the outro's red pill, then the address.
  const pillW = measureText(BANNER_COPY.cta, T.cta, 800, KIT.sans, T.ctaTracking) + 52;
  const arrowW = measureText("→", T.cta + 6, 800, KIT.sans);
  const urlW = measureText(BANNER_COPY.url, T.cta, 800, KIT.sans, T.ctaTracking);
  const lineX = cx - (pillW + 20 + arrowW + 16 + urlW) / 2;
  const ctaBase = st.ctaTop + T.ctaPillH / 2 + T.cta * 0.36;
  const sansStyle = (size: number, tr = 0) => ({ fontFamily: KIT.sans, fontWeight: 800, fontSize: size, letterSpacing: size * tr });

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} width={width} height={width ? (width * vb.h) / vb.w : undefined}
      role="img" aria-label="Survive Accounting YouTube banner" style={{ display: "block" }}>
      <rect x={0} y={0} width={BANNER.w} height={BANNER.h} fill={KIT.navy} />

      {bannerTrail().map((b) => {
        const cw = colorwayFor(b.id);
        return <KitBolt key={b.id} x={b.box.x} y={b.box.y} h={b.h} c1={cw.c1} c2={cw.c2} opacity={b.opacity} />;
      })}

      {/* The wordmark alone — surviveaccounting.com below says the rest. */}
      <KitWordmark x={cx} baseline={st.wordmarkBaseline} size={T.wordmark} anchor="middle" />

      {BANNER_COPY.tagline.map((line, i) => (
        <text key={line} x={cx} y={st.taglineBaselines[i]} textAnchor="middle" fill={KIT.cream} style={sansStyle(T.tagline)}>{line}</text>
      ))}

      <rect x={lineX} y={st.ctaTop} width={pillW} height={T.ctaPillH} rx={T.ctaPillH / 2} fill={KIT.ctaRed} />
      <text x={lineX + 26} y={ctaBase} fill={KIT.cream} style={sansStyle(T.cta, T.ctaTracking)}>{BANNER_COPY.cta}</text>
      <text x={lineX + pillW + 20} y={ctaBase + 1} fill={KIT.cream} style={sansStyle(T.cta + 6)}>→</text>
      <text x={lineX + pillW + 20 + arrowW + 16} y={ctaBase} fill={KIT.cream} fillOpacity={0.92} style={sansStyle(T.cta, T.ctaTracking)}>{BANNER_COPY.url}</text>

      {guides && (
        <g data-kit-guide="1" fill="none">
          {BANNER_VIEWS.filter((v) => v.id !== "tv").map((v, i) => (
            <g key={v.id}>
              <rect x={v.rect.x + 4} y={v.rect.y} width={v.rect.w - 8} height={v.rect.h} stroke={VIEW_COLOR[v.id]} strokeWidth={5} strokeDasharray="22 16" />
              <text x={v.rect.x + 20} y={i === 1 ? v.rect.y + v.rect.h + 44 : v.rect.y - 18} fill={VIEW_COLOR[v.id]} style={sansStyle(30, 0.08)}>
                {v.label.toUpperCase()} {v.rect.w}×{v.rect.h}
              </text>
            </g>
          ))}
          <rect x={BANNER_SAFE.x} y={BANNER_SAFE.y} width={BANNER_SAFE.w} height={BANNER_SAFE.h} stroke="#FCA311" strokeWidth={6} />
          <text x={BANNER_SAFE.x + BANNER_SAFE.w} y={BANNER_SAFE.y + BANNER_SAFE.h + 44} textAnchor="end" fill="#FCA311" style={sansStyle(30, 0.08)}>
            SAFE AREA {BANNER_SAFE.w}×{BANNER_SAFE.h}
          </text>
        </g>
      )}
    </svg>
  );
});
