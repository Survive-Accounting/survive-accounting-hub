// THE THUMBNAIL SHEET — /v3/post's cover generator.
//
// Lee, 2026-09-09: "Thumbnails too that I can download that it generates?" The card renders at
// /api/thumb/<setId> (composition and rules in lib/thumb-card.ts); this is where he picks the
// hook line, the ground and the shape, sees it, and saves the PNG.
//
// THE DEFAULT IS THE SET'S FIRST QUESTION, resolved on the server — so opening the sheet and
// pressing Download is a complete, correct cover with nothing typed. Everything below that is
// for the shorts where the first stem isn't the hook.
//
// The preview is the real renderer, not a mock: the <img> is the same URL the download uses, so
// what he sees is the file byte for byte. The route is admin-gated and same-origin, so both the
// image and the download carry his cookie without anything special here.
import { useEffect, useMemo, useRef, useState } from "react";

import { cleanHook, THUMB_GROUNDS, THUMB_RATIOS, THUMB_SIZE, thumbFilename, trimToHook, type ThumbGround, type ThumbRatio } from "@/lib/thumb-card";
import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { TakeFrame } from "@/components/v3/TakeFrame";

const GROUND_LABEL: Record<ThumbGround, string> = { navy: "Navy", gold: "Gold", cream: "Cream" };
const RATIO_LABEL: Record<ThumbRatio, string> = { "9x16": "9:16 · the cover", "16x9": "16:9 · YouTube search" };

/** Long enough that typing a hook doesn't fire a render per keystroke, short enough that pausing
 *  feels like the picture is keeping up. */
const REDRAW_AFTER_MS = 550;

export function ThumbSheet({ setId, setName, topicName, defaultLine = "", onClose }: {
  setId: string; setName: string; topicName: string;
  /** THIS video's first question. A split set's second video is not covered by the set's first
   *  card, so the caller — which knows the split — supplies the hook rather than the route
   *  guessing it. Empty falls back to the route's own default. */
  defaultLine?: string;
  onClose: () => void;
}) {
  // Prefilled rather than left blank: seeing the hook is what makes it obvious it can be changed.
  const start = useMemo(() => trimToHook(cleanHook(defaultLine)), [defaultLine]);
  const [line, setLine] = useState(start);
  const [settled, setSettled] = useState(start);
  /** TWO SOURCES (2026-09-09). Lee: "I think with the using the intro slide for the thumbnail,
   *  let me choose between the first few seconds… since often I have my eyes closed at the start."
   *  So the cover is either the card we draw, or a still of his own opening. */
  const [source, setSource] = useState<"card" | "take">("card");
  const [ground, setGround] = useState<ThumbGround>("navy");
  const [ratio, setRatio] = useState<ThumbRatio>("9x16");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setSettled(line.trim()), REDRAW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [line]);

  const src = useMemo(() => {
    const q = new URLSearchParams({ ground, ar: ratio });
    if (settled) q.set("line", settled);
    if (topicName.trim()) q.set("topic", topicName.trim());
    return `/api/thumb/${encodeURIComponent(setId)}?${q.toString()}`;
  }, [setId, settled, ground, ratio, topicName]);

  useEffect(() => { setLoading(true); setFailed(null); }, [src]);

  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); } };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, []);

  const { w, h } = THUMB_SIZE[ratio];
  const previewW = ratio === "9x16" ? 260 : 460;
  const previewH = Math.round((previewW * h) / w);

  const small: React.CSSProperties = { font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "transparent", color: V3_CREAM, cursor: "pointer", whiteSpace: "nowrap" };
  const chip = (on: boolean): React.CSSProperties => ({ ...small, borderColor: on ? `${V3_GOLD}aa` : V3_EDGE, color: on ? V3_GOLD : V3_MUTED, background: on ? "rgba(252,163,17,0.10)" : "transparent" });

  return (
    <div role="dialog" aria-modal="true" aria-label={`Thumbnail — ${setName}`} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2147482800, background: "rgba(5,8,16,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 760, maxHeight: "92vh", overflowY: "auto", background: "#0B0F1E", color: V3_CREAM, border: `1px solid ${V3_GOLD}66`, borderRadius: 16, padding: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: V3_DISPLAY, fontSize: 20, fontWeight: 900, letterSpacing: "-0.01em" }}>Thumbnail</div>
          <div style={{ fontSize: 12.5, color: V3_MUTED }}>{setName}{topicName ? ` · ${topicName}` : ""}</div>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ ...small, color: V3_MUTED }}>close</button>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setSource("card")} style={chip(source === "card")}>The card</button>
          <button type="button" onClick={() => setSource("take")} style={chip(source === "take")}>A frame of the take</button>
        </div>

        {source === "take" && <div style={{ marginTop: 12 }}><TakeFrame name={setName} /></div>}

        {source === "card" && (
        <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* THE PICTURE — the renderer itself, at preview scale. */}
          <div style={{ width: previewW, flexShrink: 0 }}>
            <div style={{ position: "relative", width: previewW, height: previewH, borderRadius: 10, overflow: "hidden", border: `1px solid ${V3_EDGE}`, background: "rgba(244,239,230,0.04)" }}>
              <img
                src={src} alt="" width={previewW} height={previewH}
                onLoad={() => { setLoading(false); setFailed(null); }}
                onError={() => { setLoading(false); setFailed("The card didn't render. Reload the page if you were signed out."); }}
                style={{ display: "block", width: "100%", height: "100%", opacity: loading ? 0.35 : 1, transition: "opacity 160ms ease" }}
              />
              {loading && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 11.5, color: V3_MUTED }}>drawing…</div>
              )}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: V3_MUTED, textAlign: "center" }}>{w} × {h}</div>
          </div>

          {/* THE CONTROLS. */}
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
              The hook is the set's first question unless you write another. Keep it to something a
              student would type into search when they're stuck.
            </div>
            <textarea
              autoFocus value={line} onChange={(e) => setLine(e.target.value)} rows={3}
              placeholder="the hook — leave empty for this video's first question"
              style={{ width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 13.5, lineHeight: 1.45, marginTop: 8, padding: "7px 10px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "rgba(244,239,230,0.05)", color: V3_CREAM, outline: "none", resize: "vertical" }}
            />

            <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {THUMB_GROUNDS.map((g) => (
                <button key={g} type="button" onClick={() => setGround(g)} style={chip(g === ground)}>{GROUND_LABEL[g]}</button>
              ))}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {THUMB_RATIOS.map((r) => (
                <button key={r} type="button" onClick={() => setRatio(r)} style={chip(r === ratio)}>{RATIO_LABEL[r]}</button>
              ))}
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <a
                href={`${src}&dl=1`} download={thumbFilename(setName, ratio)}
                style={{ ...small, fontSize: 12.5, padding: "7px 14px", border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.12)", textDecoration: "none", display: "inline-block" }}
              >
                Download the PNG
              </a>
              {failed && <span style={{ fontSize: 12, color: "#FF8B7E" }}>{failed}</span>}
            </div>
            <div style={{ marginTop: 10, fontSize: 11.5, color: V3_MUTED, lineHeight: 1.5 }}>
              9:16 is the cover every destination shows — the Shorts shelf, the Reels grid, your
              TikTok profile. 16:9 is the second slot YouTube fills, in search and the subscriptions feed.
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
