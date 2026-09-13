// THE CUT LIST (2026-09-13) — Post's side of F3 on /film (capture/scrap.tsx). Lee: "if we keep that
// take, is to auto-edit out that portion."
//
// Every scrap made while OBS was recording is a stretch to remove: from when that attempt at the
// slide began to the F3 that restarted it. Once a take file is picked, this finds the recording it
// is (matchRoll: the F4 nearest the file's start), lists the cuts with the reason he gave, and hands
// him ONE ffmpeg command that writes `<name>.cut.mp4` with those stretches gone. Pick that file
// instead and post it.
//
// HONEST ABOUT WHAT IS AUTOMATIC: the marks and the command are; running it is a paste into a
// terminal on the machine holding the file. The render worker could run it later — it isn't wired.
import { useEffect, useMemo, useState } from "react";

import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { clockOf, cutRanges, ffmpegCutCommand, matchRoll, parseTakeRef, type ScrapMark } from "@/components/blastoff/frame-events";
import { listScrapMarks } from "@/lib/frame-events.functions";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

const RED = "#FF8B7E";

export function ScrapCuts({ setId, takeIndex, file, fileSeconds }: { setId: string; takeIndex: number; file: File; fileSeconds: number | null }) {
  const [marks, setMarks] = useState<ScrapMark[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pickedRef, setPickedRef] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setMarks(null); setErr(null); setPickedRef(null);
    listScrapMarks({ data: { setId } })
      .then((r) => { if (!alive) return; if (r.ok) setMarks(r.marks); else setErr(r.error); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [setId, file]);

  const isCut = /\.cut\.[a-z0-9]+$/i.test(file.name);
  const auto = useMemo(() => (marks && fileSeconds != null ? matchRoll(marks, takeIndex, file.lastModified, fileSeconds) : null), [marks, takeIndex, file, fileSeconds]);
  const ref = pickedRef ?? auto;
  // The other recordings of this split with scraps, newest first — for when the match misses.
  const rolls = useMemo(() => {
    const out: string[] = [];
    for (const m of marks ?? []) {
      const p = parseTakeRef(m.takeRef);
      if (p && (p.takeIndex === null || p.takeIndex === takeIndex) && !out.includes(m.takeRef)) out.push(m.takeRef);
    }
    return out.sort((a, b) => (parseTakeRef(b)?.rolledAt ?? "").localeCompare(parseTakeRef(a)?.rolledAt ?? ""));
  }, [marks, takeIndex]);

  if (isCut) return <div style={{ marginTop: 8, fontSize: 12, color: "#3BF5A0" }}>This is a cut take (.cut) — the scrapped stretches are already out.</div>;
  if (err) return <div style={{ marginTop: 8, fontSize: 12, color: RED }}>Couldn't read the F3 scraps: {err}</div>;
  if (!marks) return <div style={{ marginTop: 8, fontSize: 12, color: V3_MUTED }}>Checking for F3 scraps…</div>;
  if (!rolls.length) return <div style={{ marginTop: 8, fontSize: 12, color: V3_MUTED }}>No F3 scraps on this split — nothing to cut.</div>;

  const mine = ref ? marks.filter((m) => m.takeRef === ref) : [];
  const ranges = cutRanges(mine);
  const removed = ranges.reduce((s, r) => s + (r.end - r.start), 0);
  const cmd = ffmpegCutCommand(file.name, ranges);
  const when = (r: string) => { const p = parseTakeRef(r); return p ? new Date(p.rolledAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }) : r; };

  return (
    <div style={{ marginTop: 10, border: `1px solid ${V3_EDGE}`, borderRadius: 10, padding: "10px 12px", background: "rgba(255,90,95,0.05)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <b style={{ color: V3_CREAM, fontSize: 13 }}>✗ F3 scraps</b>
        <span style={{ fontSize: 12, color: V3_MUTED }}>
          {ref ? (pickedRef ? "recording you chose" : "matched to this file") + ` — rolled ${when(ref)}` : "no recording matched this file's start time — pick the one it is:"}
        </span>
        <select value={ref ?? ""} onChange={(e) => setPickedRef(e.target.value || null)}
          style={{ font: "inherit", fontSize: 11.5, background: "#0B0F1E", color: V3_CREAM, border: `1px solid ${V3_EDGE}`, borderRadius: 6, padding: "2px 6px" }}>
          <option value="">{auto ? "— the match —" : "— choose —"}</option>
          {rolls.map((r) => <option key={r} value={r}>{when(r)} · {marks.filter((m) => m.takeRef === r).length} scrap{marks.filter((m) => m.takeRef === r).length === 1 ? "" : "s"}</option>)}
        </select>
      </div>
      {ref && (
        <>
          <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 12, color: V3_CREAM, lineHeight: 1.55 }}>
            {[...mine].sort((a, b) => a.attemptStartMs - b.attemptStartMs).map((m, k) => (
              <li key={k}>
                <span style={{ fontVariantNumeric: "tabular-nums", color: RED, fontWeight: 700 }}>{clockOf(m.attemptStartMs / 1000)} → {clockOf(m.resumeMs / 1000)}</span>
                <span style={{ color: V3_MUTED }}> · F3 at {clockOf(m.scrapMs / 1000)} · </span>
                <span>{m.reason}</span>
              </li>
            ))}
          </ol>
          {fileSeconds != null && ranges.some((r) => r.end > fileSeconds + 1) && (
            <div style={{ marginTop: 6, fontSize: 12, color: RED }}>A cut runs past the end of this file ({clockOf(fileSeconds)}) — this probably isn't that recording. Choose another above.</div>
          )}
          <div style={{ marginTop: 8, fontSize: 12, color: V3_MUTED, lineHeight: 1.5 }}>
            Removes {clockOf(removed)}{fileSeconds != null ? ` of ${clockOf(fileSeconds)}` : ""}. Run this in the folder that holds <b style={{ color: V3_CREAM }}>{file.name}</b>, then pick the <b style={{ color: V3_CREAM }}>.cut.mp4</b> it writes as the take:
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <code style={{ flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "pre", fontSize: 11, color: V3_CREAM, background: "rgba(0,0,0,0.35)", border: `1px solid ${V3_EDGE}`, borderRadius: 6, padding: "6px 8px" }}>{cmd}</code>
            <button type="button" onClick={async () => { setCopied(await copyToClipboard(cmd)); window.setTimeout(() => setCopied(false), 1800); }}
              style={{ font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "5px 11px", borderRadius: 8, border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.12)", color: copied ? "#3BF5A0" : V3_CREAM, cursor: "pointer", whiteSpace: "nowrap" }}>
              {copied ? "copied" : "Copy command"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
