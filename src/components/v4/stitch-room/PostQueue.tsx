// THE POST QUEUE. Lee, 2026-09-15: "I don't want to post immediately. I'd rather queue it to quick post. Let
// these queue up in the order I send them there. Then I review everything and post it all in one batch."
// In the order he queued them (↑ ↓ to change it); each with its brand thumbnail; Post all goes top to bottom and
// stops at the first failure so nothing posts out of order.
import { useMemo, useRef, useState } from "react";

import { ThumbnailArt } from "@/components/brand-kit/ThumbnailArt";
import { coverFor } from "@/components/v3/quick-post";
import { measureText } from "@/lib/brand-kit/measure";
import { defaultThumbSpec, seriesTitleCap, TITLE_TRACKING } from "@/lib/brand-kit/thumbnail";
import { colorwayFor, KIT, NEUTRAL_COLORWAY_ID } from "@/lib/brand-kit/tokens";
import { clock, money, queueOf, type StitchRecord } from "@/lib/film-stitch";
import { queueFilmStitch, reorderFilmStitchQueue } from "@/lib/film-stitch.functions";

import { ROOM } from "./room-theme";
import { postStitch } from "./stitch-render";

function thumbFor(r: StitchRecord) {
  const c = coverFor(r.name);
  const base = defaultThumbSpec({ exam: 1, part: r.topicName || "Easy Points", kicker: "", visualType: "concept", concept: { kind: "bolt", text: "" } });
  const spec = { ...base, title: c.title, variant: c.variant };
  return { ...spec, titleCap: seriesTitleCap([spec], (t: string, s: number) => measureText(t, s, 900, KIT.display, TITLE_TRACKING)) };
}

export function PostQueue({ records, onChange, onOpen }: { records: readonly StitchRecord[]; onChange: (r?: StitchRecord) => void; onOpen?: (r: StitchRecord) => void }) {
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
              {onOpen ? <button type="button" onClick={() => onOpen(r)} style={{ all: "unset", cursor: "pointer", fontWeight: 800 }}>{r.name || `Video ${r.takeIndex + 1}`}</button> : <b>{r.name}</b>}
              <div style={{ fontSize: 11.5, color: ROOM.muted }}>{r.setName} · Video {r.takeIndex + 1} · {clock(r.durationS)} · {r.slides} slides · {money(r.payCents)}</div>
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
              <span style={{ flex: 1 }}>{r.name} <span style={{ color: ROOM.muted }}>· {r.setName}</span></span>
              {r.postedLink && <a href={r.postedLink} target="_blank" rel="noreferrer" style={{ color: ROOM.sky }}>see it</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
