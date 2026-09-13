// THE BACKGROUND PICKER — Original / Blur / Remove, and Transparent / Black / Navy under Remove.
//
// For the MAIN /film window's chrome (never inside the pop-out's client area — that is the shot).
// It writes camera-bg.ts's one setting; the pop-out hears the `storage` event and changes on the
// next camera frame. The line under it is the pop-out's own report (live · GPU · ms, or why it
// fell back), so a silent fallback is never a mystery.
import { CAM_BG_LABEL, CAM_BG_MODES, CAM_FILL_CSS, CAM_FILL_LABEL, CAM_BG_FILLS, describeCamBgStatus, useCamBg, useCamBgStatus } from "./camera-bg";

const CREAM = "#F5EFE6", MUTED = "rgba(245,239,230,0.6)", EDGE = "rgba(245,239,230,0.18)", GOLD = "#FCA311";

/** `compact`: one row for the /film chrome bar — the status becomes a dot with the text on hover. */
export function CameraBgPicker({ style, compact = false }: { style?: React.CSSProperties; compact?: boolean }) {
  const [bg, setBg] = useCamBg();
  const status = useCamBgStatus();
  const fell = bg.mode !== "original" && status?.state === "fallback";
  const said = describeCamBgStatus(status, bg);
  if (compact) {
    const dot = bg.mode === "original" ? MUTED : fell ? GOLD : status?.state === "live" ? "#3BF5A0" : MUTED;
    return (
      <span data-sa-cam-bg-picker="" title={`Camera background — ${said}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, ...style }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />
        {CAM_BG_MODES.map((m) => (
          <button key={m} type="button" aria-pressed={bg.mode === m} onClick={() => setBg({ mode: m })}
            style={{ border: `1px solid ${bg.mode === m ? GOLD : EDGE}`, background: bg.mode === m ? GOLD : "none", color: bg.mode === m ? "#14213D" : CREAM, borderRadius: 6, padding: "2px 7px", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>
            {CAM_BG_LABEL[m]}
          </button>
        ))}
        {bg.mode === "remove" && CAM_BG_FILLS.map((f) => (
          <button key={f} type="button" aria-pressed={bg.fill === f} title={CAM_FILL_LABEL[f]} onClick={() => setBg({ fill: f })}
            style={{ width: 16, height: 16, padding: 0, borderRadius: "50%", cursor: "pointer", border: `2px solid ${bg.fill === f ? GOLD : EDGE}`,
              background: f === "transparent" ? "repeating-conic-gradient(#555 0 25%, #222 0 50%) 0 0 / 6px 6px" : CAM_FILL_CSS[f] }} />
        ))}
      </span>
    );
  }
  return (
    <div data-sa-cam-bg-picker="" style={{ display: "inline-flex", flexDirection: "column", gap: 6, fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 12, color: CREAM, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED }}>Camera bg</span>
        <div role="radiogroup" aria-label="Camera background" style={{ display: "inline-flex", border: `1px solid ${EDGE}`, borderRadius: 8, overflow: "hidden" }}>
          {CAM_BG_MODES.map((m) => {
            const on = bg.mode === m;
            return (
              <button key={m} type="button" role="radio" aria-checked={on} onClick={() => setBg({ mode: m })}
                style={{ padding: "4px 10px", border: "none", cursor: "pointer", font: "inherit", fontWeight: on ? 700 : 500, background: on ? CREAM : "transparent", color: on ? "#14213D" : CREAM }}>
                {CAM_BG_LABEL[m]}
              </button>
            );
          })}
        </div>
        {bg.mode === "remove" && (
          <div role="radiogroup" aria-label="Behind the cut-out" style={{ display: "inline-flex", gap: 4 }}>
            {CAM_BG_FILLS.map((f) => {
              const on = bg.fill === f;
              return (
                <button key={f} type="button" role="radio" aria-checked={on} title={CAM_FILL_LABEL[f]} onClick={() => setBg({ fill: f })}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px 3px 4px", borderRadius: 999, cursor: "pointer", font: "inherit",
                    border: `1px solid ${on ? GOLD : EDGE}`, background: "transparent", color: on ? CREAM : MUTED }}>
                  <span aria-hidden style={{ width: 14, height: 14, borderRadius: "50%", border: `1px solid ${EDGE}`,
                    background: f === "transparent" ? "repeating-conic-gradient(#555 0 25%, #222 0 50%) 0 0 / 8px 8px" : CAM_FILL_CSS[f] }} />
                  {CAM_FILL_LABEL[f]}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: fell ? GOLD : MUTED }}>{said}</div>
    </div>
  );
}

