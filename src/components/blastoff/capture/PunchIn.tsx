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
//   Stitch    the kept takes in slide order (a newer take overwrites the slides it covers) go to the background
//             stitch queue (stitch-queue.ts): uploaded, pauses trimmed and joined on the render worker, saved,
//             and watched, trimmed, downloaded and queued to post in the Stitch Room popout (/v4/stitch-room).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { baseName, connectObs, OBS_DEFAULT_ADDRESS, type ObsStatus } from "@/components/canvas/obs-bridge";
import { fsaSupported, getFile, moveToRecycle, pickTakesFolder, probeDuration, restoreFromRecycle, savedTakesFolder } from "@/components/canvas/takes-folder";
import { uploadTake } from "@/components/v3/take-burn";
import { isPlaceholderName, splitNameOf, takesFingerprint, videoKey } from "@/lib/film-stitch";
import { loadV4Splits, v4InsertSlideAfter } from "@/lib/v4.functions";
import { listFilmStitches } from "@/lib/film-stitch.functions";
import { track } from "@/lib/analytics";
import { enqueueStitch, openStitchRoom, stitchJob, subscribeStitches, type StitchInput } from "./stitch-queue";

import type { BlastFrame } from "../plan";
import { FRAME_LABEL } from "../plan";
import { endCtaOf } from "../practice-cta";
import { chunks, furthestForward, nextAfter, obsFileTime, pickTakes, punchKey, rangeOf, readTakes, recoverTakes, STITCH_CHUNK, uncovered, type PunchTake } from "../punch-in";
import { listTakeLogsSince } from "@/lib/take-log.functions";

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

export function PunchIn({ setId, setName, topicName, frames, takeIndex, takeName, popoutFrameId, onClose, onNext, onPrev, videoOf, stemOf }: {
  /** A card's question, by id — the fallback name of a video with no cut name. */
  stemOf?: (ceqId: string) => string | undefined;
  /** Move this window (and the pop-out) to the next video; null on the last one. */
  onNext?: (() => void) | null;
  /** …and back one; null on the first. */
  onPrev?: (() => void) | null;
  /** Which video of the set a slide is in (a take filmed on another video's slide goes there). */
  videoOf?: (frameId: string) => number | null;
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
  const [takes, setTakes] = useState<PunchTake[]>(() => { try { return readTakes(localStorage.getItem(key)); } catch { return []; } });
  // A NEW VIDEO (2026-09-15): its own takes — and any take in its list that belongs to another video (a Ctrl+Z of
  // another video's Start over, the old stale-save bug) goes home to that video. Scrap / undo / replace state is
  // per video, so Ctrl+Z never brings another video's takes in.
  useEffect(() => {
    let list: PunchTake[] = [];
    try { list = readTakes(localStorage.getItem(key)); } catch { list = []; }
    const here = new Set(frames.map((f) => f.id));
    let moved = 0;
    const keep: PunchTake[] = [];
    for (const t of list) {
      const other = here.has(t.fromId) ? takeIndex : videoOf?.(t.fromId) ?? null;
      if (other == null || other === takeIndex) { keep.push(t); continue; }
      try {
        const k = punchKey(setId, other);
        const there = readTakes(localStorage.getItem(k));
        if (!there.some((x) => x.file === t.file)) localStorage.setItem(k, JSON.stringify([...there, t]));
        moved++;
      } catch { keep.push(t); }
    }
    if (moved) { try { localStorage.setItem(key, JSON.stringify(keep)); } catch { /* shown, not saved */ } }
    setTakes(keep);
    setTrash([]); cleared.current = null; setArmed(null); setReplacing(null); replacingRef.current = null;
    if (moved) setFlash({ text: `Moved ${moved} take${moved === 1 ? "" : "s"} back to the video${moved === 1 ? "" : "s"} they were filmed for.`, tone: "warn" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const save = useCallback((next: PunchTake[]) => { setTakes(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* this visit only */ } }, [key]);
  const takesRef = useRef(takes); takesRef.current = takes;

  const [obs, setObs] = useState<{ status: ObsStatus; detail?: string }>({ status: "off" });
  const [addr, setAddr] = useState(() => { try { return localStorage.getItem("sa-obs-addr") ?? OBS_DEFAULT_ADDRESS; } catch { return OBS_DEFAULT_ADDRESS; } });
  const [pass, setPass] = useState(() => { try { return localStorage.getItem("sa-obs-pass") ?? ""; } catch { return ""; } });
  const [connectTick, setConnectTick] = useState(0);
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [recording, setRecording] = useState<{ fromId: string } | null>(null);
    const recRef = useRef(recording); recRef.current = recording;
  /** Every slide the pop-out showed during the recording, in order (see the OBS "started" handler). */
  const walked = useRef<string[]>([]);
  const walkTimer = useRef<number | null>(null);
  const [armed, setArmed] = useState<"last" | "live" | null>(null);
  const armedRef = useRef(armed); armedRef.current = armed;
  const scrapLive = useRef(false);
  const [trash, setTrash] = useState<PunchTake[]>([]);
  /** The take the next recording replaces, whole (a speed run included). */
  const [replacing, setReplacing] = useState<PunchTake | null>(null);
  const replacingRef = useRef(replacing); replacingRef.current = replacing;
  const trashRef = useRef(trash); trashRef.current = trash;
  const [flash, setFlash] = useState<{ text: string; tone: "good" | "warn" | "bad" } | null>(null);
  const say = (text: string, tone: "good" | "warn" | "bad" = "good") => setFlash({ text, tone });
  const [stage, setStage] = useState<Stage>({ s: "idle" });
  // THE VIDEO'S NAME from the Build step's cuts, as the v4 Film list shows it (Lee, 2026-09-15: "#1 - [title]").
  const splitsQ = useQuery({ queryKey: ["v4-splits", setId], queryFn: () => loadV4Splits({ data: { setId } }), staleTime: 60_000, retry: false });
  const cutName = splitNameOf(splitsQ.data, takeIndex);
    // No cut name and no take name → the video is named by what it opens on (its first question), not the set —
  // the Stitch Room was a column of "A = L + E effects" (Lee, 2026-09-16).
  const firstStem = useMemo(() => { const f = frames.find((x) => x.kind === "ceq" && !x.skipped && x.ceqId && stemOf?.(x.ceqId)); const s = f?.ceqId ? (stemOf?.(f.ceqId) ?? "") : ""; return s.length > 70 ? `${s.slice(0, 68)}…` : s; }, [frames, stemOf]);
  const defaultTitle = cutName || (isPlaceholderName(takeName) ? "" : takeName) || firstStem || setName;
  const [title, setTitle] = useState(defaultTitle);
  useEffect(() => { setTitle(defaultTitle); setStage({ s: "idle" }); }, [defaultTitle, takeIndex]);
  const cta = endCtaOf(frames);
  // THE OUTRO CLIP (Lee, 2026-09-14: "just append the outro to each video automatically, with the animation
  // and everything"). Film the outro slide once (its entrance, the cursor clicking Start Cramming for Free),
  // keep that take as the outro, and every Preview ends on it — no outro slide to film per video.
  const [outroClip, setOutroClip] = useState<OutroClip | null>(() => readOutroClip());
  const [savingOutro, setSavingOutro] = useState(false);
  const isOutro = (id: string) => frames.find((f) => f.id === id)?.kind === "outro";
  /** START OVER (Lee, 2026-09-14: "a start over button being useful with punch in"): the takes it cleared,
   *  so Ctrl+Z brings them back. The files stay in the recordings folder. */
  const cleared = useRef<PunchTake[] | null>(null);

  const goto = useCallback((frameId: string | null) => {
    if (!frameId) return;
    try { localStorage.setItem(`sa-film-goto:${setId}`, JSON.stringify({ frameId, at: Date.now() })); } catch { /* the pop-out stays */ }
  }, [setId]);
  const label = (id: string) => { const k = ids.indexOf(id); const f = frames[k]; return k < 0 || !f ? "a slide" : `slide ${k + 1} (${FRAME_LABEL[f.kind]})`; };
  // (the live ref is declared with the OBS effect below; refreshed every render once it exists)

  // THE FOLDER, if it was granted before.
  useEffect(() => { void savedTakesFolder(false).then((h) => { if (h) setFolder(h); }); }, []);

  // THE LIVE VIDEO for the OBS handler. The handler is made once, on Connect — it must never keep the video that
  // was up then (Lee, 2026-09-15: takes kept after Next video were written over the first video's list).
  const live = useRef({ setId, ids, takeIndex, videoOf, save, goto: (id: string | null) => { void id; }, label: (id: string) => id, folder });
  // OBS — connected while the panel is open.
  useEffect(() => {
    if (!connectTick) return;
    return connectObs(addr, pass, {
      onStatus: (status, detail) => setObs({ status, detail }),
      onRecord: (e) => {
        const { setId, ids, takeIndex, videoOf, save, goto, label, folder } = live.current;
        if (e.kind === "started") {
          const from = popoutFrameId();
          if (!from) { say("Recording, but no pop-out is open — open the 9:16 window so the take knows its slide.", "bad"); setRecording({ fromId: "" }); return; }
                    setRecording({ fromId: from }); scrapLive.current = false; setArmed(null);
          // THE WALK while recording (2026-09-16). Lee: "sometimes I will go backwards with a take to recall
          // something. It's screwing up the takes." A take used to cover start→stop, so stopping three slides back
          // wrote over slides already filmed. Now every slide the pop-out shows while recording is noted, and the
          // take reaches only as far FORWARD as it got — a look back is never part of it.
          walked.current = [from];
          if (walkTimer.current) window.clearInterval(walkTimer.current);
          walkTimer.current = window.setInterval(() => { const id = popoutFrameId(); if (id && walked.current[walked.current.length - 1] !== id) walked.current.push(id); }, 200);
          say(`● recording ${label(from)}`, "warn");
          return;
        }
        if (e.kind === "stopped") {
                    const rec = recRef.current;
          if (walkTimer.current) { window.clearInterval(walkTimer.current); walkTimer.current = null; }
          setRecording(null);
                    const stoppedOn = popoutFrameId();
          if (stoppedOn && walked.current[walked.current.length - 1] !== stoppedOn) walked.current.push(stoppedOn);
          const to = rec?.fromId ? furthestForward(ids, rec.fromId, walked.current) : stoppedOn;
          if (!rec?.fromId || !to || !e.path) { say("Stopped — the take couldn't be matched to a slide, so it wasn't kept.", "bad"); return; }
          const take: PunchTake = { file: baseName(e.path), fromId: rec.fromId, toId: to, at: Date.now() };
          // THE WRONG VIDEO (Lee, 2026-09-15: "I accidentally stitched in wrong place"): the pop-out was on a
          // slide of another video. The take belongs to that video, so it's kept there, not here.
          if (!ids.includes(rec.fromId) && !scrapLive.current) {
            const other = videoOf?.(rec.fromId) ?? null;
            if (other != null && other !== takeIndex) {
              try {
                const k = punchKey(setId, other);
                localStorage.setItem(k, JSON.stringify([...readTakes(localStorage.getItem(k)), take]));
              } catch { /* not kept */ }
              say(`That take was on video #${other + 1}'s slide — kept with #${other + 1}, not this video. Next video / Previous video to line the windows up.`, "bad");
              return;
            }
          }
          if (scrapLive.current) {
            scrapLive.current = false;
            setTrash((t) => [...t, take]);
            track("take_scrapped", { set_id: setId, video: takeIndex + 1, live: true });
            if (folder) void moveToRecycle(folder as never, take.file);
            goto(take.fromId);
            say(`Scrapped — back on ${label(take.fromId)}. Ctrl+Z brings it back.`, "warn");
            return;
          }
          // REPLACE (Lee, 2026-09-14: "If I hit replace, it lets me film a new version that overwrites it. If I
          // try to replace a speed, it replaces it in its entirety."): the take being replaced goes, whole.
          const replaced = replacingRef.current;
          replacingRef.current = null; setReplacing(null);
          save([...takesRef.current.filter((t) => t !== replaced && !(replaced && t.file === replaced.file)), take]);
          { const r = rangeOf(ids, take); track("take_kept", { set_id: setId, video: takeIndex + 1, slides: r ? r.to - r.from + 1 : 1, replaced: !!replaced }); }
          if (replaced) say(`✓ replaced — the new take is in`, "good");
          const next = nextAfter(ids, take);
          goto(next);
          say(next ? `✓ kept ${label(take.fromId)}${take.toId !== take.fromId ? ` → ${label(take.toId)}` : ""} — up next: ${label(next)}` : "✓ kept — that's the last slide. Preview the video.", "good");
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnect only on an explicit Connect
  }, [connectTick]);

  live.current = { setId, ids, takeIndex, videoOf, save, goto, label, folder };

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
  // RECOVER TAKES (Lee, 2026-09-15: "scrapping removed takes I liked"): this video's recordings from the last day and
  // a half, matched to the pop-out's roll logs — tick the ones to put back.
    const [recover, setRecover] = useState<null | { busy: string } | { error: string } | { list: { take: PunchTake; on: boolean; had: boolean }[] }>(null);
  // THE ADD-ON CLIP (Lee, 2026-09-16): a new slide after this one, straight into the plan; the open Editor adopts it
  // over the sa-plan channel, the pop-out puts it up, and the next punch-in lands on it. Stitch again joins it in;
  // Post replaces the old video in its slot.
  const [adding, setAdding] = useState(false);
  const addSlideAfter = async (afterId: string, n: number) => {
    const text = window.prompt(`The new slide, after slide ${n} — what's on it?`, "Quick thing I forgot that matters for your exam:");
    if (!text?.trim()) return;
    setAdding(true);
    try {
      const r = await v4InsertSlideAfter({ data: { setId, afterId, text: text.trim() } });
      try { const ch = new BroadcastChannel(`sa-plan:${setId}`); ch.postMessage({ from: "punch-add", frames: r.frames, updatedAt: r.updatedAt }); ch.close(); } catch { /* the deck reloads on its own next visit */ }
      window.setTimeout(() => goto(r.id), 700);
      say(`Added a slide after ${n} — punch in on it. Stitch again puts the clip in; Post replaces the old video.`, "good");
      track("v4_slide_added", { set_id: setId, source: "film-add-on" } as never);
    } catch (e) { say(e instanceof Error ? e.message : String(e), "bad"); }
    finally { setAdding(false); }
  };
  const findLost = async () => {
    try {
      let dir = folder;
      if (!dir) { dir = (await pickTakesFolder()) as never; if (!dir) return; setFolder(dir); }
      setRecover({ busy: "reading the recordings folder…" });
      const since = Date.now() - 36 * 3600_000;
      const names: string[] = [];
      for await (const [name, h] of (dir as unknown as { entries: () => AsyncIterable<[string, { kind: string }]> }).entries()) {
        if (h.kind !== "file" || !/\.(mp4|mkv|mov|m4v|flv)$/i.test(name)) continue;
        const t = obsFileTime(name);
        if (t != null && t >= since) names.push(name);
      }
      setRecover({ busy: `matching ${names.length} recordings to the slide logs…` });
      const r = await listTakeLogsSince({ data: { setId, since: new Date(since - 3600_000).toISOString() } });
      if (!r.ok) throw new Error(r.error);
      const rough = recoverTakes(filmIds, r.logs, names.map((name) => ({ name, durationS: null })));
      const files: { name: string; durationS: number | null }[] = [];
      for (const c of rough) {
        const f = await getFile(dir as never, c.file);
        files.push({ name: c.file, durationS: f ? await probeDuration(f).catch(() => null) : null });
      }
      const found = recoverTakes(filmIds, r.logs, files);
      const had = new Set(takes.map((t) => t.file));
      setRecover({ list: found.map((t) => ({ take: t, on: !had.has(t.file), had: had.has(t.file) })) });
    } catch (e) { setRecover({ error: e instanceof Error ? e.message : String(e) }); }
  };
  const putBack = () => {
    if (!recover || !("list" in recover)) return;
    const add = recover.list.filter((x) => x.on && !x.had).map((x) => x.take);
    save([...takes, ...add]);
    say(`Put back ${add.length} take${add.length === 1 ? "" : "s"}`, "good");
    setRecover(null);
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
  // STITCH (Lee, 2026-09-15: "Stitch # clips?"). The video goes to the background stitch queue
  // (stitch-queue.ts) and the Stitch Room popout opens on it — filming carries on, even onto the next topic. The
  // same kept takes as the saved video → watch that one again instead of stitching twice.
  const fingerprint = takesFingerprint(picks);
  const slidesFilmed = picks.reduce((n, p) => n + (p.to - p.from + 1), 0);
  const job = useSyncExternalStore(subscribeStitches, () => stitchJob(setId, takeIndex), () => undefined);
  const qc = useQueryClient();
  const savedQ = useQuery({ queryKey: ["film-stitches"], queryFn: () => listFilmStitches(), staleTime: 30_000, retry: false });
  const saved = savedQ.data?.find((r) => r.setId === setId && r.takeIndex === takeIndex);
  const sameAsSaved = !!saved && saved.fingerprint === fingerprint;
  const jobLive = !!job && job.state !== "done" && job.state !== "error";
  useEffect(() => { if (job?.state === "done") void qc.invalidateQueries({ queryKey: ["film-stitches"] }); }, [job?.state, qc]);
  const vKey = videoKey(setId, takeIndex);
  const briefTitle = cutName || (isPlaceholderName(takeName) ? "" : takeName);
  const brief = useMemo(() => {
    const real = frames.filter((f) => f.kind !== "outro" && !f.skipped);
    const ceqs = real.filter((f) => f.kind === "ceq");
    const speed = ceqs.filter((f) => f.pace === "speed").length;
    const out: { n: number; label: string; tone: string }[] = [{ n: real.length, label: real.length === 1 ? "slide" : "slides", tone: CREAM }];
    if (ceqs.length) out.push({ n: ceqs.length, label: `CEQ${ceqs.length === 1 ? "" : "s"}${speed ? ` (${speed} speed)` : ""}`, tone: "#7DD3FC" });
    const byKind = new Map<string, number>();
    for (const f of real) if (f.kind !== "ceq") byKind.set(FRAME_LABEL[f.kind], (byKind.get(FRAME_LABEL[f.kind]) ?? 0) + 1);
    for (const [label, n] of byKind) out.push({ n, label, tone: GOLD });
    return out;
  }, [frames]);
  const stitch = async (o: { andNext?: boolean } = {}) => {
    // the Stitch Room first, inside the click (a window opened after an await is blocked) — not on Stitch & next,
    // where the filming keeps the focus
    if (!o.andNext) openStitchRoom(vKey);
    try {
      let dir = folder;
      if (!dir) { dir = (await pickTakesFolder()) as never; if (!dir) throw new Error("Choose the OBS recordings folder first."); setFolder(dir); }
      if (!picks.length) throw new Error("No kept takes in this video yet.");
      const clips: StitchInput["clips"] = [];
      for (let i = 0; i < picks.length; i++) {
        const p = picks[i];
        const file = await getFile(dir as never, p.take.file);
        if (!file) throw new Error(`${p.take.file} isn't in the recordings folder (moved, or OBS still writing it) — wait a moment and stitch again.`);
        const a = ids.indexOf(filmIds[p.from]) + 1, b = ids.indexOf(filmIds[p.to]) + 1;
        clips.push({ file, label: a === b ? `Slide ${a}` : `Slides ${a}–${b}`, slides: p.to - p.from + 1 });
      }
      enqueueStitch({ setId, takeIndex, name: title.trim() || defaultTitle, setName, topicName, slides: slidesFilmed, fingerprint, endCta: cta ?? null, clips });
      say(`⚡ Stitching ${clips.length} clip${clips.length === 1 ? "" : "s"} in the background — keep filming`, "good");
      if (o.andNext) onNext?.();
    } catch (e) { say(e instanceof Error ? e.message : String(e), "bad"); }
  };

  const btn = (strong = false): React.CSSProperties => ({ font: "inherit", fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 7, cursor: "pointer", border: `1px solid ${strong ? GOLD : EDGE}`, background: strong ? GOLD : "transparent", color: strong ? "#14213D" : CREAM, whiteSpace: "nowrap" });
  const field: React.CSSProperties = { font: "inherit", fontSize: 12, background: "rgba(0,0,0,0.35)", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 6, padding: "4px 6px", width: "100%", boxSizing: "border-box" };
  const obsTone = obs.status === "connected" ? MINT : obs.status === "error" ? RED : MUTED;

  return (
    <aside aria-label="Punch-in filming" style={{ position: "fixed", top: 12, right: 12, bottom: 12, width: 330, zIndex: 40, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, background: "rgba(7,11,20,0.94)", border: `1px solid ${EDGE}`, borderRadius: 12, padding: 12, fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 12, color: CREAM }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 14, color: GOLD }}>Punch-in</b>
        <span style={{ color: MUTED }}>Video {takeIndex + 1}</span>
        <span style={{ flex: 1 }} />
        <button type="button" style={btn()} onClick={onClose} title="Close punch-in (F3 goes back to the normal scrap)">✕</button>
      </div>

      {/* AT A GLANCE (Lee, 2026-09-15: "When I switch to a new video. I want to see some things that help me quickly get
          caught up … # - Title, # of slides, # of CEQ's, how many callouts and of each type") */}
      <div key={`brief-${takeIndex}`} className="sa-brief" style={{ borderRadius: 10, padding: "9px 10px", background: "rgba(252,163,17,0.07)", border: `1px solid ${GOLD}55`, display: "flex", flexDirection: "column", gap: 6 }}>
        <style>{`@keyframes sa-brief-in { 0% { box-shadow: 0 0 0 0 rgba(252,163,17,.6); transform: translateY(-4px); opacity: .4 } 100% { box-shadow: 0 0 0 10px rgba(252,163,17,0); transform: none; opacity: 1 } } .sa-brief { animation: sa-brief-in 520ms ease-out; } @media (prefers-reduced-motion: reduce) { .sa-brief { animation: none } }`}</style>
        <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.2, color: CREAM }}>#{takeIndex + 1}{briefTitle ? ` - ${briefTitle}` : ""}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {brief.map((b) => (
            <span key={b.label} style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, border: `1px solid ${b.tone}66`, color: b.tone, whiteSpace: "nowrap" }}>{b.n} {b.label}</span>
          ))}
        </div>
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
        
        {armed && <div style={{ color: GOLD, fontWeight: 800 }}>{armed === "live" ? "Scrap this take? F3 again (Esc cancels)" : "Scrap the last take? F3 again (Esc cancels)"}</div>}
        {flash && <div role="status" style={{ color: flash.tone === "good" ? MINT : flash.tone === "warn" ? GOLD : RED, fontWeight: 700 }}>{flash.text}</div>}
      </div>

      {/* THE SLIDES AND THEIR TAKES */}
      <div style={{ borderTop: `1px solid ${EDGE}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                {/* THE OUTRO CLIP (kept once, for the social versions) only speaks up when there is a new one to keep —
            Lee, 2026-09-16: "I don't need to see 'No outro clip yet'… minimalize it and show me only what I need." */}
        {lastOutroTake && lastOutroTake.file !== outroClip?.file && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, color: MUTED }}>
            <span style={{ flex: 1 }}>New outro take</span>
            <button type="button" style={btn(true)} disabled={savingOutro} onClick={() => void keepOutro(lastOutroTake)}
              title="Keep your latest outro take as the outro every video ends on (socials only)">{savingOutro ? "Keeping…" : "Use as the outro"}</button>
          </div>
        )}
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
                  <span title={p.take.file}>Take {n + 1}</span>
                  <span style={{ flex: 1 }} />
                  <button type="button" title="Play this take" style={{ ...btn(), padding: "0 6px", fontSize: 11 }} onClick={() => void playTake(p.take)}>▶</button>
                  <button type="button" aria-pressed={replacing === p.take}
                    title={replacing === p.take ? "Replacing — punch in (F4). Click to cancel." : "Replace: puts its first slide up; your next take replaces this whole take"}
                    style={{ ...btn(replacing === p.take), padding: "0 6px", fontSize: 11 }}
                    onClick={() => { if (replacing === p.take) { setReplacing(null); say("Replace cancelled"); return; } setReplacing(p.take); goto(p.take.fromId); say(`Replacing take ${n + 1} — punch in (F4); the new take replaces it whole`, "warn"); }}>↻</button>
                  <button type="button" title="Take this take out of the video (Ctrl+Z brings it back). The file stays." style={{ ...btn(), padding: "0 6px", fontSize: 11, color: RED }}
                    onClick={() => { save(takes.filter((t) => t !== p.take)); setTrash((t) => [...t, p.take]); setStage({ s: "idle" }); say(`Removed take ${n + 1} — Ctrl+Z brings it back`, "warn"); }}>✕</button>
                </div>
              )}
                            <div className="sa-take-row" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button type="button" onClick={() => goto(f.id)} title="Put this slide up in the pop-out — punch in again to overwrite it"
                  style={{ all: "unset", cursor: "pointer", display: "flex", gap: 6, alignItems: "center", padding: "2px 4px", borderRadius: 5, color: p ? CREAM : MUTED, flex: 1, minWidth: 0 }}>
                  <span style={{ width: 18, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{k + 1}</span>
                  <span style={{ color: p ? MINT : MUTED }}>{p ? "✓" : "○"}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{FRAME_LABEL[f.kind]}{f.pace === "speed" ? " · speed" : ""}</span>
                </button>
                {/* ADD A CLIP HERE (Lee, 2026-09-16: "an 'Add clip here' button that shows up on hover for takes… whatever
                    we film, it will be placed there"): a new slide goes in after this one; punch in on it and Stitch again. */}
                <button type="button" className="sa-take-add" disabled={adding} title="Add a slide after this one — then punch in on it. Stitch again puts the new clip into the video, and Post replaces the old one."
                  style={{ ...btn(), padding: "0 6px", fontSize: 11, opacity: 0 }} onClick={() => void addSlideAfter(f.id, k + 1)}>+ slide</button>
              </div>
            </div>
          );
        })}
        {playing && (
          <div style={{ position: "relative", marginTop: 6, alignSelf: "center", width: 200, maxWidth: "100%" }}>
            <video key={playing.url} src={playing.url} controls autoPlay playsInline style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", background: "#000", borderRadius: 8 }} />
            <button type="button" style={{ ...btn(), position: "absolute", top: 4, right: 4, padding: "0 6px" }} onClick={() => { URL.revokeObjectURL(playing.url); setPlaying(null); }}>✕</button>
          </div>
        )}
                <style>{`.sa-take-row:hover .sa-take-add, .sa-take-add:focus-visible { opacity: 1 !important; }`}</style>
        <div style={{ color: MUTED, marginTop: 4, display: "flex", alignItems: "center", gap: 10, fontSize: 11 }}>
          <span style={{ flex: 1 }}>{picks.length} take{picks.length === 1 ? "" : "s"}{gaps.length ? ` · ${gaps.length} slide${gaps.length === 1 ? "" : "s"} not filmed` : " · every slide filmed"}</span>
          <button type="button" style={{ all: "unset", cursor: "pointer", color: MUTED, textDecoration: "underline" }} disabled={!!recording} onClick={() => void findLost()}
            title="Find this video's recordings from the last day and a half and put takes back">Recover</button>
          <button type="button" style={{ all: "unset", cursor: "pointer", color: MUTED, textDecoration: "underline" }} disabled={!takes.length || !!recording}
            title="Clear this video's takes and film it again from the first slide. The files stay in the folder; Ctrl+Z brings the takes back."
            onClick={() => { cleared.current = takes; save([]); setStage({ s: "idle" }); goto(ids[0] ?? null); say(`Started over — ${takes.length} take${takes.length === 1 ? "" : "s"} cleared. Ctrl+Z brings them back.`, "warn"); }}>Start over</button>
        </div>
      </div>

      {recover && (
        <div style={{ border: `1px solid ${GOLD}66`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6, background: "rgba(252,163,17,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center" }}><b style={{ color: GOLD }}>Recover takes</b><span style={{ flex: 1 }} /><button type="button" style={{ ...btn(), padding: "0 6px" }} onClick={() => setRecover(null)}>✕</button></div>
          {"busy" in recover && <div style={{ color: MUTED }}>{recover.busy}</div>}
          {"error" in recover && <div style={{ color: RED }}>{recover.error}</div>}
          {"list" in recover && (recover.list.length === 0
            ? <div style={{ color: MUTED }}>No recordings from this video in the last day and a half matched a slide log. Scrapped files sit in the folder's _trash; Ctrl+Z (right after a scrap) brings those back.</div>
            : <>
                {recover.list.map((x, k) => {
                  const a = filmIds.indexOf(x.take.fromId) + 1, b = filmIds.indexOf(x.take.toId) + 1;
                  return (
                    <label key={x.take.file} style={{ display: "flex", gap: 6, alignItems: "center", cursor: x.had ? "default" : "pointer", color: x.had ? MUTED : CREAM }}>
                      <input type="checkbox" disabled={x.had} checked={x.on && !x.had} onChange={() => setRecover({ list: recover.list.map((y, j) => (j === k ? { ...y, on: !y.on } : y)) })} />
                      <span style={{ flex: 1 }}>{a === b ? `Slide ${a}` : `Slides ${a}–${b}`} · {x.take.file.replace(/\.\w+$/, "").slice(11)}</span>
                      {x.had && <span style={{ fontSize: 10.5 }}>already in</span>}
                      <button type="button" style={{ ...btn(), padding: "0 6px", fontSize: 11 }} onClick={(e) => { e.preventDefault(); void playTake(x.take); }}>▶</button>
                    </label>
                  );
                })}
                <div style={{ color: MUTED, fontSize: 11 }}>Newer takes win where two cover the same slide — untick the ones you don't want.</div>
                <button type="button" style={btn(true)} disabled={!recover.list.some((x) => x.on && !x.had)} onClick={putBack}>Put back {recover.list.filter((x) => x.on && !x.had).length} take{recover.list.filter((x) => x.on && !x.had).length === 1 ? "" : "s"}</button>
              </>)}
        </div>
      )}

      {/* STITCH → the Stitch Room (trim, download, queue to post) */}
      <div style={{ borderTop: `1px solid ${EDGE}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ color: MUTED }}>Title
          <input style={{ ...field, marginTop: 3 }} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        {jobLive ? (
          <button type="button" style={{ ...btn(true), background: "#7DD3FC", borderColor: "#7DD3FC" }} onClick={() => openStitchRoom(vKey)} title="Open the Stitch Room on this video">
            ⚡ Stitching… {job!.state === "waiting" ? "waiting its turn" : job!.note}
          </button>
        ) : sameAsSaved ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={{ ...btn(true), flex: 1 }} onClick={() => openStitchRoom(vKey)}>▶ Watch it again</button>
            <button type="button" style={btn()} disabled={!picks.length} onClick={() => void stitch()} title="Stitch these takes again from scratch">Stitch again</button>
          </div>
        ) : (
          <button type="button" style={{ ...btn(true), fontSize: 13, padding: "8px 10px" }} disabled={!picks.length} onClick={() => void stitch()}>
            ⚡ Stitch {picks.length} clip{picks.length === 1 ? "" : "s"}
          </button>
        )}
        {job?.state === "error" && <div style={{ color: RED }}>{job.error}</div>}
        {job?.state === "done" && job.error && <div style={{ color: GOLD }}>{job.error}</div>}
        {saved && !jobLive && (
          <div style={{ color: saved.status === "posted" ? MINT : saved.status === "queued" ? GOLD : MUTED }}>
            {saved.status === "posted" ? "✓ Posted" : saved.status === "queued" ? "In the post queue" : "Stitched — not queued yet"}{!sameAsSaved ? " · the takes changed since" : ""}
          </div>
        )}
        <button type="button" style={btn()} onClick={() => openStitchRoom(saved || job ? vKey : undefined)}>Open the Stitch Room</button>
        {/* STITCH & NEXT (Lee, 2026-09-15: "Even a 'stitch and next' would be great"): stitch in the background,
            straight on to the next video — the pop-out follows. */}
        {onNext && !jobLive && !sameAsSaved && picks.length > 0 && (
          <button type="button" style={{ ...btn(true), background: MINT, borderColor: MINT }} onClick={() => void stitch({ andNext: true })}>⚡ Stitch &amp; next video →</button>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" style={{ ...btn(), flex: 1 }} disabled={!onPrev} onClick={() => onPrev?.()} title="The previous video — the pop-out follows (same as [)">← Previous video</button>
          <button type="button" style={{ ...btn(jobLive || sameAsSaved), flex: 1 }} disabled={!onNext} onClick={() => onNext?.()} title="The next video — the pop-out follows (same as ])">Next video →</button>
        </div>
      </div>
    </aside>
  );
}
