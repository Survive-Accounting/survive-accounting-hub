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
//
// 2026-09-07: no teleprompter on the Editor — lines are made on Rehearse & Film
// (rounds + the rehearsal review). Lee: "I want to remove teleprompter lines from
// #2 Review. No teleprompter at all. I think just editor and illustrator all
// needed. And put these in two side by side buttons." So the right column's
// dropdown became two equal buttons, Editor | Illustrator, and the prompter face
// (stamps → phrases → slides, the "Proofread" micro call) left this file. The
// frame.prompter data is untouched — /film, the rehearsal review and the pop-out
// window still read and write it; this step just stops showing it.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { applyCeqEdit, revertCeqEdit, type BoothCeq, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";
import { NOTE_EYEBROW } from "@/components/canvas/frame-copy";
import { refreshBank } from "@/components/v3/use-bank";
import { BankPicker } from "./BankPicker";
import { indentBulletLine } from "./bullet-indent";
import { BIO_CARD } from "./bio-card";
import { CREAM, EDGE, FrameView, GOLD, MUTED, PANEL, questionProgress, usePlan } from "./BlastOffEditor";
import { SetCard } from "./SetCard";
import { AD_KINDS, FRAME_LABEL, backdropFor, dropFrame, duplicateFrame, filmFrames, insertFrame, isAdKind, isInsert, isStandard, moveFrame, newFrameId, patchFrame, patchFramesOfKind, toggleSkip, type BackdropMode, type BlastFrame, type BlastFrameKind, isFullFrame } from "./plan";
import { ZOOM_VARIANTS } from "@/components/brand-cards/bolt-zoom";
import { ADS, AD_LABEL } from "./AdSlide";
import { PhoneFrame } from "./PhoneFrame";
import { SlideEditContext } from "./slide-edit";
import { CAM_LABEL, CAM_SPOTS, camSpotOf, isCamSpot } from "./capture/webcam-spots";
import { camDefault, layoutOf } from "./layout";
import { canIllustrate } from "./illustration";
import { IllustrationPanel } from "./IllustrationPanel";

/** What the AI board hands the deck: "＋ slide" on an idea card. */
export interface DeckApi { addSlide: (kind: BlastFrameKind, patch: Partial<BlastFrame>) => void }

const QUICK: readonly { kind: BlastFrameKind; label: string; patch?: Partial<BlastFrame> }[] = [
  { kind: "phrase", label: "Memorize this" },
  { kind: "cheat", label: "Cheat code" },
  { kind: "tip", label: "Deep question" },
  // 2026-09-04: the bolt detour (Lee's OBS camera bed) and the three ads.
  { kind: "bolt", label: "Bolt detour" },
  { kind: "ad", label: "Ad · Greek", patch: { ad: "greek" } },
  { kind: "ad", label: "Ad · reps", patch: { ad: "rep" } },
  { kind: "ad", label: "Ad · materials", patch: { ad: "send" } },
  { kind: "ad", label: "Ad · behind the scenes", patch: { ad: "building" } },
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
// PROFESSOR PASS (Lee, 2026-09-06: "make this look... like a professor would be using
// it"). One small change reused everywhere: a hairline rule under a section's header
// row, the way a printed syllabus rules off "Section 2" from what sits under it —
// spread into every header row's own style rather than a new wrapper, so nothing
// about the columns' structure changes. Chips, colors and copy are untouched.
const HEAD_RULE: React.CSSProperties = { borderBottom: `1px solid ${EDGE}`, paddingBottom: 8 };
/** A slide's kind, read as a stamped tag rather than plain colored text — the
 *  same information (colorOf/labelOf), boxed like a card catalog label. */
const kindTag = (color: string): React.CSSProperties => ({
  fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color,
  border: `1px solid ${color}55`, borderRadius: 4, padding: "1px 5px", minWidth: 92,
  textAlign: "center", boxSizing: "border-box", flexShrink: 0,
});

// THE RIGHT PANEL has two faces (Lee, 2026-09-04: "Teleprompter maybe can be
// toggleable between editor / teleprompter"). The face he left it on is
// remembered per browser; a browser that refuses storage just forgets.
// Three faces since 2026-09-05 (Lee: "Editor, Illustrator, Teleprompter in like a dropdown
// on right side"): the Illustrator is its own face, offered only on the kinds that take a
// picture (illustration.ts ILLUSTRATION_KINDS).
// TWO FACES AGAIN since 2026-09-07 — Editor | Illustrator, as two side-by-side buttons rather
// than a dropdown (Lee: "No teleprompter at all... put these in two side by side buttons").
// The teleprompter face is gone; its lines are made on Rehearse & Film now.
type RightTab = "editor" | "illustrator";
const RIGHT_TABS: { id: RightTab; label: string; title: string }[] = [
  { id: "editor", label: "Editor", title: "Edit the selected slide here, beside it" },
  { id: "illustrator", label: "Illustrator", title: "A picture for this slide — Memorize This, Cheat Code, Deep Question and blank slides" },
];
/** What the Illustrator button says when the selected slide's kind can't take a picture. */
const ILLUSTRATOR_OFF_TITLE = "Pictures go on Memorize This, Cheat Code, Deep Question and blank slides — not this kind";
const RIGHT_TAB_KEY = "sa-review-right-tab";
// A browser that last left the panel on the retired "teleprompter" face (the value this key
// held before 2026-09-07) lands on the Editor — the only face that exists for every slide —
// rather than on a face that no longer exists. Any other unknown value does the same.
const readRightTab = (): RightTab => { try { return localStorage.getItem(RIGHT_TAB_KEY) === "illustrator" ? "illustrator" : "editor"; } catch { return "editor"; } };
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

// THE SKIPPED FOLDER (Lee, 2026-09-06: "once a slide is skipped, move it to bottom
// in a skipped folder... make this look like an actual folder on a desktop"). A
// shade warmer than the spine's own panel so it reads as manila against navy —
// its own surface, not just another row — and the same three tones the professor
// pass's hairline rule already uses, just tinted gold instead of neutral.
const FOLDER_TAB = "rgba(252,163,17,0.16)";
const FOLDER_BODY = "rgba(252,163,17,0.05)";
const FOLDER_EDGE = "rgba(252,163,17,0.34)";
const SKIP_FOLDER_KEY = "sa-review-skip-folder";
const readFolderOpen = (): boolean => { try { return localStorage.getItem(SKIP_FOLDER_KEY) === "open"; } catch { return false; } };
const writeFolderOpen = (v: boolean): void => { try { localStorage.setItem(SKIP_FOLDER_KEY, v ? "open" : "closed"); } catch { /* storage refused — it just won't stick */ } };

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

/** THE FOLDER ITSELF — a tab riding above a body, the way a manila folder sits on
 *  a desktop. Skipped cards keep their real place in the plan (see toggleSkip in
 *  plan.ts); nothing here reorders the running order or touches backdropFor —
 *  this only changes where the SPINE DRAWS them. Un-skipping one just stops
 *  hiding it, and it is already sitting at its real position — there is no
 *  "remembered slot" to put it back in, because it never actually left. */
function SkipFolder({ count, open, onToggle, children }: { count: number; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        title={open ? "Collapse the skipped folder" : "Expand the skipped folder"}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, position: "relative", top: 1, zIndex: 1,
          background: FOLDER_TAB, border: `1px solid ${FOLDER_EDGE}`, borderBottom: "none",
          borderRadius: "7px 7px 0 0", padding: "5px 12px", cursor: "pointer",
          fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD,
        }}>
        <span aria-hidden>{open ? "📂" : "📁"}</span> Skipped <span style={{ color: MUTED }}>· {count}</span>
        <span aria-hidden style={{ fontSize: 9, color: MUTED }}>{open ? "▾" : "▸"}</span>
      </button>
      <div style={{
        background: FOLDER_BODY, border: `1px solid ${FOLDER_EDGE}`, borderRadius: "0 8px 8px 8px",
        padding: open ? 8 : "0 8px", maxHeight: open ? 4000 : 0, overflow: "hidden",
        transition: "max-height .15s ease",
      }}>
        {open && <div className="flex flex-col" style={{ gap: 5 }}>{children}</div>}
      </div>
    </div>
  );
}

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

// slidePatchFor (a proofread phrase → the slide it becomes) left with the prompter face on
// 2026-09-07 — it had no caller outside it.

export function ReviewDeck({ set, topic, register, initialSelectedId = null }: {
  set: BoothSetInfo; topic: BoothTopic;
  /** Hands the deck's verbs to whoever mounts it (the AI board's "＋ slide"). */
  register?: (api: DeckApi | null) => void;
  /** Open with this slide selected and scrolled into view — the route's ?frame= (2026-09-06,
   *  the illustration bank's deep link). Unknown id → the first slide, as always. */
  initialSelectedId?: string | null;
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

  const [selId, setSelId] = useState<string | null>(initialSelectedId);
  const sel = frames.find((f) => f.id === selId) ?? frames[0] ?? null;
  const selIdx = sel ? frames.indexOf(sel) : -1;
  // The deep link's slide scrolls into view once the plan is in — once, not on every select.
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!initialSelectedId || scrolledTo.current === initialSelectedId || !frames.some((f) => f.id === initialSelectedId)) return;
    scrolledTo.current = initialSelectedId;
    document.querySelector(`[data-frame-id="${CSS.escape(initialSelectedId)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [initialSelectedId, frames]);

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
  /** Lee, 2026-09-05: "resize it from its fixed spot and it would apply to any other slides
   *  using that setting" — one click instead of a fast-track round trip. */
  const patchKind = useCallback((kind: BlastFrameKind, p: Partial<BlastFrame>) => { if (plan) commit(patchFramesOfKind(plan.frames, kind, p)); }, [plan, commit]);

  // Which row's ⋯ menu is open (one at a time). A row that leaves the plan
  // while its menu is up takes the menu with it.
  const [menuId, setMenuId] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenuId(null), []);
  useEffect(() => { if (menuId && !frames.some((f) => f.id === menuId)) setMenuId(null); }, [frames, menuId]);

  // THE SKIPPED FOLDER's open/closed state (Lee, 2026-09-06) — remembered per
  // browser like the right panel's face; closed by default, since the point of
  // the folder is to get skipped cards out of the way.
  const [folderOpen, setFolderOpenState] = useState<boolean>(readFolderOpen);
  const setFolderOpen = useCallback((v: boolean) => { setFolderOpenState(v); writeFolderOpen(v); }, []);

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
    // The cold open carries the banner unless told not to; every other slide only when asked.
    const bannerOn = f.kind === "open" ? f.banner !== "off" : f.banner === "on";
    items.push({
      label: `🏫 Campus banner · ${bannerOn ? "on" : "off"}`, title: "The slow Power Four banner along the lower third",
      run: () => patch(f.id, { banner: f.kind === "open" ? (f.banner === "off" ? undefined : "off") : (f.banner === "on" ? undefined : "on") }),
    });
    // THE CAMERA (2026-09-05): cycles the spots; "free" is placed by dragging the ring on the stage.
    items.push({ label: `📷 Camera · ${camSpotOf(f)}`, title: `Where Lee sits on this slide — ${CAM_LABEL[camSpotOf(f)]}. Click to cycle.`, run: () => patch(f.id, { cam: CAM_SPOTS[(CAM_SPOTS.indexOf(camSpotOf(f)) + 1) % CAM_SPOTS.length] }) });
    // THE ILLUSTRATION (polish pass): opens the Illustrator face for this slide.
    if (canIllustrate(f.kind)) items.push({
      label: `🎨 Illustration · ${f.illustration?.assetUrl ? "on" : f.illustration?.requested ? "idea banked" : "none"}`,
      title: "An optional picture — write and generate it in the Illustrator; drag it around on the slide.",
      run: () => { setSelId(f.id); setRightTab("illustrator"); },
    });
    if (f.kind === "bio") items.push({ label: `🖼 Portrait · ${f.portrait === "on" ? "on" : "off (parked)"}`, title: "The hand-drawn portrait over the black — on unless you turn it off", run: () => patch(f.id, { portrait: f.portrait === "on" ? undefined : "on" }) });
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
  // The two buttons at the top of the right column (2026-09-07). The Illustrator one goes
  // disabled on a kind that can't take a picture; the face itself still explains which can.
  const tabs = <RightTabs tab={rightTab} onTab={setRightTab} canIllustrate={!!sel && canIllustrate(sel.kind)} />;

  // THE SKIPPED FOLDER (Lee, 2026-09-06: "once a slide is skipped, move it to
  // bottom in a skipped folder"). JUDGMENT CALL: this splits how the spine DRAWS
  // the running order, not the running order itself — frames keeps its real
  // indices untouched (toggleSkip in plan.ts never moves anything), so
  // backdropFor, filmFrames and every index a menu action closes over below
  // still mean exactly what they meant before. Un-skipping a card from inside
  // the folder needs no "restore its old slot" logic because it never left one.
  const indexed = frames.map((f, i) => ({ f, i }));
  const activeRows = indexed.filter((r) => !r.f.skipped);
  const skippedRows = indexed.filter((r) => r.f.skipped);

  /** One spine row, shared by the running order and the folder — `number` is the
   *  row's place in the actual film order (undefined inside the folder, where a
   *  slide has no such place); `foldered` turns off drag (a skipped card's order
   *  relative to other skipped cards films nothing, so there is nothing to reorder). */
  const spineRow = (f: BlastFrame, i: number, opts: { number?: number; foldered?: boolean } = {}) => {
    const on = f.id === sel?.id;
    const menu = menuId === f.id;
    const lineAbove = !opts.foldered && over?.i === i && !over.below && dragId !== f.id;
    const lineBelow = !opts.foldered && over?.i === i && over.below && dragId !== f.id;
    // Foldered rows accept neither drag (nothing to reorder — a skipped card's
    // order relative to other skipped cards films nothing) nor drop (dragging an
    // active card into the folder isn't how a card gets skipped; the ⊘ button is).
    // An active row with its own menu open keeps accepting drops, same as before —
    // only picking IT up is disabled, so a press inside the menu never drags the row.
    const canDrop = !opts.foldered;
    const draggableRow = !menu && canDrop;
    return (
      <div key={f.id} data-frame-id={f.id} draggable={draggableRow} className={`sa-spine-row${on ? " is-on" : ""}${menu ? " is-menu" : ""}`}
        onDragStart={() => setDragId(f.id)}
        onDragOver={canDrop ? (e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ i, below: e.clientY > r.top + r.height / 2 }); } : undefined}
        onDrop={canDrop ? (e) => { e.preventDefault(); drop(); } : undefined}
        onDragEnd={() => { setDragId(null); setOver(null); }}
        onClick={() => setSelId(f.id)}
        title={canDrop ? "Click to open · drag to reorder" : "Click to open"}
        style={{
          position: "relative", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7,
          background: opts.foldered ? "rgba(9,13,26,0.35)" : PANEL,
          border: `1px solid ${on ? GOLD : opts.foldered ? FOLDER_EDGE : EDGE}`,
          boxShadow: lineAbove ? `0 -3px 0 0 ${SKY}` : lineBelow ? `0 3px 0 0 ${SKY}` : "none",
          opacity: opts.foldered ? 0.8 : dragId === f.id ? 0.5 : 1, cursor: draggableRow ? "grab" : "pointer",
        }}>
        <span style={{ color: MUTED, fontSize: 11, fontWeight: 800, minWidth: 18, borderRight: `1px solid ${EDGE}`, paddingRight: 6, fontVariantNumeric: "tabular-nums" }}>
          {opts.number != null ? opts.number : "⊘"}
        </span>
        <span style={kindTag(colorOf(f))}>{labelOf(f)}</span>
        <span style={{ fontSize: 12, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textDecoration: f.skipped ? "line-through" : "none" }}>{snippet(f)}</span>
        {/* Lines are made on Rehearse & Film (2026-09-07); the count still shows here so the spine says which slides have them. */}
        {(f.prompter?.length ?? 0) > 0 && <span title={`${f.prompter!.length} teleprompter line${f.prompter!.length > 1 ? "s" : ""} — made on Rehearse & Film`} style={{ fontSize: 10, color: MINT, fontWeight: 800 }}>🗒{f.prompter!.length}</span>}
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
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 18, alignItems: "start" }}>
      {/* ------------------------------------------------ LEFT: the spine */}
      <section>
        <style>{SPINE_CSS}</style>
        <div className="flex items-center" style={{ gap: 8, marginBottom: 10, flexWrap: "wrap", ...HEAD_RULE }}>
          <span style={eyebrow}>Film draft</span>
          <span style={{ fontSize: 11.5, color: MUTED }}>{filmed} slides{skipped ? ` · ${skipped} in the skipped folder` : ""}</span>
          {saving && <span style={{ fontSize: 11, color: saving.startsWith("⚠") ? RED : saving === "saved" ? MINT : MUTED, marginLeft: "auto" }}>{saving}</span>}
        </div>
        <div style={{ ...subhead, marginTop: 10, marginBottom: 5 }}>Insert a slide</div>
        <div className="flex" style={{ gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          {QUICK.map((q) => (
            <button key={q.label} style={chip(false, KIND_COLOR[q.kind])} title={`Insert a ${q.label} slide after slide ${selIdx + 1}`} onClick={() => add(q.kind, q.patch)}>＋ {q.label}</button>
          ))}
          <button style={chip(picker === "exhibit")} title="Insert an exhibit after the selected slide" onClick={() => setPicker(picker === "exhibit" ? null : "exhibit")}>＋ Exhibit</button>
          <button style={chip(false)} title="Insert a bare frame" onClick={() => add("blank")}>＋ Blank</button>
        </div>
        <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 10 }}>inserts land after the selected slide · space / shift+space walk the slides · drag to reorder</div>
        {picker && <BankPicker kind={picker} setId={set.id} setName={set.name} onPick={(p) => add(picker, p)} onClose={() => setPicker(null)} />}

        <div style={{ ...subhead, marginBottom: 5 }}>Running order</div>
        <div className="flex flex-col" style={{ gap: 5 }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); }}>
          {activeRows.map(({ f, i }, pos) => spineRow(f, i, { number: pos + 1 }))}
        </div>

        {skippedRows.length > 0 && (
          <SkipFolder count={skippedRows.length} open={folderOpen} onToggle={() => setFolderOpen(!folderOpen)}>
            {skippedRows.map(({ f, i }) => spineRow(f, i, { foldered: true }))}
          </SkipFolder>
        )}
      </section>

      {/* --------------------------------------------- MIDDLE: the slide */}
      <section>
        {sel && (
          <SlidePane key={sel.id} sel={sel} idx={selIdx} count={frames.length} label={labelOf(sel)} viewSet={viewSet} topic={topic}
            progress={progress.get(sel.id)}
            backdrop={backdropFor(frames, selIdx, (id) => !!ceqById.get(id)?.noteOnly)}
            frames={frames}
            layout={layoutOf(plan)}
            onMove={(d) => commit(moveFrame(frames, selIdx, selIdx + d))}
            onPatch={(p) => patch(sel.id, p)} />
        )}
      </section>

      {/* --------------------------------- RIGHT: editor | illustrator (no teleprompter since 2026-09-07) */}
      {!sel ? (
        <section style={panelShell}>{tabs}</section>
      ) : rightTab === "illustrator" ? (
        <section style={panelShell}>
          {tabs}
          <div className="flex items-center" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap", ...HEAD_RULE }}>
            <span style={{ fontSize: 11.5, color: MUTED }}>{labelOf(sel)}{sel.skipped ? " · skipped" : ""}</span>
          </div>
          {canIllustrate(sel.kind)
            ? <IllustrationPanel key={sel.id} sel={sel} setId={set.id} setName={set.name} frames={frames} onPatch={(p) => patch(sel.id, p)} />
            : <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>Pictures go on Memorize This, Cheat Code, Deep Question and blank slides. Pick one of those in the spine, or insert a <b style={{ color: CREAM }}>＋ Blank</b> — on a blank slide the picture is the slide: the watermark, the picture and the camera if you want it.</div>}
        </section>
      ) : (
        <SlideEditor key={sel.id} sel={sel} label={labelOf(sel)} set={set} topic={topic} tabs={tabs} layout={layoutOf(plan)}
          ceq={sel.kind === "ceq" && sel.ceqId ? ceqById.get(sel.ceqId) : undefined}
          saving={saving}
          onPatch={(p) => patch(sel.id, p)}
          onPatchKind={(p) => patchKind(sel.kind, p)}
          onSaved={(d) => { if (sel.ceqId) setOverrides((o) => ({ ...o, [sel.ceqId!]: d })); }} />
      )}
    </div>
  );
}

/** THE TWO BUTTONS at the top of the right column (2026-09-07, Lee: "put these in two side by
 *  side buttons") — Editor | Illustrator, the same size and weight, the one you're on gold.
 *  Replaced the dropdown that named the face as the column's heading; each face still labels
 *  the slide under the buttons. The Illustrator button is disabled (with a reason) on a slide
 *  kind that can't take a picture; the face itself, if it's already up, says which kinds can. */
function RightTabs({ tab, onTab, canIllustrate: can }: { tab: RightTab; onTab: (t: RightTab) => void; canIllustrate: boolean }) {
  return (
    <div role="tablist" aria-label="Editor or Illustrator" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
      {RIGHT_TABS.map((t) => {
        const on = tab === t.id;
        const off = t.id === "illustrator" && !can;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={on} disabled={off}
            title={off ? ILLUSTRATOR_OFF_TITLE : t.title}
            onClick={() => onTab(t.id)}
            style={{
              ...eyebrow, textAlign: "center", padding: "7px 8px", borderRadius: 8, cursor: off ? "not-allowed" : "pointer",
              border: `1.5px solid ${on ? GOLD : EDGE}`, background: on ? "rgba(252,163,17,0.14)" : "transparent",
              color: on ? GOLD : off ? MUTED : CREAM, opacity: off ? 0.5 : 1,
            }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------ the middle column

function SlidePane({ sel, idx, count, label, viewSet, topic, progress, backdrop, frames, layout, onMove, onPatch }: {
  sel: BlastFrame; idx: number; count: number; label: string; viewSet: BoothSetInfo; topic: BoothTopic;
  progress?: { x: number; y: number };
  /** The bolt-zoom backdrop the rule (or the override) gives this slide. */
  backdrop: BackdropMode | null;
  /** The whole running order — the phone applies the backdrop rule itself. */
  frames: readonly BlastFrame[];
  /** The set's slide template. */
  layout: "pass1" | "pass2";
  onMove: (d: -1 | 1) => void;
  /** Only the backdrop toggle patches from here; the words are edited in SlideEditor. */
  onPatch: (p: Partial<BlastFrame>) => void;
}) {
  const [phone, setPhone] = useState(true);
  const [safe, setSafe] = useState(true);
  return (
    <>
      <div className="flex items-center" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap", ...HEAD_RULE }}>
        <span style={eyebrow}>Slide {idx + 1} of {count}</span>
        <span style={{ fontSize: 11.5, color: MUTED }}>{label}{sel.skipped ? " · skipped" : ""}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <button style={chip(phone, SKY)} title="Show the slide on a 9:16 phone stage" onClick={() => setPhone((v) => !v)}>📱 phone</button>
          {phone && <button style={chip(safe, SKY)} title="Shade the zones TikTok and Shorts paint their own UI over" onClick={() => setSafe((v) => !v)}>safe zones</button>}
          <button style={tiny} title="Move up" onClick={() => onMove(-1)}>↑</button>
          <button style={tiny} title="Move down" onClick={() => onMove(1)}>↓</button>
        </span>
      </div>

      {/* CLICK THE WORDS (Lee, 2026-09-04): the tagline, the tutor line, the domain,
          an ad's every line — editable on the slide itself. Cards keep the Editor tab. */}
      <SlideEditContext.Provider value={onPatch}>
      {phone ? (
        <PhoneFrame frame={sel} frames={frames} index={idx} set={viewSet} topicName={topic.name} progress={progress} safe={safe} dim={!!sel.skipped} w={STAGE_W} layout={layout} />
      ) : (
        <div style={{ border: `1px solid ${EDGE}`, borderRadius: 10, overflow: "hidden", display: "inline-block", maxWidth: "100%", opacity: sel.skipped ? 0.5 : 1 }}>
          <FrameView frame={sel} set={viewSet} scale={0.78} topicName={topic.name} progress={progress} layout={layout} />
        </div>
      )}
      </SlideEditContext.Provider>
    </>
  );
}

// The phone stage itself is ./PhoneFrame.tsx — shared with /film (and the Arrange preview,
// retired into Review on 2026-09-05).

// ------------------------------------------------- the editor (right column)

/** Everything editable about the selected slide — beside it, not under it
 *  (Lee, 2026-09-04: "Instead of having edits of a slide underneath, it'd be
 *  faster/better to have them left/right"). A set card edits the card itself;
 *  an insert edits its words; the brand slides and ads edit their few
 *  switches. Same shell as the Illustrator — the two are faces of one column
 *  (the prompter was the other face until 2026-09-07). */

function SlideEditor({ sel, label, ceq, set, topic, tabs, layout, saving, onPatch, onPatchKind, onSaved }: {
  /** The set's slide template — the camera chips read their default from it. */
  layout: "pass1" | "pass2";
  sel: BlastFrame; label: string; ceq?: BoothCeq; set: BoothSetInfo; topic: BoothTopic;
  /** The Editor | Illustrator buttons, drawn by the deck (the Teleprompter | Editor toggle until 2026-09-07). */
  tabs: ReactNode;
  /** usePlan's own save state — every field below writes through onPatch, which
   *  debounces into the same commit. Shown here too (not just on the spine)
   *  because the spine is out of view while typing in this panel. */
  saving: string | null;
  onPatch: (p: Partial<BlastFrame>) => void;
  /** Same fields, but written onto every OTHER slide of this same kind too (2026-09-05). */
  onPatchKind: (p: Partial<BlastFrame>) => void;
  onSaved: (d: CeqDraft) => void;
}) {
  const bulletsText = (sel.bullets ?? []).join("\n");
  const detour = sel.kind === "phrase" || sel.kind === "tip" || sel.kind === "cheat";
  const ad = sel.kind === "ad" ? ADS[sel.ad ?? "greek"] : null;
  const adOwn = sel.text !== undefined || sel.title !== undefined || sel.bullets !== undefined || sel.url !== undefined;
  return (
    <section style={panelShell}>
      {tabs}
      <div className="flex items-center" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap", ...HEAD_RULE }}>
        <span style={{ fontSize: 11.5, color: MUTED }}>{label}{sel.skipped ? " · skipped" : ""}</span>
        {/* Lee, 2026-09-06: "if I edit any text when editing slides, instant
            save it." It already did (onPatch → commit, debounced 500ms) — the
            "saving…/saved" readout just lived on the spine, off to the left,
            out of sight while typing here. Same readout, closer to the fields. */}
        {saving && <span style={{ fontSize: 11, color: saving.startsWith("⚠") ? RED : saving === "saved" ? MINT : MUTED }}>{saving}</span>}
      </div>
      <div>
        {sel.kind === "ceq" && ceq && <CeqEditor key={ceq.id} ceq={ceq} topicName={topic.name} onSaved={onSaved} />}
        {sel.kind === "ceq" && !ceq && <div style={{ fontSize: 12, color: RED }}>This card is no longer in the set — skip it.</div>}
        {sel.kind === "cheat" && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <label style={{ fontSize: 11, color: MUTED }}>Title — the bold heading
              <textarea rows={1} style={{ ...field, resize: "vertical" }} value={sel.title ?? ""} placeholder="e.g. The Paycheck Test" onChange={(e) => onPatch({ title: e.target.value })} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>First line under it
              <textarea style={{ ...field, minHeight: 48 }} value={sel.body ?? ""} placeholder="Ask yourself if they get a paycheck from the company. If so, they're internal." onChange={(e) => onPatch({ body: e.target.value })} /></label>
          </div>
        )}
        {(sel.kind === "phrase" || sel.kind === "tip" || sel.kind === "blank" || sel.kind === "exhibit") && (
          <label style={{ fontSize: 11, color: MUTED }}>{sel.kind === "phrase" || sel.kind === "tip" ? "Title — the bold heading" : sel.kind === "exhibit" ? `Caption${sel.exhibitRef ? ` · exhibit: ${sel.exhibitRef}` : ""}` : "Text on the bare frame"}
            <textarea style={{ ...field, minHeight: 48, marginTop: 4 }} value={sel.text ?? ""} placeholder={sel.kind === "phrase" ? "e.g. Internal users" : sel.kind === "tip" ? "e.g. Why the board feels like a gray area" : "say it the way you'd say it on camera"} onChange={(e) => onPatch({ text: e.target.value })} /></label>
        )}
        {detour && (
          <label style={{ fontSize: 11, color: MUTED, display: "block", marginTop: 8 }}>{sel.kind === "cheat" ? "More lines under it" : "Lines under it"} — one per line, Tab to nest
            <textarea style={{ ...field, minHeight: 64, marginTop: 4, tabSize: 2 }} value={bulletsText} placeholder={"Management\nBudgets, costs, forecasts\nProduction"}
              onChange={(e) => onPatch({ bullets: e.target.value.split("\n") })}
              // NESTING (2026-09-06, Lee: "let me tab over to nest bullets into another
              // indention under"): Tab/Shift+Tab on the current LINE, not the whole field —
              // a plain textarea Tab would otherwise just jump focus to the next control.
              onKeyDown={(e) => {
                if (e.key !== "Tab") return;
                e.preventDefault();
                const ta = e.currentTarget;
                const r = indentBulletLine(ta.value, ta.selectionStart, e.shiftKey ? -1 : 1);
                onPatch({ bullets: r.text.split("\n") });
                requestAnimationFrame(() => ta.setSelectionRange(r.cursor, r.cursor));
              }} /></label>
        )}
        {detour && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6 }}>Nothing is highlighted on its own — highlight while filming, or type ==like this== for a fixed one. Type __word__ to underline, or ____ for a blank.</div>}
        {sel.kind === "intro" && (
          <label style={{ fontSize: 11, color: MUTED }}>Topic line on the intro (blank = the set's name)
            <textarea rows={1} style={{ ...field, marginTop: 4, resize: "vertical" }} value={sel.text ?? ""} placeholder={set.name} onChange={(e) => onPatch({ text: e.target.value })} /></label>
        )}
        {sel.kind === "outro" && (
          <label style={{ fontSize: 11, color: MUTED }}>Tagline on the outro (blank = the standard one)
            <textarea rows={1} style={{ ...field, marginTop: 4, resize: "vertical" }} value={sel.text ?? ""} placeholder="Cram what's on your exam." onChange={(e) => onPatch({ text: e.target.value })} /></label>
        )}
        {sel.kind === "bio" && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div style={{ fontSize: 12, color: MUTED }}>The tutor card — its words live in one place (bio-card.ts) so every rip says the same thing. Skip it if this rip doesn't need it.</div>
            <div>
              <button style={chip(sel.portrait === "on", ORANGE)} title="The hand-drawn portrait over the black — on unless you turn it off" onClick={() => onPatch({ portrait: sel.portrait === "on" ? undefined : "on" })}>🖼 portrait · {sel.portrait === "on" ? "on" : "off (parked)"}</button>
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
        {/* THE CAMERA (Lee, 2026-09-05): three fixed spots, free, or off — home 70 %+ of the time. */}
        <div style={{ marginTop: 10 }}>
          <div style={subhead}>📷 Camera on this slide</div>
          <div className="flex" style={{ gap: 5, flexWrap: "wrap", marginTop: 4 }}>
            {CAM_SPOTS.map((c) => (
              <button key={c} style={chip((isCamSpot(sel.cam) ? sel.cam : camDefault(layout, sel.kind).spot) === c, ORANGE)} title={CAM_LABEL[c]} onClick={() => onPatch({ cam: c })}>{c}</button>
            ))}
          </div>
          {(isCamSpot(sel.cam) ? sel.cam : camDefault(layout, sel.kind).spot) === "free" && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>Drag the ring on the stage to place it · wheel over it to resize.</div>}
          {/* SIZE (2026-09-05: "allow me to choose a camera on this slide location and resize
              it from its fixed spot and it would apply to any other slides using that setting"
              — instead of a fast-track round trip every time). Works on any spot but off; "apply
              to every ⟨kind⟩ slide" writes the size onto every other slide of this kind at once
              — one that's already been resized by hand individually keeps its own (plan.ts
              patchFramesOfKind). */}
          {(isCamSpot(sel.cam) ? sel.cam : camDefault(layout, sel.kind).spot) !== "off" && (() => {
            const current = sel.camSize ?? camDefault(layout, sel.kind).size ?? 0.28;
            return (
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11, color: MUTED, display: "flex", alignItems: "center", gap: 8 }}>
                  Size — {Math.round(current * 100)}% of the frame width
                  <input type="range" min={12} max={90} value={Math.round(current * 100)}
                    onChange={(e) => onPatch({ camSize: Number(e.target.value) / 100 })} style={{ flex: 1 }} />
                </label>
                <div className="flex" style={{ gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                  {sel.camSize !== undefined && <button style={chip(false)} title="Back to the built-in default — this slide only" onClick={() => onPatch({ camSize: undefined })}>↺ this slide's default</button>}
                  <button style={chip(false, ORANGE)} title={`Every ${FRAME_LABEL[sel.kind]} slide gets this size too. One you've already resized by hand keeps its own.`}
                    onClick={() => onPatchKind({ camSize: current })}>apply to every {FRAME_LABEL[sel.kind]} slide</button>
                </div>
              </div>
            );
          })()}
        </div>
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

