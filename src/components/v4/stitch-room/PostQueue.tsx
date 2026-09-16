// THE POST QUEUE. Lee, 2026-09-15: "I don't want to post immediately. I'd rather queue it to quick post. Let
// these queue up in the order I send them there. Then I review everything and post it all in one batch."
// In the order he queued them (↑ ↓ to change it); each with its brand thumbnail; Post all goes top to bottom and
// stops at the first failure so nothing posts out of order.
import { useEffect, useMemo, useRef, useState } from "react";

import { ThumbnailArt } from "@/components/brand-kit/ThumbnailArt";
import { coverFor } from "@/components/v3/quick-post";
import { measureText } from "@/lib/brand-kit/measure";
import { defaultThumbSpec, seriesTitleCap, TITLE_TRACKING } from "@/lib/brand-kit/thumbnail";
import { colorwayFor, KIT, NEUTRAL_COLORWAY_ID } from "@/lib/brand-kit/tokens";
import { clock, queueOf, videoTitle, type StitchRecord } from "@/lib/film-stitch";
import { suggestStitchNames } from "@/lib/film-names.functions";
import type { V4VideoBrief } from "@/lib/v4.functions";
import { queueFilmStitch, renameFilmStitch, reorderFilmStitchQueue } from "@/lib/film-stitch.functions";

import { ROOM } from "./room-theme";
import { postStitch } from "./stitch-render";
import { track } from "@/lib/analytics";

function thumbFor(r: StitchRecord) {
  const c = coverFor(r.name);
  const base = defaultThumbSpec({ exam: 1, part: r.topicName || "Easy Points", kicker: "", visualType: "concept", concept: { kind: "bolt", text: "" } });
  const spec = { ...base, title: c.title, variant: c.variant };
  return { ...spec, titleCap: seriesTitleCap([spec], (t: string, s: number) => measureText(t, s, 900, KIT.display, TITLE_TRACKING)) };
}

/** THE NAME FIELD (Lee, 2026-09-16: seven "#N - Accounting equation effects" in a row): each queued video is named
 *  right here — the thumbnail redraws from it — with the video's first question offered as a starting point. */
function NameField({ r, suggest, onSaved }: { r: StitchRecord; suggest?: string; onSaved: (r: StitchRecord) => void }) {
  const [v, setV] = useState(r.name);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(r.name), [r.name]);
  const save = async (name: string) => {
    const next = name.trim();
    if (next === r.name.trim()) { setV(next); return; }
    setBusy(true);
    try { onSaved(await renameFilmStitch({ data: { id: r.id, name: next } })); } catch { setV(r.name); } finally { setBusy(false); }
  };
  const same = !v.trim() || v.trim() === (r.setName ?? "").trim();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span style={{ fontWeight: 800, color: ROOM.muted, flex: "none" }}>#{r.takeIndex + 1}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => void save(v)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setV(r.name); }}
        placeholder={suggest || "Name this video"} disabled={busy} aria-label="Video name"
        style={{ font: "inherit", fontWeight: 800, fontSize: 14, color: ROOM.cream, background: "rgba(0,0,0,0.25)", border: `1px solid ${same ? ROOM.gold : ROOM.edge}`, borderRadius: 7, padding: "3px 8px", flex: 1, minWidth: 0 }} />
      {same && suggest && <button type="button" onClick={() => { setV(suggest); void save(suggest); }} title="Use the first question as the name" style={{ font: "inherit", fontSize: 11.5, fontWeight: 800, color: ROOM.gold, background: "transparent", border: `1px solid ${ROOM.gold}66`, borderRadius: 7, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>Use question</button>}
    </div>
  );
}

export function PostQueue({ records, onChange, onOpen, suggestName, briefOf }: { records: readonly StitchRecord[]; onChange: (r?: StitchRecord) => void; onOpen?: (r: StitchRecord) => void; suggestName?: (r: StitchRecord) => string; briefOf?: (r: StitchRecord) => V4VideoBrief | undefined }) {
  const [naming, setNaming] = useState(false);
  /** Every queued video still wearing its set's name (or none) — the ones "✨ Name them" fills; a hand-typed name stays. */
  const unnamed = (list: readonly StitchRecord[]) => list.filter((r) => !r.name.trim() || r.name.trim() === (r.setName ?? "").trim());
  const nameThem = async (all: boolean) => {
    const list = all ? queueOf(records) : unnamed(queueOf(records));
    if (!list.length || !briefOf) return;
    setNaming(true); setErr(null);
    try {
      const bySet = new Map<string, StitchRecord[]>();
      for (const r of list) bySet.set(r.setId, [...(bySet.get(r.setId) ?? []), r]);
      for (const [, group] of bySet) {
        const videos = group.map((r) => { const b = briefOf(r); return { id: r.id, takeIndex: r.takeIndex, first: b?.first ?? "", last: b?.last ?? "", stems: b?.stems ?? [] }; });
        const { names } = await suggestStitchNames({ data: { setName: group[0].setName ?? "", topicName: group[0].topicName ?? "", videos } });
        for (const r of group) { const name = names[r.id]; if (name) onChange(await renameFilmStitch({ data: { id: r.id, name } })); }
      }
      track("stitch_names_suggested", { videos: list.length, all });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setNaming(false); }
  };
  const queue = useMemo(() => queueOf(records), [records]);
  const arts = useRef(new Map<string, SVGSVGElement | null>());
  const [status, setStatus] = useState<Record<string, { note: string; tone: "work" | "good" | "bad" }>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const posted = records.filter((r) => r.status === "posted").sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")).slice(0, 8);

  const move = async (i: number, d: -1 | 1) => {
    const ids = queue.map((r) => r.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await reorderFilmStitchQueue({ data: { ids } }); onChange(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const unqueue = async (r: StitchRecord) => {
    try { onChange(await queueFilmStitch({ data: { id: r.id, queued: false } })); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const postAll = async () => {
    setBusy(true); setErr(null);
    for (const r of queue) {
      const svg = arts.current.get(r.id);
      const say = (note: string) => setStatus((s) => ({ ...s, [r.id]: { note, tone: "work" } }));
      try {
        if (!svg) throw new Error("The thumbnail isn't drawn yet.");
        const done = await postStitch(r, svg, say);
        setStatus((s) => ({ ...s, [r.id]: { note: "✓ posted", tone: "good" } }));
        track("stitch_posted", { set_id: r.setId, video: r.takeIndex + 1, slides: r.slides });
        onChange(done);
      } catch (e) {
        setStatus((s) => ({ ...s, [r.id]: { note: e instanceof Error ? e.message : String(e), tone: "bad" } }));
        setErr("Stopped at the first one that failed, so nothing posts out of order. Fix it and press Post all again.");
        break;
      }
    }
    setBusy(false);
  };

  const btn = (strong = false): React.CSSProperties => ({ font: "inherit", fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 7, cursor: "pointer", border: `1px solid ${strong ? ROOM.gold : ROOM.edge}`, background: strong ? ROOM.gold : "transparent", color: strong ? "#14213D" : ROOM.cream, whiteSpace: "nowrap" });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, color: ROOM.cream, fontFamily: ROOM.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <b style={{ fontSize: 16 }}>Post queue</b>
        <span style={{ color: ROOM.muted, fontSize: 12 }}>{queue.length} waiting · posts top to bottom</span>
        <span style={{ flex: 1 }} />
        {/* THE NAMES (Lee, 2026-09-16: "I want to have AI generate some on queue to post"): one short name per
            queued video from what its slides say; shift-click renames every queued video, hand-typed ones too. */}
        {briefOf && queue.length > 0 && (
          <button type="button" style={btn()} disabled={busy || naming} onClick={(e) => void nameThem(e.shiftKey)}
            title={unnamed(queue).length ? `Name the ${unnamed(queue).length} still wearing the set's name (shift-click: all ${queue.length})` : `Every queued video has a name — shift-click to redo all ${queue.length}`}>
            {naming ? "Naming…" : `✨ Name them${unnamed(queue).length ? ` · ${unnamed(queue).length}` : ""}`}
          </button>
        )}
        <button type="button" style={btn(true)} disabled={busy || !queue.length} onClick={() => void postAll()}>{busy ? "Posting…" : `Post all ${queue.length}`}</button>
      </div>
      {err && <div style={{ color: ROOM.red, fontSize: 12 }}>{err}</div>}
      {queue.length === 0 && <div style={{ color: ROOM.muted, fontSize: 13 }}>Nothing queued. Open a stitched video and press “Queue to post”.</div>}
      {queue.map((r, i) => {
        const st = status[r.id];
        return (
          <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", background: ROOM.panel, border: `1px solid ${ROOM.edge}`, borderRadius: 10, padding: 8 }}>
            <span style={{ width: 20, textAlign: "right", color: ROOM.muted, fontWeight: 800 }}>{i + 1}</span>
            <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${ROOM.edge}`, flex: "none" }}>
              <ThumbnailArt ref={(el) => { arts.current.set(r.id, el); }} spec={thumbFor(r)} colorway={colorwayFor(NEUTRAL_COLORWAY_ID)} mode="social" width={54} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <NameField r={r} suggest={suggestName?.(r)} onSaved={(x) => onChange(x)} />
              <div style={{ fontSize: 11.5, color: ROOM.muted, marginTop: 3 }}>{r.setName} · {clock(r.durationS)} · {r.slides} slides{onOpen && <> · <button type="button" onClick={() => onOpen(r)} style={{ all: "unset", cursor: "pointer", color: ROOM.sky, fontWeight: 700 }}>open</button></>}</div>
              {st && <div style={{ fontSize: 11.5, color: st.tone === "good" ? ROOM.mint : st.tone === "bad" ? ROOM.red : ROOM.gold }}>{st.note}</div>}
            </div>
            <button type="button" style={btn()} disabled={busy || i === 0} onClick={() => void move(i, -1)} title="Earlier">↑</button>
            <button type="button" style={btn()} disabled={busy || i === queue.length - 1} onClick={() => void move(i, 1)} title="Later">↓</button>
            <button type="button" style={{ ...btn(), color: ROOM.red }} disabled={busy} onClick={() => void unqueue(r)} title="Take it out of the queue (the video stays)">✕</button>
          </div>
        );
      })}
      {posted.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.12em", color: ROOM.muted, fontWeight: 800 }}>RECENTLY POSTED</div>
          {posted.map((r) => (
            <div key={r.id} style={{ fontSize: 12.5, display: "flex", gap: 8 }}>
              <span style={{ color: ROOM.mint }}>✓</span>
              <span style={{ flex: 1 }}>{videoTitle(r.takeIndex, r.name)} <span style={{ color: ROOM.muted }}>· {r.setName}</span></span>
              {r.postedLink && <a href={r.postedLink} target="_blank" rel="noreferrer" style={{ color: ROOM.sky }}>see it</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
