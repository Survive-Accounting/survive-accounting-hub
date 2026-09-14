// /v4/$topic/$set/studio — BUILD A SPLIT AND FILM IT, ON ONE SCREEN.
//
// Lee, 2026-09-13: "The way I like to make these is not prep everything and then make — it's prep on
// the spot, make on the spot … I build a split and I make that video right away, and if I want to
// stop at a specific point and scrap it, then add a few slides and bolt them on, I want to be able to
// do that … I want just a new UI. It's complicated, there's too much going on. Next split would be
// great when in film mode. I've wasted a ton of time clicking between results and film, reopening
// the film window."
//
// So one page, three things and nothing else:
//   SPLITS  (left)   — pick one; it's what the film window is on. Rename, see the slide count flag.
//   SLIDES  (middle) — the picked split, top to bottom. Type straight into a slide; add a slide
//                      anywhere (or right after whatever is ON AIR); move, skip, delete, end the
//                      split here. Every change saves and lands in the open film window at once
//                      (usePlan's live channel) — no reloading, no reopening.
//   FILM    (header) — one button opens the 9:16 film window on the picked split. Picking another
//                      split moves that window; "Film from here" jumps it to a slide.
// Heavier slide types (maps, rubrics, pictures) stay in the full Editor — one link away.
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CRAM_NOT_LECTURE } from "@/components/brand-cards/slogans";
import { usePlan } from "@/components/blastoff/BlastOffEditor";
import { FILM_ACTIVE_KEY, POPOUT_STALE_MS, readFilmActive } from "@/components/blastoff/capture/prompter-sync";
import { POPOUT_BLOCKED, POPOUT_FEATURES, POPOUT_NAME } from "@/components/blastoff/capture/popout";
import {
  FRAME_LABEL, canRemove, cutAfterFrame, duplicateFrame, filmFrames, insertFrame, moveFrame, nameTake, newFrameId, patchFrame,
  planTakes, removeFrame, standardOpener, takeLabel, toggleSkip, type BlastFrame, type BlastFrameKind, type PlanTake,
} from "@/components/blastoff/plan";
import { contentCount, countText, frameFlag } from "@/components/blastoff/reel";
import { V3Note, V3Shell, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

const MINT = "#7BD3A8";
const RED = "#FF8A7A";
const AMBER = "#FFC46B";
const CARD = "rgba(255,255,255,0.035)";

/** The slides you can add from here — the talking-point kinds. Everything else: the full Editor. */
const ADD_KINDS: { kind: BlastFrameKind; label: string }[] = [
  { kind: "phrase", label: "Memorize this" },
  { kind: "cheat", label: "Cheat code" },
  { kind: "tip", label: "Go deeper" },
  { kind: "tricky", label: "Tricky" },
  { kind: "found", label: "Exam question" },
  { kind: "ask", label: "Ask yourself" },
  { kind: "blank", label: "Blank" },
  { kind: "outro", label: "Outro" },
];

/** Split + slide signals the film windows listen for (BlastOffCapture). */
const splitKey = (setId: string) => `sa-film-split:${setId}`;
const gotoKey = (setId: string) => `sa-film-goto:${setId}`;
function signal(key: string, value: Record<string, unknown>) {
  try { window.localStorage.setItem(key, JSON.stringify({ ...value, at: Date.now() })); } catch { /* storage blocked */ }
}

const btn = (tone: "plain" | "gold" | "ghost" = "plain"): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 800, fontFamily: "inherit",
  border: `1px solid ${tone === "gold" ? V3_GOLD : V3_EDGE}`,
  background: tone === "gold" ? V3_GOLD : "transparent",
  color: tone === "gold" ? "#14213D" : tone === "ghost" ? V3_MUTED : V3_CREAM,
});
const tiny: React.CSSProperties = { ...btn("ghost"), padding: "3px 8px", fontSize: 12, fontWeight: 700 };
const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.28)", color: V3_CREAM, border: `1px solid ${V3_EDGE}`,
  borderRadius: 8, padding: "7px 9px", fontSize: 14, fontFamily: "inherit", resize: "vertical",
};

export function StudioPage({ topicKey, setKey }: { topicKey: string; setKey: string }) {
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);
  return (
    <V3Shell wide crumbs={[{ label: "V4", to: "/v4" }, { label: set?.name ?? setKey }]}>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}” in “{topicKey}”.</V3Note>}
      {set && topic && <Studio key={set.id} set={set} topic={topic} topicKey={topicKey} setKey={setKey} />}
    </V3Shell>
  );
}

/** Which slide the film window has up, if it's this set's and the window is alive. */
function useOnAir(setId: string): string | null {
  const [on, setOn] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const r = readFilmActive();
      setOn(r && r.setId === setId && Date.now() - r.at < POPOUT_STALE_MS * 3 ? r.qId ?? null : null);
    };
    read();
    const onStorage = (e: StorageEvent) => { if (e.key === FILM_ACTIVE_KEY) read(); };
    window.addEventListener("storage", onStorage);
    const t = window.setInterval(read, 2000);
    return () => { window.removeEventListener("storage", onStorage); window.clearInterval(t); };
  }, [setId]);
  return on;
}

function Studio({ set, topic, topicKey, setKey }: { set: BoothSetInfo; topic: BoothTopic; topicKey: string; setKey: string }) {
  const { plan, commit, saving, undo } = usePlan(set);
  const [sel, setSel] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const airNode = useOnAir(set.id);
  const ceqById = useMemo(() => new Map(set.ceqs.map((c) => [c.id, c])), [set.ceqs]);
  const frames = plan?.frames ?? [];
  // The record names a card by its CEQ node id and anything else as "blast-<frame id>".
  const onAir = !airNode ? null : airNode.startsWith("blast-") ? airNode.slice(6) : frames.find((f) => f.kind === "ceq" && f.ceqId === airNode && !f.skipped)?.id ?? null;
  // Splits over EVERY frame (skipped ones included, greyed) so the list edits what's really there;
  // the film numbering is over the filmed frames — the same split index either way, since a skip
  // never carries a cut away.
  const takes = useMemo(() => planTakes(frames), [frames]);
  const filmTakes = useMemo(() => planTakes(filmFrames(frames)), [frames]);
  const cur = takes[Math.min(sel, Math.max(0, takes.length - 1))];
  const isV4 = frames.some((f) => f.v4Bound);
  const flash = useCallback((m: string) => { setNote(m); window.setTimeout(() => setNote((x) => (x === m ? null : x)), 3500); }, []);

  // The on-air slide's split becomes the picked one — the page follows the camera.
  const lastAir = useRef<string | null>(null);
  useEffect(() => {
    if (!onAir || onAir === lastAir.current) return;
    lastAir.current = onAir;
    const t = takes.find((x) => x.frames.some((f) => f.id === onAir));
    if (t && t.index !== sel) setSel(t.index);
  }, [onAir, takes, sel]);

  // Ctrl+Z on the page (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (undo()) flash("Undone"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, flash]);

  const filmPath = blastOffPath(topic, set, "film");
  const openFilm = (take: number) => {
    let w: Window | null = null;
    try { w = window.open(`${filmPath}?popout=1&take=${take}`, POPOUT_NAME, POPOUT_FEATURES); } catch { w = null; }
    if (!w) { flash(POPOUT_BLOCKED); return; }
    try { w.focus(); } catch { /* ignore */ }
  };
  const pick = (k: number) => { setSel(k); signal(splitKey(set.id), { take: k }); };
  const filmFromHere = (f: BlastFrame) => { signal(gotoKey(set.id), { frameId: f.id }); flash("Film window → this slide"); };

  const add = (kind: BlastFrameKind, afterId: string) => {
    const at = frames.findIndex((f) => f.id === afterId);
    const f: BlastFrame = { id: newFrameId(kind), kind };
    commit(insertFrame(frames, f, at));
    setFocusId(f.id);
  };
  const [focusId, setFocusId] = useState<string | null>(null);
  const move = (id: string, d: -1 | 1) => {
    const i = frames.findIndex((f) => f.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= frames.length) return;
    commit(moveFrame(frames, i, j));
  };
  const endSplitHere = (f: BlastFrame) => {
    const wasCut = !!f.cutAfter;
    commit(cutAfterFrame(frames, f.id, standardOpener(set.name, CRAM_NOT_LECTURE)));
    flash(wasCut ? "Split joined back up — the outro and opener it added are still there, delete them if you don't want them" : "New split starts after this slide — outro and opener added");
  };

  if (!plan) return <V3Note>Loading the slides…</V3Note>;
  const onAirTake = onAir ? takes.find((t) => t.frames.some((f) => f.id === onAir)) : undefined;

  return (
    <div style={{ color: V3_CREAM }}>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 28, fontWeight: 900, margin: 0 }}>{set.name}</h1>
        <span style={{ fontSize: 12.5, color: V3_MUTED }}>{topic.name} · {takes.length} split{takes.length === 1 ? "" : "s"}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: saving?.startsWith("⚠") ? RED : V3_MUTED }}>{saving ?? ""}</span>
        <span style={{ fontSize: 12, color: onAir ? RED : V3_MUTED, fontWeight: 800 }}>{onAir ? `● film window on ${onAirTake ? takeLabel(onAirTake) : "this set"}` : "film window closed"}</span>
        <button type="button" style={btn("gold")} onClick={() => openFilm(cur?.index ?? 0)}>🎬 Open film window</button>
        <Link to="/v3/$topic/$set/blast-off/results" params={{ topic: topicKey, set: setKey }} style={{ ...btn("ghost"), textDecoration: "none" }}>Full editor ↗</Link>
      </div>
      <div style={{ fontSize: 12, color: V3_MUTED, marginBottom: 14 }}>
        In the film window: <b style={{ color: V3_CREAM }}>Space</b> next slide · <b style={{ color: V3_CREAM }}>F3</b> scrap · <b style={{ color: V3_CREAM }}>]</b> next split · <b style={{ color: V3_CREAM }}>[</b> previous split. Edits here show up there right away.
      </div>
      {note && <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#0B1220", border: `1px solid ${V3_GOLD}`, color: V3_CREAM, padding: "8px 14px", borderRadius: 10, fontSize: 13, zIndex: 50 }}>{note}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
        {/* SPLITS */}
        <div style={{ position: "sticky", top: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {takes.map((t) => {
            const filmT = filmTakes[t.index];
            const count = filmT ? contentCount(filmT.frames) : 0;
            const flag = frameFlag(count);
            const on = t.index === cur?.index;
            const air = onAirTake?.index === t.index;
            return (
              <div key={t.headId || t.index} onClick={() => pick(t.index)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") pick(t.index); }}
                style={{ cursor: "pointer", borderRadius: 10, padding: "8px 10px", border: `1px solid ${on ? V3_GOLD : V3_EDGE}`, background: on ? "rgba(252,163,17,0.08)" : CARD }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 900, fontSize: 13, color: on ? V3_GOLD : V3_CREAM }}>{t.index + 1}</span>
                  <span style={{ fontWeight: 800, fontSize: 13.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name || takeLabel(t)}</span>
                  {air && <span style={{ color: RED, fontSize: 11, fontWeight: 900 }}>● ON AIR</span>}
                </div>
                <div style={{ fontSize: 11.5, color: flag === "over" ? RED : flag === "long" ? AMBER : V3_MUTED, marginTop: 2 }}>
                  {countText(count)} content slide{count === 1 ? "" : "s"} · {t.frames.length} total
                </div>
                {on && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button type="button" style={tiny} onClick={(e) => { e.stopPropagation(); openFilm(t.index); }}>🎬 film this</button>
                    <button type="button" style={tiny} onClick={(e) => {
                      e.stopPropagation();
                      const name = window.prompt("Name this split", t.name) ?? null;
                      if (name !== null && t.headId) commit(nameTake(frames, t.headId, name));
                    }}>rename</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* SLIDES */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {cur && cur.frames.map((f, k) => (
            <div key={f.id}>
              {k === 0 && <AddBar onAdd={(kind) => {
                // Before the split's first slide: insert after the slide before it (or at the very top).
                const at = frames.findIndex((x) => x.id === f.id);
                const nf: BlastFrame = { id: newFrameId(kind), kind };
                commit(insertFrame(frames, nf, at - 1));
                setFocusId(nf.id);
              }} />}
              <SlideCard
                f={f} n={k + 1} onAir={onAir === f.id} focus={focusId === f.id} onFocused={() => setFocusId(null)}
                stem={f.kind === "ceq" && f.ceqId ? ceqById.get(f.ceqId)?.stem ?? "(card not found)" : undefined}
                onPatch={(patch) => commit(patchFrame(frames, f.id, patch))}
                onMove={(d) => move(f.id, d)}
                onDuplicate={() => commit(duplicateFrame(frames, f.id))}
                onSkip={() => commit(toggleSkip(frames, f.id))}
                onRemove={canRemove(frames, f) ? () => commit(removeFrame(frames, f.id)) : undefined}
                onEndSplit={isV4 ? undefined : () => endSplitHere(f)}
                onFilmFromHere={() => filmFromHere(f)}
              />
              <AddBar highlight={onAir === f.id} onAdd={(kind) => add(kind, f.id)} />
            </div>
          ))}
          {isV4 && <div style={{ fontSize: 12, color: V3_MUTED, marginTop: 8 }}>This is a v4 topic — its splits are set on the <Link to="/v4/$topic/$set/$step" params={{ topic: topicKey, set: setKey, step: "split" }} style={{ color: V3_GOLD }}>Split step</Link>.</div>}
        </div>
      </div>
    </div>
  );
}

function AddBar({ onAdd, highlight = false }: { onAdd: (kind: BlastFrameKind) => void; highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0 4px 34px", minHeight: 22, flexWrap: "wrap" }}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} style={{ ...tiny, borderStyle: "dashed", color: highlight ? V3_GOLD : V3_MUTED, borderColor: highlight ? V3_GOLD : V3_EDGE }}>
          + slide{highlight ? " after what's on air" : ""}
        </button>
      ) : (
        <>
          {ADD_KINDS.map((a) => <button key={a.kind} type="button" style={tiny} onClick={() => { onAdd(a.kind); setOpen(false); }}>{a.label}</button>)}
          <button type="button" style={{ ...tiny, border: 0 }} onClick={() => setOpen(false)}>cancel</button>
        </>
      )}
    </div>
  );
}

/** The words a slide carries, by kind: cheat codes have a title and body, most have text, and
 *  callouts can have bullet lines. */
function SlideCard({ f, n, stem, onAir, focus, onFocused, onPatch, onMove, onDuplicate, onSkip, onRemove, onEndSplit, onFilmFromHere }: {
  f: BlastFrame; n: number; stem?: string; onAir: boolean; focus: boolean; onFocused: () => void;
  onPatch: (p: Partial<BlastFrame>) => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void; onSkip: () => void;
  onRemove?: () => void; onEndSplit?: () => void; onFilmFromHere: () => void;
}) {
  const first = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { if (focus) { first.current?.focus(); onFocused(); } }, [focus, onFocused]);
  const hasTitle = f.kind === "cheat";
  const hasText = ["phrase", "tip", "tricky", "found", "ask", "blank", "intro", "slogan"].includes(f.kind) || (f.kind === "cheat" && !!f.text);
  const hasBody = f.kind === "cheat";
  const hasBullets = ["phrase", "cheat", "tip", "tricky", "found", "ask"].includes(f.kind);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", opacity: f.skipped ? 0.45 : 1 }}>
      <div style={{ width: 24, textAlign: "right", fontWeight: 900, fontSize: 13, color: onAir ? RED : V3_MUTED, paddingTop: 10 }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0, borderRadius: 10, padding: "8px 10px", background: CARD, border: `1px solid ${onAir ? RED : f.cutAfter ? V3_GOLD : V3_EDGE}`, boxShadow: onAir ? `0 0 0 1px ${RED}` : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: V3_GOLD }}>{FRAME_LABEL[f.kind]}</span>
          {onAir && <span style={{ fontSize: 11, fontWeight: 900, color: RED }}>● ON AIR</span>}
          {f.skipped && <span style={{ fontSize: 11, color: V3_MUTED }}>skipped</span>}
          {f.pace === "speed" && <span style={{ fontSize: 11, color: V3_GOLD }}>⚡ speed run</span>}
          {f.needs && <span style={{ fontSize: 11, color: AMBER }}>needs: {f.needs}</span>}
          <span style={{ flex: 1 }} />
          <button type="button" style={tiny} title="Jump the film window to this slide" onClick={onFilmFromHere}>▶ film from here</button>
          <button type="button" style={tiny} title="Move up" onClick={() => onMove(-1)}>↑</button>
          <button type="button" style={tiny} title="Move down" onClick={() => onMove(1)}>↓</button>
          <button type="button" style={tiny} title="Duplicate" onClick={onDuplicate}>⧉</button>
          <button type="button" style={tiny} title={f.skipped ? "Film it again" : "Skip it when filming"} onClick={onSkip}>{f.skipped ? "unskip" : "skip"}</button>
          {onRemove && <button type="button" style={{ ...tiny, color: RED }} title="Delete this slide" onClick={onRemove}>✕</button>}
        </div>
        {stem !== undefined && <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.45 }}>{stem}</div>}
        {hasTitle && <textarea ref={first} rows={1} value={f.title ?? ""} placeholder="Cheat code heading" onChange={(e) => onPatch({ title: e.target.value })} style={{ ...field, marginTop: 6, fontWeight: 800 }} />}
        {hasText && <textarea ref={hasTitle ? undefined : first} rows={2} value={f.text ?? ""} placeholder="What the slide says" onChange={(e) => onPatch({ text: e.target.value })} style={{ ...field, marginTop: 6 }} />}
        {hasBody && <textarea rows={2} value={f.body ?? ""} placeholder="The code itself" onChange={(e) => onPatch({ body: e.target.value })} style={{ ...field, marginTop: 6 }} />}
        {hasBullets && (
          <textarea rows={Math.max(1, (f.bullets ?? []).length)} value={(f.bullets ?? []).join("\n")} placeholder="Bullet lines under it (optional, one per line)"
            onChange={(e) => onPatch({ bullets: e.target.value.split("\n") })} style={{ ...field, marginTop: 6, fontSize: 13 }} />
        )}
        {onEndSplit && (
          <div style={{ marginTop: 6 }}>
            <button type="button" style={{ ...tiny, color: f.cutAfter ? V3_GOLD : V3_MUTED }} onClick={onEndSplit}>{f.cutAfter ? "✂ split ends here — join back" : "✂ end the split here"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export type { PlanTake };
