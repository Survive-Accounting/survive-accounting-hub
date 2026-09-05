// A PLAIN <video>, playing a Mux PUBLIC playback id — no signing needed (SHIPPED assets are
// created with playback_policy: "public"; this is a build-in-public log, not gated content).
// Same HLS approach already used for the paid /learn player (CramPlayer.tsx): native HLS where
// the browser has it (Safari), hls.js everywhere else. No position tracking, no locking — just
// "use our existing Mux infrastructure… Mux Player rather than building a custom playback
// system" scoped down to what a public page actually needs.
import { useEffect, useRef, useState } from "react";

export function MuxVideo({ playbackId, poster, style }: { playbackId: string; poster?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const src = `https://stream.mux.com/${playbackId}.m3u8`;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = src;
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled || !ref.current) return;
        if (Hls.isSupported()) {
          const h = new Hls();
          h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) setErr(true); });
          h.loadSource(src);
          h.attachMedia(ref.current);
          hls = h;
        } else { ref.current.src = src; }
      }).catch(() => setErr(true));
    }
    return () => { cancelled = true; hls?.destroy(); };
  }, [playbackId]);

  if (err) return <div style={{ ...style, display: "grid", placeItems: "center", background: "#000", color: "#FF8B7E", fontSize: 13 }}>Couldn't load the video.</div>;
  return <video ref={ref} controls playsInline poster={poster} style={style} />;
}
