// THE CUT LIST (2026-09-13) — Post's side of F3 on /film (capture/scrap.tsx), and since G the SLICER
// for one continuous take (take-slice.ts). Lee: "if we keep that take, is to auto-edit out that
// portion" · "once we have a chain built, I can just do one continuous take and get a TON of videos
// posted in one day."
//
// Once a take file is picked, this finds the recording it is (matchRollRef: the F4 nearest the file's
// start, across the F3 scraps AND the slide timelines /film saved). Then:
//   · the recording covers SEVERAL splits → the splits it found, where each sits in the file, what
//     its scraps take out, and one ffmpeg line per split writing `<name>.partN-<split>.cut.mp4`.
//     Each split's own row then takes its part.
//   · it covers one split → the scraps with the reason he gave, and one line writing `<name>.cut.mp4`.
//
// HONEST ABOUT WHAT IS AUTOMATIC: the timeline, the marks and the commands are; running them is a
// paste into a terminal on the machine holding the file. The render worker could run it later.
import { useEffect, useMemo, useState } from "react";

import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { clockOf, cutRanges, ffmpegCutCommand, matchRollRef, parseTakeRef, type ScrapMark } from "@/components/blastoff/frame-events";
import { filmFrames, planTakes, takeLabel } from "@/components/blastoff/plan";
import { PAUSE_LEVELS, editScript, keptSeconds, mergeCuts, pauseCuts, rangeText, scrapsWithin, sliceCommands, speedWindows, splitRanges, type PauseLevel } from "@/components/blastoff/take-slice";
import type { BlastFrame } from "@/components/blastoff/plan";
import { loadBlastPlan } from "@/lib/blastoff.functions";
import { listScrapMarks } from "@/lib/frame-events.functions";
import { listTakeLogs, type TakeLogRow } from "@/lib/take-log.functions";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

const RED = "#FF8B7E";
const MINT = "#3BF5A0";
const LEVEL_KEY = "sa-pause-level";

/** `takeIndex` null = a recording of the whole set (the ✂ Slice a recording door on /v3/post). */
export function ScrapCuts({ setId, takeIndex, file, fileSeconds, words }: {
  setId: string; takeIndex: number | null; file: File; fileSeconds: number | null;
  /** The take's transcript words (Post step 2) — what the pause trimming reads. Null until it's back. */
  words?: readonly { s: number; e: number }[] | null;
}) {
  const [marks, setMarks] = useState<ScrapMark[] | null>(null);
  const [logs, setLogs] = useState<TakeLogRow[]>([]);
  const [logErr, setLogErr] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pickedRef, setPickedRef] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [speedIds, setSpeedIds] = useState<Set<string>>(new Set());
  // THE PAUSES (take-slice.ts pauseCuts) — the level is remembered on this machine.
  const [level, setLevelState] = useState<PauseLevel>("gentle");
  useEffect(() => { try { const v = localStorage.getItem(LEVEL_KEY); if (v === "off" || v === "gentle" || v === "tight") setLevelState(v); } catch { /* default */ } }, []);
  const setLevel = (v: PauseLevel) => { setLevelState(v); try { localStorage.setItem(LEVEL_KEY, v); } catch { /* not remembered */ } };

  useEffect(() => {
    let alive = true;
    setMarks(null); setErr(null); setPickedRef(null); setLogErr(null);
    listScrapMarks({ data: { setId } })
      .then((r) => { if (!alive) return; if (r.ok) setMarks(r.marks); else setErr(r.error); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    // The timelines are optional to the scrap list, so a missing table is said, not fatal.
    listTakeLogs({ data: { setId } })
      .then((r) => { if (!alive) return; if (r.ok) setLogs(r.logs); else setLogErr(r.error); })
      .catch((e) => { if (alive) setLogErr(e instanceof Error ? e.message : String(e)); });
    loadBlastPlan({ data: { setId } })
      .then((p) => {
        if (!alive || !p) return;
        const frames = p.frames as unknown as BlastFrame[];
        setNames(planTakes(filmFrames(frames)).map((t) => takeLabel(t)));
        setSpeedIds(new Set(frames.filter((f) => f.pace === "speed").map((f) => f.id)));
      })
      .catch(() => { /* names fall back to "Split N" */ });
    return () => { alive = false; };
  }, [setId, file]);

  const isCut = /\.cut\.[a-z0-9]+$/i.test(file.name);
  // Every recording of this split (or of the whole set) that has scraps or a timeline, newest first.
  const refs = useMemo(() => {
    const all = [...(marks ?? []).map((m) => m.takeRef), ...logs.map((l) => l.take_ref)];
    const out: string[] = [];
    for (const r of all) {
      const p = parseTakeRef(r);
      if (p && (takeIndex === null || p.takeIndex === null || p.takeIndex === takeIndex) && !out.includes(r)) out.push(r);
    }
    return out.sort((a, b) => (parseTakeRef(b)?.rolledAt ?? "").localeCompare(parseTakeRef(a)?.rolledAt ?? ""));
  }, [marks, logs, takeIndex]);
  const auto = useMemo(() => (fileSeconds != null ? matchRollRef(refs, takeIndex, file.lastModified, fileSeconds) : null), [refs, takeIndex, file, fileSeconds]);
  const ref = pickedRef ?? auto;

  if (isCut) return <div style={{ marginTop: 8, fontSize: 12, color: MINT }}>This is a cut take (.cut) — the scrapped stretches are already out.</div>;
  if (err) return <div style={{ marginTop: 8, fontSize: 12, color: RED }}>Couldn't read the F3 scraps: {err}</div>;
  if (!marks) return <div style={{ marginTop: 8, fontSize: 12, color: V3_MUTED }}>Checking for F3 scraps and the take's timeline…</div>;
  if (!refs.length && !words?.length) {
    return (
      <div style={{ marginTop: 8, fontSize: 12, color: V3_MUTED }}>
        No F3 scraps or saved timeline for this split yet — once the transcript is back (step 2), the pauses can be trimmed here.
        {logErr && <div style={{ color: RED, marginTop: 4 }}>Timelines couldn't be read: {logErr}</div>}
      </div>
    );
  }

  const mine = ref ? marks.filter((m) => m.takeRef === ref) : [];
  const cuts = cutRanges(mine);
  const log = ref ? logs.find((l) => l.take_ref === ref) : undefined;
  const ranges = log && fileSeconds != null ? splitRanges(log.arrivals, fileSeconds) : [];
  const slicing = ranges.length > 1;
  const nameOf = (t: number) => names[t] ?? `Split ${t + 1}`;
  const commands = slicing ? sliceCommands(file.name, ranges, cuts, nameOf) : [];
  const keepWindows = log && fileSeconds != null ? speedWindows(log.arrivals, fileSeconds, (id) => speedIds.has(id)) : [];
  const pauses = !slicing && words?.length && fileSeconds != null ? pauseCuts(words.map((w) => ({ start: w.s, end: w.e })), fileSeconds, level, keepWindows) : [];
  const allCuts = mergeCuts(cuts, pauses);
  const single = !slicing ? ffmpegCutCommand(file.name, allCuts) : "";
  const block = slicing ? commands.join("\n") : single;
  const removed = allCuts.reduce((s, r) => s + (r.end - r.start), 0);
  const pauseSeconds = pauses.reduce((s, r) => s + (r.end - r.start), 0);
  const stem = file.name.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "take";
  const downloadScript = () => {
    const blob = new Blob([editScript(slicing ? commands : [single])], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `edit-${stem}.cmd`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const when = (r: string) => { const p = parseTakeRef(r); return p ? new Date(p.rolledAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }) : r; };
  const countFor = (r: string) => marks.filter((m) => m.takeRef === r).length;

  return (
    <div style={{ marginTop: 10, border: `1px solid ${V3_EDGE}`, borderRadius: 10, padding: "10px 12px", background: slicing ? "rgba(252,163,17,0.05)" : "rgba(255,90,95,0.05)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <b style={{ color: V3_CREAM, fontSize: 13 }}>{slicing ? `✂ One recording, ${ranges.length} splits` : "✂ Edit this take"}</b>
        {refs.length > 0 && <>
        <span style={{ fontSize: 12, color: V3_MUTED }}>
          {ref ? (pickedRef ? "recording you chose" : "matched to this file") + ` — rolled ${when(ref)}` : "no recording matched this file's start time — pick the one it is:"}
        </span>
        <select value={ref ?? ""} onChange={(e) => setPickedRef(e.target.value || null)}
          style={{ font: "inherit", fontSize: 11.5, background: "#0B0F1E", color: V3_CREAM, border: `1px solid ${V3_EDGE}`, borderRadius: 6, padding: "2px 6px" }}>
          <option value="">{auto ? "— the match —" : "— choose —"}</option>
          {refs.map((r) => <option key={r} value={r}>{when(r)}{parseTakeRef(r)?.takeIndex === null ? " · whole set" : ""} · {countFor(r)} scrap{countFor(r) === 1 ? "" : "s"}</option>)}
        </select>
        </>}
      </div>

      {ref && slicing && (
        <>
          <div style={{ marginTop: 8, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, color: V3_CREAM, minWidth: 460 }}>
              <tbody>
                {ranges.map((r) => {
                  const inside = scrapsWithin(r, cuts);
                  return (
                    <tr key={r.take} style={{ borderTop: `1px solid ${V3_EDGE}` }}>
                      <td style={{ padding: "4px 10px 4px 0", fontWeight: r.take === takeIndex ? 800 : 600, color: r.take === takeIndex ? V3_GOLD : V3_CREAM, whiteSpace: "nowrap" }}>{r.take + 1}. {nameOf(r.take)}</td>
                      <td style={{ padding: "4px 10px 4px 0", fontVariantNumeric: "tabular-nums", color: V3_MUTED, whiteSpace: "nowrap" }}>{rangeText(r)}</td>
                      <td style={{ padding: "4px 10px 4px 0", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{clockOf(keptSeconds(r, cuts))} kept</td>
                      <td style={{ padding: "4px 0", color: inside.length ? RED : V3_MUTED, whiteSpace: "nowrap" }}>{inside.length ? `${inside.length} scrap${inside.length === 1 ? "" : "s"} out` : "no scraps"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: V3_MUTED, lineHeight: 1.5 }}>
            <b style={{ color: V3_CREAM }}>Download the edit script</b>, save it in the same folder as <b style={{ color: V3_CREAM }}>{file.name}</b> and double-click it — one video per split, scraps already out. Then open each split's row and pick its <b style={{ color: V3_CREAM }}>.partN</b> file{names.length ? "" : " (split names didn't load — files are numbered)"}.
          </div>
        </>
      )}

      {!slicing && (
        <>
          {!ref ? null : mine.length > 0 ? (
            <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 12, color: V3_CREAM, lineHeight: 1.55 }}>
              {[...mine].sort((a, b) => a.attemptStartMs - b.attemptStartMs).map((m, k) => (
                <li key={k}>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: RED, fontWeight: 700 }}>{clockOf(m.attemptStartMs / 1000)} → {clockOf(m.resumeMs / 1000)}</span>
                  <span style={{ color: V3_MUTED }}> · F3 at {clockOf(m.scrapMs / 1000)} · </span>
                  <span>{m.reason}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div style={{ marginTop: 8, fontSize: 12, color: V3_MUTED }}>No F3 scraps in this recording.</div>
          )}
          {/* THE PAUSES (2026-09-13) */}
          <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
            <span style={{ color: V3_MUTED }}>Pauses:</span>
            {(Object.keys(PAUSE_LEVELS) as PauseLevel[]).map((k) => (
              <button key={k} type="button" onClick={() => setLevel(k)} title={PAUSE_LEVELS[k]?.label ?? "Keep every pause"}
                style={{ font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, cursor: "pointer", border: `1px solid ${level === k ? V3_GOLD : V3_EDGE}`, background: level === k ? "rgba(252,163,17,0.14)" : "transparent", color: level === k ? V3_GOLD : V3_CREAM }}>
                {k === "off" ? "keep all" : k}
              </button>
            ))}
            <span style={{ color: V3_MUTED }}>
              {!words?.length ? "waiting for the transcript (step 2) to find them"
                : level === "off" ? "every pause stays"
                : `${pauses.length} out · ${clockOf(pauseSeconds)}${keepWindows.length ? " · pauses on speed-run slides kept" : speedIds.size && !log ? " · no timeline for this take, so speed-run slides aren't spared" : ""}`}
            </span>
          </div>
          {fileSeconds != null && cuts.some((r) => r.end > fileSeconds + 1) && (
            <div style={{ marginTop: 6, fontSize: 12, color: RED }}>A cut runs past the end of this file ({clockOf(fileSeconds)}) — this probably isn't that recording. Choose another above.</div>
          )}
          {single && (
            <div style={{ marginTop: 8, fontSize: 12, color: V3_MUTED, lineHeight: 1.5 }}>
              Takes out {clockOf(removed)}{fileSeconds != null ? ` — ${clockOf(Math.max(0, fileSeconds - removed))} left of ${clockOf(fileSeconds)}` : ""}. <b style={{ color: V3_CREAM }}>Download the edit script</b>, save it in the same folder as <b style={{ color: V3_CREAM }}>{file.name}</b> and double-click it. Then pick the <b style={{ color: V3_CREAM }}>.cut.mp4</b> it makes above — it plays right here before you post.
            </div>
          )}
        </>
      )}

      {block && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={downloadScript} title="A small Windows script that runs the edit from the folder you save it in. First time only: if ffmpeg isn't installed, the window tells you the one line to run. Windows may ask to run anyway for a downloaded script."
            style={{ font: "inherit", fontSize: 12.5, fontWeight: 800, padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.18)", color: V3_CREAM, cursor: "pointer", whiteSpace: "nowrap" }}>
            ⬇ Download the edit script
          </button>
        </div>
      )}
      {block && (
        <details style={{ marginTop: 6 }}>
        <summary style={{ fontSize: 11.5, color: V3_MUTED, cursor: "pointer" }}>or run it yourself in a terminal</summary>
        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <code style={{ flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "pre", fontSize: 11, color: V3_CREAM, background: "rgba(0,0,0,0.35)", border: `1px solid ${V3_EDGE}`, borderRadius: 6, padding: "6px 8px" }}>{block}</code>
          <button type="button" onClick={async () => { setCopied(await copyToClipboard(block)); window.setTimeout(() => setCopied(false), 1800); }}
            style={{ font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "5px 11px", borderRadius: 8, border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.12)", color: copied ? MINT : V3_CREAM, cursor: "pointer", whiteSpace: "nowrap" }}>
            {copied ? "copied" : slicing ? `Copy ${commands.length} commands` : "Copy command"}
          </button>
        </div>
        </details>
      )}
      {logErr && <div style={{ marginTop: 6, fontSize: 11.5, color: RED }}>Timelines couldn't be read: {logErr}</div>}
    </div>
  );
}
