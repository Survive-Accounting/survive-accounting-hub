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
import { keptSeconds, rangeText, scrapsWithin, sliceCommands, splitRanges } from "@/components/blastoff/take-slice";
import { loadBlastPlan } from "@/lib/blastoff.functions";
import { listScrapMarks } from "@/lib/frame-events.functions";
import { listTakeLogs, type TakeLogRow } from "@/lib/take-log.functions";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

const RED = "#FF8B7E";
const MINT = "#3BF5A0";

/** `takeIndex` null = a recording of the whole set (the ✂ Slice a recording door on /v3/post). */
export function ScrapCuts({ setId, takeIndex, file, fileSeconds }: { setId: string; takeIndex: number | null; file: File; fileSeconds: number | null }) {
  const [marks, setMarks] = useState<ScrapMark[] | null>(null);
  const [logs, setLogs] = useState<TakeLogRow[]>([]);
  const [logErr, setLogErr] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pickedRef, setPickedRef] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      .then((p) => { if (alive && p) setNames(planTakes(filmFrames(p.frames as never)).map((t) => takeLabel(t))); })
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
  if (!refs.length) {
    return (
      <div style={{ marginTop: 8, fontSize: 12, color: V3_MUTED }}>
        No F3 scraps or saved timeline for this split — nothing to cut.
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
  const single = !slicing ? ffmpegCutCommand(file.name, cuts) : "";
  const block = slicing ? commands.join("\n") : single;
  const removed = cuts.reduce((s, r) => s + (r.end - r.start), 0);
  const when = (r: string) => { const p = parseTakeRef(r); return p ? new Date(p.rolledAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }) : r; };
  const countFor = (r: string) => marks.filter((m) => m.takeRef === r).length;

  return (
    <div style={{ marginTop: 10, border: `1px solid ${V3_EDGE}`, borderRadius: 10, padding: "10px 12px", background: slicing ? "rgba(252,163,17,0.05)" : "rgba(255,90,95,0.05)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <b style={{ color: V3_CREAM, fontSize: 13 }}>{slicing ? `✂ One recording, ${ranges.length} splits` : "✗ F3 scraps"}</b>
        <span style={{ fontSize: 12, color: V3_MUTED }}>
          {ref ? (pickedRef ? "recording you chose" : "matched to this file") + ` — rolled ${when(ref)}` : "no recording matched this file's start time — pick the one it is:"}
        </span>
        <select value={ref ?? ""} onChange={(e) => setPickedRef(e.target.value || null)}
          style={{ font: "inherit", fontSize: 11.5, background: "#0B0F1E", color: V3_CREAM, border: `1px solid ${V3_EDGE}`, borderRadius: 6, padding: "2px 6px" }}>
          <option value="">{auto ? "— the match —" : "— choose —"}</option>
          {refs.map((r) => <option key={r} value={r}>{when(r)}{parseTakeRef(r)?.takeIndex === null ? " · whole set" : ""} · {countFor(r)} scrap{countFor(r) === 1 ? "" : "s"}</option>)}
        </select>
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
            Run these in the folder that holds <b style={{ color: V3_CREAM }}>{file.name}</b> — one video per split, scraps already out. Then open each split's row and pick its <b style={{ color: V3_CREAM }}>.partN</b> file{names.length ? "" : " (split names didn't load — files are numbered)"}.
          </div>
        </>
      )}

      {ref && !slicing && (
        <>
          {mine.length > 0 ? (
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
            <div style={{ marginTop: 8, fontSize: 12, color: V3_MUTED }}>No scraps in this recording — nothing to cut.</div>
          )}
          {fileSeconds != null && cuts.some((r) => r.end > fileSeconds + 1) && (
            <div style={{ marginTop: 6, fontSize: 12, color: RED }}>A cut runs past the end of this file ({clockOf(fileSeconds)}) — this probably isn't that recording. Choose another above.</div>
          )}
          {single && (
            <div style={{ marginTop: 8, fontSize: 12, color: V3_MUTED, lineHeight: 1.5 }}>
              Removes {clockOf(removed)}{fileSeconds != null ? ` of ${clockOf(fileSeconds)}` : ""}. Run this in the folder that holds <b style={{ color: V3_CREAM }}>{file.name}</b>, then pick the <b style={{ color: V3_CREAM }}>.cut.mp4</b> it writes as the take:
            </div>
          )}
        </>
      )}

      {ref && block && (
        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <code style={{ flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "pre", fontSize: 11, color: V3_CREAM, background: "rgba(0,0,0,0.35)", border: `1px solid ${V3_EDGE}`, borderRadius: 6, padding: "6px 8px" }}>{block}</code>
          <button type="button" onClick={async () => { setCopied(await copyToClipboard(block)); window.setTimeout(() => setCopied(false), 1800); }}
            style={{ font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "5px 11px", borderRadius: 8, border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.12)", color: copied ? MINT : V3_CREAM, cursor: "pointer", whiteSpace: "nowrap" }}>
            {copied ? "copied" : slicing ? `Copy ${commands.length} commands` : "Copy command"}
          </button>
        </div>
      )}
      {logErr && <div style={{ marginTop: 6, fontSize: 11.5, color: RED }}>Timelines couldn't be read: {logErr}</div>}
    </div>
  );
}
