// HOW SURVIVE WORKS — Lee's 36-second walkthrough (2026-09-16).
//
// Two homes: the home hero (HowSurviveWorksVideo — autoplays silently the moment the page is up, a tap restarts it
// from the top with sound) and one row on /learn above the topics (HowSurviveWorksRow — "How Survive Works · 0:36";
// after it has been watched once it shrinks to a single line with "Watch again"). Lee: "How to put How Survive Works
// at the top like you said… also place it on the home page."
//
// The file lives in the site's public media bucket; no host player, no library — a <video>. Nothing here invents a
// length: 0:36 is the file's.
import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX, X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { CtaButton } from "@/components/brand-cards/ChainLightning";
import { LK } from "@/components/learn/learn-theme";
import { track } from "@/lib/analytics";

export const HOW_SURVIVE_WORKS_URL = "https://unvxagsledbsdoremqeb.supabase.co/storage/v1/object/public/canvas-media/site/how-survive-works.mp4";
export const HOW_SURVIVE_WORKS_LEN = "0:36";
const SEEN_KEY = "sa-hsw-seen";

export function readHswSeen(): boolean { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } }
function writeHswSeen() { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ } }

/** THE VIDEO ITSELF: silent and looping on its own until tapped; a tap restarts it from the top with sound, and
 *  the next tap mutes it again. The picture holds black until the first frame (no wheel). */
export function HowSurviveWorksVideo({ style, radius = 16, caption = true, onSoundOn }: {
  style?: React.CSSProperties;
  radius?: number;
  caption?: boolean;
  onSoundOn?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { const v = ref.current; if (v) void v.play().catch(() => { /* the tap starts it */ }); }, []);
  const tap = () => {
    const v = ref.current; if (!v) return;
    if (!sound) {
      v.muted = false; v.currentTime = 0; v.loop = false; setSound(true);
      void v.play().catch(() => { /* blocked: the mute pill stays */ });
      writeHswSeen(); onSoundOn?.();
      track("hsw_play_sound", { where: window.location.pathname });
    } else { v.muted = true; v.loop = true; setSound(false); if (v.paused) void v.play().catch(() => {}); }
  };
  return (
    <button type="button" onClick={tap} aria-label={sound ? "Mute How Survive Works" : "Play How Survive Works with sound"}
      style={{ position: "relative", display: "block", width: "100%", aspectRatio: "9 / 16", borderRadius: radius, overflow: "hidden", background: "#000", border: 0, padding: 0, cursor: "pointer", ...style }}>
      <video ref={ref} src={HOW_SURVIVE_WORKS_URL} muted playsInline loop preload="auto" aria-hidden
        onPlaying={() => setReady(true)} onEnded={() => { const v = ref.current; if (v && sound) { v.muted = true; v.loop = true; setSound(false); void v.play().catch(() => {}); } }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: ready ? 1 : 0, transition: "opacity 420ms ease" }} />
      <span aria-hidden style={{ position: "absolute", left: 10, top: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 999, background: "rgba(0,0,0,0.62)", color: "#F2EFE6", fontSize: 11, fontWeight: 800, fontFamily: BRAND_SANS, letterSpacing: "0.04em" }}>
        {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />} {sound ? "Sound on" : "Tap for sound"}
      </span>
      {caption && (
        <span aria-hidden style={{ position: "absolute", left: 10, right: 10, bottom: 10, display: "flex", alignItems: "baseline", gap: 6, color: "#F2EFE6", textShadow: "0 1px 6px rgba(0,0,0,0.8)", fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 14, letterSpacing: "0.02em" }}>
          <span style={{ color: "#FCA311" }}>HOW SURVIVE WORKS</span><span style={{ fontFamily: BRAND_SANS, fontWeight: 700, fontSize: 12, opacity: 0.85 }}>· {HOW_SURVIVE_WORKS_LEN}</span>
        </span>
      )}
    </button>
  );
}

/** THE /learn ROW, above the topics: a small silent preview, the name, the length, Watch. Once watched, one line. */
export function HowSurviveWorksRow({ narrow }: { narrow: boolean }) {
  const [seen, setSeen] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setSeen(readHswSeen()); }, []);
  const watch = () => { setOpen(true); track("hsw_open", { where: "/learn" }); };
  const close = () => { setOpen(false); writeHswSeen(); setSeen(true); };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const lightbox = open && <HowSurviveWorksLightbox onClose={close} />;
  if (seen) {
    return (
      <>
        <div className="flex items-center gap-3" style={{ padding: narrow ? "6px 0 2px" : "4px 0", color: LK.muted, fontFamily: BRAND_SANS, fontSize: 13 }}>
          <span className="lk-disp" style={{ fontSize: 14, color: LK.text }}>How Survive Works</span>
          <span>· {HOW_SURVIVE_WORKS_LEN}</span>
          <button type="button" onClick={watch} className="underline underline-offset-2" style={{ background: "transparent", border: 0, padding: "4px 2px", color: LK.acc, cursor: "pointer", font: "inherit", fontWeight: 700, minHeight: 32 }}>Watch again</button>
        </div>
        {lightbox}
      </>
    );
  }
  return (
    <>
      <div className="lk-card" style={{ display: "grid", gridTemplateColumns: narrow ? "84px 1fr" : "96px 1fr auto", gap: narrow ? 12 : 16, alignItems: "center", padding: narrow ? 10 : 12, border: `1px solid ${LK.acc}`, background: "color-mix(in srgb, var(--lk-acc) 6%, var(--lk-surface))" }}>
        <div style={{ width: narrow ? 84 : 96 }}><HowSurviveWorksVideo radius={10} caption={false} onSoundOn={() => { setSeen(true); }} /></div>
        <div className="min-w-0">
          <div className="lk-disp" style={{ fontSize: narrow ? 17 : 20, lineHeight: 1.1, color: LK.text }}>How Survive Works</div>
          <div style={{ fontSize: 12.5, color: LK.muted, marginTop: 3, fontFamily: BRAND_SANS }}>{HOW_SURVIVE_WORKS_LEN}{narrow ? "" : " · Lee, in 36 seconds"}</div>
          {narrow && <button type="button" onClick={watch} className="lk-btn lk-btn-acc" style={{ marginTop: 8, padding: "8px 14px", fontSize: 12, minHeight: 36 }}><Play className="h-3.5 w-3.5" fill="currentColor" /> Watch</button>}
        </div>
        {!narrow && <button type="button" onClick={watch} className="lk-btn lk-btn-acc" style={{ padding: "10px 18px", fontSize: 13 }}><Play className="h-4 w-4" fill="currentColor" /> Watch</button>}
      </div>
      {lightbox}
    </>
  );
}

/** The lightbox's copy starts WITH sound (it was opened by a tap — the gesture browsers want). */
function SoundFirst() {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(false);
  useEffect(() => { const v = ref.current; if (!v) return; v.muted = false; void v.play().catch(() => { v.muted = true; setMuted(true); void v.play().catch(() => {}); }); }, []);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 18, overflow: "hidden", background: "#000", boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)" }}>
      <video ref={ref} src={HOW_SURVIVE_WORKS_URL} playsInline preload="auto" onEnded={() => setEnded(true)} onPlay={() => setEnded(false)}
        onClick={() => { const v = ref.current; if (!v) return; if (v.ended) { v.currentTime = 0; void v.play(); } else if (v.paused) void v.play(); else v.pause(); }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", cursor: "pointer" }} />
      <button type="button" onClick={() => { const v = ref.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); }} className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-extrabold" style={{ background: muted ? "#FCA311" : "rgba(28,28,28,0.85)", color: muted ? "#14213D" : "#F2EFE6", border: muted ? 0 : "1px solid rgba(255,255,255,0.18)", cursor: "pointer", fontFamily: BRAND_SANS }}>
        {muted ? <><VolumeX className="h-3.5 w-3.5" /> Tap for sound</> : <><Volume2 className="h-3.5 w-3.5" /> Sound on</>}
      </button>
      {ended && (
        <button type="button" onClick={() => { const v = ref.current; if (v) { v.currentTime = 0; void v.play(); } }} className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full" style={{ width: 72, height: 72, background: "rgba(0,0,0,0.6)", border: "2px solid rgba(255,255,255,0.85)", color: "#fff", cursor: "pointer" }} aria-label="Play again"><Play className="h-8 w-8" fill="currentColor" style={{ marginLeft: 4 }} /></button>
      )}
    </div>
  );
}

/** THE CARD (the home hero, Lee, 2026-09-16: "the video shouldn't autoplay… it should just have the bolt, boiling, and say
 *  How Survive Works, Meet Lee, 36 seconds, a play button — and that's it"). The campus bolt changes with the school. */
export function HowSurviveWorksCard({ bolt, onOpen }: { bolt: { c1: string; c2: string } | null; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label="Watch How Survive Works — meet Lee, 36 seconds" data-gm-cta="hero-video"
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 16, width: "min(370px, 90vw)", minHeight: 104, borderRadius: 14, background: "linear-gradient(125deg, #1B2D49, #14213D)", border: "1px solid rgba(125,211,252,0.35)", padding: "14px 18px", cursor: "pointer", boxShadow: "0 18px 40px -18px rgba(0,0,0,0.8)", color: "#F5EFE6", textAlign: "left" }}>
      <span aria-hidden style={{ flex: "none", display: "grid", placeItems: "center", width: 64 }}>
        <BoltBoil height={62} red={bolt?.c1} blue={bolt?.c2} boilSeconds={1.2} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 17, lineHeight: 1.1, letterSpacing: "0.01em", whiteSpace: "nowrap" }}>How Survive Works</span>
        <span style={{ display: "block", marginTop: 6, fontFamily: BRAND_SANS, fontSize: 12.5, fontWeight: 700, color: "#C8D2E6" }}>Meet Lee · {HOW_SURVIVE_WORKS_LEN}</span>
      </span>
      <span aria-hidden style={{ flex: "none", width: 50, height: 50, borderRadius: "50%", border: "2px solid #FCA311", background: "rgba(11,18,32,0.75)", display: "grid", placeItems: "center", color: "#FCA311" }}>
        <Play className="h-5 w-5" fill="currentColor" style={{ marginLeft: 3 }} />
      </span>
    </button>
  );
}

/** THE LIGHTBOX: the vertical video with sound, and — when the caller hands one in — the next step right under it
 *  (the home page's "Start cramming →", so a viewer moves on without closing anything). */
export function HowSurviveWorksLightbox({ onClose, cta }: { onClose: () => void; cta?: { label: string; onClick: () => void } }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div role="dialog" aria-label="How Survive Works" className="fixed inset-0 z-[150] flex items-center justify-center" style={{ background: "rgba(6,10,22,0.9)", backdropFilter: "blur(10px)" }} onClick={onClose}>
      <div style={{ position: "relative", width: "min(400px, 92vw)", aspectRatio: "9 / 16", maxHeight: "94dvh" }} onClick={(e) => e.stopPropagation()}>
        <SoundFirst />
        {/* THE NEXT STEP, OVER THE PICTURE (Lee: "the start cramming button needs to be overlaid on the video… matching
            the one on the homepage, with the hover animation"): the outro's own pill, at the foot of the video. */}
        {cta && (
          <button type="button" onClick={cta.onClick} aria-label={cta.label} style={{ position: "absolute", left: "50%", bottom: 28, transform: "translateX(-50%)", background: "transparent", border: 0, padding: 0, cursor: "pointer", zIndex: 2 }}>
            <CtaButton label={cta.label} font={17} h={52} padX={28} minW={230} />
          </button>
        )}
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full" style={{ background: "rgba(255,255,255,0.14)", color: "#fff", border: 0, cursor: "pointer" }}><X className="h-5 w-5" /></button>
    </div>
  );
}
