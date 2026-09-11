// THE COVER SHEET — the 🖼 button on a /v3/post row. It used to open ThumbSheet, the server-drawn
// hook card (/api/thumb); since 2026-09-11 there is ONE thumbnail system and this is its editor over
// the queue, seeded with this video's name and its place on the cram path.
import { useEffect, useRef } from "react";

import { ThumbnailStudio } from "@/components/brand-kit/ThumbnailStudio";
import { small } from "@/components/brand-kit/kit-ui";
import { V3_DISPLAY, V3_GOLD, V3_MUTED, V3_CREAM } from "@/components/v3/Shell";

export function CoverSheet({ title, topicName, setId, part, onClose }: {
  title: string; topicName: string; setId: string;
  /** "3" on the cram path, else a name for the series label. */
  part: string;
  onClose: () => void;
}) {
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); } };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Cover — ${title}`} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2147482800, background: "rgba(5,8,16,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 1120, maxHeight: "92vh", overflowY: "auto", background: "#0B0F1E", color: V3_CREAM, border: `1px solid ${V3_GOLD}66`, borderRadius: 16, padding: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
          <div style={{ fontFamily: V3_DISPLAY, fontSize: 20, fontWeight: 900, letterSpacing: "-0.01em" }}>Cover</div>
          <div style={{ fontSize: 12.5, color: V3_MUTED }}>{title}{topicName ? ` · ${topicName}` : ""}</div>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ ...small, color: V3_MUTED }}>close</button>
        </div>
        <ThumbnailStudio compact context={{ title, topicName, setId, part, exam: 1 }} />
      </div>
    </div>
  );
}
