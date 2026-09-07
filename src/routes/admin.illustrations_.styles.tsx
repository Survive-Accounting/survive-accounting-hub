// /admin/illustrations/styles — THE STYLE EDITOR. The illustration style registry, edited from
// the app: every field that used to be hardcoded in components/blastoff/illustration.ts, a
// version history, the settings (which style is the exam default, which the strategy shorts'),
// the BRIEF_SYSTEM textarea — and, "the important part", the test panel.
//
// WHY (2026-09-06, Lee's v6 workshop — docs/ILLUSTRATION-STYLE-V6-DIRECTION.md, Part 2): "Build a
// style editor so the illustration style can be changed from the app and regenerated, without a
// code change each time." The suffix and the palette were being tuned through a prompt every
// night; the judging was of "a 1024px square on white" rather than the phone.
//
//   "Version bumping: a 'Save as new version' button that increments the version and marks all
//   existing illustrations generated under the old version as stale (the existing stale mechanism
//   already handles the rest). Also a 'Save without bumping' for typo fixes that shouldn't
//   invalidate the library."
//   "Test panel — the important part. On the same page: a subject sentence input; a 'Generate 4'
//   button that runs the current unsaved draft against that subject four times and shows results
//   side by side; a background-removed preview on the actual black stage, at true phone size, so
//   the judging is of what students see rather than a 1024px square on white; buttons to try the
//   same subject against any saved version for comparison."
//
// The test panel generates SEQUENTIALLY, never in parallel (Recraft rate limits), with ONE fixed
// seed per column shared across every style tried, so two rows differ only by the style. Every
// preview is a real generation (runGeneration, catalogued in the library under set "_preview" so
// the cost is tracked) and is never written to any frame. Every preview shows its seed and cost.
//
// A sibling of admin.illustrations (the underscore), not a tab in its shell; registered in
// lib/site-qa/manifest.ts. Server: lib/illustration-registry.functions.ts (the registry) and
// lib/illustrate.functions.ts (previewIllustration); pure parts in lib/illustration-registry.ts.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { AdminGate, getAdminWho } from "@/components/AdminGate";
import { ANIMATION_LABEL, ANIMATION_PRESETS, type IllustrationStyle } from "@/components/blastoff/illustration";
import { BRIEF_SYSTEM } from "@/components/blastoff/illustration-brief";
import { primeIllustrationRegistry, useIllustrationRegistry } from "@/components/blastoff/use-illustration-registry";
import { usd } from "@/lib/illustration-bank";
import {
  MISSING_STYLES_HINT, PREVIEW_COUNT, cloneStyle, copyStyle, fixedSeeds, hexToRgb, nextVersion, rgbToHex, sameStyle,
  stalePictureCount, styleDraftSchema, weightSum,
} from "@/lib/illustration-registry";
import { saveIllustrationStyle, seedIllustrationStyles, setIllustrationSettings } from "@/lib/illustration-registry.functions";
import { listIllustrationsAcrossBank, previewIllustration, type IllustrationBank, type PreviewResult } from "@/lib/illustrate.functions";

export const Route = createFileRoute("/admin/illustrations_/styles")({
  component: () => <AdminGate><StyleEditor /></AdminGate>,
  head: () => ({ meta: [{ title: "Illustration styles — Survive" }, { name: "robots", content: "noindex" }] }),
});

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)", BG = "#070B14", PANEL = "rgba(16,24,44,0.92)";
const ORANGE = "#FB923C", MINT = "#3BF5A0", RED = "#F87171", BLUE = "#7DD3FC";
const DISPLAY = "'League Spartan', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const btn = (kind: "gold" | "ghost" | "quiet" | "mint" | "danger" = "ghost"): CSSProperties => ({
  background: kind === "gold" ? GOLD : kind === "mint" ? MINT : "transparent",
  color: kind === "gold" || kind === "mint" ? "#0B1322" : kind === "quiet" ? MUTED : kind === "danger" ? RED : CREAM,
  border: kind === "gold" || kind === "mint" ? "none" : `1px solid ${kind === "quiet" ? "transparent" : kind === "danger" ? `${RED}88` : EDGE}`,
  borderRadius: 10, padding: kind === "quiet" ? "4px 8px" : "7px 12px", fontSize: kind === "quiet" ? 12 : 13, fontWeight: kind === "quiet" ? 700 : 800, cursor: "pointer",
  fontFamily: "'Rubik', system-ui, sans-serif", whiteSpace: "nowrap",
});
const chip = (color = MUTED, on = true): CSSProperties => ({
  fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: on ? color : MUTED,
  border: `1px solid ${on ? color : MUTED}55`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap", background: "transparent",
});
const field: CSSProperties = {
  width: "100%", background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 9, color: CREAM,
  padding: "7px 9px", fontSize: 13, lineHeight: 1.45, fontFamily: "inherit", boxSizing: "border-box",
};
const label: CSSProperties = { fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, fontWeight: 800, marginBottom: 4, display: "block" };
const section: CSSProperties = { background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const short = (s: string) => s.replace(/\s*\(.*\)$/, "");
/** The phone stage at a size four fit across: 9:16, the picture where a blank slide puts it. */
const STAGE_W = 156, STAGE_H = Math.round(STAGE_W * 16 / 9);

/** THE STAGE — the same placement as the bank's pop-out (admin.illustrations.tsx Lightbox): a
 *  black 9:16 at phone proportions, the picture at 72% width centred at 44% height, like a
 *  blank slide. Judged as a student sees it, never as a square on white. */
function Stage({ url, note, w = STAGE_W }: { url: string | null; note?: React.ReactNode; w?: number }) {
  const h = Math.round(w * 16 / 9);
  return (
    <div style={{ width: w, height: h, background: "#000", borderRadius: 14, border: `1px solid ${EDGE}`, position: "relative", overflow: "hidden", flexShrink: 0 }}>
      {url && <img src={url} alt="" style={{ position: "absolute", left: "50%", top: "44%", transform: "translate(-50%, -50%)", width: "72%", objectFit: "contain" }} />}
      {!url && note !== undefined && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 10, textAlign: "center", fontSize: 11.5, color: MUTED }}>{note}</div>}
    </div>
  );
}

/** A hex field that lets Lee type: local text until it parses, then the rgb goes up. */
function HexField({ rgb, onChange, disabled }: { rgb: [number, number, number]; onChange: (rgb: [number, number, number]) => void; disabled?: boolean }) {
  const hex = rgbToHex(rgb);
  const [text, setText] = useState(hex);
  useEffect(() => { setText(hex); }, [hex]);
  const ok = hexToRgb(text) !== null;
  return (
    <span className="flex items-center gap-1">
      <input type="color" value={hex} disabled={disabled} onChange={(e) => { const v = hexToRgb(e.target.value); if (v) onChange(v); }}
        style={{ width: 30, height: 26, padding: 0, border: `1px solid ${EDGE}`, borderRadius: 6, background: "transparent", cursor: "pointer" }} />
      <input value={text} disabled={disabled} onChange={(e) => { setText(e.target.value); const v = hexToRgb(e.target.value); if (v) onChange(v); }}
        style={{ ...field, width: 92, fontFamily: MONO, fontSize: 12, padding: "4px 7px", borderColor: ok ? EDGE : `${RED}88` }} spellCheck={false} />
    </span>
  );
}

type Slot = { state: "pending" } | { state: "running" } | { state: "ok"; r: PreviewResult } | { state: "err"; error: string };
/** One row of the test panel: a style (the draft as it was when pressed, or a saved version)
 *  against one subject, one picture per fixed seed. */
interface TestRow { key: string; label: string; style: IllustrationStyle; subject: string; seeds: number[]; slots: Slot[]; startedAt: number }

function StyleEditor() {
  const { registry: reg, loaded, error: regErr } = useIllustrationRegistry();
  const who = getAdminWho();

  // THE DRAFT — a copy of the selected style (or a fresh one), edited in place, saved on a button.
  const [draft, setDraft] = useState<IllustrationStyle | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [bank, setBank] = useState<IllustrationBank | null>(null);
  const [briefText, setBriefText] = useState<string | null>(null);
  const seededRef = useRef(false);

  const saved = draft ? reg.styles[draft.id] : undefined;
  const isNew = !!draft && !saved;
  const dirty = !!draft && !sameStyle(draft, saved);
  const parsed = useMemo(() => (draft ? styleDraftSchema.safeParse(draft) : null), [draft]);
  const problems = parsed && !parsed.success ? parsed.error.issues.map((i) => `${i.path.join(".") || "style"}: ${i.message}`) : [];
  const sum = draft ? weightSum(draft.controls.colors) : 0;
  const overweight = sum > 1 + 1e-9;
  const nextV = draft ? nextVersion(reg, draft.id) : 1;
  const staleCount = draft && bank ? stalePictureCount(bank.rows, draft.id) : null;
  const isDefault = !!draft && reg.defaultStyleId === draft.id;
  const isStrategy = !!draft && reg.strategyStyleId === draft.id;
  const versions = useMemo(() => (draft ? reg.history.filter((s) => s.id === draft.id).sort((a, b) => b.version - a.version) : []), [reg, draft?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const select = (s: IllustrationStyle) => { setDraft(cloneStyle(s)); setNote(s.note ?? ""); setMsg(null); setErr(null); setConfirmRetire(false); };

  // First load: the exam default in the editor; the seeds into the table if the migration has
  // run and they aren't there yet (idempotent — only missing (id, version) pairs are written).
  useEffect(() => {
    if (!loaded) return;
    if (!draft) select(reg.styles[reg.defaultStyleId] ?? Object.values(reg.styles)[0]);
    if (briefText === null) setBriefText(reg.briefSystem ?? BRIEF_SYSTEM);
    if (reg.source === "db" && reg.unseeded?.length && !seededRef.current) {
      seededRef.current = true;
      setBusy("seeding");
      seedIllustrationStyles({ data: { who } })
        .then((r) => { primeIllustrationRegistry(r.registry); setMsg(`Seeded ${r.inserted.map((u) => `${u.id} v${u.version}`).join(", ") || "nothing"} from the code.`); })
        .catch((e) => setErr(errText(e)))
        .finally(() => setBusy(null));
    }
  }, [loaded, reg]);   // eslint-disable-line react-hooks/exhaustive-deps
  const refreshBank = () => { listIllustrationsAcrossBank().then(setBank).catch(() => setBank(null)); };
  useEffect(refreshBank, []);

  const patch = (p: Partial<IllustrationStyle>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const setColor = (i: number, c: Partial<{ rgb: [number, number, number]; weight: number }>) => setDraft((d) => {
    if (!d) return d;
    const colors = d.controls.colors.map((x, j) => (j === i ? { ...x, ...c } : x));
    return { ...d, controls: { ...d.controls, colors } };
  });
  const removeColor = (i: number) => setDraft((d) => (d ? { ...d, controls: { ...d.controls, colors: d.controls.colors.filter((_, j) => j !== i) } } : d));
  const addColor = () => setDraft((d) => (d ? { ...d, controls: { ...d.controls, colors: [...d.controls.colors, { rgb: [245, 239, 230], weight: 0 }] } } : d));

  const run = async (what: string, fn: () => Promise<string | null>) => {
    setBusy(what); setErr(null); setMsg(null);
    try { const m = await fn(); if (m) setMsg(m); }
    catch (e) { setErr(errText(e)); }
    finally { setBusy(null); }
  };

  const save = (bump: boolean) => draft && run(bump ? "saving a new version" : "saving", async () => {
    const res = await saveIllustrationStyle({ data: { style: draft, bump, note: note.trim() || null, who } });
    primeIllustrationRegistry(res.registry);
    const s = res.registry.styles[res.saved.id];
    if (s) { setDraft(cloneStyle(s)); setNote(s.note ?? ""); }
    if (bump) refreshBank();
    return bump
      ? `Saved ${res.saved.id} as v${res.saved.version}. Every picture stamped v${res.saved.version - 1} or older now reads stale in the bank — regenerate them there from their own subjects.`
      : `Saved ${res.saved.id} v${res.saved.version} in place — nothing went stale.`;
  });
  const settings = (p: { defaultStyleId?: string; strategyStyleId?: string; briefSystem?: string | null }, done: string) => run("saving settings", async () => {
    primeIllustrationRegistry(await setIllustrationSettings({ data: p }));
    refreshBank();
    return done;
  });
  const toggleRetire = () => saved && run(saved.retired ? "un-retiring" : "retiring", async () => {
    // The SAVED copy, flag flipped, in place — never the draft's unsaved edits by the back door.
    const res = await saveIllustrationStyle({ data: { style: { ...saved, retired: !saved.retired }, bump: false, note: saved.note ?? null, who } });
    primeIllustrationRegistry(res.registry);
    const s = res.registry.styles[saved.id];
    if (s) setDraft((d) => (d ? { ...d, retired: s.retired } : d));
    setConfirmRetire(false);
    return s?.retired ? `${saved.id} is retired — old pictures still resolve; nothing new starts in it.` : `${saved.id} is back.`;
  });

  // ---- THE TEST PANEL ----------------------------------------------------------------------
  const [subject, setSubject] = useState("");
  const [seeds, setSeeds] = useState<number[]>(() => fixedSeeds(PREVIEW_COUNT));
  const [tests, setTests] = useState<TestRow[]>([]);
  const [testing, setTesting] = useState<{ key: string; i: number } | null>(null);
  const [spent, setSpent] = useState(0);
  const stopRef = useRef(false);
  const draftRuns = useRef(0);

  const setSlot = (key: string, i: number, slot: Slot) => setTests((t) => t.map((row) => (row.key === key ? { ...row, slots: row.slots.map((s, j) => (j === i ? slot : s)) } : row)));
  /** SEQUENTIAL, always — one Recraft call at a time; Stop lets the one in flight finish. The
   *  style is snapshotted when pressed, so editing the draft mid-run changes nothing in flight. */
  const runTest = async (label: string, style: IllustrationStyle) => {
    if (testing) return;
    const subj = subject.trim();
    if (!subj) { setErr("Type a subject sentence first — what the picture shows."); return; }
    const check = styleDraftSchema.safeParse(style);
    if (!check.success) { setErr(`This style can't be sent as it is: ${check.error.issues[0]?.message ?? "invalid"}`); return; }
    const key = `${label}·${Date.now().toString(36)}`;
    const snapshot = cloneStyle(style);
    const mySeeds = seeds.slice();
    setErr(null);
    setTests((t) => [{ key, label, style: snapshot, subject: subj, seeds: mySeeds, slots: mySeeds.map(() => ({ state: "pending" })), startedAt: Date.now() }, ...t]);
    stopRef.current = false;
    for (let i = 0; i < mySeeds.length; i++) {
      if (stopRef.current) break;
      setTesting({ key, i });
      setSlot(key, i, { state: "running" });
      try {
        const r = await previewIllustration({ data: { draft: snapshot, subject: subj, seed: mySeeds[i], who } });
        setSlot(key, i, { state: "ok", r });
        setSpent((s) => s + (r.costUsd ?? 0));
      } catch (e) { setSlot(key, i, { state: "err", error: errText(e) }); }
    }
    setTesting(null);
  };
  const generateDraft = () => { if (!draft) return; draftRuns.current += 1; void runTest(`draft #${draftRuns.current} · ${draft.id}${dirty || isNew ? " (unsaved)" : ` v${draft.version}`}`, draft); };
  const rowCost = (row: TestRow) => row.slots.reduce((s, x) => s + (x.state === "ok" ? x.r.costUsd ?? 0 : 0), 0);

  // ---- THE LIST ----------------------------------------------------------------------------
  const list = useMemo(() => {
    const all = Object.values(reg.styles).slice().sort((a, b) => {
      const rank = (s: IllustrationStyle) => (s.id === reg.defaultStyleId ? 0 : s.id === reg.strategyStyleId ? 1 : s.retired ? 3 : 2);
      return rank(a) - rank(b) || a.label.localeCompare(b.label);
    });
    return all;
  }, [reg]);
  const unseededOf = (s: IllustrationStyle) => !!reg.unseeded?.some((u) => u.id === s.id && u.version === s.version);

  const readOnly = reg.source !== "db";

  return (
    <div style={{ minHeight: "100vh", background: BG, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "16px clamp(12px, 4vw, 26px) 120px" }}>
      <header className="flex items-center gap-3" style={{ marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 21, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>🎛 Illustration styles</h1>
        <a href="/admin/illustrations" style={{ color: MUTED, fontSize: 13, textDecoration: "underline" }}>← bank</a>
        <a href="/leeportal" style={{ color: MUTED, fontSize: 13, textDecoration: "underline" }}>portal</a>
        <span style={{ flex: 1 }} />
        <span style={chip(reg.source === "db" ? MINT : ORANGE)}>{!loaded ? "loading…" : reg.source === "db" ? "registry: database" : "registry: code seeds"}</span>
      </header>
      <p style={{ fontSize: 12.5, color: MUTED, margin: "0 0 12px", maxWidth: 900 }}>
        The house art direction, as data. Edit the draft, test it on the phone stage below, then save it as a new version (old pictures read stale in the bank) or in place (a typo fix).
        {" "}Exam content starts in <b style={{ color: CREAM }}>{short(reg.styles[reg.defaultStyleId]?.label ?? reg.defaultStyleId)} v{reg.styles[reg.defaultStyleId]?.version ?? "?"}</b>; strategy shorts in <b style={{ color: CREAM }}>{short(reg.styles[reg.strategyStyleId]?.label ?? reg.strategyStyleId)} v{reg.styles[reg.strategyStyleId]?.version ?? "?"}</b>.
      </p>
      {readOnly && loaded && <div style={{ color: ORANGE, fontSize: 12.5, marginBottom: 12 }}>The illustration_styles table is missing — {MISSING_STYLES_HINT}. Until then this page shows the code seeds and can test them, but cannot save.</div>}
      {regErr && <div style={{ color: RED, fontSize: 12.5, marginBottom: 12 }}>Couldn't load the registry: {regErr} — showing the code seeds.</div>}
      {!readOnly && !!reg.unseeded?.length && !busy && (
        <div className="flex items-center gap-3" style={{ color: ORANGE, fontSize: 12.5, marginBottom: 12 }}>
          {reg.unseeded.length} code version{reg.unseeded.length === 1 ? "" : "s"} not in the table yet ({reg.unseeded.map((u) => `${u.id} v${u.version}`).join(", ")}).
          <button onClick={() => run("seeding", async () => { const r = await seedIllustrationStyles({ data: { who } }); primeIllustrationRegistry(r.registry); return `Seeded ${r.inserted.length}.`; })} style={btn("ghost")}>Seed from code</button>
        </div>
      )}
      {busy && <div style={{ color: GOLD, fontSize: 12.5, marginBottom: 10 }}>{busy}…</div>}
      {msg && <div style={{ color: MINT, fontSize: 12.5, marginBottom: 10 }}>{msg}</div>}
      {err && <div style={{ color: RED, fontSize: 12.5, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 260px) 1fr", gap: 14, alignItems: "start" }}>
        {/* LEFT: THE LIST */}
        <aside style={{ ...section, position: "sticky", top: 8 }}>
          <span style={label}>styles</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {list.map((s) => {
              const on = draft?.id === s.id;
              return (
                <button key={s.id} onClick={() => select(s)} style={{ textAlign: "left", background: on ? `${GOLD}18` : "transparent", border: `1px solid ${on ? `${GOLD}88` : EDGE}`, borderRadius: 10, padding: "8px 10px", color: CREAM, cursor: "pointer", opacity: s.retired ? 0.6 : 1 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: on ? GOLD : CREAM }}>{s.id} <span style={{ color: MUTED }}>v{s.version}</span></div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, margin: "2px 0 4px" }}>{s.label}</div>
                  <div className="flex" style={{ gap: 4, flexWrap: "wrap" }}>
                    {s.id === reg.defaultStyleId && <span style={chip(GOLD)}>exam default</span>}
                    {s.id === reg.strategyStyleId && <span style={chip(BLUE)}>strategy</span>}
                    {s.retired && <span style={chip(MUTED)}>retired</span>}
                    {unseededOf(s) && <span style={chip(ORANGE)}>code only</span>}
                  </div>
                </button>
              );
            })}
            {isNew && draft && (
              <div style={{ border: `1px dashed ${GOLD}88`, borderRadius: 10, padding: "8px 10px", background: `${GOLD}18` }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: GOLD }}>{draft.id} <span style={{ color: MUTED }}>v1</span></div>
                <div style={{ fontSize: 12.5, fontWeight: 700, margin: "2px 0 4px" }}>{draft.label}</div>
                <span style={chip(ORANGE)}>new · unsaved</span>
              </div>
            )}
          </div>
          <button disabled={!draft || !!busy} onClick={() => { if (draft) { setDraft(copyStyle(saved ?? draft, reg)); setNote(""); setMsg(null); setErr(null); } }} style={{ ...btn("ghost"), marginTop: 10, width: "100%" }}
            title="A copy of the selected style as a new id — for a second style (strategy shorts, an experiment) rather than editing the default">
            + New style (copy of selected)
          </button>
        </aside>

        {/* MAIN: THE FORM */}
        <main>
          {draft && (
            <section style={section}>
              <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 18 }}>{isNew ? "New style" : draft.label}</span>
                {dirty && !isNew && <span style={chip(ORANGE)}>unsaved changes</span>}
                {isDefault && <span style={chip(GOLD)}>exam default</span>}
                {isStrategy && <span style={chip(BLUE)}>strategy</span>}
                {draft.retired && <span style={chip(MUTED)}>retired</span>}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
                <div>
                  <span style={label}>id {isNew ? "" : "· locked"}</span>
                  <input value={draft.id} disabled={!isNew} onChange={(e) => patch({ id: e.target.value.toLowerCase() })} style={{ ...field, fontFamily: MONO, fontSize: 12 }} spellCheck={false} />
                </div>
                <div>
                  <span style={label}>label</span>
                  <input value={draft.label} onChange={(e) => patch({ label: e.target.value })} style={field} />
                </div>
                <div>
                  <span style={label}>version · read-only</span>
                  <input value={isNew ? "1 (on save)" : `v${draft.version}${saved && draft.version !== saved.version ? ` — loaded from history; latest is v${saved.version}` : ""}`} readOnly style={{ ...field, color: MUTED }} />
                </div>
                <div>
                  <span style={label}>provider</span>
                  <input value={draft.provider} readOnly style={{ ...field, color: MUTED }} title="Recraft is the only provider today (recraft.server.ts)" />
                </div>
                <div>
                  <span style={label}>model</span>
                  <input value={draft.model} onChange={(e) => patch({ model: e.target.value })} style={{ ...field, fontFamily: MONO, fontSize: 12 }} spellCheck={false} />
                </div>
                <div>
                  <span style={label}>size</span>
                  <input value={draft.size} onChange={(e) => patch({ size: e.target.value })} style={{ ...field, fontFamily: MONO, fontSize: 12 }} spellCheck={false} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <span style={label}>prompt prefix — before the subject</span>
                <input value={draft.promptPrefix} onChange={(e) => patch({ promptPrefix: e.target.value })} style={{ ...field, fontFamily: MONO, fontSize: 12 }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={label}>prompt suffix — after the subject · the main thing · {draft.promptSuffix.length} chars</span>
                <textarea rows={11} value={draft.promptSuffix} onChange={(e) => patch({ promptSuffix: e.target.value })} spellCheck={false}
                  style={{ ...field, fontFamily: MONO, fontSize: 12, lineHeight: 1.5, resize: "vertical" }} />
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Lee types the subject; this wraps it. "no text" is lifted automatically when the subject carries a quoted label. Keep every empirical rule (brown contour, no black / near-white fills, named skin tones, two-or-three shapes, no front face, the two-seconds line) unless a real generation proved it wrong.</div>
              </div>

              {/* THE PALETTE — controls.colors as rows, live sum */}
              <div style={{ marginBottom: 12 }}>
                <span style={label}>controls · colours and weights</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {draft.controls.colors.map((c, i) => (
                    <div key={i} className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                      <HexField rgb={c.rgb} onChange={(rgb) => setColor(i, { rgb })} />
                      <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, width: 92 }}>{c.rgb.join(",")}</span>
                      <input type="number" min={0} max={1} step={0.05} value={c.weight ?? 0} onChange={(e) => setColor(i, { weight: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })}
                        style={{ ...field, width: 84, fontFamily: MONO, fontSize: 12, padding: "4px 7px" }} title="weight 0–1" />
                      <span style={{ height: 10, width: `${Math.round((c.weight ?? 0) * 220)}px`, background: rgbToHex(c.rgb), borderRadius: 5, opacity: 0.9 }} />
                      <button onClick={() => removeColor(i)} style={btn("quiet")} title="remove this colour">✕</button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3" style={{ marginTop: 8, flexWrap: "wrap" }}>
                  <button onClick={addColor} disabled={draft.controls.colors.length >= 8} style={btn("ghost")}>+ colour</button>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: overweight ? RED : sum > 0.999 ? MINT : GOLD }}>
                    Σ {sum.toFixed(2)}{overweight ? " — over 1.00, Recraft rejects the call" : sum < 0.999 ? ` — ${(1 - sum).toFixed(2)} left to the model's discretion` : " — nothing left to chance"}
                  </span>
                </div>
                <div className="flex items-center gap-2" style={{ marginTop: 10, flexWrap: "wrap" }}>
                  <span style={{ ...label, marginBottom: 0 }}>generation ground</span>
                  <HexField rgb={draft.controls.background_color.rgb} onChange={(rgb) => setDraft((d) => (d ? { ...d, controls: { ...d.controls, background_color: { rgb } } } : d))} />
                  <span style={{ fontSize: 11, color: MUTED }}>white is stripped to alpha after generation; the picture lands on the black stage</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
                <div>
                  <span style={label}>styleIdEnv — a Recraft custom style id, if the server holds one</span>
                  <input value={draft.styleIdEnv} onChange={(e) => patch({ styleIdEnv: e.target.value.toUpperCase() })} style={{ ...field, fontFamily: MONO, fontSize: 12 }} spellCheck={false} />
                </div>
                <div>
                  <span style={label}>default animation</span>
                  <div className="flex" style={{ gap: 5, flexWrap: "wrap" }}>
                    {ANIMATION_PRESETS.map((a) => (
                      <button key={a} onClick={() => patch({ defaultAnimation: a })} style={{ ...chip(ORANGE, draft.defaultAnimation === a), cursor: "pointer" }}>{ANIMATION_LABEL[a]}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <span style={label}>note — what changed, in your words (saved on the row)</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} style={field} placeholder="e.g. added heat: magenta + violet; halo behind the subject" />
              </div>

              {problems.length > 0 && <div style={{ color: RED, fontSize: 12, marginBottom: 10 }}>{problems.map((p, i) => <div key={i}>✗ {p}</div>)}</div>}

              {/* THE BUTTONS */}
              <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                {isNew ? (
                  <button disabled={readOnly || !!busy || problems.length > 0} onClick={() => save(false)} style={{ ...btn("gold"), opacity: readOnly || !!busy || problems.length > 0 ? 0.5 : 1 }}>Save new style → v1</button>
                ) : (
                  <>
                    <div>
                      <button disabled={readOnly || !!busy || problems.length > 0} onClick={() => save(true)} style={{ ...btn("gold"), opacity: readOnly || !!busy || problems.length > 0 ? 0.5 : 1 }}>Save as new version → v{nextV}</button>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 4, maxWidth: 300 }}>
                        {staleCount === null ? "Counting the bank…" : `${staleCount} picture${staleCount === 1 ? "" : "s"} in ${draft.id} will read stale in the bank`} — the existing stale mechanism does the rest: regenerate them there from their own subjects.
                      </div>
                    </div>
                    <button disabled={readOnly || !!busy || problems.length > 0} onClick={() => save(false)} style={{ ...btn("ghost"), opacity: readOnly || !!busy || problems.length > 0 ? 0.5 : 1 }} title="Typo fixes that shouldn't invalidate the library">
                      Save without bumping (v{saved?.version} in place)
                    </button>
                  </>
                )}
                <span style={{ flex: 1 }} />
                <button disabled={readOnly || !!busy || isNew || dirty || isDefault || !!draft.retired} onClick={() => settings({ defaultStyleId: draft.id }, `${draft.id} is now the default for exam content.`)}
                  style={{ ...btn("ghost"), opacity: readOnly || isNew || dirty || isDefault || draft.retired ? 0.5 : 1 }} title={dirty ? "Save first" : "New exam pictures start in this style; every other style's exam pictures read off-style in the bank"}>
                  {isDefault ? "✓ exam default" : "Make default for exam content"}
                </button>
                <button disabled={readOnly || !!busy || isNew || dirty || isStrategy || !!draft.retired} onClick={() => settings({ strategyStyleId: draft.id }, `${draft.id} is now the strategy shorts' style.`)}
                  style={{ ...btn("ghost"), opacity: readOnly || isNew || dirty || isStrategy || draft.retired ? 0.5 : 1 }} title={dirty ? "Save first" : "The reps / chairs / founder shorts start in this style"}>
                  {isStrategy ? "✓ strategy style" : "Make strategy style"}
                </button>
                {!isNew && !confirmRetire && (
                  <button disabled={readOnly || !!busy || isDefault || isStrategy} onClick={() => (saved?.retired ? toggleRetire() : setConfirmRetire(true))}
                    style={{ ...btn(saved?.retired ? "ghost" : "danger"), opacity: readOnly || isDefault || isStrategy ? 0.5 : 1 }} title={isDefault || isStrategy ? "Make another style the default first" : "Old pictures keep resolving; nothing new starts in it"}>
                    {saved?.retired ? "Un-retire" : "Retire"}
                  </button>
                )}
                {confirmRetire && (
                  <span className="flex items-center gap-2" style={{ fontSize: 12.5 }}>
                    Retire {draft.id}?
                    <button onClick={toggleRetire} style={btn("danger")}>yes, retire</button>
                    <button onClick={() => setConfirmRetire(false)} style={btn("quiet")}>cancel</button>
                  </span>
                )}
              </div>

              {/* VERSION HISTORY */}
              {versions.length > 0 && (
                <details style={{ marginTop: 14 }}>
                  <summary style={{ ...label, cursor: "pointer", display: "inline" }}>version history · {versions.length}</summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    {versions.map((v) => (
                      <div key={v.version} style={{ border: `1px solid ${EDGE}`, borderRadius: 10, padding: "8px 10px", fontSize: 12.5 }}>
                        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                          <span style={{ fontFamily: MONO, color: v.version === saved?.version ? GOLD : CREAM }}>v{v.version}</span>
                          <span style={{ fontWeight: 700 }}>{v.label}</span>
                          {v.version === saved?.version && <span style={chip(GOLD)}>latest</span>}
                          {v.retired && <span style={chip(MUTED)}>retired</span>}
                          {unseededOf(v) && <span style={chip(ORANGE)}>code only</span>}
                          <span style={{ flex: 1 }} />
                          <button onClick={() => { select(v); setMsg(`v${v.version} loaded into the editor as a draft — nothing saved.`); }} style={btn("quiet")}>load into editor</button>
                          <button disabled={!!testing} onClick={() => void runTest(`${v.id} v${v.version}`, v)} style={btn("quiet")} title="The test panel's subject, the same seeds, this version">try subject against v{v.version}</button>
                        </div>
                        {v.note && <div style={{ color: MUTED, marginTop: 4 }}>{v.note}</div>}
                        <details style={{ marginTop: 4 }}>
                          <summary style={{ fontSize: 11, color: MUTED, cursor: "pointer" }}>suffix · palette</summary>
                          <div style={{ fontFamily: MONO, fontSize: 11, color: CREAM, opacity: 0.8, whiteSpace: "pre-wrap", marginTop: 4, lineHeight: 1.45 }}>{v.promptSuffix}</div>
                          <div className="flex items-center gap-2" style={{ marginTop: 6, flexWrap: "wrap" }}>
                            {v.controls.colors.map((c, i) => <span key={i} className="flex items-center gap-1" style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}><span style={{ width: 14, height: 14, borderRadius: 4, background: rgbToHex(c.rgb), display: "inline-block" }} />{rgbToHex(c.rgb)} {c.weight ?? 0}</span>)}
                            <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>Σ {weightSum(v.controls.colors).toFixed(2)} · {v.model} · {v.size} · {ANIMATION_LABEL[v.defaultAnimation]}</span>
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}
          {!draft && <section style={section}><div style={{ color: MUTED, fontSize: 13 }}>{loaded ? "Pick a style on the left." : "Loading the registry…"}</div></section>}

          {/* THE TEST PANEL — the important part */}
          <section style={{ ...section, border: `1px solid ${GOLD}55` }}>
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 18 }}>Test panel</span>
              <span style={{ fontSize: 12, color: MUTED }}>real generations, on the phone stage, never written to a slide · catalogued under “_preview” · one at a time</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12.5 }}>spent this session: <b style={{ color: GOLD }}>{usd(spent)}</b>{bank?.medianCostUsd ? <span style={{ color: MUTED }}> · about {usd(bank.medianCostUsd)} a picture</span> : null}</span>
            </div>
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="the subject sentence — e.g. a young professional seen from behind at the glass of a high floor, the city below"
                onKeyDown={(e) => { if (e.key === "Enter" && !testing) generateDraft(); }} style={{ ...field, flex: 1, minWidth: 320 }} />
              <button disabled={!draft || !!testing || !subject.trim()} onClick={generateDraft} style={{ ...btn("gold"), opacity: !draft || testing || !subject.trim() ? 0.5 : 1 }}
                title="The CURRENT UNSAVED DRAFT, four times, one after the other, with the four fixed seeds">
                Generate {PREVIEW_COUNT} with the draft
              </button>
              {testing && <button onClick={() => { stopRef.current = true; }} style={btn("ghost")}>Stop after this one</button>}
            </div>
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginTop: 8, fontSize: 12, color: MUTED }}>
              <span>seeds, one per column, shared by every row so rows differ only by style:</span>
              {seeds.map((s, i) => <span key={i} style={{ fontFamily: MONO, color: CREAM }}>{s}</span>)}
              <button disabled={!!testing} onClick={() => setSeeds(fixedSeeds(PREVIEW_COUNT))} style={btn("quiet")} title="Roll four new seeds — rows already drawn keep theirs">new seeds</button>
            </div>
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginTop: 8, fontSize: 12, color: MUTED }}>
              <span>try this subject against a saved version:</span>
              {reg.history.map((v) => (
                <button key={`${v.id}@${v.version}`} disabled={!!testing || !subject.trim()} onClick={() => void runTest(`${v.id} v${v.version}`, v)}
                  style={{ ...chip(v.id === draft?.id ? GOLD : CREAM), cursor: "pointer", opacity: testing || !subject.trim() ? 0.5 : 1, textTransform: "none", letterSpacing: 0, fontFamily: MONO }}>
                  {v.id} v{v.version}{v.retired ? " · retired" : ""}
                </button>
              ))}
            </div>

            {tests.length === 0 && <div style={{ color: MUTED, fontSize: 12.5, marginTop: 14 }}>Nothing drawn yet. Type a subject, then Generate {PREVIEW_COUNT} with the draft — or pick a saved version to draw the same subject with the same seeds.</div>}
            {tests.map((row) => (
              <div key={row.key} style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${EDGE}` }}>
                <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginBottom: 8, fontSize: 12.5 }}>
                  <span style={{ fontFamily: MONO, fontWeight: 800, color: row.label.startsWith("draft") ? GOLD : CREAM }}>{row.label}</span>
                  <span style={{ color: MUTED }}>“{row.subject}”</span>
                  <span style={{ color: MUTED }}>· {usd(rowCost(row))}</span>
                  {testing?.key === row.key && <span style={{ color: GOLD }}>· drawing {testing.i + 1} of {row.slots.length}…</span>}
                  <span style={{ flex: 1 }} />
                  <details>
                    <summary style={{ fontSize: 11, color: MUTED, cursor: "pointer" }}>the suffix + palette this row used</summary>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: CREAM, opacity: 0.8, whiteSpace: "pre-wrap", marginTop: 4, lineHeight: 1.45, maxWidth: 720 }}>{row.style.promptSuffix}</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, marginTop: 4 }}>{row.style.controls.colors.map((c) => `${rgbToHex(c.rgb)} ${c.weight ?? 0}`).join(" · ")} · Σ {weightSum(row.style.controls.colors).toFixed(2)} · {row.style.model}</div>
                  </details>
                  <button disabled={testing?.key === row.key} onClick={() => setTests((t) => t.filter((x) => x.key !== row.key))} style={btn("quiet")} title="Take this row off the page (the pictures stay in the library)">✕</button>
                </div>
                <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                  {row.slots.map((slot, i) => (
                    <div key={i} style={{ flexShrink: 0 }}>
                      <Stage url={slot.state === "ok" ? slot.r.url : null}
                        note={slot.state === "pending" ? "queued" : slot.state === "running" ? <span style={{ color: GOLD }}>drawing…</span> : slot.state === "err" ? <span style={{ color: RED }}>✗ {slot.error}</span> : undefined} />
                      <div style={{ fontFamily: MONO, fontSize: 10.5, color: MUTED, marginTop: 4, width: STAGE_W, display: "flex", justifyContent: "space-between" }}>
                        <span title="seed">{row.seeds[i]}</span>
                        <span>{slot.state === "ok" ? (slot.r.costUsd === null ? "cost n/a" : usd(slot.r.costUsd)) : ""}</span>
                      </div>
                      {slot.state === "ok" && <a href={slot.r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: MUTED, textDecoration: "underline" }}>PNG ↗</a>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* BRIEF_SYSTEM */}
          <section style={section}>
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 18 }}>The brief's system prompt</span>
              <span style={chip(reg.briefSystem ? GOLD : MUTED)}>{reg.briefSystem ? "edited — from settings" : "code default"}</span>
              <span style={{ fontSize: 12, color: MUTED }}>the other half of how pictures look: the cast, the setting, the banned subjects, the pair rule. The preset adds the medium; this writes the subject.</span>
            </div>
            <textarea rows={18} value={briefText ?? ""} onChange={(e) => setBriefText(e.target.value)} spellCheck={false}
              style={{ ...field, fontFamily: MONO, fontSize: 12, lineHeight: 1.5, resize: "vertical" }} disabled={briefText === null} />
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginTop: 8 }}>
              {/* The brief lives in site_settings (always there), so this saves even before the styles migration. */}
              <button disabled={!!busy || briefText === null || briefText === (reg.briefSystem ?? BRIEF_SYSTEM)} onClick={() => briefText !== null && settings({ briefSystem: briefText }, "Brief saved — the next Prep the prompt uses it.")}
                style={{ ...btn("gold"), opacity: busy || briefText === null || briefText === (reg.briefSystem ?? BRIEF_SYSTEM) ? 0.5 : 1 }}>Save brief</button>
              <button disabled={!!busy || (!reg.briefSystem && briefText === BRIEF_SYSTEM)} onClick={() => { setBriefText(BRIEF_SYSTEM); if (reg.briefSystem) void settings({ briefSystem: null }, "Brief reset to the code default."); }}
                style={{ ...btn("ghost"), opacity: busy || (!reg.briefSystem && briefText === BRIEF_SYSTEM) ? 0.5 : 1 }}>Reset to code default</button>
              <span style={{ fontSize: 11.5, color: MUTED }}>{briefText !== null && briefText !== BRIEF_SYSTEM ? "differs from the code default" : "same as the code default"}{briefText !== null && briefText !== (reg.briefSystem ?? BRIEF_SYSTEM) ? " · unsaved" : ""}</span>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
