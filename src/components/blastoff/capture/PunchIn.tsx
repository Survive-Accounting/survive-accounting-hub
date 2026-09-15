// PUNCH-IN — film one slide at a time with OBS, then Preview and Post the video (punch-in.ts has the rules
// and Lee's words). This panel lives in the MAIN /film window only; the pop-out is what OBS captures, so
// it gets nothing but the key relay at the bottom.
//
//   F4 (OBS)  starts / stops a recording — the app hears it over OBS WebSocket and keeps the file's name
//             with the slides on screen from start to stop (walk slides while recording = a speed run).
//             On stop, the pop-out goes to the next slide.
//   F3        "scrap?" — F3 again scraps: the file moves to _trash in the recordings folder, the pop-out goes
//             back to that slide. While recording, the take is scrapped when it stops. Esc cancels.
//   Ctrl+Z    brings the last scrapped take back.
//   Preview   the kept takes in slide order (a newer take overwrites the slides it covers), uploaded,
//             pauses trimmed and joined on the render worker, played with the site's end buttons.
//   Post      a brand thumbnail, the end button, and the site post — then on to the next split.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ThumbnailArt } from "@/components/brand-kit/ThumbnailArt";
import { baseName, connectObs, OBS_DEFAULT_ADDRESS, type ObsStatus } from "@/components/canvas/obs-bridge";
import { fsaSupported, getFile, moveToRecycle, pickTakesFolder, probeDuration, restoreFromRecycle, savedTakesFolder } from "@/components/canvas/takes-folder";
import { PracticeEndCard } from "@/components/learn/PracticeEndCard";
import { coverFor } from "@/components/v3/quick-post";
import { uploadCover, uploadTake } from "@/components/v3/take-burn";
import { renderSvgToBlob } from "@/lib/brand-kit/export-png";
import { measureText } from "@/lib/brand-kit/measure";
import { defaultThumbSpec, seriesTitleCap, SITE_EXPORT, TITLE_TRACKING, type ThumbSpec } from "@/lib/brand-kit/thumbnail";
import { colorwayFor, KIT, NEUTRAL_COLORWAY_ID } from "@/lib/brand-kit/tokens";
import { setPublishCover, setPublishEndCta } from "@/lib/publish-queue.functions";
import { resolveWorkerRender, startDissectStitch, startWorkerRender, workerPreflight } from "@/lib/render-worker.functions";
import { resolveSitePost, startSitePost } from "@/lib/site-publish.functions";
import { partKey } from "@/lib/student-shorts";

import type { BlastFrame } from "../plan";
import { FRAME_LABEL } from "../plan";
import { endCtaOf } from "../practice-cta";
import { chunks, nextAfter, pickTakes, punchKey, readTakes, STITCH_CHUNK, uncovered, type PunchTake } from "../punch-in";

const GOLD = "#FCA311", CREAM = "#F5EFE6", MUTED = "#8C9BBA", EDGE = "#2A3654", RED = "#FF7A6B", MINT = "#3BF5A0";
export const PUNCH_ON_KEY = "sa-punch-on";
const relayKey = (setId: string) => `sa-punch-key:${setId}`;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export function readPunchOn(): boolean { try { return localStorage.getItem(PUNCH_ON_KEY) === "1"; } catch { return false; } }

/** The one filmed outro every video ends on (this browser). */
interface OutroClip { url: string; durationS: number; file: string; at: number }
const OUTRO_CLIP_KEY = "sa-punch-outro-clip";
function readOutroClip(): OutroClip | null {
  try {
    const v = JSON.parse(localStorage.getItem(OUTRO_CLIP_KEY) ?? "null") as OutroClip | null;
    return v && typeof v.url === "string" && typeof v.durationS === "number" && v.durationS > 0 ? v : null;
  } catch { return null; }
}

/** THE POP-OUT'S KEYS, sent to the main window while punch-in is on (the pop-out has the focus while he
 *  films, and must draw nothing). Returns true when it took the key. */
export function relayPunchKey(setId: string, e: KeyboardEvent): boolean {
  if (!readPunchOn()) return false;
  const undo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
  if (e.key !== "F3" && !undo) return false;
  try { localStorage.setItem(relayKey(setId), JSON.stringify({ key: undo ? "undo" : e.key, at: Date.now() })); } catch { return false; }
  return true;
}

type Stage =
  | { s: "idle" }
  | { s: "uploading"; done: number; of: number }
  | { s: "stitching"; note: string }
  | { s: "ready"; fileUrl: string }
  | { s: "posting"; note: string }
  | { s: "posted"; link: string }
  | { s: "error"; error: string; fileUrl?: string };

export function PunchIn({ setId, setName, topicName, frames, takeIndex, takeName, popoutFrameId, onClose, onNext }: {
  /** Move this window (and the pop-out) to the next video; null on the last one. */
  onNext?: (() => void) | null;
  setId: string; setName: string; topicName: string;
  /** The split being filmed, as the pop-out walks it. */
  frames: readonly BlastFrame[];
  takeIndex: number;
  takeName: string;
  /** The slide the pop-out has up right now (read at the moment it's asked), or null with no pop-out. */
  popoutFrameId: () => string | null;
  onClose: () => void;
}) {
  const ids = useMemo(() => frames.map((f) => f.id), [frames]);
  const key = punchKey(setId, takeIndex);
  const pubKey = partKey(setId, takeIndex);
  const [takes, setTakes] = useState<PunchTake[]>(() => { try { return readTakes(localStorage.getItem(key)); } catch { return []; } });
  useEffect(() => { try { setTakes(readTakes(localStorage.getItem(key))); } catch { setTakes([]); } }, [key]);
  const save = useCallback((next: PunchTake[]) => { setTakes(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* this visit only */ } }, [key]);
  const takesRef = useRef(takes); takesRef.current = takes;

  const [obs, setObs] = useState<{ status: ObsStatus; detail?: string }>({ status: "off" });
  const [addr, setAddr] = useState(() => { try { return localStorage.getItem("sa-obs-addr") ?? OBS_DEFAULT_ADDRESS; } catch { return OBS_DEFAULT_ADDRESS; } });
  const [pass, setPass] = useState(() => { try { return localStorage.getItem("sa-obs-pass") ?? ""; } catch { return ""; } });
  const [connectTick, setConnectTick] = useState(0);
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [recording, setRecording] = useState<{ fromId: string } | null>(null);
  const recRef = useRef(recording); recRef.current = recording;
  const [armed, setArmed] = useState<"last" | "live" | null>(null);
  const armedRef = useRef(armed); armedRef.current = armed;
  const scrapLive = useRef(false);
  const [trash, setTrash] = useState<PunchTake[]>([]);
  const trashRef = useRef(trash); trashRef.current = trash;
  const [flash, setFlash] = useState<{ text: string; tone: "good" | "warn" | "bad" } | null>(null);
  const say = (text: string, tone: "good" | "warn" | "bad" = "good") => setFlash({ text, tone });
  const [stage, setStage] = useState<Stage>({ s: "idle" });
  const [title, setTitle] = useState(takeName || setName);
  useEffect(() => { setTitle(takeName || setName); setStage({ s: "idle" }); }, [takeName, setName, takeIndex]);
  const [ended, setEnded] = useState(false);
  const cta = endCtaOf(frames);
  /** True when this preview had to use the worker's plain join (pauses not trimmed). */
  const plainJoin = useRef(false);
  /** Takes already uploaded this visit, by file name → their URL. */
  const uploaded = useRef(new Map<string, string>());
  // THE OUTRO CLIP (Lee, 2026-09-14: "just append the outro to each video automatically, with the animation
  // and everything"). Film the outro slide once (its entrance, the cursor clicking Start Cramming for Free),
  // keep that take as the outro, and every Preview ends on it — no outro slide to film per video.
  const [outroClip, setOutroClip] = useState<OutroClip | null>(() => readOutroClip());
  const [savingOutro, setSavingOutro] = useState(false);
  const isOutro = (id: string) => frames.find((f) => f.id === id)?.kind === "outro";
  /** START OVER (Lee, 2026-09-14: "a start over button being useful with punch in"): the takes it cleared,
   *  so Ctrl+Z brings them back. The files stay in the recordings folder. */
  const cleared = useRef<PunchTake[] | null>(null);
  const artRef = useRef<SVGSVGElement | null>(null);

  const goto = useCallback((frameId: string | null) => {
    if (!frameId) return;
    try { localStorage.setItem(`sa-film-goto:${setId}`, JSON.stringify({ frameId, at: Date.now() })); } catch { /* the pop-out stays */ }
  }, [setId]);
  const label = (id: string) => { const k = ids.indexOf(id); const f = frames[k]; return k < 0 || !f ? "a slide" : `slide ${k + 1} (${FRAME_LABEL[f.kind]})`; };

  // THE FOLDER, if it was granted before.
  useEffect(() => { void savedTakesFolder(false).then((h) => { if (h) setFolder(h); }); }, []);

  // OBS — connected while the panel is open.
  useEffect(() => {
    if (!connectTick) return;
    return connectObs(addr, pass, {
      onStatus: (status, detail) => setObs({ status, detail }),
      onRecord: (e) => {
        if (e.kind === "started") {
          const from = popoutFrameId();
          if (!from) { say("Recording, but no pop-out is open — open the 9:16 window so the take knows its slide.", "bad"); setRecording({ fromId: "" }); return; }
          setRecording({ fromId: from }); scrapLive.current = false; setArmed(null);
          say(`● recording ${label(from)}`, "warn");
          return;
        }
        if (e.kind === "stopped") {
          const rec = recRef.current;
          setRecording(null);
          const to = popoutFrameId();
          if (!rec?.fromId || !to || !e.path) { say("Stopped — the take couldn't be matched to a slide, so it wasn't kept.", "bad"); return; }
          const take: PunchTake = { file: baseName(e.path), fromId: rec.fromId, toId: to, at: Date.now() };
          if (scrapLive.current) {
            scrapLive.current = false;
            setTrash((t) => [...t, take]);
            if (folder) void moveToRecycle(folder as never, take.file);
            goto(take.fromId);
            say(`Scrapped — back on ${label(take.fromId)}. Ctrl+Z brings it back.`, "warn");
            return;
          }
          save([...takesRef.current, take]);
          const next = nextAfter(ids, take);
          goto(next);
          say(next ? `✓ kept ${label(take.fromId)}${take.toId !== take.fromId ? ` → ${label(take.toId)}` : ""} — up next: ${label(next)}` : "✓ kept — that's the last slide. Preview the video.", "good");
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnect only on an explicit Connect
  }, [connectTick]);

  // F3 · F3 · Ctrl+Z · Esc — here, and from the pop-out through the relay.
  const onPunchKey = useCallback((k: string) => {
    if (k === "Escape") { if (armedRef.current) { setArmed(null); say("Scrap cancelled"); return true; } return false; }
    if (k === "undo") {
      if (cleared.current) {
        const back = cleared.current;
        cleared.current = null;
        save([...back, ...takesRef.current]);
        say(`Brought back ${back.length} take${back.length === 1 ? "" : "s"}`, "good");
        return true;
      }
      const last = trashRef.current[trashRef.current.length - 1];
      if (!last) { say("Nothing scrapped to bring back", "warn"); return true; }
      setTrash((t) => t.slice(0, -1));
      if (folder) void restoreFromRecycle(folder as never, last.file);
      save([...takesRef.current, last]);
      say(`Brought back ${label(last.fromId)}`, "good");
      return true;
    }
    if (k !== "F3") return false;
    if (recRef.current) {
      if (armedRef.current === "live") { scrapLive.current = true; setArmed(null); say("This take will be scrapped when you punch out (F4)", "warn"); }
      else { setArmed("live"); say("Scrap this take? F3 again", "warn"); }
      return true;
    }
    const last = [...takesRef.current].sort((a, b) => b.at - a.at)[0];
    if (!last) { say("No take to scrap yet", "warn"); return true; }
    if (armedRef.current === "last") {
      setArmed(null);
      save(takesRef.current.filter((t) => t !== last));
      setTrash((t) => [...t, last]);
      if (folder) void moveToRecycle(folder as never, last.file);
      goto(last.fromId);
      say(`Scrapped ${label(last.fromId)} — go again. Ctrl+Z brings it back.`, "warn");
    } else { setArmed("last"); say(`Scrap the last take (${label(last.fromId)})? F3 again`, "warn"); }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, save, goto, ids]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const undo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      const k = undo ? "undo" : e.key;
      if (k !== "F3" && k !== "undo" && !(k === "Escape" && armedRef.current)) return;
      if (onPunchKey(k)) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== relayKey(setId) || !e.newValue) return;
      try { const m = JSON.parse(e.newValue) as { key?: string }; if (m.key) onPunchKey(m.key); } catch { /* not ours */ }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("storage", onStorage); };
  }, [onPunchKey, setId]);

  // PREVIEW: upload the kept takes, trim + join on the worker, play it here.
  // THE OUTRO IS FOR SOCIALS ONLY (Lee, 2026-09-14: "We will only show the outro in social posts. Not on the
  // site … too repetitive and redundant."). The site video never has one, so no video films its outro slide:
  // it drops out of the takes and the gaps. The kept clip goes on the social version only.
  const filmIds = ids.filter((id) => !isOutro(id));
  const picks = pickTakes(filmIds, takes);
  const gaps = uncovered(filmIds, takes);
  // PLAY A TAKE straight from the recordings folder — no upload.
  const [playing, setPlaying] = useState<{ file: string; url: string } | null>(null);
  const playTake = async (t: PunchTake) => {
    let dir = folder;
    if (!dir) { dir = (await pickTakesFolder()) as never; if (!dir) return; setFolder(dir); }
    const file = await getFile(dir as never, t.file);
    if (!file) { say(`${t.file} isn't in the recordings folder`, "bad"); return; }
    setPlaying((prev) => { if (prev) URL.revokeObjectURL(prev.url); return { file: t.file, url: URL.createObjectURL(file) }; });
  };
  const lastOutroTake =[...takes].sort((a, b) => b.at - a.at).find((t) => t.fromId === t.toId && isOutro(t.fromId)) ?? null;
  const keepOutro = async (t: PunchTake) => {
    setSavingOutro(true);
    try {
      let dir = folder;
      if (!dir) { dir = (await pickTakesFolder()) as never; if (!dir) throw new Error("Choose the OBS recordings folder first."); setFolder(dir); }
      const file = await getFile(dir as never, t.file);
      if (!file) throw new Error(`${t.file} isn't in the recordings folder.`);
      const durationS = await probeDuration(file);
      if (!(durationS > 0)) throw new Error("Couldn't read the outro take's length.");
      const url = await uploadTake(file);
      const clip: OutroClip = { url, durationS, file: t.file, at: Date.now() };
      try { localStorage.setItem(OUTRO_CLIP_KEY, JSON.stringify(clip)); } catch { /* this visit only */ }
      setOutroClip(clip);
      say(`Outro kept (${durationS.toFixed(1)} s) — every video's Preview ends on it now.`, "good");
    } catch (e) { say(e instanceof Error ? e.message : String(e), "bad"); }
    finally { setSavingOutro(false); }
  };
  const preview = async () => {
    setEnded(false);
    try {
      let dir = folder;
      if (!dir) { dir = (await pickTakesFolder()) as never; if (!dir) throw new Error("Choose the OBS recordings folder first."); setFolder(dir); }
      if (!picks.length) throw new Error("No kept takes in this split yet.");
      setSocial({ s: "idle" });
      const urls: string[] = [];
      setStage({ s: "uploading", done: 0, of: picks.length });
      for (const p of picks) {
        // A take already uploaded this visit isn't sent again (a second Preview after a failure starts fast).
        const known = uploaded.current.get(p.take.file);
        if (known) { urls.push(known); setStage({ s: "uploading", done: urls.length, of: picks.length }); continue; }
        const file = await getFile(dir as never, p.take.file);
        if (!file) throw new Error(`${p.take.file} isn't in the recordings folder (moved, or OBS still writing it) — wait a moment and preview again.`);
        const url = await uploadTake(file);
        uploaded.current.set(p.take.file, url);
        urls.push(url);
        setStage({ s: "uploading", done: urls.length, of: picks.length });
      }
      plainJoin.current = false;
      // WAKE THE WORKER FIRST: it sleeps after 5 idle minutes, and a cold start is slow to answer.
      setStage({ s: "stitching", note: "waking the video joiner…" });
      for (let tries = 0; ; tries++) {
        const h = await workerPreflight().catch((e) => ({ configured: true, healthy: false, detail: e instanceof Error ? e.message : String(e) }));
        if (!h.configured) throw new Error("The video joiner isn't set up on the site (RENDER_WORKER_URL / RENDER_WORKER_TOKEN).");
        if (h.healthy) break;
        if (tries >= 5) throw new Error(`The video joiner didn't wake up: ${h.detail}. Press Preview again in a minute.`);
        await wait(5000);
      }
      // One join, or batches of STITCH_CHUNK then a last join of the batches. The batches are already
      // trimmed, so the last join keeps each whole (manual trims skip the silence pass) and only adds the gaps.
      const join = async (list: string[], label: string, trims?: ({ start: number; end: number } | null)[]) => {
        // THE FALLBACK (2026-09-14): the deployed worker predates the pause-trimming join ("unknown stage kind
        // dissect_stitch" until it's redeployed). Then join the takes as they are with the worker's plain
        // concat, and say that the pauses stayed in.
        const job = await startDissectStitch({ data: { urls: list, gapMs: 220, vertical: true, ...(trims ? { trims } : {}) } }).catch(async (e) => {
          if (!/unknown stage/i.test(e instanceof Error ? e.message : String(e))) throw e;
          plainJoin.current = true;
          return startWorkerRender({ data: { urls: list, mode: "full" } });
        });
        let misses = 0;
        for (;;) {
          await wait(3000);
          // A slow or dropped check is retried, not fatal — the job keeps running on the worker.
          const r = await resolveWorkerRender({ data: { jobId: job.jobId, path: job.path, machineId: job.machineId } }).catch((e) => {
            if (++misses > 8) throw e;
            return { state: "rendering" as const, note: "checking again…", fileUrl: null, error: null, result: null };
          });
          if (r.state !== "rendering" || r.note !== "checking again…") misses = 0;
          if (r.state === "done" && r.fileUrl) return { fileUrl: r.fileUrl, totalS: r.result?.totalS ?? (plainJoin.current ? -1 : null) };
          if (r.state === "error") throw new Error(r.error ?? "The joiner failed.");
          setStage({ s: "stitching", note: `${label} · ${r.state}${r.note ? ` · ${r.note}` : ""}` });
        }
      };
      // The site video: the takes only (the outro goes on the social version).
      const batches = chunks(urls);
      if (batches.length === 1) {
        setStage({ s: "stitching", note: "trimming pauses and joining…" });
        const one = await join(urls, "joining");
        setStage({ s: "ready", fileUrl: one.fileUrl });
        if (plainJoin.current) say("Joined without trimming the pauses — the video joiner needs its update deployed for that.", "warn");
        return;
      }
      let parts: { fileUrl: string; totalS: number | null }[] = [];
      for (let b = 0; b < batches.length; b++) parts.push(await join(batches[b], `batch ${b + 1} of ${batches.length}`));
      if (!plainJoin.current && parts.some((p) => p.totalS == null)) throw new Error("A batch came back without its length, so the batches can't be joined cleanly — press Preview again.");
      // Batches of batches, so no single join ever holds more than STITCH_CHUNK videos.
      while (parts.length > STITCH_CHUNK) {
        const groups = chunks(parts);
        const next: typeof parts = [];
        for (let g = 0; g < groups.length; g++) {
          next.push(await join(groups[g].map((p) => p.fileUrl), `joining batches ${g + 1} of ${groups.length}`, plainJoin.current ? undefined : groups[g].map((p) => ({ start: 0, end: p.totalS! }))));
        }
        parts = next;
      }
      const whole = await join(
        parts.map((p) => p.fileUrl),
        "joining the batches",
        plainJoin.current ? undefined : parts.map((p) => ({ start: 0, end: p.totalS! })),
      );
      setStage({ s: "ready", fileUrl: whole.fileUrl });
      if (plainJoin.current) say("Joined without trimming the pauses — the video joiner needs its update deployed for that.", "warn");
    } catch (e) { setStage({ s: "error", error: e instanceof Error ? e.message : String(e) }); }
  };

  // THE SOCIAL VERSION: the site video + the kept outro clip, joined whole (the worker's plain join — no
  // trimming wanted, and it works on the deployed worker), then saved to this computer for Reels / TikTok /
  // Shorts.
  const [social, setSocial] = useState<{ s: "idle" } | { s: "working"; note: string } | { s: "ready"; url: string } | { s: "error"; error: string }>({ s: "idle" });
  const makeSocial = async (siteUrl: string) => {
    if (!outroClip) { setSocial({ s: "error", error: "Keep an outro clip first: film the outro slide once and press “Use as the outro”." }); return; }
    try {
      setSocial({ s: "working", note: "adding the outro…" });
      const job = await startWorkerRender({ data: { urls: [siteUrl, outroClip.url], mode: "full" } });
      let misses = 0;
      for (;;) {
        await wait(3000);
        const r = await resolveWorkerRender({ data: { jobId: job.jobId, path: job.path, machineId: job.machineId } }).catch((e) => { if (++misses > 8) throw e; return null; });
        if (!r) continue;
        misses = 0;
        if (r.state === "done" && r.fileUrl) { setSocial({ s: "ready", url: r.fileUrl }); return; }
        if (r.state === "error") throw new Error(r.error ?? "Adding the outro failed.");
        setSocial({ s: "working", note: `adding the outro · ${r.state}` });
      }
    } catch (e) { setSocial({ s: "error", error: e instanceof Error ? e.message : String(e) }); }
  };
  const saveSocial = async (url: string) => {
    try {
      const blob = await (await fetch(url)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "video"}-social.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch { window.open(url, "_blank", "noopener"); }
  };

  // POST: thumbnail → end button → the site.
  const thumb: ThumbSpec = useMemo(() => {
    const c = coverFor(title);
    const base = defaultThumbSpec({ exam: 1, part: topicName || "Easy Points", kicker: "", visualType: "concept", concept: { kind: "bolt", text: "" } });
    const spec = { ...base, title: c.title, variant: c.variant };
    const cap = seriesTitleCap([spec], (t: string, s: number) => measureText(t, s, 900, KIT.display, TITLE_TRACKING));
    return { ...spec, titleCap: cap };
  }, [title, topicName]);
  const post = async (fileUrl: string) => {
    try {
      setStage({ s: "posting", note: "making the thumbnail…" });
      const svg = artRef.current;
      if (!svg) throw new Error("The thumbnail isn't drawn yet.");
      const blob = await renderSvgToBlob(svg, { width: SITE_EXPORT.w, height: SITE_EXPORT.h, type: SITE_EXPORT.type, quality: SITE_EXPORT.quality });
      const name = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "video"}.webp`;
      const coverUrl = await uploadCover(new File([blob], name, { type: SITE_EXPORT.type }));
      const c = await setPublishCover({ data: { setId: pubKey, cover: { url: coverUrl, name } } });
      if (!c.ok) throw new Error(`Thumbnail: ${c.error ?? "not saved"}`);
      const e = await setPublishEndCta({ data: { setId: pubKey, cta } });
      if (!e.ok) throw new Error(`End button: ${e.error ?? "not saved"}`);
      setStage({ s: "posting", note: "sending to the video host…" });
      const { assetId } = await startSitePost({ data: { videoUrl: fileUrl, pubKey } });
      const started = Date.now();
      while (Date.now() - started < 30 * 60_000) {
        await wait(5000);
        const r = await resolveSitePost({ data: { assetId, setId, pubKey, takeIndex, takeName: title, title, videoUrl: fileUrl } });
        if (r.state === "posted") { setStage({ s: "posted", link: r.link }); return; }
        if (r.state === "error") { if (/changed while posting/i.test(r.error)) { await wait(2000); continue; } throw new Error(r.error); }
        setStage({ s: "posting", note: "processing on the video host…" });
      }
      throw new Error("Still processing after 30 minutes — press Post again.");
    } catch (err) { setStage({ s: "error", error: err instanceof Error ? err.message : String(err), fileUrl }); }
  };

  const btn = (strong = false): React.CSSProperties => ({ font: "inherit", fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 7, cursor: "pointer", border: `1px solid ${strong ? GOLD : EDGE}`, background: strong ? GOLD : "transparent", color: strong ? "#14213D" : CREAM, whiteSpace: "nowrap" });
  const field: React.CSSProperties = { font: "inherit", fontSize: 12, background: "rgba(0,0,0,0.35)", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 6, padding: "4px 6px", width: "100%", boxSizing: "border-box" };
  const obsTone = obs.status === "connected" ? MINT : obs.status === "error" ? RED : MUTED;
  const fileUrlOf = stage.s === "ready" ? stage.fileUrl : stage.s === "error" ? stage.fileUrl : undefined;

  return (
    <aside aria-label="Punch-in filming" style={{ position: "fixed", top: 12, right: 12, bottom: 12, width: 330, zIndex: 40, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, background: "rgba(7,11,20,0.94)", border: `1px solid ${EDGE}`, borderRadius: 12, padding: 12, fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 12, color: CREAM }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 14, color: GOLD }}>Punch-in</b>
        <span style={{ color: MUTED }}>Video {takeIndex + 1}{takeName ? ` · ${takeName}` : ""}</span>
        <span style={{ flex: 1 }} />
        <button type="button" style={btn()} onClick={onClose} title="Close punch-in (F3 goes back to the normal scrap)">✕</button>
      </div>

      {/* SETUP */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${EDGE}`, paddingTop: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: obsTone }} />
          <span>OBS {obs.status}{obs.detail ? ` — ${obs.detail}` : ""}</span>
        </div>
        {obs.status !== "connected" && (<>
          <input style={field} value={addr} aria-label="OBS WebSocket address" onChange={(e) => { setAddr(e.target.value); try { localStorage.setItem("sa-obs-addr", e.target.value); } catch { /* */ } }} placeholder={OBS_DEFAULT_ADDRESS} />
          <input style={field} type="password" value={pass} aria-label="OBS WebSocket password" onChange={(e) => { setPass(e.target.value); try { localStorage.setItem("sa-obs-pass", e.target.value); } catch { /* */ } }} placeholder="OBS WebSocket password (Tools ▸ WebSocket Server Settings)" />
          <button type="button" style={btn(true)} onClick={() => setConnectTick((n) => n + 1)}>Connect OBS</button>
        </>)}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: folder ? MINT : MUTED }} />
          <span style={{ flex: 1 }}>{folder ? `Recordings folder: ${folder.name}` : fsaSupported() ? "Recordings folder not chosen" : "This browser can't open folders — use Chrome"}</span>
          {fsaSupported() && <button type="button" style={btn(!folder)} onClick={() => void pickTakesFolder().then((h) => h && setFolder(h as never))}>{folder ? "Change" : "Choose"}</button>}
        </div>
      </div>

      {/* NOW */}
      <div style={{ borderTop: `1px solid ${EDGE}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontWeight: 800, color: recording ? RED : CREAM }}>{recording ? `● REC — ${recording.fromId ? label(recording.fromId) : "no pop-out"}` : "F4 in OBS to punch in"}</div>
        <div style={{ color: MUTED }}>Space in the pop-out while recording = a speed run over those slides. F3 scrap · F3 again to confirm · Ctrl+Z undo.</div>
        {armed && <div style={{ color: GOLD, fontWeight: 800 }}>{armed === "live" ? "Scrap this take? F3 again (Esc cancels)" : "Scrap the last take? F3 again (Esc cancels)"}</div>}
        {flash && <div role="status" style={{ color: flash.tone === "good" ? MINT : flash.tone === "warn" ? GOLD : RED, fontWeight: 700 }}>{flash.text}</div>}
      </div>

      {/* THE SLIDES AND THEIR TAKES */}
      <div style={{ borderTop: `1px solid ${EDGE}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* THE OUTRO CLIP: kept once, added to every video's Preview. */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, color: outroClip ? MINT : MUTED }}>
          <span style={{ flex: 1 }}>{outroClip ? `✓ Outro clip kept (${outroClip.durationS.toFixed(1)} s) — for the social versions` : "No outro clip yet — film the outro slide once (socials only)"}</span>
          {lastOutroTake && lastOutroTake.file !== outroClip?.file && (
            <button type="button" style={btn(true)} disabled={savingOutro} onClick={() => void keepOutro(lastOutroTake)}
              title="Keep your latest outro take as the outro every video ends on">{savingOutro ? "Keeping…" : "Use as the outro"}</button>
          )}
        </div>
        {frames.map((f, k) => {
          const fk = filmIds.indexOf(f.id);
          const p = fk < 0 ? undefined : picks.find((x) => fk >= x.from && fk <= x.to);
          if (f.kind === "outro") {
            return (
              <button key={f.id} type="button" onClick={() => goto(f.id)} title="Put the outro up to film it once for the social versions"
                style={{ all: "unset", cursor: "pointer", display: "flex", gap: 6, padding: "2px 4px", color: MUTED }}>
                <span style={{ width: 18, textAlign: "right" }}>{k + 1}</span><span>—</span><span>Outro · socials only, not in the site video</span>
              </button>
            );
          }
          // THE TAKE BRACKETS (Lee, 2026-09-14: "let me pick a take and remove it from the chain before I preview
          // … a bracket around each slide that is covering a take. Take 1, take 2, take 3"). Each kept take's
          // slides share a coloured rule; its first row names it, plays it, and ✕ takes it out (Ctrl+Z back).
          const n = p ? picks.indexOf(p) : -1;
          const tone = n % 2 === 0 ? GOLD : "#7DD3FC";
          return (
            <div key={f.id} style={{ display: "flex", flexDirection: "column", borderLeft: `3px solid ${p ? tone : "transparent"}`, paddingLeft: 4, marginTop: p && fk === p.from && n > 0 ? 4 : 0 }}>
              {p && fk === p.from && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0 1px", fontSize: 11, fontWeight: 800, color: tone }}>
                  <span>Take {n + 1}</span>
                  <span style={{ color: MUTED, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.take.file}</span>
                  <button type="button" title="Play this take" style={{ ...btn(), padding: "0 6px", fontSize: 11 }} onClick={() => void playTake(p.take)}>▶</button>
                  <button type="button" title="Take this take out of the video (Ctrl+Z brings it back). The file stays." style={{ ...btn(), padding: "0 6px", fontSize: 11, color: RED }}
                    onClick={() => { save(takes.filter((t) => t !== p.take)); setTrash((t) => [...t, p.take]); setStage({ s: "idle" }); say(`Removed take ${n + 1} — Ctrl+Z brings it back`, "warn"); }}>✕</button>
                </div>
              )}
              <button type="button" onClick={() => goto(f.id)} title="Put this slide up in the pop-out — punch in again to overwrite it"
                style={{ all: "unset", cursor: "pointer", display: "flex", gap: 6, alignItems: "center", padding: "2px 4px", borderRadius: 5, color: p ? CREAM : MUTED }}>
                <span style={{ width: 18, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{k + 1}</span>
                <span style={{ color: p ? MINT : MUTED }}>{p ? "✓" : "○"}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{FRAME_LABEL[f.kind]}{f.pace === "speed" ? " · speed" : ""}</span>
              </button>
            </div>
          );
        })}
        {playing && (
          <div style={{ position: "relative", marginTop: 6, alignSelf: "center", width: 200, maxWidth: "100%" }}>
            <video key={playing.url} src={playing.url} controls autoPlay playsInline style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", background: "#000", borderRadius: 8 }} />
            <button type="button" style={{ ...btn(), position: "absolute", top: 4, right: 4, padding: "0 6px" }} onClick={() => { URL.revokeObjectURL(playing.url); setPlaying(null); }}>✕</button>
          </div>
        )}
        <div style={{ color: MUTED, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1 }}>{picks.length} take{picks.length === 1 ? "" : "s"} kept{gaps.length ? ` · ${gaps.length} slide${gaps.length === 1 ? "" : "s"} not filmed` : " · every slide filmed"}</span>
          <button type="button" style={btn()} disabled={!takes.length || !!recording}
            title="Clear this video's takes and film it again from the first slide. The files stay in the folder; Ctrl+Z brings the takes back."
            onClick={() => { cleared.current = takes; save([]); setStage({ s: "idle" }); goto(ids[0] ?? null); say(`Started over — ${takes.length} take${takes.length === 1 ? "" : "s"} cleared. Ctrl+Z brings them back.`, "warn"); }}>↺ Start over</button>
        </div>
      </div>

      {/* PREVIEW → POST */}
      <div style={{ borderTop: `1px solid ${EDGE}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        <button type="button" style={btn(true)} disabled={stage.s === "uploading" || stage.s === "stitching" || stage.s === "posting" || !picks.length} onClick={() => void preview()}>
          {stage.s === "ready" || stage.s === "posted" ? "Preview again" : "▶ Preview this video"}
        </button>
        {stage.s === "uploading" && <div style={{ color: GOLD }}>Uploading takes {stage.done} / {stage.of}…</div>}
        {stage.s === "stitching" && <div style={{ color: GOLD }}>{stage.note}</div>}
        {stage.s === "error" && <div style={{ color: RED }}>{stage.error}</div>}
        {fileUrlOf && (
          <div style={{ position: "relative", width: 270, maxWidth: "100%", aspectRatio: "9 / 16", background: "#000", borderRadius: 10, overflow: "hidden", alignSelf: "center" }}>
            <video src={fileUrlOf} controls playsInline onPlay={() => setEnded(false)} onEnded={() => setEnded(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {ended && cta && <PracticeEndCard variant={cta} onPractice={() => setEnded(false)} onSkip={() => setEnded(false)} />}
          </div>
        )}
        {fileUrlOf && (<>
          <label style={{ color: MUTED }}>Title
            <input style={{ ...field, marginTop: 3 }} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${EDGE}` }}>
              <ThumbnailArt ref={(el) => { artRef.current = el; }} spec={thumb} colorway={colorwayFor(NEUTRAL_COLORWAY_ID)} mode="social" width={72} />
            </div>
            <div style={{ color: MUTED, flex: 1 }}>End button on the site: <b style={{ color: CREAM }}>{cta === "try" ? "Try Practice Questions" : cta === "unlock" ? "Start Practice" : "none"}</b></div>
          </div>
          <button type="button" style={btn(true)} onClick={() => void post(fileUrlOf)}>Post to the site</button>
          {/* SOCIAL VERSION — the same video with the outro on the end, saved for Reels / TikTok / Shorts. */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={btn()} disabled={social.s === "working"} onClick={() => void makeSocial(fileUrlOf)}
              title="The same video with your outro clip on the end — for Reels, TikTok and Shorts">{social.s === "ready" ? "Make social version again" : "Make social version (+ outro)"}</button>
            {social.s === "ready" && <button type="button" style={btn(true)} onClick={() => void saveSocial(social.url)}>⬇ Save social video</button>}
          </div>
          {social.s === "working" && <div style={{ color: GOLD }}>{social.note}</div>}
          {social.s === "error" && <div style={{ color: RED }}>{social.error}</div>}
        </>)}
        {stage.s === "posting" && <div style={{ color: GOLD }}>{stage.note}</div>}
        {stage.s === "posted" && <div style={{ color: MINT, fontWeight: 800 }}>✓ Posted — <a href={stage.link} target="_blank" rel="noreferrer" style={{ color: MINT }}>see it</a>.</div>}
        {/* NEXT VIDEO, right here (Lee: "once I finish one split, it will just let me navigate to the next one
            right away and keep filming"). The pop-out follows. */}
        {onNext && <button type="button" style={btn(stage.s === "posted")} onClick={onNext} title="The next video — the pop-out follows (same as ])">Next video →</button>}
      </div>
    </aside>
  );
}
