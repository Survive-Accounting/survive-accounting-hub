// A VIDEO CARD — not a tile.
//
// The difference is what the eye gets first. A tile leads with artwork and hangs a label under
// it; a card leads with the thumbnail but commits real space to the TITLE and the metadata
// beneath, because in a scrolling list the title is what a student is actually reading. So: a
// 16:9 thumbnail with the duration burned into the corner the way every video product does it,
// then two lines of title, then the metadata row.
//
// TWO LINES OF TITLE, ALWAYS. The clamp is fixed rather than natural so every card in a column
// has its metadata on the same baseline — a ragged list of one- and two-line cards reads as
// broken alignment, not as variety.
//
// The bolt placeholder stays until real thumbnails exist; a paid set has no playbackId in the
// tree at all, so the bolt face is also the deliberate visual tell that a set is locked.
import { CircleCheck, Lock, Play } from "lucide-react";

import { Bolt } from "@/components/canvas/brand";

export type VideoCardProps = {
  title: string;
  /** Mux thumbnail; absent for paid or unpublished sets, which keep the bolt face. */
  thumbUrl?: string | null;
  /** Seconds. Rendered as the corner overlay every video product uses. */
  durationSec?: number | null;
  /** The line under the title — topic, set number, question count. */
  meta?: string;
  locked?: boolean;
  complete?: boolean;
  /** 0–1. Draws the watched strip along the bottom of the thumbnail. */
  watched?: number;
  active?: boolean;
  onOpen: () => void;
  /** Horizontal in the up-next rail; the player column uses the same card at full width. */
  compact?: boolean;
};

const fmt = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export function VideoCard({
  title, thumbUrl, durationSec, meta, locked, complete, watched = 0, active, onOpen, compact,
}: VideoCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      className="lm-card lm-surface group w-full overflow-hidden rounded-xl border text-left focus-visible:ring-2"
      style={{
        // The active card keeps the accent border at all times — in a long scrolling rail, "which
        // one am I watching" has to be answerable without scrolling back to the player.
        borderColor: active ? "var(--lm-accent)" : "var(--lm-border)",
        borderWidth: 1,
        borderStyle: "solid",
        cursor: "pointer",
      }}
    >
      <div className="relative w-full" style={{ aspectRatio: "16 / 9", background: "rgba(0,0,0,0.35)" }}>
        {thumbUrl ? (
          <img src={thumbUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full" style={{ objectFit: "cover" }} />
        ) : (
          <span className="absolute inset-0 grid place-items-center">
            <span className="inline-block" style={{ height: compact ? 26 : 34, width: compact ? 16 : 21 }}>
              <Bolt c1="#006BA6" c2="#00456E" />
            </span>
          </span>
        )}

        {/* THE PLAY AFFORDANCE — fades in on hover, as it did before. */}
        <span className="lm-play absolute inset-0 grid place-items-center" style={{ background: "rgba(4,7,14,0.45)" }}>
          <span
            className="grid place-items-center rounded-full"
            style={{ width: 40, height: 40, background: "var(--lm-accent)", color: "var(--lm-accent-ink)" }}
          >
            <Play className="h-4 w-4" style={{ marginLeft: 2 }} />
          </span>
        </span>

        {/* DURATION, burned into the corner. */}
        {durationSec != null && durationSec > 0 && (
          <span
            className="absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
            style={{ background: "rgba(4,7,14,0.85)", color: "#E8ECF5" }}
          >
            {fmt(durationSec)}
          </span>
        )}

        {locked && (
          <span
            className="absolute right-1.5 top-1.5 grid place-items-center rounded-full"
            style={{ width: 24, height: 24, background: "rgba(4,7,14,0.75)", border: "1px solid var(--lm-border)", color: "#F0B24A" }}
          >
            <Lock className="h-3.5 w-3.5" />
          </span>
        )}
        {complete && !locked && (
          <span
            className="absolute right-1.5 top-1.5 grid place-items-center rounded-full"
            style={{ width: 24, height: 24, background: "rgba(4,7,14,0.75)", border: "1px solid rgba(59,245,160,0.5)", color: "#3BF5A0" }}
          >
            <CircleCheck className="h-3.5 w-3.5" />
          </span>
        )}

        {/* WATCHED STRIP — the one piece of state worth showing without a hover. */}
        {watched > 0 && (
          <span className="absolute bottom-0 left-0 h-[3px] w-full" style={{ background: "rgba(255,255,255,0.18)" }}>
            <span className="block h-full" style={{ width: `${Math.min(100, watched * 100)}%`, background: "var(--lm-accent)" }} />
          </span>
        )}
      </div>

      <div className="px-3 py-2.5">
        <div
          className="text-[13px] font-bold leading-snug"
          style={{
            color: active ? "var(--lm-accent)" : "var(--lm-text)",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            overflow: "hidden", minHeight: "2.6em",
          }}
        >
          {title}
        </div>
        {meta && (
          <div className="mt-1 truncate text-[11px]" style={{ color: "var(--lm-muted)" }}>
            {meta}
          </div>
        )}
      </div>
    </button>
  );
}
