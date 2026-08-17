// TAKES INBOX (T1/T2) — film with F9 in OBS, never leave the app.
//
// STUDIO SURFACE ONLY. Nothing in this file may render inside the film popout,
// the capture window or Recording Mode: the OBS chip, the recording dot, the
// armed badge and the countdown are all status, and NOTHING status-related may
// exist anywhere OBS captures. CeqStudio gates every one of them on !recording
// and renders them outside the film portal.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, FolderOpen, Loader2, Mic, Play, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";

import { connectObs, OBS_DEFAULT_ADDRESS, baseName, type ObsStatus } from "./obs-bridge";
import { cancelSlate, slateEndOffsetMs, slateSeconds, startSlate, SLATE_CHOICES, setSlateSeconds } from "./film-slate";
import { orientation } from "./orientation-store";
import { fileUrl, fsaSupported, getFile, moveToRecycle, pickTakesFolder, probeDuration, recycleStats, restoreFromRecycle, savedTakesFolder, scanFolder } from "./takes-folder";
import { currentTakes, dropTakeRecord, fmtBytes, latestPending, loadTakes, makeRecord, missingRecords, newFiles, saveTake, setTriageHandler, subscribeTakes, type TakeRecord, type TakeTarget } from "./takes-store";
import { NEON } from "./theme";

export interface TakesInboxProps {
  onClose: () => void;
  /** The armed target (T2) — shown here, chosen in the Studio's rail. */
  armed: TakeTarget | null;
  onDisarm: () => void;
  /** Bank a kept take against its target: upload + attach. Resolves to the
   *  public URL, or throws — the record keeps the error and the file survives. */
  onUpload: (take: TakeRecord, file: File) => Promise<{ url: string; path: string }>;
  /** FILMING MODE (F2): render as a filling column inside the rail instead of a
   *  floating drawer. Same component — the mode switch re-arranges surfaces, it
   *  does not fork them. */
  inline?: boolean;
  /** The per-CEQ attached-clip list, merged in above the queues. Supplied by the
   *  Studio so the clip logic lives in exactly one place. */
  clipsPanel?: ReactNode;
  /** Frames on screen right now — the coverage hint for a live take. */
  liveFrameIds: () => string[];
  /** Mirror status up so the Studio can render the chip/dot/countdown. */
  onObsState: (s: { status: ObsStatus; recording: boolean; detail?: string }) => void;
  /** Fired on OBS record-start so the Studio can run the countdown. */
  onRecordStart: () => void;
  /** Mirror the Recycle counter up for the Filming Mode status strip (F2). */
  onRecycle?: (b: { count: number; bytes: number }) => void;
  /** ROOM TONE from a TAKE (Lee, 08-17) — roll a few seconds of silence, keep it,
   *  mark it. Room tone becomes part of the filming pass instead of a file picker
   *  in another panel. Any recording works: the stitcher only reads its audio. */
  onRoomTone?: (t: TakeRecord, file: File) => Promise<void>;
}

type Dir = Awaited<ReturnType<typeof savedTakesFolder>>;

export function TakesInbox({ onClose, armed, onDisarm, onUpload, liveFrameIds, onObsState, onRecordStart, onRecycle, onRoomTone, inline, clipsPanel }: TakesInboxProps) {
  const [takes, setTakes] = useState<TakeRecord[]>(() => currentTakes());
  const [dir, setDir] = useState<Dir>(null);
  const [status, setStatus] = useState<ObsStatus>("off");
  const [detail, setDetail] = useState<string>("");
  const [recording, setRecording] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bin, setBin] = useState({ count: 0, bytes: 0 });
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [showObs, setShowObs] = useState(false);
  const [addr, setAddr] = useState(() => localStorage.getItem("sa-obs-addr") ?? OBS_DEFAULT_ADDRESS);
  const [pass, setPass] = useState(() => localStorage.getItem("sa-obs-pass") ?? "");
  const [obsOn, setObsOn] = useState(() => localStorage.getItem("sa-obs-on") === "1");
  const recStartRef = useRef<{ at: string; startedMs: number; frames: string[] } | null>(null);
  const dirRef = useRef<Dir>(null);
  const armedRef = useRef<TakeTarget | null>(armed);
  useEffect(() => { armedRef.current = armed; }, [armed]);
  // THE FLASHING BUG (Lee, 08-15): these props are inline arrows from the
  // Studio, so their identity changes EVERY render — with them in the OBS
  // effect's deps, each failed connect wrote status, re-rendered the Studio,
  // re-ran the effect, closed the socket and reconnected: an infinite
  // connect/fail/flash loop that looked like OBS refusing us. Refs break it.
  const liveFramesRef = useRef(liveFrameIds);
  const onRecStartRef = useRef(onRecordStart);
  const addrRef = useRef(addr);
  const passRef = useRef(pass);
  const onRecycleRef = useRef(onRecycle);
  useEffect(() => { liveFramesRef.current = liveFrameIds; onRecStartRef.current = onRecordStart; onRecycleRef.current = onRecycle; addrRef.current = addr; passRef.current = pass; });
  /** Bumped by the Connect button — the ONLY thing that re-dials (typing a
   *  password no longer tears the socket down mid-keystroke). */
  const [connectTick, setConnectTick] = useState(0);
  useEffect(() => { dirRef.current = dir; }, [dir]);

  useEffect(() => subscribeTakes(setTakes), []);
  useEffect(() => { void loadTakes(); }, []);
  useEffect(() => { onObsState({ status, recording, detail }); }, [status, recording, detail, onObsState]);

  // restore the folder grant silently; ask only on the button
  useEffect(() => { void (async () => { const d = await savedTakesFolder(false); if (d) { setDir(d); void refreshBin(d); } })(); }, []);
  const refreshBin = async (d: Dir) => { if (d) setBin(await recycleStats(d)); };
  useEffect(() => { onRecycleRef.current?.(bin); }, [bin]);

  /** Fold new files into the store — the shared path for scans AND record-stop.
   *  A full scan (no onlyName) also RECONCILES: rows whose file Lee deleted in
   *  Explorer are dropped, because a scan that only ever adds leaves the inbox
   *  showing takes that no longer exist. */
  const ingest = useCallback(async (d: Dir, opts?: { coverage?: TakeRecord["coverage"]; slateEndMs?: number; onlyName?: string }): Promise<number> => {
    if (!d) return 0;
    const scanned = await scanFolder(d);
    if (!opts?.onlyName) {
      const gone = missingRecords(currentTakes(), scanned);
      for (const id of gone) await dropTakeRecord(id);
      if (gone.length) setNote(`${gone.length} row${gone.length === 1 ? "" : "s"} cleared — the file is no longer in the folder.`);
    }
    const fresh = newFiles(opts?.onlyName ? scanned.filter((f) => f.name === opts.onlyName) : scanned, currentTakes());
    for (const f of fresh) {
      // Stamp the shape it was FILMED in at ingest — the only moment we can know
      // it for certain, and what lets the rail group and the publish gate refuse a
      // mixed 9:16 cut.
      const rec = makeRecord(f, { orientation: orientation(), ...(armedRef.current ? { target: armedRef.current } : {}), ...(opts?.coverage ? { coverage: opts.coverage } : {}), ...(opts?.slateEndMs != null ? { slateEndMs: opts.slateEndMs } : {}) });
      const file = await getFile(d, f.name);
      if (file) rec.durationS = await probeDuration(file);
      await saveTake(rec);
    }
    void refreshBin(d);
    return fresh.length;
  }, []);

  // OBS bridge
  useEffect(() => {
    if (!obsOn) { setStatus("off"); return; }
    const stop = connectObs(addrRef.current, passRef.current, {
      onStatus: (s, d) => { setStatus(s); setDetail(d ?? ""); },
      onRecord: (e) => {
        if (e.kind === "started") {
          setRecording(true);
          const startedMs = startSlate(); // the in-frame slate — see film-slate.ts
          recStartRef.current = { at: new Date().toISOString(), startedMs, frames: liveFramesRef.current() };
          onRecStartRef.current();
          return;
        }
        setRecording(false);
        const started = recStartRef.current;
        recStartRef.current = null;
        cancelSlate();
        const coverage = started ? { startedAt: started.at, stoppedAt: new Date().toISOString(), frameIds: Array.from(new Set([...started.frames, ...liveFramesRef.current()])) } : undefined;
        const slateEndMs = started ? (slateEndOffsetMs(started.startedMs) ?? undefined) : undefined;
        // OBS finishes the file just after the event — retry the scan briefly.
        const name = e.kind === "stopped" && e.path ? baseName(e.path) : undefined;
        void (async () => {
          for (const wait of [400, 1200, 2500]) {
            await new Promise((r) => setTimeout(r, wait));
            if (await ingest(dirRef.current, { coverage, slateEndMs, ...(name ? { onlyName: name } : {}) })) { setNote("Take banked" + (armedRef.current ? " → armed target" : "")); return; }
          }
          setNote(name ? `Recorded "${name}" — grant the folder to see it here.` : "Recording stopped.");
        })();
      },
    });
    return stop;
    // deps: ONLY the explicit dial signals — never render-unstable identities.
  }, [obsOn, connectTick, ingest]);

  const doKeep = useCallback(async (t: TakeRecord) => {
    const d = dirRef.current;
    await saveTake({ ...t, status: "kept", upload: t.target ? { state: "queued", attempts: 0 } : t.upload });
    if (!t.target || !d) { setNote(t.target ? "Kept — folder not granted, upload deferred." : "Kept (unattached — attach it from the target picker)."); return; }
    const file = await getFile(d, t.fileName);
    if (!file) { await saveTake({ ...t, status: "kept", upload: { state: "error", attempts: 1, error: "file not found in the folder" } }); return; }
    await saveTake({ ...t, status: "kept", upload: { state: "uploading", attempts: 1 } });
    try {
      const { url, path } = await onUpload(t, file);
      await saveTake({ ...t, status: "kept", upload: { state: "done", attempts: 1, url, path } });
      setNote(`Uploaded "${t.fileName}" → its target.`);
    } catch (err) {
      await saveTake({ ...t, status: "kept", upload: { state: "error", attempts: 1, error: err instanceof Error ? err.message : String(err) } });
      setNote("Upload failed — the local file is untouched; retry from the inbox.");
    }
  }, [onUpload]);

  const doTrash = useCallback(async (t: TakeRecord) => {
    const d = dirRef.current;
    const ok = d ? await moveToRecycle(d, t.fileName) : false;
    await saveTake({ ...t, status: "trashed" });
    void refreshBin(d);
    setNote(ok ? `Moved to Recycle — restore any time.` : "Marked trashed (file not moved — folder not granted).");
  }, []);

  const doRestore = useCallback(async (t: TakeRecord) => {
    const d = dirRef.current;
    if (d) await restoreFromRecycle(d, t.fileName);
    await saveTake({ ...t, status: "pending" });
    void refreshBin(d);
    setNote("Restored to the inbox.");
  }, []);

  // TRIAGE HOTKEYS (F8 trash / F10 keep) reach us through the store's bus —
  // the film controller fires, this is the real handler. APP FOCUS REQUIRED
  // (unlike OBS's global F9).
  useEffect(() => {
    setTriageHandler((action) => {
      const t = latestPending(currentTakes());
      if (!t) { setNote("No pending take to " + action + "."); return; }
      void (action === "keep" ? doKeep(t) : doTrash(t));
    });
    return () => setTriageHandler(null);
  }, [doKeep, doTrash]);

  const pending = takes.filter((t) => t.status === "pending");
  const kept = takes.filter((t) => t.status === "kept");
  const trashed = takes.filter((t) => t.status === "trashed");
  const row = (t: TakeRecord) => {
    const up = t.upload?.state;
    return (
      <div key={t.id} className="mb-1 flex items-center gap-1.5 rounded px-1.5 py-1" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${NEON.borderSoft}` }}>
        <button className="shrink-0" style={{ color: NEON.cyan }} title="Play locally (instant — nothing uploads)"
          onClick={() => void (async () => { if (playing?.id === t.id) { URL.revokeObjectURL(playing.url); setPlaying(null); return; } const u = dirRef.current ? await fileUrl(dirRef.current, t.fileName) : null; if (u) setPlaying({ id: t.id, url: u }); })()}><Play className="h-3 w-3" /></button>
        <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: NEON.text }} title={t.fileName}>{t.fileName}</span>
        {t.orientation === "9:16" && <span className="shrink-0 rounded px-1 text-[7.5px] font-black" style={{ color: "#0B1322", background: "#B79CFF" }} title="Filmed vertical">9:16</span>}
        {t.durationS ? <span className="shrink-0 text-[8.5px] tabular-nums" style={{ color: NEON.muted }}>{Math.round(t.durationS)}s</span> : null}
        {t.target && <span className="shrink-0 rounded px-1 text-[7.5px] font-bold uppercase" style={{ color: "#B79CFF", border: `1px solid ${NEON.borderSoft}` }} title={t.target.ids.length + " frame(s)"}>{t.target.label ?? t.target.kind}</span>}
        {up === "uploading" && <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: NEON.cyan }} />}
        {up === "done" && <span className="shrink-0 text-[8px] font-bold" style={{ color: "#3BF5A0" }}>✓ up</span>}
        {up === "error" && <button className="shrink-0 text-[8px] font-bold" style={{ color: "#FF8B9E" }} title={t.upload?.error} onClick={() => void doKeep(t)}>retry</button>}
        {t.status === "pending" && (<>
          <button className="shrink-0" style={{ color: "#3BF5A0" }} title="Keep (F10) — banks it, uploads if armed" onClick={() => void doKeep(t)}><Check className="h-3 w-3" /></button>
          <button className="shrink-0" style={{ color: "#FF8B9E" }} title="Trash (F8) — moves the file to Recycle; never deleted" onClick={() => void doTrash(t)}><Trash2 className="h-3 w-3" /></button>
        </>)}
        {t.status === "trashed" && <button className="shrink-0" style={{ color: NEON.cyan }} title="Restore out of Recycle" onClick={() => void doRestore(t)}><RotateCcw className="h-3 w-3" /></button>}
        {t.status === "kept" && onRoomTone && (
          <button className="shrink-0" style={{ color: "#B79CFF" }} title="Use THIS take as today's room tone — a few seconds of your silence. Any recording works; only its audio is used."
            onClick={() => void (async () => {
              const d = dirRef.current; if (!d) { setNote("Grant the folder first."); return; }
              const f = await getFile(d, t.fileName);
              if (!f) { setNote("That file is no longer in the folder — Scan to refresh."); return; }
              try { await onRoomTone(t, f); setNote("Room tone set from this take."); }
              catch (err) { setNote("Room tone FAILED: " + (err instanceof Error ? err.message : String(err))); }
            })()}><Mic className="h-3 w-3" /></button>
        )}
        {/* Remove the ROW, never the file. For takes already dealt with — or ones
            whose file Lee deleted himself. Trash (F8) is the one that moves a file. */}
        <button className="shrink-0" style={{ color: NEON.muted }} title="Remove this row from the inbox. The file on disk is NOT touched — use Trash to move a file to Recycle."
          onClick={() => void dropTakeRecord(t.id)}><X className="h-3 w-3" /></button>
      </div>
    );
  };

  return (
    <div className={inline ? "order-last ml-2 flex h-full w-[380px] min-w-0 max-w-[42%] shrink-0 flex-col overflow-hidden rounded-lg" : "absolute inset-y-0 right-0 z-[74] flex w-[380px] max-w-[94vw] flex-col shadow-2xl"} style={{ background: NEON.panelSolid, border: inline ? `1px solid ${NEON.borderSoft}` : undefined, borderLeft: inline ? undefined : `1px solid ${NEON.border}` }}>
      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
        <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: "#3BF5A0" }}>Takes inbox</span>
        <button className="rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase" style={{ color: status === "connected" ? "#3BF5A0" : status === "error" ? "#FF8B9E" : NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setShowObs((v) => !v)} title={detail || "OBS WebSocket — click for settings"}>OBS {status === "connected" ? "●" : "○"}</button>
        {armed && <span className="rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase" style={{ color: "#0B1322", background: "#B79CFF" }} title={armed.ids.length + " frame(s) armed"}>armed: {armed.label ?? armed.kind}<button className="ml-1" onClick={onDisarm} title="Disarm">✕</button></span>}
        {!inline && <button className="ml-auto grid h-5 w-5 place-items-center rounded" style={{ color: NEON.muted }} onClick={onClose}><X className="h-3 w-3" /></button>}
      </div>

      {showObs && (
        <div className="border-b px-3 py-2" style={{ borderColor: NEON.borderSoft }}>
          <div className="text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>OBS ▸ Tools ▸ WebSocket Server Settings</div>
          <input className="mt-1 w-full rounded bg-black/30 px-1.5 py-0.5 text-[10px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} value={addr} onChange={(e) => { setAddr(e.target.value); localStorage.setItem("sa-obs-addr", e.target.value); }} placeholder={OBS_DEFAULT_ADDRESS} />
          <input type="password" className="mt-1 w-full rounded bg-black/30 px-1.5 py-0.5 text-[10px]" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} value={pass} onChange={(e) => { setPass(e.target.value); localStorage.setItem("sa-obs-pass", e.target.value); }} placeholder="server password" />
          <button className="mt-1 rounded px-2 py-0.5 text-[9px] font-black uppercase" style={{ color: "#0B1322", background: obsOn ? "#FF8B9E" : "#3BF5A0" }} onClick={() => { const v = !obsOn; setObsOn(v); localStorage.setItem("sa-obs-on", v ? "1" : "0"); if (v) setConnectTick((t) => t + 1); }}>{obsOn ? "Disconnect" : "Connect"}</button>
          {obsOn && <button className="mt-1 ml-1 rounded px-2 py-0.5 text-[9px] font-black uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setConnectTick((t) => t + 1)} title="Re-dial with the current address + password">Retry</button>}
          {detail && <div className="mt-1 text-[8.5px]" style={{ color: "#FF8B9E" }}>{detail}</div>}
          <div className="mt-1.5 flex items-center gap-1">
            <span className="text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>Slate</span>
            {SLATE_CHOICES.map((sc) => (<button key={sc} className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ color: slateSeconds() === sc ? "#0B1322" : NEON.muted, background: slateSeconds() === sc ? NEON.yellow : "transparent", border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setSlateSeconds(sc); setNote(`Slate ${sc}s — counts down IN FRAME on record-start, and sets the take's head trim.`); }}>{sc}s</button>))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 border-b px-3 py-1.5" style={{ borderColor: NEON.borderSoft }}>
        <button className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => void (async () => { const d = (await savedTakesFolder(true)) ?? (fsaSupported() ? await pickTakesFolder() : null); if (d) { setDir(d); setNote("Folder granted."); void refreshBin(d); } })()} title="Grant the OBS recordings folder once — takes are read locally, nothing uploads until you Keep">{dir ? "Folder ✓" : "Grant folder"}</button>
        <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase disabled:opacity-40" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} disabled={!dir || scanning} onClick={() => void (async () => { setScanning(true); const n = await ingest(dirRef.current); setScanning(false); setNote(n ? `${n} new take${n === 1 ? "" : "s"}.` : "No new takes."); })()} title="Scan the folder for new recordings (works with OBS disconnected)"><RefreshCw className={`h-3 w-3 ${scanning ? "animate-spin" : ""}`} /> Scan</button>
        <span className="ml-auto text-[8.5px]" style={{ color: NEON.muted }}>F10 keep · F8 trash <span title="These are APP keys — the app window must have focus, unlike OBS's global F9.">(app focus)</span></span>
      </div>

      {note && <div className="px-3 py-1 text-[9px]" style={{ color: "#3BF5A0" }}>{note}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {playing && <video src={playing.url} controls autoPlay className="mb-2 max-h-[190px] w-full rounded" />}
        {/* MERGED RAIL (F2): the per-CEQ attached clips sit ABOVE the queues —
            they were two lists answering the same question ("what video exists
            for this CEQ?"). The Studio supplies this so clip logic isn't forked. */}
        {clipsPanel}
        <div className="pb-0.5 text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.yellow }}>Pending · {pending.length}</div>
        {pending.length === 0 && <div className="px-1 py-1 text-[9.5px] italic" style={{ color: NEON.muted }}>Nothing waiting. Roll F9 in OBS — takes land here.</div>}
        {pending.map(row)}
        {kept.length > 0 && <div className="pb-0.5 pt-2 text-[8px] font-bold uppercase tracking-wide" style={{ color: "#3BF5A0" }}>Kept · {kept.length}</div>}
        {kept.map(row)}
        {trashed.length > 0 && <div className="pb-0.5 pt-2 text-[8px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }}>Recycle · {trashed.length}</div>}
        {trashed.map(row)}
      </div>

      <div className="flex items-center gap-2 border-t px-3 py-1.5" style={{ borderColor: NEON.borderSoft }}>
        <span className="text-[8.5px] font-bold uppercase" style={{ color: NEON.muted }}>Recycle: {bin.count} take{bin.count === 1 ? "" : "s"} · {fmtBytes(bin.bytes)}</span>
        <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setNote(`Open your recordings folder ▸ "_trash" in Explorer to empty it — the app never deletes.`)} title="The app can't open Explorer directly; _trash inside your recordings folder is the bin"><FolderOpen className="h-3 w-3" /> open folder</button>
      </div>
    </div>
  );
}
