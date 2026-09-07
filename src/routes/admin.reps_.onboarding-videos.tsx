// /admin/reps/onboarding-videos — the four shorts that play on /rep/onboarding steps 1–4.
//
// Film on the /v3 line (the four are on the strategy board's reps lane), then either drop the
// MP4 here — Mux direct upload, public playback, same path as the /shipped recorder — or paste
// a public playback id. The step's placeholder card becomes the video the moment the id lands.
// Also the beta-mode switch. A sibling of admin.reps (the underscore), not a tab in its shell.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { MuxVideo } from "@/components/shipped/MuxVideo";
import { muxThumb } from "@/components/learn/cram-media";
import {
  createOnboardingVideoUpload, getOnboardingVideoSettings, resolveOnboardingVideoUpload, setOnboardingVideoId, setRepBetaMode,
  type VideoSettings, type VideoStep,
} from "@/lib/rep-onboarding-videos.functions";
import { STEPS } from "@/lib/rep-pre-onboarding";

export const Route = createFileRoute("/admin/reps_/onboarding-videos")({
  component: () => <AdminGate><Videos /></AdminGate>,
  head: () => ({ meta: [{ title: "Rep onboarding videos — Survive" }, { name: "robots", content: "noindex" }] }),
});

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)", BG = "#070B14", PANEL = "rgba(16,24,44,0.92)";
const STEP_KEYS: VideoStep[] = ["step1", "step2", "step3", "step4"];

function Videos() {
  const [s, setS] = useState<VideoSettings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [paste, setPaste] = useState<Record<string, string>>({});

  const refresh = useCallback(() => { getOnboardingVideoSettings().then(setS).catch((e) => setErr(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(refresh, [refresh]);

  const upload = async (step: VideoStep, f: File | undefined) => {
    if (!f) return;
    setErr(null); setBusy((b) => ({ ...b, [step]: "Starting…" }));
    try {
      const { uploadUrl } = await createOnboardingVideoUpload({ data: { step } });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setBusy((b) => ({ ...b, [step]: `Uploading ${Math.round((e.loaded / e.total) * 100)}%` })); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Upload failed — network"));
        xhr.open("PUT", uploadUrl); xhr.send(f);
      });
      setBusy((b) => ({ ...b, [step]: "Mux is processing…" }));
      for (let i = 0; i < 90; i++) {
        const r = await resolveOnboardingVideoUpload({ data: { step } });
        if (r.status === "ready") break;
        if (r.status === "errored") throw new Error("Mux could not process that file.");
        await new Promise((res) => setTimeout(res, 4000));
      }
      refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy((b) => { const n = { ...b }; delete n[step]; return n; }); }
  };

  const save = async (step: VideoStep, id: string) => {
    setErr(null);
    try { setS(await setOnboardingVideoId({ data: { step, playbackId: id.trim() } })); setPaste((p) => ({ ...p, [step]: "" })); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "16px clamp(12px, 4vw, 26px) 80px" }}>
      <header className="flex items-center gap-3" style={{ marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 21, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>🎬 Rep onboarding videos</h1>
        <a href="/admin/reps" style={{ color: MUTED, fontSize: 13, textDecoration: "underline" }}>← reps</a>
        <a href="/admin/ideas/strategy" style={{ color: MUTED, fontSize: 13, textDecoration: "underline" }}>strategy board (the scripts) →</a>
      </header>
      <p style={{ fontSize: 12.5, color: MUTED, margin: "0 0 18px", maxWidth: 760 }}>
        One short per step, vertical, public. Upload the MP4 or paste a public Mux playback id. Until a step has one, /rep/onboarding shows the gist card instead.
      </p>
      {err && <div style={{ color: "#F87171", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {!s && !err && <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>}

      {s && (
        <>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, maxWidth: 1180 }}>
            {STEP_KEYS.map((step, i) => {
              const def = STEPS[i];
              const id = s.videos[step];
              const b = busy[step];
              return (
                <section key={step} style={{ background: PANEL, border: `1px solid ${id ? `${GOLD}66` : EDGE}`, borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD }}>Step {i + 1}</div>
                  <div style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 17, margin: "2px 0 8px" }}>{def.title}</div>
                  {id ? (
                    <MuxVideo playbackId={id} poster={muxThumb(id, 480)} style={{ width: "100%", maxWidth: 220, aspectRatio: "9 / 16", borderRadius: 12, background: "#000" }} />
                  ) : (
                    <div style={{ maxWidth: 220, aspectRatio: "9 / 16", borderRadius: 12, border: `1px dashed ${EDGE}`, display: "grid", placeItems: "center", color: MUTED, fontSize: 12, padding: 12, textAlign: "center" }}>
                      no video yet — the gist card shows
                    </div>
                  )}
                  <ul style={{ margin: "10px 0", paddingLeft: 16, fontSize: 12, color: MUTED, lineHeight: 1.4 }}>{def.gist.map((g, k) => <li key={k}>{g}</li>)}</ul>
                  <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                    <label style={{ background: GOLD, color: "#0B1322", borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 800, cursor: b ? "default" : "pointer", opacity: b ? 0.6 : 1 }}>
                      {b ?? (id ? "Replace MP4" : "Upload MP4")}
                      <input type="file" accept="video/mp4,video/quicktime,video/*" className="hidden" disabled={!!b} onChange={(e) => void upload(step, e.target.files?.[0])} />
                    </label>
                    {id && <button onClick={() => void save(step, "")} style={{ background: "transparent", border: `1px solid ${EDGE}`, color: MUTED, borderRadius: 10, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}>Clear</button>}
                  </div>
                  <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
                    <input value={paste[step] ?? ""} onChange={(e) => setPaste((p) => ({ ...p, [step]: e.target.value }))} placeholder={id ? `current: ${id}` : "or paste a public playback id"}
                      style={{ flex: 1, minWidth: 0, background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, borderRadius: 8, color: CREAM, fontSize: 12, padding: "6px 8px", outline: "none" }} />
                    <button onClick={() => void save(step, paste[step] ?? "")} disabled={!(paste[step] ?? "").trim()} style={{ background: "transparent", border: `1px solid ${EDGE}`, color: CREAM, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save id</button>
                  </div>
                </section>
              );
            })}
          </div>

          <section style={{ marginTop: 22, background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 14, padding: 14, maxWidth: 560 }}>
            <div style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 15 }}>🧪 Beta mode</div>
            <p style={{ fontSize: 12.5, color: MUTED, margin: "4px 0 10px" }}>The "what was confusing here?" box on every apply and onboarding screen, texting you. On for the first reps; turn it off before wide launch.</p>
            <button onClick={() => void setRepBetaMode({ data: { on: !s.betaMode } }).then((r) => setS({ ...s, betaMode: r.betaMode })).catch((e) => setErr(e instanceof Error ? e.message : String(e)))}
              style={{ background: s.betaMode ? GOLD : "transparent", color: s.betaMode ? "#0B1322" : CREAM, border: `1px solid ${s.betaMode ? GOLD : EDGE}`, borderRadius: 10, padding: "7px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              {s.betaMode ? "Beta feedback is ON — turn off" : "Beta feedback is OFF — turn on"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
