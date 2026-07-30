// LOGO LAB — a standalone, out-of-the-main-flow comparison sheet (/logo-lab,
// linked from nowhere): three SVG logo concepts, each rendered at hero / card /
// favicon sizes on BOTH backgrounds it will live on (dark navy + cream CEQ card),
// with the SVG source in an editable textarea that re-renders live so Lee can
// tweak colors/proportions in place. Pure client page — no data, no auth, no
// side effects; concepts live in src/lib/logo-concepts.ts.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { LOGO_CONCEPTS, LOGO_CREAM, LOGO_NAVY, type LogoMark } from "@/lib/logo-concepts";

export const Route = createFileRoute("/logo-lab")({ component: LogoLab });

const PAGE_BG = "#070D1E";

/** One mark on one background at one size. The container's CSS `color` drives
 *  every currentColor element (wordmark text, the mono badge), which is how a
 *  single source renders correctly on navy AND cream. */
function Swatch({ svg, size, ratio, bg }: { svg: string; size: number; ratio?: number; bg: "navy" | "cream" }) {
  const dark = bg === "navy";
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        gap: 6,
        padding: "16px 18px",
        borderRadius: 12,
        background: dark ? LOGO_NAVY : LOGO_CREAM,
        border: `1px solid ${dark ? "rgba(244,246,250,0.14)" : "rgba(10,17,40,0.16)"}`,
      }}
    >
      <div
        style={{ height: size, width: ratio ? Math.round(size * ratio) : size, color: dark ? LOGO_CREAM : LOGO_NAVY }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div style={{ fontSize: 11, fontFamily: "monospace", color: dark ? "rgba(244,246,250,0.5)" : "rgba(10,17,40,0.5)" }}>{size}px</div>
    </div>
  );
}

/** A mark's full block: both backgrounds × all sizes, then the live source. */
function MarkBlock({ mark }: { mark: LogoMark }) {
  const [svg, setSvg] = useState(mark.svg);
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(244,246,250,0.72)" }}>{mark.label}</div>
      {(["navy", "cream"] as const).map((bg) => (
        <div key={bg} style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
          {mark.sizes.map((s) => (
            <Swatch key={`${bg}-${s}`} svg={svg} size={s} ratio={mark.ratio} bg={bg} />
          ))}
        </div>
      ))}
      {/* live source — edit here, the swatches above re-render as you type */}
      <textarea
        spellCheck={false}
        value={svg}
        onChange={(e) => setSvg(e.target.value)}
        style={{
          marginTop: 12,
          width: "100%",
          minHeight: 150,
          resize: "vertical",
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 1.45,
          color: "#C9D4E8",
          background: "#0D1730",
          border: "1px solid rgba(147,160,180,0.28)",
          borderRadius: 10,
          padding: 12,
        }}
      />
    </div>
  );
}

function LogoLab() {
  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG, color: LOGO_CREAM, fontFamily: "'Sora', 'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 24px 120px" }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.01em" }}>Logo Lab</h1>
        <p style={{ marginTop: 6, fontSize: 14, color: "rgba(244,246,250,0.6)", maxWidth: 720 }}>
          Three concepts, each at hero / card-corner / favicon size, on the two backgrounds a mark
          will actually live on. Edit any source box to tweak colors or proportions — the swatches
          re-render live. This page is linked from nowhere; it exists only at /logo-lab.
        </p>
        {LOGO_CONCEPTS.map((c) => (
          <section key={c.id} style={{ marginTop: 44, paddingTop: 28, borderTop: "1px solid rgba(147,160,180,0.2)" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>
              <span style={{ color: "#FCA311" }}>Concept {c.id}</span> — {c.name}
            </h2>
            <p style={{ marginTop: 4, fontSize: 13, color: "rgba(244,246,250,0.6)", maxWidth: 720 }}>{c.blurb}</p>
            {c.marks.map((m) => (
              <MarkBlock key={m.id} mark={m} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
