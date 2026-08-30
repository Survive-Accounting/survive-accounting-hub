// THE VIDEO — poster frame, click to play.
//
// NEVER AUTOPLAY WITH SOUND. Not a preference: a page shared by email gets opened in a quiet
// room, in a meeting, next to somebody sleeping. The player mounts paused with its poster showing
// and starts only on a click, which is also the only way a browser will let audio play at all.
//
// NO EMAIL GATE. The video and the deck are both open. The form is downstream of being convinced,
// never upstream of it.
//
// TWO SOURCES, one component: a file URL renders a real <video> (poster, controls, playsInline);
// a YouTube or Vimeo URL renders the poster as a click-to-load facade and only then swaps in the
// iframe — so the embed's cookies and network calls do not fire for someone who never pressed
// play.
import { useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";

/** YouTube/Vimeo → embed URL, or null when this is a plain media file. */
function embedFor(url: string): string | null {
  const u = url.trim();
  let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0`;
  m = u.match(/vimeo\.com\/(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}?autoplay=1`;
  return null;
}

export function CampaignVideo({ src, poster, title = "The campaign, in about two minutes" }: {
  /** The video. When absent the whole block renders nothing — a broken player is worse than none. */
  src?: string | null;
  poster?: string | null;
  title?: string;
}) {
  const [playing, setPlaying] = useState(false);
  if (!src) return null;

  const embed = embedFor(src);

  return (
    <div
      className="mx-auto mt-7 w-full max-w-[680px] overflow-hidden rounded-2xl"
      style={{
        background: "#000", border: "1px solid var(--border-default)",
        boxShadow: "0 24px 60px -30px rgba(0,0,0,0.7)", fontFamily: BRAND_SANS,
      }}
    >
      <div style={{ position: "relative", aspectRatio: "16 / 9" }}>
        {embed ? (
          playing ? (
            <iframe
              src={embed}
              title={title}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          ) : (
            <PosterButton poster={poster} title={title} onPlay={() => setPlaying(true)} />
          )
        ) : (
          // A real file: the browser's own controls, muted={false} but PAUSED — no autoplay
          // attribute anywhere, so nothing makes noise until somebody presses play.
          <video
            src={src}
            poster={poster ?? undefined}
            controls
            playsInline
            preload="metadata"
            title={title}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "#000" }}
          />
        )}
      </div>
    </div>
  );
}

function PosterButton({ poster, title, onPlay }: { poster?: string | null; title: string; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play: ${title}`}
      className="group focus-visible:ring-2"
      style={{
        position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, padding: 0,
        cursor: "pointer", background: poster ? `#000 center/cover no-repeat url(${JSON.stringify(poster)})` : "#0B1220",
        display: "grid", placeItems: "center",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "grid", placeItems: "center", width: 74, height: 74, borderRadius: 999,
          background: "var(--accent)", color: "#0B1220", fontSize: 26, fontWeight: 900,
          boxShadow: "0 12px 40px -8px rgba(0,0,0,0.7)", paddingLeft: 6,
        }}
      >
        ▶
      </span>
    </button>
  );
}
