// Video card — Mux playback. Signed-policy assets (video_archive) 403 on plain
// stream.mux.com/image.mux.com URLs; PUBLIC playback IDs work unsigned. Strategy:
// try unsigned HLS first (cheap, no server round-trip); if the manifest load
// fails, request a signed token (aud "v" for the manifest, aud "t" for the
// poster) and retry once. hls.js drives playback everywhere except Safari,
// which plays HLS natively. Static MP4 renditions aren't guaranteed to be
// enabled per-asset in Mux (video_archive assets aren't), so HLS is the only
// reliable path for these ids — the old <video src=".../high.mp4"> silently
//404s on them.
import { useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";

import { signMuxPlayback } from "@/lib/canvas.functions";
import { BaseCard, useCardActions } from "../BaseCard";
import { PAPER } from "../theme";
import type { VideoCard } from "../types";

type LoadState = "idle" | "unsigned" | "signing" | "signed" | "error";

function hlsUrl(playbackId: string, token?: string) {
  return `https://stream.mux.com/${playbackId}.m3u8${token ? `?token=${token}` : ""}`;
}
function posterUrl(playbackId: string, token?: string) {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=1${token ? `&token=${token}` : ""}`;
}

export function VideoCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as VideoCard;
  const { update } = useCardActions(id);
  const editing = !!d.editMode;

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<import("hls.js").default | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [poster, setPoster] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const triedSigned = useRef(false);
  /** Set by the effect each run; the <video onError> (Safari's native-HLS failure
   *  signal) calls through this ref to trigger the one signed retry. */
  const retrySignedRef = useRef<() => void>(() => {});

  useEffect(() => {
    triedSigned.current = false;
    setErr(null);
    setState("idle");
    setPoster(d.playbackId ? posterUrl(d.playbackId) : null);
    const video = videoRef.current;
    if (!video || !d.playbackId) return;

    let cancelled = false;

    const attach = async (token?: string) => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      const url = hlsUrl(d.playbackId, token);
      const { default: Hls } = await import("hls.js");
      if (cancelled) return;
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_evt, data2) => {
          if (!data2.fatal || cancelled) return;
          if (!triedSigned.current) void trySigned();
          else setState("error");
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { if (!cancelled) setState(token ? "signed" : "unsigned"); });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari: native HLS, no separate error event to hook cleanly — success/
        // failure both surface on the <video> element's own onError below.
        video.src = url;
        setState(token ? "signed" : "unsigned");
      } else {
        setState("error");
        setErr("This browser can't play HLS and hls.js isn't supported.");
      }
    };

    const trySigned = async () => {
      if (triedSigned.current || cancelled) return;
      triedSigned.current = true;
      setState("signing");
      try {
        const [{ token: vTok }, { token: tTok }] = await Promise.all([
          signMuxPlayback({ data: { playbackId: d.playbackId, aud: "v" } }),
          signMuxPlayback({ data: { playbackId: d.playbackId, aud: "t" } }),
        ]);
        if (cancelled) return;
        setPoster(posterUrl(d.playbackId, tTok));
        await attach(vTok);
      } catch (e) {
        if (cancelled) return;
        setState("error");
        setErr(e instanceof Error ? e.message : String(e));
      }
    };

    retrySignedRef.current = () => void trySigned();
    void attach();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [d.playbackId]);

  return (
    <BaseCard id={id} data={d} selected={selected} accent="#4FA3E3">
      {editing || !d.playbackId ? (
        <label className="block text-[11px]" style={{ color: PAPER.inkMuted }}>
          Mux playback ID
          <input
            className="nodrag mt-0.5 w-full rounded bg-black/5 px-1.5 py-1 text-[12px] outline-none ring-1 ring-[rgba(20,33,61,0.30)]"
            defaultValue={d.playbackId}
            placeholder="e.g. DS00Spx1CV902MCtPj5WknGlR102V5HFkDe"
            onBlur={(e) => update({ playbackId: e.target.value.trim() })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
      ) : null}
      {d.playbackId && (
        <>
          <video
            ref={videoRef}
            className="nodrag mt-1 w-full rounded"
            style={{ minWidth: 280, background: "#000" }}
            controls
            playsInline
            poster={poster ?? undefined}
            onError={() => retrySignedRef.current()}
          />
          {state === "signing" && (
            <p className="mt-1 text-[10.5px]" style={{ color: PAPER.inkMuted }}>
              unsigned playback failed — requesting a signed token…
            </p>
          )}
          {state === "error" && (
            <p className="mt-1 rounded px-2 py-1 text-[11px]" style={{ background: "rgba(194,24,50,0.07)", color: PAPER.red, border: "1px solid rgba(194,24,50,0.3)" }}>
              {err ?? "Playback failed."} {!err?.includes("not configured") && "Check the playback ID."}
            </p>
          )}
        </>
      )}
    </BaseCard>
  );
}
