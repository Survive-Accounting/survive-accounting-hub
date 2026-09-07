// /admin/ideas/strategy — THE STRATEGY BOARD. Lee, 2026-09-06, on pasting the strategy &
// culture doc: "build this into the idea bank as a new route to brainstorm. CTRL + i can
// incorporate this too." And: "Strategy shorts are going to be about riffing. We will make
// them using the same tool as blast off /v3/ pipeline."
//
// Two halves, both read from the ordinary ideas table (lib/strategy.ts says how they are told
// apart), so Ctrl+I, the Idea Bank, Obsidian and this page all see the same rows:
//
//   THE SHORTS BOARD — the strategy shorts to film, by audience, in priority order. Each card
//   is the highlights and what to riff on — never a script. "Blast off" mints the short's
//   deck under /v3/strategy (strategy.functions.ts) with the points already laid out as
//   slides and teleprompter lines; from there it is the same Talkthrough → Review → Film →
//   Post line as an Easy Points rip.
//
//   THE DOC, BY LANE — the strategy & culture doc's sections as folds, the doc's own lines
//   as the prompts, and every note captured for that lane underneath. "+ note" opens the
//   Ctrl+I modal already aimed at the lane (say it or type it); loose strategy notes land in
//   "Unfiled" and get a lane from here.
//
// A sibling file (admin.ideas_.strategy.tsx), not a child: admin.ideas.tsx renders no
// <Outlet/>. This is a build-machine surface (docs/TWO-MACHINES.md); the laptop meets the
// shorts in /v3.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminGate, getAdminWho } from "@/components/AdminGate";
import type { IdeaPreset } from "@/components/ideas/IdeasDock";
import type { Idea } from "@/components/ideas/model";
import { listIdeas, saveIdea } from "@/lib/ideas.functions";
import {
  STRATEGY_LANES, SHORT_LANES, STRATEGY_SHORTS, isShortIdea, isStrategyNote, laneDef, seedShortId, shortLaneDef,
  shortPriorityOf, shortRiffOf, shortSeedToIdea, shortSlidesOf, type ShortLane, type StrategyLane,
} from "@/lib/strategy";
import { blastOffStrategyShort } from "@/lib/strategy.functions";

export const Route = createFileRoute("/admin/ideas_/strategy")({
  component: () => <AdminGate><StrategyBoard /></AdminGate>,
  head: () => ({ meta: [{ title: "Strategy board — Survive" }, { name: "robots", content: "noindex" }] }),
});

const GOLD = "#FCA311";
const CREAM = "#F4EFE6";
const MUTED = "#9AA3B8";
const EDGE = "rgba(244,239,230,0.16)";
const BG = "#070B14";
const PANEL = "rgba(16,24,44,0.92)";
const MINT = "#3BF5A0";
const SKY = "#7DD3FC";
const DISPLAY = "'League Spartan', sans-serif";
const FOLD_STORE = "sa-strategy-folds-v1";

const readFolds = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(FOLD_STORE) ?? "{}") as Record<string, boolean>; } catch { return {}; } };

/** Open the Ctrl+I modal already aimed at a lane. IdeasDock listens for this. */
const capture = (preset: IdeaPreset) => window.dispatchEvent(new CustomEvent<IdeaPreset>("sa:ideas", { detail: preset }));

const btn = (kind: "gold" | "ghost" | "quiet" = "ghost"): React.CSSProperties => ({
  background: kind === "gold" ? GOLD : "transparent",
  color: kind === "gold" ? "#0B1322" : kind === "quiet" ? MUTED : CREAM,
  border: kind === "gold" ? "none" : `1px solid ${kind === "quiet" ? "transparent" : EDGE}`,
  borderRadius: 10, padding: kind === "quiet" ? "4px 8px" : "7px 12px", fontSize: kind === "quiet" ? 12 : 13, fontWeight: kind === "quiet" ? 700 : 800, cursor: "pointer",
  fontFamily: "'Rubik', system-ui, sans-serif", whiteSpace: "nowrap",
});
const chip = (color = MUTED): React.CSSProperties => ({
  fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color, border: `1px solid ${color}55`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap",
});

function StrategyBoard() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { setFolds(readFolds()); }, []);
  const isOpen = (k: string, dflt: boolean) => folds[k] ?? dflt;
  const toggle = (k: string, dflt: boolean) => setFolds((f) => { const n = { ...f, [k]: !(f[k] ?? dflt) }; try { localStorage.setItem(FOLD_STORE, JSON.stringify(n)); } catch { /* cosmetic */ } return n; });

  const refresh = useCallback(() => {
    listIdeas().then((r) => { setIdeas(r.ideas); setErr(null); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(refresh, [refresh]);
  // Ctrl+I saves land here without a reload: the dock refreshes its own list, this page
  // listens for focus coming back and re-reads.
  useEffect(() => { const on = () => refresh(); window.addEventListener("focus", on); return () => window.removeEventListener("focus", on); }, [refresh]);

  /** EVERY field goes back — saveIdea is a whole-row upsert (see admin.ideas.tsx patch). */
  const patch = useCallback((i: Idea, p: Partial<Idea>) => {
    const next = { ...i, ...p };
    setIdeas((v) => v.map((x) => (x.id === i.id ? next : x)));
    return saveIdea({ data: {
      id: next.id, title: next.title, body: next.body, categories: next.categories, subcategory: next.subcategory, status: next.status,
      sourcePath: next.sourcePath, context: next.context, promptMd: next.promptMd, promptFilename: next.promptFilename, createdBy: next.createdBy,
      sourceKind: next.sourceKind, attachments: next.attachments, audioPath: next.audioPath, transcriptStatus: next.transcriptStatus,
    } }).then(refresh).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [refresh]);

  const live = useMemo(() => ideas.filter((i) => i.status !== "PARKED"), [ideas]);
  const shorts = useMemo(() => live.filter(isShortIdea).sort((a, b) => shortPriorityOf(a) - shortPriorityOf(b) || a.updatedAt.localeCompare(b.updatedAt)), [live]);
  const notes = useMemo(() => live.filter(isStrategyNote).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [live]);
  const shortsIn = (lane: ShortLane) => shorts.filter((i) => i.context.lane === lane);
  const looseShorts = shorts.filter((i) => !shortLaneDef(i.context.lane));
  const notesIn = (lane: StrategyLane) => notes.filter((i) => i.context.lane === lane);
  const unfiledNotes = notes.filter((i) => !laneDef(i.context.lane));

  // THE SEPT 2026 LIST (lib/strategy.ts) — loaded once, by hand, so the board never
  // re-creates a short Lee parked. Only the ones not already present are offered.
  const missingSeeds = useMemo(() => STRATEGY_SHORTS.filter((s) => !ideas.some((i) => i.id === seedShortId(s.slug))), [ideas]);
  const seed = async () => {
    setBusy("seed"); setErr(null);
    try {
      const who = getAdminWho() ?? "lee";
      for (const s of missingSeeds) await saveIdea({ data: shortSeedToIdea(s, who) });
      refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const blastOff = async (i: Idea) => {
    setBusy(i.id); setErr(null);
    try {
      const r = await blastOffStrategyShort({ data: { id: i.id } });
      refresh();
      window.open(r.path, "_blank", "noopener");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  /** Move a short one step within its lane: swap priorities with its neighbour. */
  const nudge = async (i: Idea, dir: -1 | 1) => {
    const lane = shortsIn(i.context.lane as ShortLane);
    const k = lane.findIndex((x) => x.id === i.id);
    const j = k + dir;
    if (k < 0 || j < 0 || j >= lane.length) return;
    const other = lane[j];
    const a = shortPriorityOf(i), b = shortPriorityOf(other);
    // Equal or unset priorities: give the lane explicit numbers first so the swap means something.
    if (a === b || a === 9999 || b === 9999) {
      const renum = [...lane]; [renum[k], renum[j]] = [renum[j], renum[k]];
      for (let n = 0; n < renum.length; n++) await patch(renum[n], { context: { ...renum[n].context, shortPriority: String(n + 1) } });
      return;
    }
    await patch(i, { context: { ...i.context, shortPriority: String(b) } });
    await patch(other, { context: { ...other.context, shortPriority: String(a) } });
  };

  const fold = (key: string, label: string, count: number, hint: string | undefined, dflt: boolean, extra: React.ReactNode, body: () => React.ReactNode) => {
    const on = isOpen(key, dflt);
    return (
      <section key={key} style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2" style={{ padding: "6px 0", flexWrap: "wrap" }}>
          <button onClick={() => toggle(key, dflt)} className="flex items-center gap-2"
            style={{ background: "transparent", border: "none", color: count ? CREAM : MUTED, cursor: "pointer", padding: 0, fontFamily: DISPLAY, fontWeight: 800, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "left" }}>
            <span style={{ color: MUTED, fontSize: 12, width: 12 }}>{on ? "▾" : "▸"}</span>
            <span style={{ color: GOLD }}>{label}</span>
            <span style={{ color: MUTED, fontWeight: 700, fontSize: 12 }}>{count}</span>
          </button>
          {hint && <span style={{ color: MUTED, fontSize: 11.5 }}>— {hint}</span>}
          <span style={{ marginLeft: "auto" }}>{extra}</span>
        </div>
        {on && <div style={{ paddingLeft: 20 }}>{body()}</div>}
      </section>
    );
  };

  const laneSelect = (i: Idea, kind: "short" | "note") => (
    <select value={i.context.lane ?? ""} onChange={(e) => void patch(i, { context: { ...i.context, lane: e.target.value } })}
      style={{ background: "rgba(9,13,26,0.8)", border: `1px solid ${EDGE}`, color: CREAM, borderRadius: 8, fontSize: 12, padding: "3px 6px" }}>
      <option value="">— lane —</option>
      {(kind === "short" ? SHORT_LANES : STRATEGY_LANES).map((l) => <option key={l.key} value={l.key}>{l.title}</option>)}
    </select>
  );

  const shortCard = (i: Idea, n: number) => {
    const slides = shortSlidesOf(i);
    const riff = shortRiffOf(i);
    const expanded = open === i.id;
    const deckPath = i.context.deckPath;
    return (
      <article key={i.id} style={{ background: PANEL, border: `1px solid ${deckPath ? `${MINT}55` : EDGE}`, borderRadius: 14, padding: "12px 14px", marginBottom: 8 }}>
        <div className="flex items-start gap-3">
          <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 22, color: GOLD, minWidth: 30, lineHeight: 1, paddingTop: 2, fontVariantNumeric: "tabular-nums" }}>{n}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <button onClick={() => setOpen(expanded ? null : i.id)} style={{ background: "transparent", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: CREAM, width: "100%" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 17, lineHeight: 1.15 }}>{i.title}</div>
              {(i.context.hook || i.context.tldr) && <div style={{ color: MUTED, fontSize: 13, marginTop: 3 }}>{i.context.hook || i.context.tldr}</div>}
            </button>
            {expanded && (
              <div style={{ marginTop: 10 }}>
                {slides.length > 0 ? (
                  <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                    {slides.map((s, k) => (
                      <div key={k} style={{ border: `1px solid ${EDGE}`, borderRadius: 10, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: SKY, marginBottom: 4 }}>slide {k + 1} · {s.title}</div>
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.45 }}>{s.lines.map((l, m) => <li key={m}>{l}</li>)}</ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.45, color: CREAM }}>{i.body}</div>
                )}
                {riff.length > 0 && (
                  <div style={{ marginTop: 10, borderLeft: `2px solid ${GOLD}`, paddingLeft: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, marginBottom: 3 }}>Riff on</div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.45, color: CREAM }}>{riff.map((r, m) => <li key={m}>{r}</li>)}</ul>
                  </div>
                )}
                <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
                  {i.createdBy ? `${i.createdBy} · ` : ""}{new Date(i.updatedAt).toLocaleDateString("en-US")}{i.context.deckAt ? ` · blasted off ${new Date(i.context.deckAt).toLocaleDateString("en-US")}` : ""}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
            {deckPath
              ? <a href={deckPath} target="_blank" rel="noopener" style={{ ...btn("gold"), textDecoration: "none", background: MINT }}>Open in /v3 →</a>
              : <button onClick={() => void blastOff(i)} disabled={busy === i.id} style={btn("gold")}>{busy === i.id ? "Minting…" : "Blast off →"}</button>}
            <button title="Film sooner" onClick={() => void nudge(i, -1)} style={btn("quiet")}>↑</button>
            <button title="Film later" onClick={() => void nudge(i, 1)} style={btn("quiet")}>↓</button>
            {laneSelect(i, "short")}
            <button title="Park it — off the board, kept in the bank" onClick={() => { if (window.confirm(`Park “${i.title}”? It leaves the board and stays in the bank as PARKED.`)) void patch(i, { status: "PARKED" }); }} style={btn("quiet")}>park</button>
          </div>
        </div>
      </article>
    );
  };

  const noteRow = (i: Idea, unfiled = false) => (
    <div key={i.id} style={{ borderLeft: `2px solid ${EDGE}`, padding: "4px 10px", marginBottom: 6 }}>
      <div className="flex items-baseline gap-2" style={{ flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 13.5, color: CREAM }}>{i.title || i.body.slice(0, 80)}</span>
        <span style={{ fontSize: 11, color: MUTED }}>{i.createdBy || "lee"} · {new Date(i.updatedAt).toLocaleDateString("en-US")}{i.sourceKind === "voice" ? " · 🎙" : ""}</span>
        <span style={{ marginLeft: "auto" }} className="flex items-center gap-1">
          {unfiled && laneSelect(i, "note")}
          <button title="Make this a strategy short" onClick={() => void patch(i, { context: { ...i.context, short: "1" }, subcategory: "Strategy short" })} style={btn("quiet")}>→ short</button>
          <button title="Park it" onClick={() => void patch(i, { status: "PARKED" })} style={btn("quiet")}>park</button>
        </span>
      </div>
      {i.body && i.body !== i.title && <div style={{ fontSize: 12.5, color: CREAM, opacity: 0.85, whiteSpace: "pre-wrap", lineHeight: 1.45, marginTop: 2 }}>{i.body}</div>}
      {i.context.tldr && i.context.tldr !== i.body && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{i.context.tldr}</div>}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: BG, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "16px clamp(12px, 4vw, 26px) 90px" }}>
      <header className="flex items-center gap-3" style={{ marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 21, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>🧭 Strategy</h1>
        <span style={{ fontSize: 12, color: MUTED }}>Use your words. Ctrl/⌘ I from anywhere lands here too.</span>
        <a href="/admin/ideas" style={{ ...btn(), textDecoration: "none", marginLeft: 6 }}>← Idea Bank</a>
        <a href="/v3" target="_blank" rel="noopener" style={{ ...btn(), textDecoration: "none" }}>/v3 →</a>
        <span className="ml-auto flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          {missingSeeds.length > 0 && (
            <button onClick={() => void seed()} disabled={busy === "seed"} style={btn()}>
              {busy === "seed" ? "Loading…" : `Load the Sept 2026 shorts list (${missingSeeds.length})`}
            </button>
          )}
          <button onClick={() => capture({ intent: "strategy", short: true })} style={btn()}>＋ Short</button>
          <button onClick={() => capture({ intent: "strategy" })} style={btn("gold")}>🎙 Brainstorm</button>
        </span>
      </header>
      <p style={{ fontSize: 12.5, color: MUTED, margin: "0 0 18px", maxWidth: 860 }}>
        The doc is <code style={{ color: CREAM }}>docs/SURVIVE_STRATEGY_CULTURE_2026-09.md</code>. Shorts are highlights and what to riff on, never scripts.
        <b style={{ color: CREAM }}> Feed the Machine:</b> no strategy short gets made until accounting shorts have shipped — the rep, chair and student ones are the exception because they are the product's onboarding.
      </p>
      {err && <div style={{ color: "#F87171", fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {/* ------------------------------------------------------------ THE SHORTS BOARD */}
      <h2 style={{ fontFamily: DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTED, margin: "8px 0 4px" }}>The shorts board · {shorts.length}</h2>
      {shorts.length === 0 && missingSeeds.length > 0 && (
        <div style={{ color: MUTED, fontSize: 13, margin: "6px 0 14px" }}>Nothing on the board yet — load the Sept 2026 list above, or press ＋ Short and say one.</div>
      )}
      {SHORT_LANES.map((l) => {
        const list = shortsIn(l.key);
        const post = l.post === "now" ? <span style={chip(MINT)}>post now</span> : l.post === "bank" ? <span style={chip(GOLD)}>bank</span> : <span style={chip()}>later</span>;
        return fold(`short:${l.key}`, l.title, list.length, l.blurb, l.post === "now",
          <span className="flex items-center gap-2">{post}<button onClick={() => capture({ intent: "strategy", short: true, lane: l.key })} style={btn("quiet")}>＋ short</button></span>,
          () => list.length === 0 ? <div style={{ color: MUTED, fontSize: 12.5, padding: "2px 0 6px" }}>nothing here</div> : <div>{list.map((i, k) => shortCard(i, k + 1))}</div>);
      })}
      {looseShorts.length > 0 && fold("short:loose", "Unfiled shorts", looseShorts.length, "captured without a lane — pick one", true, null,
        () => <div>{looseShorts.map((i, k) => shortCard(i, k + 1))}</div>)}

      {/* ------------------------------------------------------------ THE DOC, BY LANE */}
      <h2 style={{ fontFamily: DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTED, margin: "28px 0 4px" }}>The doc, by lane · {notes.length} note{notes.length === 1 ? "" : "s"}</h2>
      {unfiledNotes.length > 0 && fold("note:unfiled", "Unfiled notes", unfiledNotes.length, "said with Ctrl+I, no lane yet — file them", true, null,
        () => <div>{unfiledNotes.map((i) => noteRow(i, true))}</div>)}
      {STRATEGY_LANES.map((l) => {
        const list = notesIn(l.key);
        return fold(`lane:${l.key}`, l.title, list.length, l.blurb, false,
          <button onClick={() => capture({ intent: "strategy", lane: l.key })} style={btn("quiet")}>＋ note</button>,
          () => (
            <div>
              <ul style={{ margin: "0 0 10px", paddingLeft: 16, color: MUTED, fontSize: 12.5, lineHeight: 1.5 }}>
                {l.canon.map((c, k) => <li key={k}>{c}</li>)}
              </ul>
              {list.length === 0 ? <div style={{ color: MUTED, fontSize: 12, padding: "0 0 6px" }}>no notes yet — ＋ note, or Ctrl+I → 🧭 Strategy</div> : list.map((i) => noteRow(i))}
            </div>
          ));
      })}
    </div>
  );
}
