// Camera bubble — Lee's face on the recording. getUserMedia webcam in a SCREEN-FIXED
// overlay (does not pan/zoom with the canvas). Drag anywhere, corner-drag resize,
// circle/rounded-rect mask, mirror, device picker. Position/size/shape persist in
// localStorage (screen-space concern, not scene data). Graceful permission/no-camera
// state — never crashes the canvas. Toggled with "b"; it IS filming chrome, so film
// mode leaves it visible.
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FlipHorizontal2, Circle, Square, X } from "lucide-react";
import { DISPLAY_FONT, NEON } from "./theme";

const LS_KEY = "sa-canvas-camera";

interface CamPrefs {
  x: number;
  y: number;
  size: number; // px (width; circle uses size×size)
  shape: "circle" | "rect";
  mirror: boolean;
  deviceId?: string;
}

const DEFAULTS: CamPrefs = { x: -1, y: -1, size: 220, shape: "circle", mirror: true };

function loadPrefs(): CamPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<CamPrefs>) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function CameraBubble({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<CamPrefs>(loadPrefs);
  const [err, setErr] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const persist = useCallback((p: CamPrefs) => {
    setPrefs(p);
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  }, []);

  // ---- stream lifecycle ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setErr(null);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: prefs.deviceId ? { deviceId: { exact: prefs.deviceId } } : true,
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        // enumerate AFTER permission so labels are populated
        const devs = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(devs.filter((d) => d.kind === "videoinput"));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [prefs.deviceId]);

  // ---- drag (whole bubble) + corner resize, pointer-capture based ----
  const dragState = useRef<{ mode: "move" | "resize"; startX: number; startY: number; origX: number; origY: number; origSize: number } | null>(null);

  const onPointerDown = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const box = boxRef.current?.getBoundingClientRect();
    dragState.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: box?.left ?? prefs.x,
      origY: box?.top ?? prefs.y,
      origSize: prefs.size,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragState.current;
    if (!s) return;
    if (s.mode === "move") {
      persist({ ...prefs, x: s.origX + (e.clientX - s.startX), y: s.origY + (e.clientY - s.startY) });
    } else {
      const d = Math.max(e.clientX - s.startX, e.clientY - s.startY);
      persist({ ...prefs, size: Math.min(560, Math.max(120, s.origSize + d)) });
    }
  };
  const onPointerUp = () => { dragState.current = null; };

  // default position: bottom-right-ish on first ever open
  const x = prefs.x >= 0 ? prefs.x : Math.max(16, window.innerWidth - prefs.size - 32);
  const y = prefs.y >= 0 ? prefs.y : Math.max(16, window.innerHeight - prefs.size - 48);
  const h = prefs.shape === "circle" ? prefs.size : Math.round(prefs.size * 0.62);

  return (
    <div
      ref={boxRef}
      className="group fixed z-[80] select-none"
      style={{ left: x, top: y, width: prefs.size, height: h }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* White matte frame — same treatment as the home-page photo frames */}
      <div
        className="h-full w-full cursor-grab active:cursor-grabbing"
        style={{
          borderRadius: prefs.shape === "circle" ? "9999px" : 22,
          background: "#fff",
          padding: Math.max(6, Math.round(prefs.size / 26)),
          boxShadow: "0 0 0 1px rgba(0,0,0,0.05), 0 26px 60px -26px rgba(20,33,61,0.5)",
        }}
        onPointerDown={onPointerDown("move")}
      >
      <div
        className="h-full w-full overflow-hidden"
        style={{
          borderRadius: prefs.shape === "circle" ? "9999px" : 14,
          background: "#000",
        }}
      >
        {err ? (
          <div className="grid h-full w-full place-items-center p-3 text-center">
            <div>
              <Camera className="mx-auto mb-1 h-5 w-5" style={{ color: NEON.red }} />
              <p className="text-[10.5px] leading-snug" style={{ color: NEON.red }}>camera unavailable</p>
              <p className="mt-0.5 max-w-[180px] text-[9px] leading-snug" style={{ color: NEON.muted }}>{err}</p>
              <button
                className="mt-1.5 rounded px-2 py-0.5 text-[10px] font-semibold"
                style={{ color: NEON.cyan, border: `1px solid ${NEON.cyan}` }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => persist({ ...prefs })}
              >
                retry
              </button>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{ transform: prefs.mirror ? "scaleX(-1)" : undefined }}
          />
        )}
      </div>
      </div>

      {/* Signature nametag — home-page display face */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white"
        style={{
          bottom: -Math.max(10, Math.round(prefs.size / 20)),
          padding: "1px 14px 3px",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 10px 24px -12px rgba(20,33,61,0.55)",
          fontFamily: DISPLAY_FONT,
          fontSize: Math.max(13, Math.min(20, Math.round(prefs.size / 13))),
          color: "#14213D",
          lineHeight: 1.35,
        }}
      >
        Lee Ingram
        <span className="mx-auto block h-[2px] w-3/5 rounded-full" style={{ background: NEON.yellow }} />
      </div>

      {/* controls — appear on hover, hidden while at rest (clean on camera). The
          sa-chrome class also hides them in FILM mode so a stray hover never
          reveals the device picker on the recording. */}
      <div className="sa-chrome absolute -top-8 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <CamBtn title={prefs.shape === "circle" ? "Rounded rectangle" : "Circle"} onClick={() => persist({ ...prefs, shape: prefs.shape === "circle" ? "rect" : "circle" })}>
          {prefs.shape === "circle" ? <Square className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
        </CamBtn>
        <CamBtn title="Mirror" onClick={() => persist({ ...prefs, mirror: !prefs.mirror })}>
          <FlipHorizontal2 className="h-3 w-3" style={{ color: prefs.mirror ? NEON.cyan : undefined }} />
        </CamBtn>
        {devices.length > 1 && (
          <select
            className="max-w-[110px] rounded bg-black/50 px-1 py-0.5 text-[9.5px] outline-none"
            style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
            value={prefs.deviceId ?? ""}
            onChange={(e) => persist({ ...prefs, deviceId: e.target.value || undefined })}
          >
            <option value="">default cam</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `cam ${d.deviceId.slice(0, 6)}`}</option>
            ))}
          </select>
        )}
        <CamBtn title="Close (b)" onClick={onClose}><X className="h-3 w-3" /></CamBtn>
      </div>

      {/* corner resize handle */}
      <div
        className="sa-chrome absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: `linear-gradient(135deg, transparent 50%, ${NEON.yellow} 50%)`, borderBottomRightRadius: prefs.shape === "circle" ? 9999 : 22 }}
        onPointerDown={onPointerDown("resize")}
        title="Resize"
      />
    </div>
  );
}

function CamBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      title={title}
      className="grid h-5 w-5 place-items-center rounded"
      style={{ color: NEON.muted }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.color = NEON.text)}
      onMouseLeave={(e) => (e.currentTarget.style.color = NEON.muted)}
    >
      {children}
    </button>
  );
}
