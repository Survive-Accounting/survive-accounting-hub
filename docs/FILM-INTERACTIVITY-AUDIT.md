# Film interactivity audit — 2026-09-04

Written by the `film-interactivity-audit` workflow (four readers, one skeptic per claim, one synthesis) for Lee's question: "why aren't the interactivity tools working on the in-page capture?" Line numbers are as of commit 8185b9ca.

# Why the in-page capture has no tools

## 1. Root cause

Every interactivity tool lives inside `CeqPreviewer.tsx`'s `Inner`, and the canvas film popout is a `createPortal` of that same React tree (`PanelPopout.tsx:32-34, 71-85`), so it inherits everything: the providers at `CeqPreviewer.tsx:2856-2865` (Highlight, CardWrite, Practice, Scale, Width, Move, Persist, PreviewSpot), a real `<ReactFlow>` camera (`:3187-3262`), the `film-mode[ sa-alt]` root (`:3186`), `FLAME_CSS+PV_CSS+FILM_LOCK_CSS` (`:3185`), `PerfArrowLayer` (`:3284`), `BrandCursor` (`:3295`), keys bound on both windows (`:2836-2844`). The `/v3/.../film` route mounts `BlastOffCapture` (`v3.$topic.$set.blast-off.film.tsx:26`) → `PhoneFrame.tsx:68` → `frame-view.tsx:78` → `SetCard`, which renders the same `CeqPreviewNode` but with only `HighlightContext` provided (`BlastOffCapture.tsx:73`), a bare `ReactFlowProvider` with no viewport (`SetCard.tsx:18-20, :65`), `FilmContext=true` (`:66`), `inert: true` (`:94`), `enterAnim: "none"` (`:92-93`). `PracticeContext` (`:78`), `ScaleContext` (`:89`), `WidthContext` (`:94`), `MoveContext` (`:100`), `PersistContext` (`:107`), `PreviewSpotContext` (`:110`) are non-exported consts, so the card reads no-op defaults. `inert` kills practice (`:625-627`), Alt-move (`:634`), boss/clear-click (`:722`), shift-click (`:809, :839`), choice drag-select (`:856`), AltGrips (`:872`). No element under `src/components/blastoff` carries `film-mode`, so `.film-mode .sa-type` (`:172`) and `.sa-outro-fade` (`:187`) never match. The only survivor is stem drag-select (`:810`, not inert-gated).

## 2. Inventory

| Tool | Gesture | Canvas | /film | Needs on /film | Effort |
|---|---|---|---|---|---|
| Spotlight pill | Ctrl+click choice/detour line | yes | no | export `PreviewSpotContext` (`:110`), spotApi state copied from `:1717-1728` in BlastOffCapture | small |
| Super/warn spotlight | Ctrl+Shift(+Alt)+click | yes | no | same provider | small |
| Freehand ink | — | **does not exist anywhere** | — | — | — |
| F1 perf arrows | F1, move, F1; Delete | yes (`:1306-1393`) | no | export/extract `PerfArrowLayer`, state, Delete branch, Esc guard vs `onExit` (`BlastOffCapture.tsx:49`) | medium |
| Alt+drag move | Alt+drag card | yes (`:633-648`) | no | `inert:false`, export Move/Scale/Width ctx, Alt latch + `film-mode sa-alt`, transform on SetCard wrapper | medium-large |
| Alt grips resize/widen | Alt+hover, drag | yes (`:438-483`, gate `:872`) | no | same as Alt-move | medium |
| Zoom | wheel/pinch | yes (`:3250-3251`) | no | CSS `transform: scale` + `onWheel` on PhoneFrame wrapper | small |
| O pull-back | O | yes (`:2755-2785`) | no | scale-multiplier state; no camera needed | small |
| L pin | L | yes | no | meaningless without a camera | n/a |
| Bolt cursor | always-on | yes (`:3295`) | no | `useRef` on root (`BlastOffCapture.tsx:74`) + `<BrandCursor>` | small |
| Shift-click word | Shift+click | yes (`:809, :839`) | no | `live` prop → `inert:false` through SetCard/FrameView/PhoneFrame | small |
| Drag-select highlight | drag, release | yes | stem only | same `inert:false` for choices (`:856`) | small |
| Choice click select/resolve | click, click | yes (`:839, :1622-1635`) | no | export `PracticeContext`, emph/resolved state + `playSfx` in BlastOffCapture, `inert:false` | small-medium |
| BOSS mark | Ctrl+Alt+click | yes (`:722, :1426-1439`) | no | export ctx + `BossReveal`; no `boss` field in BoothCeq → ephemeral only | medium |
| Typewriter | auto on detour | yes (`:172`) | no | `film-mode` class + `key={frame.id}` on FrameView (`PhoneFrame.tsx:68`) | small |
| Neon label | auto | yes | **yes** (`.sa-glow-sweep` `:190`, ungated) | nothing | — |
| Card entrance / crossfade | auto | V1 stack = instant cut (`:1812`) | no | drop `enterAnim:"none"` for live frame | small |
| Outro fade | auto | yes | no | `film-mode` + `.sa-outro-fade` wrapper at `frame-view.tsx:62` | small |
| Space walk | Space/Shift+Space | yes | **yes** (`BlastOffCapture.tsx:41-45`) | PageDown/Up hold-to-rip absent | small |
| Backtick reset | ` | yes (`:2827`) | partial (`:48` highlights only) | grow as tools land | small |
| Teleprompter window | ▶ button | yes (`CeqStudio.tsx:671-674` writes `sa-film-active`) | no (own in-shot P panel `:88-99`) | write `sa-film-active` on frame change, ~10 lines | small |
| Campus banner / watermark | auto | yes | **yes** (`PhoneFrame.tsx:59, :62-66`) | nothing | — |
| BoltZoom backdrop/knockout | auto | yes (`:559-560`) | **no** — `PhoneFrame.tsx:54` computes, discards | `<BoltZoom>` layer under FrameView | small |
| Memo/arrow-head/exhibit/staged-element tools | various | yes | no | no memo/exhibit nodes render on /film | large |
| F fullscreen | F | popout only | no | one `onKey` branch | small |

## 3. /results vs canvas

**Stale until re-send** (only caller: `BlastOffEditor.tsx:124-140`; /results has no send): order/skips, backdrop/knockout/banner flags, `geomV.card`, insert titles/bullets, added/removed inserts, spine element re-stamp (`blastoff-sync.functions.ts:243-247, :325-343`).

**Structural (re-send never fixes)**: cheat `body` dropped (`sync:275`, phone uses `frameBullets`, `frame-view.tsx:103`); intro topic override (`sync:337` hardcodes `setName`); outro tagline (`sync:341`); world background forced only-when-absent (`sync:215-218`) plus glow/grain/vignette (`CeqPreviewer.tsx:571-577`) vs flat `#000` (`PhoneFrame.tsx:58`); watermark **rule matches** (both hide on open/intro/outro/bolt/ad) but opacity 0.92/top 5% vs 0.62/top 3.2% (`PhoneFrame.tsx:63-64` vs `:3277-3278`); card scale 87.8% CSS-centred (`PhoneFrame.tsx:24-29`) vs 80.9% centred on nominal `CARD_H` (`film-spot.ts:25-33`); navy pad only on phone (`SetCard.tsx:76`, blank frame shows a navy rectangle); bio sized by two knobs (`bio-card.ts:18, :20`); set-card `callout/cardW/boss/memos` invisible to `BoothCeq` (`talkthrough.functions.ts:186-197`); exhibit placeholder + never re-placed (`sync:332`); Q counter (`BlastOffEditor.tsx:85` counts skipped, duplicates counted twice); 16:9 ignores `geomV` (`orientation.ts:167-178`).

**/arrange = /results by construction**: `BlastOffEditor.tsx:225` and `ReviewDeck.tsx:326` both mount `PhoneFrame` (w=270 vs 306), as does `BlastOffCapture.tsx:75`. Residuals: Review's `viewSet` overrides (`ReviewDeck.tsx:111-117`), Arrange's counter, Review's safe-zone overlay.

## 4. Options

**A — mount the tools in `/film`.** Get: parity with /results/arrange, no send step, Space/`/H/P already there. Lose: ReactFlow pan/pin, memos, arrow heads, exhibits, OBS snap. Order: (1) `film-mode` wrapper + `BrandCursor` + `key={frame.id}` — cosmetic day-one; (2) `live` prop → `inert:false` through SetCard/FrameView/PhoneFrame; (3) export `PreviewSpotContext` + `PracticeContext`, provide in BlastOffCapture, grow `` ` ``; (4) `PerfArrowLayer`; (5) CSS zoom + O; (6) Alt move/grips last. Ratchets: `tdz-graph.test.ts:177-180` (function declarations only in CeqPreviewer), `film-lock.test.ts:75, :78` pins. ~2-3 days.

**B — `/film` pops into a 9:16 window.** Reusable as-is: `openPopoutWindow`/`PanelPopout`, `capture-window.ts`, `BrandCursor`, `film-lock.ts`; needs `export` on `CaptureBadge`/`FilmShell`. Simplest form is URL `?popout=1` + `snapCaptureSize(window)` on itself — no cloning, no cross-window keys. Risks: popup blocker (must be a click), fonts arrive via Google `<link>` clone with body defaulting to Inter (`PanelPopout.tsx:49`), 4s preparing gate. Orthogonal to A — gives the OBS-clean window, not the tools. ~1 day.

**C — keep the canvas popout.** Get everything today. Lose: /results as truth (all of §3), the send step, and the structural drift.

**Recommend A, then B (URL form) when the OBS crop workflow bites**; keep C for memo/exhibit rips only. Which tools do you want back first — spotlight, click-to-resolve, bolt cursor, typewriter, perf arrows, zoom/O, Alt move/grips, boss, teleprompter?
