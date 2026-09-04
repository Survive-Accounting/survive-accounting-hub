// REVIEW DECK — Step 2 as the film draft.
//
// Lee (2026-09-03): "The main thing I want to get is a way to see the slides
// and edit them / approve them … spin up quick slides for Memorize This,
// Deeper Ideas, Cheat Codes and place them in the middle of a CEQ set …
// quickly remove a CEQ slide, duplicate, edit text, rearrange … Talkthrough is
// just talking. Review is seeing the filming draft as it stands … A third
// slide to the right of the current one … the teleprompter."
//
// Second pass: a drop line that says above or below; space and shift+space to
// walk the slides; "Summary slide" (opening / closing); bullets under a
// callout; a phone-shaped stage because every video is vertical; the prompter
// as stamps → phrases → slides.
//
// Third pass: "view all stamps … click each example and let it navigate to
// the slide it was from … let's just let the stamps be proofread by default.
// Save the raw text in the toggle still." And the card's heading is bold, not
// highlighted: "If I want to emphasize something, let me just highlight it
// when filming."
//
// Three EQUAL columns (Lee, 2026-09-04: "Film draft is left 1/3, slide # of #
// is middle 1/3, teleprompter is right 1/3"). LEFT: the Blast Off plan — the
// same frames film mode walks, with duplicate / skip / remove as icons that
// show on hover. MIDDLE: the selected slide on a 9:16 stage. RIGHT: one panel
// with two faces — the teleprompter, or the slide's editor ("instead of having
// edits of a slide underneath … have them left/right"); a CEQ edit shows
// before and after and saves through the one existing door (applyCeqEdit).
// Nothing here is a new store: the plan is deck.blastOff; prompter lines and
// bullets live on the frame.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { applyCeqEdit, revertCeqEdit, runMicro, type BoothCeq, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";
import type { TTDoc } from "@/components/canvas/talkthrough";
import { NOTE_EYEBROW } from "@/components/canvas/frame-copy";
import { refreshBank } from "@/components/v3/use-bank";
import { BankPicker } from "./BankPicker";
import { BIO_CARD } from "./bio-card";
import { CREAM, EDGE, FrameView, GOLD, MUTED, PANEL, questionProgress, usePlan } from "./BlastOffEditor";
import { SetCard } from "./SetCard";
import {
  AD_KINDS, FRAME_LABEL, backdropFor, dropFrame, duplicateFrame, filmFrames, frameBullets, insertFrame, insertStem, isAdKind, isInsert, isStandard, moveFrame, newFrameId, patchFrame, toggleSkip,
  type BackdropMode, type BlastFrame, type BlastFrameKind,
} from "./plan";
import { ZOOM_VARIANTS } from "@/components/brand-cards/bolt-zoom";
import { ADS, AD_LABEL } from "./AdSlide";
import { PhoneFrame } from "./PhoneFrame";
import {
  PHRASE_SLIDE_KINDS, buildTidyMessages, frameKindForStamp, parseTidy, prompterCandidates, prompterGroups, readTidy, setStampCandidates, tidyCacheKey, writeTidy,
  type PrompterCandidate, type TidyPhrase, type TidyResult,
} from "./prompter";

/** What the AI board hands the deck: "＋ slide" on an idea card. */
export interface DeckApi { addSlide: (kind: BlastFrameKind, patch: Partial<BlastFrame>) => void }

const QUICK: readonly { kind: BlastFrameKind; label: string; patch?: Partial<BlastFrame> }[] = [
  { kind: "phrase", label: "Memorize this" },
  { kind: "cheat", label: "Cheat code" },
  { kind: "tip", label: "Deeper idea" },
  // 2026-09-04: the bolt detour (Lee's OBS camera bed) and the three ads.
  { kind: "bolt", label: "Bolt detour" },
  { kind: "ad", label: "Ad · Greek", patch: { ad: "greek" } },
  { kind: "ad", label: "Ad · reps", patch: { ad: "rep" } },
  { kind: "ad", label: "Ad · syllabus", patch: { ad: "send" } },
];

const SKY = "#7DD3FC";
const MINT = "#3BF5A0";
const RED = "#F87171";
const ORANGE = "#FF9F43";
/** The kind's colour in the list and on the stage — matches the detour skin. */
const KIND_COLOR: Partial<Record<BlastFrameKind, string>> = { cheat: GOLD, phrase: ORANGE, tip: SKY, exhibit: GOLD, blank: MUTED, bolt: "#B3E5FC", ad: MINT };

// THE PHONE STAGE — every video is vertical (Lee: "I am considering even
// continuing to ONLY make vertical videos"). 9:16, with the zones TikTok and
// Shorts paint their own UI over, so a phrase never hides under a caption.
const STAGE_W = 306;

type CeqDraft = { stem: string; choices: { text: string; correct: boolean; feedback: string }[] };
const draftOf = (c: BoothCeq): CeqDraft => ({ stem: c.stem, choices: c.choices.map((x) => ({ text: x.text, correct: x.correct, feedback: x.feedback ?? "" })) });
const sameDraft = (a: CeqDraft, b: CeqDraft): boolean => JSON.stringify(a) === JSON.stringify(b);

const chip = (on: boolean, color = GOLD): React.CSSProperties => ({
  border: `1px solid ${on ? color : EDGE}`, background: on ? `${color}22` : "transparent", color: on ? color : CREAM,
  borderRadius: 9, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
});
const tiny: React.CSSProperties = { background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13, padding: "0 4px", lineHeight: 1 };
const field: React.CSSProperties = {
  width: "100%", background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 9, color: CREAM,
  padding: "7px 9px", fontSize: 13, lineHeight: 1.45, fontFamily: "inherit", boxSizing: "border-box",
};
const eyebrow: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD, fontWeight: 800 };
const subhead: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, fontWeight: 800 };

// THE RIGHT PANEL has two faces (Lee, 2026-09-04: "Teleprompter maybe can be
// toggleable between editor / teleprompter"). The face he left it on is
// remembered per browser; a browser that refuses storage just forgets.
type RightTab = "teleprompter" | "editor";
const RIGHT_TAB_KEY = "sa-review-right-tab";
const readRightTab = (): RightTab => { try { return localStorage.getItem(RIGHT_TAB_KEY) === "editor" ? "editor" : "teleprompter"; } catch { return "teleprompter"; } };
const writeRightTab = (t: RightTab): void => { try { localStorage.setItem(RIGHT_TAB_KEY, t); } catch { /* storage refused — the tab simply won't stick */ } };
/** The right column's shell, shared by both faces: sticky, so it rides along
 *  while the spine scrolls, and never taller than the viewport. */
const panelShell: React.CSSProperties = {
  background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 12, padding: "10px 12px",
  position: "sticky", top: 12, maxHeight: "calc(100vh - 24px)", overflowY: "auto",
};
/** The spine's per-row verbs (duplicate · skip / remove) show on hover, or on
 *  the selected row — Lee: "icons that show up on hover on the left spine like
 *  when a slide is selected". Keyboard focus reveals them too. */
const SPINE_CSS = `
.sa-spine-row .sa-spine-tools{opacity:0;transition:opacity .12s}
.sa-spine-row:hover .sa-spine-tools,.sa-spine-row.is-on .sa-spine-tools,.sa-spine-row.is-menu .sa-spine-tools,.sa-spine-row .sa-spine-tools:focus-within{opacity:1}
.sa-slide-menu button:hover{background:rgba(255,255,255,0.06)}
`;

// THE SLIDE'S MENU (Lee, 2026-09-04: "for any slides, give them a … menu with
// any settings, tools, etc relevant to that slide. Maybe put that menu to
// right of the skip"). A ⋯ as the last hover icon on every row opens a small
// panel under the row. Every item goes through the verbs the icons and the
// editor already use — nothing here is a new door to the plan.
type MenuItem = { label: string; title?: string; color?: string; run: () => void };
/** A row of chips inside the menu — the bolt's six animations, the three ads. */
type MenuChips = { label: string; chips: { id: string; label: string; on: boolean; title?: string }[]; pick: (id: string) => void };

function SlideMenu({ items, chips, onClose }: { items: MenuItem[]; chips: MenuChips[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Escape closes; so does a press anywhere outside — except on a row's ⋯,
  // which toggles (or moves the menu to its own row) by itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (ref.current && t && !ref.current.contains(t) && !t.closest(".sa-spine-more")) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [onClose]);
  const item: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderRadius: 7, padding: "5px 9px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" };
  return (
    <div ref={ref} role="menu" className="sa-slide-menu" draggable={false}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
      style={{ position: "absolute", right: 6, top: "calc(100% + 4px)", zIndex: 40, minWidth: 224, maxWidth: 300, background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.55)", padding: 5, cursor: "default" }}>
      {items.map((it) => (
        <button key={it.label} type="button" role="menuitem" title={it.title} style={{ ...item, color: it.color ?? CREAM }} onClick={() => { it.run(); onClose(); }}>{it.label}</button>
      ))}
      {chips.map((g) => (
        <div key={g.label} style={{ padding: "6px 9px 4px", borderTop: `1px solid ${EDGE}`, marginTop: 4 }}>
          <div style={subhead}>{g.label}</div>
          <div className="flex" style={{ gap: 4, flexWrap: "wrap", marginTop: 5 }}>
            {g.chips.map((c) => (
              <button key={c.id} type="button" title={c.title} style={{ ...chip(c.on, ORANGE), padding: "2px 8px", fontSize: 10.5 }} onClick={() => { g.pick(c.id); onClose(); }}>{c.label}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/** A proofread phrase → the slide it becomes: the title is the bold heading,
 *  the phrase is the first line under it, and it opens the prompter. */
export function slidePatchFor(kind: BlastFrameKind, p: { title: string; text: string }): Partial<BlastFrame> {
  const title = p.title.trim();
  if (kind === "cheat") return { title: title || p.text, body: title ? p.text : "", prompter: [p.text] };
  return { text: title || p.text, bullets: title ? [p.text] : [], prompter: [p.text] };
}

export function ReviewDeck({ set, topic, doc, register }: {
  set: BoothSetInfo; topic: BoothTopic; doc: TTDoc;
  /** Hands the deck's verbs to whoever mounts it (the AI board's "＋ slide"). */
  register?: (api: DeckApi | null) => void;
}) {
  // CEQ edits saved this visit: the bank reloads on the next page load; until
  // then the preview and the list read the edited card from here.
  const [overrides, setOverrides] = useState<Record<string, CeqDraft>>({});
  const viewSet = useMemo<BoothSetInfo>(() => ({
    ...set,
    ceqs: set.ceqs.map((c) => {
      const o = overrides[c.id];
      return o ? { ...c, stem: o.stem, choices: o.choices.map((x) => ({ text: x.text, correct: x.correct, feedback: x.feedback || undefined })) } : c;
    }),
  }), [set, overrides]);

  const { plan, commit, saving } = usePlan(set);
  const frames = useMemo(() => plan?.frames ?? [], [plan]);
  const ceqById = useMemo(() => new Map(viewSet.ceqs.map((c) => [c.id, c])), [viewSet.ceqs]);
  const progress = useMemo(() => questionProgress(filmFrames(frames), ceqById), [frames, ceqById]);
  // SUMMARY SLIDES (Lee: "instead of calling this a note slide, we call it a
  // summary slide. It'll be at the beginning and end of the video"). The set's
  // note-only cards in bank order: first = opening, last = closing.
  const summaryLabel = useMemo(() => {
    const notes = viewSet.ceqs.filter((c) => c.noteOnly).map((c) => c.id);
    const m = new Map<string, string>();
    notes.forEach((id, i) => m.set(id, notes.length >= 2 && i === 0 ? "Opening summary" : notes.length >= 2 && i === notes.length - 1 ? "Closing summary" : "Summary slide"));
    return m;
  }, [viewSet.ceqs]);

  const [selId, setSelId] = useState<string | null>(null);
  const sel = frames.find((f) => f.id === selId) ?? frames[0] ?? null;
  const selIdx = sel ? frames.indexOf(sel) : -1;

  // Which face the right panel shows. Read lazily: the panel only renders once
  // the plan has loaded on the client, so there is nothing to mismatch.
  const [rightTab, setRightTabState] = useState<RightTab>(readRightTab);
  const setRightTab = useCallback((t: RightTab) => { setRightTabState(t); writeRightTab(t); }, []);

  const [picker, setPicker] = useState<BlastFrameKind | null>(null);
  /** Insert after a given frame (or the selected one), optionally selecting it. */
  const insertAfter = useCallback((afterId: string | null, kind: BlastFrameKind, patch: Partial<BlastFrame> = {}, select = true) => {
    if (!plan) return;
    const f: BlastFrame = { id: newFrameId(kind), kind, ...patch };
    const i = afterId ? plan.frames.findIndex((x) => x.id === afterId) : selIdx;
    commit(insertFrame(plan.frames, f, i < 0 ? plan.frames.length - 1 : i));
    if (select) setSelId(f.id);
    setPicker(null);
  }, [plan, commit, selIdx]);
  const add = useCallback((kind: BlastFrameKind, patch: Partial<BlastFrame> = {}) => insertAfter(null, kind, patch, true), [insertAfter]);
  useEffect(() => { register?.({ addSlide: (k, p) => add(k, p) }); return () => register?.(null); }, [register, add]);

  const patch = useCallback((id: string, p: Partial<BlastFrame>) => { if (plan) commit(patchFrame(plan.frames, id, p)); }, [plan, commit]);

  // Which row's ⋯ menu is open (one at a time). A row that leaves the plan
  // while its menu is up takes the menu with it.
  const [menuId, setMenuId] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenuId(null), []);
  useEffect(() => { if (menuId && !frames.some((f) => f.id === menuId)) setMenuId(null); }, [frames, menuId]);

  // SPACE / SHIFT+SPACE walk the slides (Lee: "I like to do this to prep
  // myself to film through them") — the same keys as film mode. Never while
  // typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only a bare space, not held, with nothing focused that takes text —
      // and never with a modifier (Ctrl+Space, Alt+Space are the browser's).
      // Not while a slide's ⋯ menu is open either — space is picking an item there.
      if (e.key !== " " || e.repeat || e.ctrlKey || e.metaKey || e.altKey || menuId || isTyping(e.target) || isTyping(document.activeElement) || !frames.length) return;
      e.preventDefault();
      const i = selIdx < 0 ? 0 : selIdx;
      const next = e.shiftKey ? Math.max(0, i - 1) : Math.min(frames.length - 1, i + 1);
      setSelId(frames[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frames, selIdx, menuId]);

  // DRAG TO REORDER — plain HTML5 drag, no library. The drop line sits above
  // or below the row under the cursor, so it is never a guess (Lee: "I can't
  // tell if it slots in above or below").
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ i: number; below: boolean } | null>(null);
  const drop = () => {
    if (plan && dragId && over) {
      const from = plan.frames.findIndex((f) => f.id === dragId);
      let to = over.below ? over.i + 1 : over.i;
      if (from < to) to -= 1;
      if (from >= 0 && from !== to) commit(moveFrame(plan.frames, from, to));
    }
    setDragId(null); setOver(null);
  };

  // THE ROW VERBS (Lee, 2026-09-04: "Duplicate and remove also can be icons
  // that show up on hover on the left spine"). Same moves the slide's chips
  // made: the copy is selected; a removed row hands selection to its
  // neighbour — but only when it was the selected one.
  const duplicateAt = (id: string, i: number) => { const next = duplicateFrame(frames, id); commit(next); setSelId(next[i + 1]?.id ?? id); };
  const removeAt = (id: string, i: number) => { const next = dropFrame(frames, id); commit(next); if (id === sel?.id) setSelId(next[Math.min(i, next.length - 1)]?.id ?? null); };

  /** What the ⋯ menu offers this slide: the row's own verbs first, then the
   *  switches the editor and the stage have (backdrop, banner), then what only
   *  this kind has (the bolt's animation, which ad, the bio's portrait). */
  const menuFor = (f: BlastFrame, i: number): { items: MenuItem[]; chips: MenuChips[] } => {
    const edit = () => { setSelId(f.id); setRightTab("editor"); };
    const items: MenuItem[] = [
      {
        label: f.kind === "ad" ? "✎ Edit the copy" : f.kind === "ceq" && f.ceqId && ceqById.has(f.ceqId) ? "✎ Edit the card" : "✎ Edit this slide",
        title: "Open it in the editor, beside the slide", color: GOLD, run: edit,
      },
      { label: "⧉ Duplicate", title: "A copy right after this one", run: () => duplicateAt(f.id, i) },
      isInsert(f.kind)
        ? { label: "✕ Remove", title: "Remove this slide", color: RED, run: () => removeAt(f.id, i) }
        : f.skipped
          ? { label: "↺ Film it", title: "Film this slide again", color: MINT, run: () => commit(toggleSkip(frames, f.id)) }
          : { label: "⊘ Skip in the film", title: "Skip this card in the film (it stays in the set)", color: RED, run: () => commit(toggleSkip(frames, f.id)) },
    ];
    if (f.kind !== "open") {
      // The same cycle as the ✨ chip on the stage: auto (the rule) → black → off.
      const word = (b: BlastFrame["backdrop"]) => (b === undefined ? "auto" : b === "zoom" ? "black" : "off");
      const next: BlastFrame["backdrop"] = f.backdrop === undefined ? "zoom" : f.backdrop === "zoom" ? "off" : undefined;
      items.push({ label: `✨ Backdrop · ${word(f.backdrop)}`, title: `The black stage behind this slide — auto (the rule) → black → off. Next: ${word(next)}`, run: () => patch(f.id, { backdrop: next }) });
    }
    // The cold open carries the banner unless told not to; every other slide only when asked.
    const bannerOn = f.kind === "open" ? f.banner !== "off" : f.banner === "on";
    items.push({
      label: `🏫 Campus banner · ${bannerOn ? "on" : "off"}`, title: "The slow Power Four banner along the lower third",
      run: () => patch(f.id, { banner: f.kind === "open" ? (f.banner === "off" ? undefined : "off") : (f.banner === "on" ? undefined : "on") }),
    });
    if (f.kind === "bio") items.push({ label: `🖼 Portrait · ${f.portrait === "off" ? "off" : "on"}`, title: "The hand-drawn portrait over the black — on unless you turn it off", run: () => patch(f.id, { portrait: f.portrait === "off" ? undefined : "off" }) });
    const chips: MenuChips[] = [];
    if (f.kind === "bolt") chips.push({ label: "The animation", chips: ZOOM_VARIANTS.map((v) => ({ id: v.id, label: v.label, on: (f.variant ?? "zoom") === v.id, title: v.blurb })), pick: (id) => patch(f.id, { variant: id }) });
    if (f.kind === "ad") chips.push({ label: "Which ad", chips: AD_KINDS.map((k) => ({ id: k, label: AD_LABEL[k].replace(/^Ad · /, ""), on: (f.ad ?? "greek") === k })), pick: (id) => { if (isAdKind(id)) patch(f.id, { ad: id }); } });
    return { items, chips };
  };

  const snippet = (f: BlastFrame): string => {
    const ceq = f.ceqId ? ceqById.get(f.ceqId) : undefined;
    if (f.kind === "open") return "Black · the glow wordmark · Power Four ticker";
    if (f.kind === "intro") return f.text?.trim() || set.name;
    if (f.kind === "bio") return "Lee Ingram · BAccy · MAccy — Ole Miss";
    if (f.kind === "outro") return f.text?.trim() || "Cram what's on your exam.";
    if (f.kind === "ceq") return ceq ? (ceq.noteOnly ? ceq.stem : `${ceq.label} · ${ceq.stem}`) : "— card missing from the set —";
    if (f.kind === "cheat") return [f.title, f.body].filter(Boolean).join(" — ") || "(empty cheat code)";
    if (f.kind === "ad") return f.title?.trim() || ADS[f.ad ?? "greek"].headline;
    if (f.kind === "bolt") return `Black + the ${f.variant ?? "zoom"} animation`;
    if (f.kind === "exhibit") return f.text?.trim() || (f.exhibitRef ? `Exhibit: ${f.exhibitRef}` : "Exhibit");
    return f.text?.trim() || `(empty ${FRAME_LABEL[f.kind].toLowerCase()})`;
  };
  const labelOf = (f: BlastFrame): string => (f.kind === "ceq" && f.ceqId && summaryLabel.get(f.ceqId)) || (f.kind === "ad" && f.ad ? AD_LABEL[f.ad] : FRAME_LABEL[f.kind]);
  const colorOf = (f: BlastFrame): string => KIND_COLOR[f.kind] ?? (isStandard(f.kind) ? SKY : f.kind === "ceq" && f.ceqId && summaryLabel.has(f.ceqId) ? MINT : MUTED);

  if (!plan) return <div style={{ color: MUTED, fontSize: 13 }}>Loading the film draft…</div>;

  const filmed = filmFrames(frames).length;
  const skipped = frames.length - filmed;
  const tabs = <RightTabs tab={rightTab} onTab={setRightTab} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 18, alignItems: "start" }}>
      {/* ------------------------------------------------ LEFT: the spine */}
      <section>
        <style>{SPINE_CSS}</style>
        <div className="flex items-center" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={eyebrow}>Film draft</span>
          <span style={{ fontSize: 11.5, color: MUTED }}>{filmed} slides{skipped ? ` · ${skipped} skipped` : ""}</span>
          {saving && <span style={{ fontSize: 11, color: saving.startsWith("⚠") ? RED : saving === "saved" ? MINT : MUTED, marginLeft: "auto" }}>{saving}</span>}
        </div>
        <div className="flex" style={{ gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          {QUICK.map((q) => (
            <button key={q.label} style={chip(false, KIND_COLOR[q.kind])} title={`Insert a ${q.label} slide after slide ${selIdx + 1}`} onClick={() => add(q.kind, q.patch)}>＋ {q.label}</button>
          ))}
          <button style={chip(picker === "exhibit")} title="Insert an exhibit after the selected slide" onClick={() => setPicker(picker === "exhibit" ? null : "exhibit")}>＋ Exhibit</button>
          <button style={chip(false)} title="Insert a bare frame" onClick={() => add("blank")}>＋ Blank</button>
        </div>
        <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 10 }}>inserts land after the selected slide · space / shift+space walk the slides · drag to reorder</div>
        {picker && <BankPicker kind={picker} setId={set.id} setName={set.name} onPick={(p) => add(picker, p)} onClose={() => setPicker(null)} />}

        <div className="flex flex-col" style={{ gap: 5 }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); }}>
          {frames.map((f, i) => {
            const on = f.id === sel?.id;
            const menu = menuId === f.id;
            const lineAbove = over?.i === i && !over.below && dragId !== f.id;
            const lineBelow = over?.i === i && over.below && dragId !== f.id;
            return (
              // A row with its menu open is not draggable — a press inside the menu must never pick the row up.
              <div key={f.id} draggable={!menu} className={`sa-spine-row${on ? " is-on" : ""}${menu ? " is-menu" : ""}`}
                onDragStart={() => setDragId(f.id)}
                onDragOver={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ i, below: e.clientY > r.top + r.height / 2 }); }}
                onDrop={(e) => { e.preventDefault(); drop(); }}
                onDragEnd={() => { setDragId(null); setOver(null); }}
                onClick={() => setSelId(f.id)}
                title="Click to open · drag to reorder"
                style={{
                  position: "relative", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 10, background: PANEL,
                  border: `1px solid ${on ? GOLD : EDGE}`,
                  boxShadow: lineAbove ? `0 -3px 0 0 ${SKY}` : lineBelow ? `0 3px 0 0 ${SKY}` : "none",
                  opacity: f.skipped ? 0.45 : dragId === f.id ? 0.5 : 1, cursor: "grab",
                }}>
                <span style={{ color: MUTED, fontSize: 11, fontWeight: 800, minWidth: 18, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: colorOf(f), minWidth: 92 }}>{labelOf(f)}</span>
                <span style={{ fontSize: 12, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textDecoration: f.skipped ? "line-through" : "none" }}>{snippet(f)}</span>
                {(f.prompter?.length ?? 0) > 0 && <span title={`${f.prompter!.length} teleprompter line${f.prompter!.length > 1 ? "s" : ""}`} style={{ fontSize: 10, color: MINT, fontWeight: 800 }}>🗒{f.prompter!.length}</span>}
                <span className="sa-spine-tools" style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 2 }}>
                  <button style={tiny} title="A copy right after this one" onClick={(e) => { e.stopPropagation(); duplicateAt(f.id, i); }}>⧉</button>
                  {f.skipped ? (
                    <button style={{ ...tiny, color: MINT }} title="Film this slide again" onClick={(e) => { e.stopPropagation(); commit(toggleSkip(frames, f.id)); }}>↺</button>
                  ) : isInsert(f.kind) ? (
                    <button style={{ ...tiny, color: RED }} title="Remove this slide" onClick={(e) => { e.stopPropagation(); removeAt(f.id, i); }}>✕</button>
                  ) : (
                    <button style={{ ...tiny, color: RED }} title="Skip this card in the film (it stays in the set)" onClick={(e) => { e.stopPropagation(); commit(toggleSkip(frames, f.id)); }}>⊘</button>
                  )}
                  <button className="sa-spine-more" style={{ ...tiny, color: menu ? GOLD : MUTED }} title="Everything for this slide — edit, duplicate, skip, backdrop, banner, and what only this kind has"
                    aria-haspopup="menu" aria-expanded={menu} onClick={(e) => { e.stopPropagation(); setMenuId(menu ? null : f.id); }}>⋯</button>
                </span>
                {menu && <SlideMenu {...menuFor(f, i)} onClose={closeMenu} />}
              </div>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------- MIDDLE: the slide */}
      <section>
        {sel && (
          <SlidePane key={sel.id} sel={sel} idx={selIdx} count={frames.length} label={labelOf(sel)} viewSet={viewSet} topic={topic}
            progress={progress.get(sel.id)}
            backdrop={backdropFor(frames, selIdx, (id) => !!ceqById.get(id)?.noteOnly)}
            frames={frames}
            onMove={(d) => commit(moveFrame(frames, selIdx, selIdx + d))}
            onPatch={(p) => patch(sel.id, p)} />
        )}
      </section>

      {/* --------------------------------- RIGHT: teleprompter | editor */}
      {rightTab === "editor" && sel ? (
        <SlideEditor key={sel.id} sel={sel} label={labelOf(sel)} set={set} topic={topic} tabs={tabs}
          ceq={sel.kind === "ceq" && sel.ceqId ? ceqById.get(sel.ceqId) : undefined}
          onPatch={(p) => patch(sel.id, p)}
          onSaved={(d) => { if (sel.ceqId) setOverrides((o) => ({ ...o, [sel.ceqId!]: d })); }} />
      ) : (
        <Prompter tabs={tabs} frame={sel} frames={frames} set={set} doc={doc} labelOf={labelOf} snippetOf={snippet}
          slideText={sel ? slideText(sel, ceqById) : ""}
          onLines={(id, lines) => patch(id, { prompter: lines })}
          onSelect={(id) => setSelId(id)}
          onSlideAfter={(id, kind, p) => insertAfter(id, kind, p, false)} />
      )}
    </div>
  );
}

/** The right panel's toggle — drawn as the panel's heading, so the face he is
 *  on reads like the column's name (as "Film draft" and "Slide n of m" do). */
function RightTabs({ tab, onTab }: { tab: RightTab; onTab: (t: RightTab) => void }) {
  const one = (t: RightTab, label: string, title: string) => (
    <button type="button" title={title} aria-pressed={tab === t} onClick={() => onTab(t)}
      style={{ ...eyebrow, color: tab === t ? GOLD : MUTED, background: "none", border: "none", borderBottom: `2px solid ${tab === t ? GOLD : "transparent"}`, borderRadius: 0, padding: "0 0 2px", cursor: "pointer", fontFamily: "inherit" }}>
      {label}
    </button>
  );
  return (
    <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {one("teleprompter", "Teleprompter", "Your own words for this slide — stamps, phrases, lines")}
      {one("editor", "Editor", "Edit the selected slide here, beside it")}
    </span>
  );
}

const slideText = (f: BlastFrame, byId: Map<string, BoothCeq>): string => {
  if (f.kind === "ceq" && f.ceqId) { const c = byId.get(f.ceqId); return c ? [c.stem, ...c.choices.map((x) => `${x.correct ? "✓" : "·"} ${x.text}`)].join("\n") : ""; }
  return [insertStem(f), ...frameBullets(f).map((b) => `• ${b}`)].join("\n");
};

// ------------------------------------------------------ the middle column

function SlidePane({ sel, idx, count, label, viewSet, topic, progress, backdrop, frames, onMove, onPatch }: {
  sel: BlastFrame; idx: number; count: number; label: string; viewSet: BoothSetInfo; topic: BoothTopic;
  progress?: { x: number; y: number };
  /** The bolt-zoom backdrop the rule (or the override) gives this slide. */
  backdrop: BackdropMode | null;
  /** The whole running order — the phone applies the backdrop rule itself. */
  frames: readonly BlastFrame[];
  onMove: (d: -1 | 1) => void;
  /** Only the backdrop toggle patches from here; the words are edited in SlideEditor. */
  onPatch: (p: Partial<BlastFrame>) => void;
}) {
  const [phone, setPhone] = useState(true);
  const [safe, setSafe] = useState(true);
  return (
    <>
      <div className="flex items-center" style={{ gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={eyebrow}>Slide {idx + 1} of {count}</span>
        <span style={{ fontSize: 11.5, color: MUTED }}>{label}{sel.skipped ? " · skipped" : ""}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <button style={chip(phone, SKY)} title="Show the slide on a 9:16 phone stage" onClick={() => setPhone((v) => !v)}>📱 phone</button>
          {sel.kind !== "open" && (
            // THE BACKDROP TOGGLE (Lee: "let me toggle any slide I want it to be
            // running"). auto = the rule (cold open → intro → opening summary).
            <button style={chip(!!backdrop, ORANGE)} title="The black stage (or the summary glow) on this slide: auto (the rule) → on → off"
              onClick={() => onPatch({ backdrop: sel.backdrop === undefined ? "zoom" : sel.backdrop === "zoom" ? "off" : undefined })}>
              ✨ backdrop · {sel.backdrop ?? "auto"}{backdrop ? ` (${backdrop})` : ""}
            </button>
          )}
          {phone && <button style={chip(safe, SKY)} title="Shade the zones TikTok and Shorts paint their own UI over" onClick={() => setSafe((v) => !v)}>safe zones</button>}
          <button style={tiny} title="Move up" onClick={() => onMove(-1)}>↑</button>
          <button style={tiny} title="Move down" onClick={() => onMove(1)}>↓</button>
        </span>
      </div>

      {phone ? (
        <PhoneFrame frame={sel} frames={frames} index={idx} set={viewSet} topicName={topic.name} progress={progress} safe={safe} dim={!!sel.skipped} w={STAGE_W} />
      ) : (
        <div style={{ border: `1px solid ${EDGE}`, borderRadius: 10, overflow: "hidden", display: "inline-block", maxWidth: "100%", opacity: sel.skipped ? 0.5 : 1 }}>
          <FrameView frame={sel} set={viewSet} scale={0.78} topicName={topic.name} progress={progress} />
        </div>
      )}
    </>
  );
}

// The phone stage itself is ./PhoneFrame.tsx — shared with Arrange and /film.

// ------------------------------------------------- the editor (right column)

/** Everything editable about the selected slide — beside it, not under it
 *  (Lee, 2026-09-04: "Instead of having edits of a slide underneath, it'd be
 *  faster/better to have them left/right"). A set card edits the card itself;
 *  an insert edits its words; the brand slides and ads edit their few
 *  switches. Same shell as the prompter — the two are faces of one column. */
function SlideEditor({ sel, label, ceq, set, topic, tabs, onPatch, onSaved }: {
  sel: BlastFrame; label: string; ceq?: BoothCeq; set: BoothSetInfo; topic: BoothTopic;
  /** The Teleprompter | Editor toggle, drawn by the deck. */
  tabs: ReactNode;
  onPatch: (p: Partial<BlastFrame>) => void; onSaved: (d: CeqDraft) => void;
}) {
  const bulletsText = (sel.bullets ?? []).join("\n");
  const detour = sel.kind === "phrase" || sel.kind === "tip" || sel.kind === "cheat";
  const ad = sel.kind === "ad" ? ADS[sel.ad ?? "greek"] : null;
  const adOwn = sel.text !== undefined || sel.title !== undefined || sel.bullets !== undefined || sel.url !== undefined;
  return (
    <section style={panelShell}>
      <div className="flex items-center" style={{ gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {tabs}
        <span style={{ fontSize: 11.5, color: MUTED }}>{label}{sel.skipped ? " · skipped" : ""}</span>
      </div>
      <div>
        {sel.kind === "ceq" && ceq && <CeqEditor key={ceq.id} ceq={ceq} topicName={topic.name} onSaved={onSaved} />}
        {sel.kind === "ceq" && !ceq && <div style={{ fontSize: 12, color: RED }}>This card is no longer in the set — skip it.</div>}
        {sel.kind === "cheat" && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <label style={{ fontSize: 11, color: MUTED }}>Title — the bold heading
              <input style={field} value={sel.title ?? ""} placeholder="e.g. The Paycheck Test" onChange={(e) => onPatch({ title: e.target.value })} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>First line under it
              <textarea style={{ ...field, minHeight: 48 }} value={sel.body ?? ""} placeholder="Ask yourself if they get a paycheck from the company. If so, they're internal." onChange={(e) => onPatch({ body: e.target.value })} /></label>
          </div>
        )}
        {(sel.kind === "phrase" || sel.kind === "tip" || sel.kind === "blank" || sel.kind === "exhibit") && (
          <label style={{ fontSize: 11, color: MUTED }}>{sel.kind === "phrase" || sel.kind === "tip" ? "Title — the bold heading" : sel.kind === "exhibit" ? `Caption${sel.exhibitRef ? ` · exhibit: ${sel.exhibitRef}` : ""}` : "Text on the bare frame"}
            <textarea style={{ ...field, minHeight: 48, marginTop: 4 }} value={sel.text ?? ""} placeholder={sel.kind === "phrase" ? "e.g. Internal users" : sel.kind === "tip" ? "e.g. Why the board feels like a gray area" : "say it the way you'd say it on camera"} onChange={(e) => onPatch({ text: e.target.value })} /></label>
        )}
        {detour && (
          <label style={{ fontSize: 11, color: MUTED, display: "block", marginTop: 8 }}>{sel.kind === "cheat" ? "More lines under it" : "Lines under it"} — one per line
            <textarea style={{ ...field, minHeight: 64, marginTop: 4 }} value={bulletsText} placeholder={"Management\nBudgets, costs, forecasts\nProduction"} onChange={(e) => onPatch({ bullets: e.target.value.split("\n") })} /></label>
        )}
        {detour && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6 }}>Nothing is highlighted on its own — highlight while filming, or type ==like this== for a fixed one. Type __word__ to underline, or ____ for a blank.</div>}
        {sel.kind === "intro" && (
          <label style={{ fontSize: 11, color: MUTED }}>Topic line on the intro (blank = the set's name)
            <input style={{ ...field, marginTop: 4 }} value={sel.text ?? ""} placeholder={set.name} onChange={(e) => onPatch({ text: e.target.value })} /></label>
        )}
        {sel.kind === "outro" && (
          <label style={{ fontSize: 11, color: MUTED }}>Tagline on the outro (blank = the standard one)
            <input style={{ ...field, marginTop: 4 }} value={sel.text ?? ""} placeholder="Cram what's on your exam." onChange={(e) => onPatch({ text: e.target.value })} /></label>
        )}
        {sel.kind === "bio" && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div style={{ fontSize: 12, color: MUTED }}>The tutor card — its words live in one place (bio-card.ts) so every rip says the same thing. Skip it if this rip doesn't need it.</div>
            <div>
              <button style={chip(sel.portrait !== "off", ORANGE)} title="The hand-drawn portrait over the black — on unless you turn it off" onClick={() => onPatch({ portrait: sel.portrait === "off" ? undefined : "off" })}>🖼 portrait · {sel.portrait === "off" ? "off" : "on"}</button>
            </div>
          </div>
        )}
        {sel.kind === "open" && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div style={{ fontSize: 11.5, color: MUTED }}>Black, the glow wordmark with the live bolt, the line, the Power Four ticker. The look is fixed now — the animations live on the bolt detour, and /branding keeps the experiments.</div>
            <div>
              <button style={chip(sel.banner !== "off", ORANGE)} title="The slow Power Four banner along the lower third" onClick={() => onPatch({ banner: sel.banner === "off" ? undefined : "off" })}>🏫 campus banner · {sel.banner === "off" ? "off" : "on"}</button>
            </div>
          </div>
        )}
        {sel.kind === "bolt" && (
          // THE BOLT DETOUR (Lee, 2026-09-04): "just black backdrop and the bolt
          // zoom animation, nothing else … a blank canvas to put things on".
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div style={subhead}>The animation</div>
            <div className="flex" style={{ gap: 5, flexWrap: "wrap" }}>
              {ZOOM_VARIANTS.map((v) => (
                <button key={v.id} style={chip((sel.variant ?? "zoom") === v.id, ORANGE)} title={v.blurb} onClick={() => onPatch({ variant: v.id })}>{v.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: MUTED }}>{ZOOM_VARIANTS.find((v) => v.id === (sel.variant ?? "zoom"))?.blurb}</div>
            <label style={{ fontSize: 11, color: MUTED, display: "flex", alignItems: "center", gap: 8 }}>
              psych <input type="range" min={0} max={1} step={0.05} value={sel.psych ?? 0.1} onChange={(e) => onPatch({ psych: Number(e.target.value) })} style={{ width: 160 }} />
              <span style={{ color: CREAM, fontVariantNumeric: "tabular-nums" }}>{Math.round((sel.psych ?? 0.1) * 100)}%</span>
              <span>0 = brand colours at rest · 100 = full trip</span>
            </label>
            <div style={{ fontSize: 11.5, color: MUTED }}>Black + the bolt, nothing else — put your camera on it in OBS, or lay an ad over it.</div>
          </div>
        )}
        {sel.kind === "ad" && ad && (
          // THE AD'S WORDS (Lee, 2026-09-04: "Let the ad's text be editable, so
          // I don't have to run changes through you"). Prefilled from the
          // built-in copy; an edit lands on this frame only — label → text,
          // headline → title, lines → bullets, address → url. "↺ default copy"
          // clears the four so the ad falls back to AdSlide.tsx.
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div style={subhead}>Which ad</div>
            <div className="flex" style={{ gap: 5, flexWrap: "wrap" }}>
              {AD_KINDS.map((k) => (
                <button key={k} style={chip((sel.ad ?? "greek") === k, ORANGE)} onClick={() => onPatch({ ad: k })}>{AD_LABEL[k]}</button>
              ))}
            </div>
            <div className="flex items-center" style={{ gap: 6, marginTop: 2 }}>
              <span style={subhead}>The copy</span>
              {adOwn && <span style={{ fontSize: 11, color: GOLD }}>edited on this slide</span>}
              <button style={{ ...chip(false), padding: "2px 8px", fontSize: 10.5, marginLeft: "auto", opacity: adOwn ? 1 : 0.5 }} disabled={!adOwn} title="Put the built-in words back — the four fields fall back to AdSlide.tsx"
                onClick={() => onPatch({ text: undefined, title: undefined, bullets: undefined, url: undefined })}>↺ default copy</button>
            </div>
            <label style={{ fontSize: 11, color: MUTED }}>Label — the small gold tag
              <input style={{ ...field, marginTop: 4 }} value={sel.text ?? ad.label} placeholder={ad.label} onChange={(e) => onPatch({ text: e.target.value })} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>Headline
              <textarea style={{ ...field, minHeight: 48, marginTop: 4 }} value={sel.title ?? ad.headline} placeholder={ad.headline} onChange={(e) => onPatch({ title: e.target.value })} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>Lines — one per line
              <textarea style={{ ...field, minHeight: 64, marginTop: 4 }} value={(sel.bullets ?? ad.lines).join("\n")} placeholder={ad.lines.join("\n")} onChange={(e) => onPatch({ bullets: e.target.value.split("\n") })} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>Address — after "go to"
              <input style={{ ...field, marginTop: 4 }} value={sel.url ?? ad.url} placeholder={ad.url} onChange={(e) => onPatch({ url: e.target.value })} /></label>
            <div style={{ fontSize: 11.5, color: MUTED }}>Edits stay on this slide; every other rip keeps the built-in copy.</div>
          </div>
        )}
        {sel.kind !== "open" && (
          <div style={{ marginTop: 8 }}>
            <button style={chip(sel.banner === "on", ORANGE)} title="Put the slow Power Four campus banner on this slide (any slide — an expansion moment)" onClick={() => onPatch({ banner: sel.banner === "on" ? undefined : "on" })}>🏫 campus banner · {sel.banner === "on" ? "on" : "off"}</button>
          </div>
        )}
      </div>
    </section>
  );
}

// --------------------------------------------------------- CEQ: before → after

/** Edit the card itself. The bank is the truth, so a save goes through the
 *  one door the review board already uses (applyCeqEdit) — the slide that
 *  films IS the card. Before and after side by side while it is dirty. */
function CeqEditor({ ceq, topicName, onSaved }: { ceq: BoothCeq; topicName: string; onSaved: (d: CeqDraft) => void }) {
  const base = useMemo(() => draftOf(ceq), [ceq]);
  const [d, setD] = useState<CeqDraft>(base);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { setD(base); setNote(null); }, [base]);
  const dirty = !sameDraft(d, base);
  const oneCorrect = ceq.noteOnly || d.choices.filter((c) => c.correct).length === 1;
  const setChoice = (i: number, p: Partial<CeqDraft["choices"][number]>) =>
    setD((v) => ({ ...v, choices: v.choices.map((c, k) => (k === i ? { ...c, ...p } : p.correct ? { ...c, correct: false } : c)) }));

  const save = async () => {
    setBusy(true); setNote(null);
    try {
      await applyCeqEdit({ data: {
        ceqNodeId: ceq.id,
        ...(d.stem !== base.stem ? { stem: d.stem } : {}),
        ...(!ceq.noteOnly && JSON.stringify(d.choices) !== JSON.stringify(base.choices) ? { choices: d.choices.map((c) => ({ text: c.text, correct: c.correct, feedback: c.feedback || null })) } : {}),
      } });
      onSaved(d);
      refreshBank();
      setNote("✓ saved to the bank — this is the card that films");
      setEdits((n) => n + 1);
    } catch (e) { setNote(`⚠ ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(false); }
  };
  // REVERT (Lee, 2026-09-03: "I'm just nervous to use it. Would be great if we
  // could revert on this after the fact"): the card's words before the last
  // save come back — one step at a time, as many times as there were saves.
  const [edits, setEdits] = useState(ceq.edits);
  useEffect(() => { setEdits(ceq.edits); }, [ceq.edits]);
  const revert = async () => {
    if (!window.confirm("Put back the words this card had before the last save?")) return;
    setBusy(true); setNote(null);
    try {
      const r = await revertCeqEdit({ data: { ceqNodeId: ceq.id } });
      const restored: CeqDraft = { stem: r.stem, choices: r.choices.map((c) => ({ text: c.text, correct: c.correct, feedback: c.feedback ?? "" })) };
      onSaved(restored);
      refreshBank();
      setEdits(r.edits);
      setNote(`↶ reverted — ${r.edits ? `${r.edits} earlier save${r.edits > 1 ? "s" : ""} left to undo` : "back to the original"}`);
    } catch (e) { setNote(`⚠ ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={eyebrow}>Edit the card</span>
        {dirty && <span style={{ fontSize: 11, color: GOLD }}>unsaved</span>}
        {note && <span style={{ fontSize: 11, color: note.startsWith("⚠") ? RED : MINT }}>{note}</span>}
        {!dirty && edits > 0 && (
          <button style={{ ...chip(false), marginLeft: "auto" }} disabled={busy} title={`Undo the last save on this card (${edits} saved edit${edits > 1 ? "s" : ""} can be undone, one at a time)`} onClick={() => void revert()}>
            {busy ? "…" : `↶ Revert last save · ${edits}`}
          </button>
        )}
        {dirty && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button style={chip(false)} onClick={() => setD(base)} disabled={busy}>discard</button>
            <button style={{ ...chip(true, MINT), opacity: oneCorrect && !busy ? 1 : 0.5 }} disabled={!oneCorrect || busy} title={oneCorrect ? "Write this to the bank" : "Exactly one choice must be correct"} onClick={() => void save()}>
              {busy ? "saving…" : "✓ Save to bank"}
            </button>
          </span>
        )}
      </div>
      {dirty && (
        <div className="flex" style={{ gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>Before</div>
            <div style={{ border: `1px solid ${EDGE}`, borderRadius: 8, overflow: "hidden" }}>
              <SetCard id={`${ceq.id}-before`} stem={base.stem} choices={base.choices} topic={ceq.noteOnly ? NOTE_EYEBROW : topicName} scale={0.42} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: GOLD, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>After</div>
            <div style={{ border: `1px solid ${GOLD}`, borderRadius: 8, overflow: "hidden" }}>
              <SetCard id={`${ceq.id}-after`} stem={d.stem} choices={d.choices} topic={ceq.noteOnly ? NOTE_EYEBROW : topicName} scale={0.42} />
            </div>
          </div>
        </div>
      )}
      <label style={{ fontSize: 11, color: MUTED }}>{ceq.noteOnly ? "The summary (one line per point)" : "Stem"}
        <textarea style={{ ...field, minHeight: 64, marginTop: 4 }} value={d.stem} onChange={(e) => setD((v) => ({ ...v, stem: e.target.value }))} /></label>
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>Type __word__ to underline, ____ for a blank, ==word== to highlight.</div>
      {!ceq.noteOnly && (
        <div className="flex flex-col" style={{ gap: 6, marginTop: 8 }}>
          <div style={{ fontSize: 11, color: MUTED }}>Choices — tick the correct one</div>
          {d.choices.map((c, i) => (
            <div key={i} className="flex items-start" style={{ gap: 6 }}>
              <input type="radio" name={`correct-${ceq.id}`} checked={c.correct} onChange={() => setChoice(i, { correct: true })} title="Correct" style={{ marginTop: 9, accentColor: MINT }} />
              <div style={{ flex: 1 }}>
                <input style={field} value={c.text} onChange={(e) => setChoice(i, { text: e.target.value })} placeholder={`Choice ${String.fromCharCode(65 + i)}`} />
                <input style={{ ...field, fontSize: 11.5, color: MUTED, marginTop: 3 }} value={c.feedback} onChange={(e) => setChoice(i, { feedback: e.target.value })} placeholder="feedback (optional)" />
              </div>
              <button style={tiny} title="Remove this choice" disabled={d.choices.length <= 2} onClick={() => setD((v) => ({ ...v, choices: v.choices.filter((_, k) => k !== i) }))}>✕</button>
            </div>
          ))}
          <button style={{ ...chip(false), alignSelf: "flex-start" }} onClick={() => setD((v) => ({ ...v, choices: [...v.choices, { text: "", correct: false, feedback: "" }] }))}>＋ choice</button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ the prompter

type TidyState = { res?: TidyResult; busy?: boolean; err?: string };

function Prompter({ tabs, frame, frames, set, doc, labelOf, snippetOf, slideText: text, onLines, onSelect, onSlideAfter }: {
  /** The Teleprompter | Editor toggle, drawn by the deck — sits where the heading was. */
  tabs: ReactNode;
  frame: BlastFrame | null; frames: BlastFrame[]; set: BoothSetInfo; doc: TTDoc;
  labelOf: (f: BlastFrame) => string; snippetOf: (f: BlastFrame) => string; slideText: string;
  onLines: (frameId: string, lines: string[]) => void;
  onSelect: (frameId: string) => void;
  /** A phrase becomes a slide of this kind, right after the given slide. */
  onSlideAfter: (frameId: string, kind: BlastFrameKind, patch: Partial<BlastFrame>) => void;
}) {
  // "This slide" or "All stamps" (Lee: "I want to just see all the stamps that
  // came through and assign from there").
  const [view, setView] = useState<"slide" | "all">("slide");
  const slideCands = useMemo(() => (frame ? prompterCandidates(frame, doc, set.id) : []), [frame, doc, set.id]);
  const allCands = useMemo(() => setStampCandidates(doc, set.id), [doc, set.id]);
  const cands = view === "all" ? allCands : slideCands;
  const groups = useMemo(() => prompterGroups(cands), [cands]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [kindPick, setKindPick] = useState<Record<string, BlastFrameKind>>({});
  const [made, setMade] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState("");
  const kept = useMemo(() => frame?.prompter ?? [], [frame]);

  // PROOFREAD BY DEFAULT (Lee: "Is there really any major cost? It will make
  // it easier for me to sort through them"). One micro call per slide / per
  // set, remembered by the words it was made from.
  const scope = frame ? (view === "all" ? `all:${set.id}` : `slide:${frame.kind}:${frame.ceqId ?? frame.id}`) : "";
  const key = frame ? tidyCacheKey(scope, cands) : "";
  const [tidy, setTidy] = useState<Record<string, TidyState>>({});
  const inflight = useRef(new Set<string>());
  const t = tidy[key];
  const proofread = useCallback(async (force = false) => {
    if (!frame || !cands.length || inflight.current.has(key)) return;
    if (!force) { const cached = readTidy(key); if (cached) { setTidy((v) => ({ ...v, [key]: { res: cached } })); return; } }
    inflight.current.add(key);
    setTidy((v) => ({ ...v, [key]: { ...v[key], busy: true, err: undefined } }));
    try {
      const { system, user } = buildTidyMessages({
        scope: view === "all" ? `Every stamp on the set "${set.name}"` : `Slide: ${labelOf(frame)} — ${snippetOf(frame)}`,
        slideText: view === "all" ? undefined : text, candidates: cands, kept: view === "all" ? [] : kept,
      });
      const r = await runMicro({ data: { system, user, maxOutput: 2000 } });
      const res = parseTidy(r.text, cands);
      writeTidy(key, res);
      setTidy((v) => ({ ...v, [key]: { res, busy: false } }));
    } catch (e) {
      setTidy((v) => ({ ...v, [key]: { ...v[key], busy: false, err: e instanceof Error ? e.message : String(e) } }));
    } finally { inflight.current.delete(key); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, cands, key, view, set.name, text]);
  useEffect(() => { if (key && cands.length && !tidy[key]) void proofread(false); }, [key, cands.length, tidy, proofread]);

  const has = (lines: readonly string[], s: string) => lines.some((k) => k.trim().toLowerCase() === s.trim().toLowerCase());
  /** The slide a phrase belongs to: the card he was looking at, else this one. */
  const homeOf = (p: { ceqId: string | null }): BlastFrame | null =>
    (p.ceqId && frames.find((f) => f.kind === "ceq" && f.ceqId === p.ceqId)) || frame;
  const keepOn = (home: BlastFrame | null, s: string) => { if (!home) return; const v = s.trim(); const lines = home.prompter ?? []; if (v && !has(lines, v)) onLines(home.id, [...lines, v]); };
  const setLine = (i: number, v: string) => frame && onLines(frame.id, kept.map((k, j) => (j === i ? v : k)));
  const dropLine = (i: number) => frame && onLines(frame.id, kept.filter((_, j) => j !== i));
  const moveLine = (i: number, d: -1 | 1) => { if (!frame) return; const j = i + d; if (j < 0 || j >= kept.length) return; const n = [...kept]; [n[i], n[j]] = [n[j], n[i]]; onLines(frame.id, n); };

  if (!frame) return <section style={panelShell}>{tabs}</section>;

  const wordLine = (c: PrompterCandidate) => {
    const home = homeOf(c);
    const on = has(home?.prompter ?? [], c.text);
    return (
      <button key={c.id} onClick={() => keepOn(home, c.text)} title={on ? "Already on the prompter" : "Keep this line as you said it"}
        style={{ textAlign: "left", background: on ? "rgba(59,245,160,0.10)" : "rgba(9,13,26,0.6)", border: `1px solid ${on ? MINT : EDGE}`, borderRadius: 9, padding: "6px 9px", color: CREAM, fontSize: 12, lineHeight: 1.4, cursor: on ? "default" : "pointer", opacity: on ? 0.7 : 1 }}>
        {on ? "✓ " : ""}{c.text}{view === "all" && c.ceqLabel ? <span style={{ color: MUTED, fontSize: 10.5 }}> · {c.ceqLabel}</span> : null}
      </button>
    );
  };

  const phraseRow = (p: TidyPhrase) => {
    const home = homeOf(p);
    const on = has(home?.prompter ?? [], p.text);
    const kind = kindPick[p.id] ?? frameKindForStamp(p.stamp);
    const done = made.has(`${key}:${p.id}`);
    return (
      <div key={p.id} style={{ background: "rgba(9,13,26,0.6)", border: `1px solid ${on || done ? MINT : EDGE}`, borderRadius: 9, padding: "6px 9px" }}>
        {p.title && <div style={{ color: CREAM, fontSize: 12.5, fontWeight: 800 }}>{p.title}</div>}
        <div style={{ color: CREAM, fontSize: 12.5, lineHeight: 1.4, opacity: p.title ? 0.85 : 1 }}>{p.text}</div>
        <div className="flex items-center" style={{ gap: 5, marginTop: 5, flexWrap: "wrap" }}>
          {view === "all" && home && home !== frame && (
            <button style={{ ...chip(false, MUTED), padding: "1px 7px", fontSize: 10 }} title={`Go to the slide it was said on: ${snippetOf(home)}`} onClick={() => onSelect(home.id)}>↗ {p.ceqLabel ?? labelOf(home)}</button>
          )}
          {view === "all" && home === frame && <span style={{ fontSize: 10, color: MUTED }}>this slide</span>}
          <span style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
            <button style={{ ...chip(on, MINT), padding: "2px 8px", fontSize: 10.5 }} disabled={on} title="Keep on that slide's prompter" onClick={() => keepOn(home, p.text)}>{on ? "✓ kept" : "keep"}</button>
            <select value={kind} onChange={(e) => setKindPick((v) => ({ ...v, [p.id]: e.target.value as BlastFrameKind }))} title="What kind of slide this becomes — override the AI's guess"
              style={{ background: "rgba(9,13,26,0.8)", color: KIND_COLOR[kind] ?? CREAM, border: `1px solid ${EDGE}`, borderRadius: 7, fontSize: 10.5, padding: "2px 4px" }}>
              {PHRASE_SLIDE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
            </select>
            <button style={{ ...chip(done, KIND_COLOR[kind]), padding: "2px 8px", fontSize: 10.5 }} title={`Add a slide right after ${home === frame ? "this slide" : "the slide it was said on"}`}
              onClick={() => { if (home) { onSlideAfter(home.id, kind, slidePatchFor(kind, p)); setMade((s) => new Set(s).add(`${key}:${p.id}`)); } }}>
              {done ? "✓ slide added" : "→ slide"}
            </button>
          </span>
        </div>
      </div>
    );
  };

  const open = groups.find((g) => g.key === openGroup) ?? null;
  const phrases = t?.res?.phrases ?? [];
  const byStamp = new Map<string, TidyPhrase[]>();
  for (const p of phrases) { const k = p.stamp ?? "card"; byStamp.set(k, [...(byStamp.get(k) ?? []), p]); }

  return (
    <section style={panelShell}>
      <div className="flex items-center" style={{ gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {tabs}
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button style={{ ...chip(view === "slide"), padding: "2px 8px", fontSize: 10.5 }} onClick={() => setView("slide")}>This slide</button>
          <button style={{ ...chip(view === "all"), padding: "2px 8px", fontSize: 10.5 }} title="Every stamp that came through on this set — assign from here" onClick={() => setView("all")}>All stamps · {allCands.length}</button>
        </span>
      </div>

      {view === "slide" && (
        <>
          <div style={{ ...subhead, marginBottom: 5 }}>{kept.length} line{kept.length === 1 ? "" : "s"} on this slide</div>
          {kept.length > 0 && (
            <div className="flex flex-col" style={{ gap: 5, marginBottom: 12 }}>
              {kept.map((k, i) => (
                <div key={i} className="flex items-center" style={{ gap: 4 }}>
                  <input style={{ ...field, padding: "5px 8px", fontSize: 12.5 }} value={k} onChange={(e) => setLine(i, e.target.value)} />
                  <button style={tiny} title="Up" onClick={() => moveLine(i, -1)}>↑</button>
                  <button style={tiny} title="Down" onClick={() => moveLine(i, 1)}>↓</button>
                  <button style={{ ...tiny, color: RED }} title="Drop this line" onClick={() => dropLine(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ ...subhead, marginBottom: 5 }}>Stamps near this slide</div>
          {groups.length === 0 ? (
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
              {frame.kind === "ceq" ? "Nothing was captured while this card was up. Talk about it in Step 1, or type a line below." : "No stamp of this kind in the talkthrough. Type a line below."}
            </div>
          ) : (
            <div className="flex" style={{ gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              {groups.map((g) => (
                <button key={g.key} style={chip(openGroup === g.key, g.stamp ? KIND_COLOR[frameKindForStamp(g.stamp)] ?? GOLD : MUTED)} onClick={() => setOpenGroup(openGroup === g.key ? null : g.key)}>
                  {g.label} ×{g.candidates.length}
                </button>
              ))}
            </div>
          )}
          {open && <div className="flex flex-col" style={{ gap: 4, marginBottom: 10 }}>{open.candidates.map(wordLine)}</div>}
        </>
      )}

      {/* PROOFREAD — automatic; the button re-runs it. */}
      <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={subhead}>{view === "all" ? "Every stamp, proofread" : "Proofread"}</span>
        {t?.busy && <span style={{ fontSize: 11, color: SKY }}>proofreading…</span>}
        {t?.err && <span style={{ fontSize: 11, color: RED }}>⚠ {t.err}</span>}
        {cands.length > 0 && !t?.busy && (
          <button style={{ ...chip(false, SKY), padding: "2px 8px", fontSize: 10.5, marginLeft: "auto" }} title="Run the proofread again" onClick={() => void proofread(true)}>✨ again</button>
        )}
      </div>
      {cands.length === 0 && view === "all" && <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>No stamps on this set yet — stamp moments in Step 1 and they land here.</div>}
      {t?.res && phrases.length === 0 && <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Nothing usable came back — the raw words are below.</div>}
      {view === "all" ? (
        [...byStamp.entries()].map(([k, list]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <div style={{ ...subhead, color: KIND_COLOR[frameKindForStamp(k === "card" ? null : k)] ?? MUTED, marginBottom: 4 }}>{groups.find((g) => g.key === k)?.label ?? k} · {list.length}</div>
            <div className="flex flex-col" style={{ gap: 6 }}>{list.map(phraseRow)}</div>
          </div>
        ))
      ) : (
        phrases.length > 0 && <div className="flex flex-col" style={{ gap: 6, marginBottom: 10 }}>{phrases.map(phraseRow)}</div>
      )}
      {t?.res?.suggestion && !has(kept, t.res.suggestion) && view === "slide" && (
        <button onClick={() => keepOn(frame, t.res!.suggestion!)} title="The one line the AI thinks is missing — take it or leave it"
          style={{ textAlign: "left", width: "100%", background: "rgba(125,211,252,0.08)", border: `1px dashed ${SKY}`, borderRadius: 9, padding: "6px 9px", color: CREAM, fontSize: 12.5, lineHeight: 1.4, cursor: "pointer", marginBottom: 10 }}>
          <span style={{ fontSize: 10, color: SKY, fontWeight: 800, letterSpacing: "0.12em", display: "block", marginBottom: 2 }}>✨ ONE AI SUGGESTION</span>
          {t.res.suggestion}
        </button>
      )}

      {cands.length > 0 && (
        <details style={{ marginBottom: 8 }}>
          <summary style={{ ...subhead, cursor: "pointer" }}>{view === "all" ? "Raw words, every stamp" : "Raw words for this slide"} · {cands.length}</summary>
          <div className="flex flex-col" style={{ gap: 4, marginTop: 6 }}>
            {view === "all"
              ? groups.map((g) => (
                <div key={g.key}>
                  <div style={{ ...subhead, marginBottom: 3 }}>{g.label}</div>
                  <div className="flex flex-col" style={{ gap: 4, marginBottom: 6 }}>{g.candidates.map(wordLine)}</div>
                </div>
              ))
              : cands.map(wordLine)}
          </div>
        </details>
      )}

      {view === "slide" && (
        <form className="flex" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); keepOn(frame, typed); setTyped(""); }}>
          <input style={{ ...field, padding: "5px 8px", fontSize: 12.5 }} value={typed} placeholder="type a line…" onChange={(e) => setTyped(e.target.value)} />
          <button type="submit" style={chip(false)} disabled={!typed.trim()}>add</button>
        </form>
      )}
    </section>
  );
}
