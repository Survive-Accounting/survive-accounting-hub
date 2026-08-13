# Authoring-Canvas UI Control Audit

**Scope:** every user-facing control reachable in the authoring canvas (`/study/canvas`).
**Branch/commit:** `canvas-v2` @ `8a4b9b5` (audit dated 2026-07-22).
**Method:** static read of handlers only — every "DOES" is traced from the actual `onClick`/keydown/handler, not inferred from a label. Six parallel read-only passes (toolbar+menus, frame+lesson chrome, hotkeys, card chrome, side panels, film/spotlight/sound). **No code was changed.** Line numbers cite `src/routes/study_.canvas.tsx` ("route") or `src/components/canvas/<file>` unless noted.

> This is a decision aid for a **later attended** deprecation/consolidation pass. Nothing here was acted on.

---

## Counts (top-line)

| Metric | Value |
|---|---|
| Distinct control **types** catalogued¹ | ≈ 480 |
| — Toolbar + its menus + Canvas-settings panel | ≈ 75 |
| — Scene dialogs (new-lesson, manage accounts/course, scaffold, snippet-save) | ≈ 12 |
| — Frame chrome (header + "Frame visuals" popover + in-frame HUD + overlays) | ≈ 70 |
| — Lesson chrome (badges + hover band) | 13 |
| — Per-card chrome (card-level, across 22 kinds) | ≈ 124 |
| — Per-row / per-segment / per-slip repeated control **types** | ≈ 45 |
| — Side / docked panels (14 panels) | ≈ 130 |
| — Keyboard bindings (38 registry + ~15 non-registry) | 53 |
| **Verdicts (grouped²)** | |
| KEEP | ~430 (default; everything not flagged below) |
| DEPRECATE? | 9 items/groups |
| CONSOLIDATE | 10 groups |
| BROKEN / DARK | 14 items |
| **Hotkey conflicts** | **0 hard**, 5 context-sensitive near-conflicts, 1 stale comment, 8 bindings absent from every legend |

¹ Counts **distinct control types**, not dynamic instances — a per-row "delete" that repeats N times is one type; swatch/emoji palettes count as one. A precise per-instance count would be far higher.
² Verdicts are applied at the **group/flagged-item** level, not one-line-per-control: KEEP is the default for every reachable control whose handler does what its label says; only the exceptions are enumerated in Part 3. This is the actionable output.

---

# PART 1 — INVENTORY

## 1.1 Toolbar (bottom-center, `route:5382+`, gated by `chrome`)

| Control | Tooltip / label (verbatim) · hotkey | Line | Does (from handler) | Scope | Persist |
|---|---|---|---|---|---|
| Scene name input | `"Scene name"` | 5390 | `setSceneName`; keydown stops canvas hotkeys | scene | scene JSON `name` |
| Cue sheet | `"Cue sheet — the entered frame's space-walk sequence (enter a frame first)"` | 5398 | toggles `cueSheetOpen` | frame panel | ephemeral |
| Card menu | `"Card"` | 5403 | opens card-kind picker | — | ephemeral |
| Palette menu | `"Palette"` | 5418 | opens element-blank picker | — | ephemeral |
| Add lesson | `"Add a lesson — pick type + topic, then scaffold its frames"` | 5432 | `addLesson` → opens New-lesson modal (CEQ_CRAM default) | scene | opens modal |
| Deck menu | `"Deck"` | 5434 | toggles Deck roster panel | scene panel | ephemeral |
| File menu | `"File"` | 5438 | Save / Save-as-new / Load / Export / Import / New-tab | — | (per item) |
| Script editor | `"Script editor — write the whole course script…"` | 5455 | toggles `scriptOpen` | global panel | ephemeral |
| Teleprompter | `"Teleprompter — current frame's script near the camera eyeline (p)"` · **p** | 5456 | toggles `prompter` | frame panel | ephemeral |
| Visual mix | `"Visual mix — read-only summary of this lesson's frame types + balance"` | 5457 | toggles `visualMixOpen` | lesson panel | ephemeral |
| Storyboard | `"Storyboard — every frame in film order; click one to jump in"` | 5458 | toggles `storyboardOpen` | global panel | ephemeral |
| Grid by type | `"Grid by type — lessons projected into type columns × topic rows…"` | 5460 | toggles `gridByType` (LessonGridView) | global view | ephemeral |
| Safe guides | `"Camera-safe guides — phone-safe, camera bubble, watermark + end-screen zones (enter a frame)"` | 5461 | toggles `safeGuides` | frame overlay | ephemeral |
| Rearrange | `"Rearrange frames (r) — full-grid drag reorder + copy/paste"` · **r** | 5465 | toggles `rearrangeOpen` | global view | ephemeral |
| Frame header | `"Frame header — header HUD + this lesson's intro / outro / preview"` | 5467 | toggles `frameHeaderOpen` dropdown | lesson panel | ephemeral |
| Canvas settings | `"Canvas settings (JE width, default preset)"` | 5488 | opens the big settings panel | — | ephemeral |
| Clean screen | `"Clean screen (chrome off)"` | 5778 | `setClean(true)` — hides all chrome (exit via **Esc** only) | global | tab snapshot only |

Menus: **File** → Save (`doSave`), Save-as-new (`doSave(true)`), Load scene, Export (.json+.md), Import from file, New tab (5443-5450). **Card**/**Palette** spawn nodes (`ADD_CARD_KINDS` / `ADD_ELEMENT_BLANKS`).

## 1.2 Canvas-settings panel (`route:5488-5775`) — ≈35 controls

JE card width, Credit indent, Focus palette, Auto-trim intro takes (+ clip length, Retrim-all), **Focus-dim** (auto/on/off), **Spotlight follows reveals**, Spacebar-also-moves-frames, Rehearsal HUD, Entrance pop, Check glow, Composition guides, Watermark, **Mute all + per-event sound rows** (keypad/swoosh/cramLaunch/confirm: volume/upload/test), Riff ×, Long-frame threshold, **Push speed / Push intensity / Ambient drift**, Backstage (cinema/light/dark/gray), Scene course + chapter selects, Manage accounts, Manage course, Account-order reorder + reset, **Prep for filming**, **Clear scene** (guarded), Preview-student tokens, New-JE mode. Persistence per-control noted in Part 3 (several **do not persist** — see BROKEN/DARK G).

## 1.3 Scene dialogs
New-lesson modal (`route:6119`, type×4 + topic + create → `createTypedLesson`), ManageAccountsDialog (`6165`), ManageCourseDialog (`6174`), Snippet-save (`6036`), **Region-scaffold dialog (`6064` — DEAD, see Part 3)**.

## 1.4 Frame chrome (`cards/FrameNode.tsx`)
**Header (always):** enter-on-click (`374`), `#lesson.frame` code chip (`379`), film-status cycle (`383`), script-state cycle (`386`), title (`401`).
**Header (hover):** bg play/pause, **Frame visuals** popover toggle, phone-check (writes nothing), Takes, **Director note (per-BEAT global, not per-frame — `716`)**, lock, duplicate, enter (redundant), delete (`405-430`).
**"Frame visuals" popover (`436-647`, ≈40 controls):** world grid (None + 8) + intensity/motion/**Seed ↻ (NO-OP)**/reset/apply-to-lesson/set-default/per-beat-default; Suggest-visual (AI); background loop (None + loops) + opacity/scrim; framing (fill/fit, zoom, 3×3 anchor, reset); cinematic (ambient push, spotlight push); layout template (8).
**Below header:** phone-check overlay, take drop-target, TakesPanel, director-note strip, `+ / clone` bubble (add-below + duplicate-below — both duplicate header actions).
**In-frame HUD (`route:5172-5233`):** title, script dock, **🔊 Sounds popover** (swoosh/cramLaunch/keypad on entry), add-frame-below, hide-navigator.

## 1.5 Lesson chrome (`route:LessonNode ~240`)
**Badge tab (always visible):** Type (cycle), Free/Paid (toggle, PAID=grayscale+lock), Optional (shown when off-path).
**Hover band:** path #, topic, pathing toggle (**duplicates the Optional badge toggle**), beat-guides toggle (**possibly stale**), check-gate flag, add-frame, duplicate-lesson, fit-to-contents, delete.

## 1.6 Per-card chrome — see the crowding ranking in Part 4. Shared base (`BaseCard.tsx:364-399`): DeckChip, Add/Tuck-to-deck (**s**), Edit, Attach memo, Duplicate, Delete, Pos-lock, resize grips. Element cards (`elements.tsx ElementChrome`): Duplicate, Lock, Delete only. Per-kind specifics catalogued (JE cluster, CEQ authoring row, Heading 12-button toolbar, Formula lens/gear, List/Testimonial/Formula settings gears, etc.).

## 1.7 Side / docked panels (14)
BrandBar drawer (Cards/Outline/Memos/Key tabs), Palette (+ snippet library + card library), OutlinePanel (nav), LegendHud "Key", MemoLibraryPanel, Deck roster, DeckManager (named decks + CEQ sets + seed), Cue sheet (recorder), Teleprompter (+ popout), Storyboard, Visual mix (read-only), Script editor, Frame-script dock, Take board (Mux). Full control lists captured per panel; dead/dark rows surfaced in Part 3.

---

# PART 2 — HOTKEY MAP + CONFLICTS

**Dispatch:** one bubble-phase `window` keydown via `useKeymap` (`keymap.ts:49`); bindings in `route:4345-4783`. Combos de-dupe by string (last wins). All registry bindings skip while typing in input/textarea/select/contenteditable (`commands.ts:86`). Two legends exist: **`?` KeymapOverlay** (all non-hidden registry keys) and **LegendHud "Key"** panel (only Space / ⇧Space).

## 2.1 Registry bindings

| Key | Handler → behavior | Context |
|---|---|---|
| **Space** | THE SHOW KEY: recordedCues +1 → cueOrder → stack flip → reveal-next / deal-next-tucked (CEQ arm-then-deal) → arm → advance frame (`4348-4460`) | global |
| **⇧Space** | reverse show key (`4463-4553`) | global |
| **H** | reveal-hide on selected card (`4556`) | selection |
| **S** | tuck selected into deck (`4570`) | selection |
| **F** | focus-zoom selected (`4603`) | selection |
| **Esc** | escape ladder (11 rungs, `4612-4685`) | global |
| **C** | Choreograph current frame (`4688`) — *rebound from Clean* | in-frame |
| **G** | explode hovered card into per-part steps (`4699`) | choreograph |
| **V** | toggle Film mode (`4700`) | global |
| **B** | toggle Camera bubble (`4701`) | global |
| **K** | Chroma test (solid-black bg in film) (`4702`) | global |
| **P** | Teleprompter (`4703`) | global |
| **J / T / N / Q / L** | quick-spawn JE / T-account / Note / CEQ / Reveal-list (`4704-4708`) | global (Q/L inert when focusPalette) |
| **D** | duplicate selected (`4709`) | global |
| **> / <** | grow / shrink ×1.06 (`4710-4711`) | global |
| **Ctrl+Shift+> / <** | grow / shrink ×1.12 (`4712-4713`) | global |
| **← / →** | film trap-flip · else frame beat nav · else JE line debit/credit hop (`4715-4730`) | context-sensitive |
| **↑ / ↓** | CEQ emphasis up/down · else prev/next sub-frame (`4733-4745`) | frame / CEQ |
| **Enter** | resolve emphasised CEQ choice (`4748`) | CEQ-focused |
| **F2** | edit selected node inline (`4764`) | authoring |
| **] / [** | next / prev beat (`4769-4770`) | global |
| **R** | Rearrange overlay (`4771`) | global |
| **PageDown / PageUp** | beat aliases (`4772-4773`, hidden) | global |
| **Ctrl+S / Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z** | save / undo / redo / redo-alias (`4774-4777`; last hidden) | global |
| **?** | toggle KeymapOverlay (`4778`) | global |

## 2.2 Non-registry handlers
Any-key disarms `armState` (Space excluded, `1258`); double-tap-arrow arming (`1279`); **Ctrl/Cmd+B** bold + **Alt+Shift+5** strike (editable fields only, `1341-1348`); Control down/up toggles `sa-ctrl` body class (`1733`); **Delete/Backspace** node delete (`5128`); **Shift+click** multi-select (`5108`), **Shift+drag** marquee (`5126`); **Ctrl+click / Ctrl+Shift+click / Ctrl+Alt+Shift+click** = spotlight / flame 🔥 / warn 🚨 on targets (`SpotlightContext.tsx:182-194`) and on edges (`1703`); Esc-capture in CardPopover / FrameNode bg-menu / ScriptEditor; **@** mention picker in ScriptEditor.

## 2.3 Conflicts & findings
- **Hard conflicts: none.** Registry de-dupes; non-registry handlers are disjoint by focus/gesture.
- **Near-conflicts (context-sensitive, intentional):** `B` (bubble vs Ctrl+B bold, focus-disjoint); `Enter` (CEQ vs editors, stopPropagation); `←/→` three-way branch; `↑/↓` CEQ-vs-subframe; `Space` heavily multiplexed (one handler, ordered precedence).
- **Stale comment:** `route:1724-1731` still says the marquee is **Ctrl+drag** and keeps the `sa-ctrl` machinery, but the live prop is `selectionKeyCode={["Shift"]}` (`5126`) — marquee is **Shift+drag**; the ctrl-drag path is effectively dead. **Flag.**
- **Bindings in NO legend:** Ctrl+Shift+Z, PageUp/PageDown (registry `hidden`); and never-registered: Ctrl+B, Alt+Shift+5, all spotlight click-combos, Delete/Backspace, Shift+click/drag, double-tap-arrow arming, `@` picker. The LegendHud "Key" panel shows only the two Space-walk keys, so everything else relies solely on the `?` overlay.
- **Verified:** `C` fully rebound (no stray Clean keydown); CEQ **reveal-answer key removed** — Enter-resolution is the sole path (`OtherCards.tsx:329-330`).

---

# PART 3 — VERDICTS

**KEEP** is the default: every reachable control not listed below traces to a live handler and a real persisted field / DB write, and serves the current locked workflow (frame-by-frame filming, space-walk, CEQ live keys, take-board pipeline). Only exceptions are enumerated.

## 3.1 BROKEN / DARK (no-op, unreachable, placeholder, or setup-gated)

| # | Control | Where | Why |
|---|---|---|---|
| B1 | **Region-scaffold dialog** + `spawnRegionScaffold` + `scaffoldName/scaffoldCourseId` state | route:6064-6113, 1938-2005 | **Unreachable** — `setScaffoldOpen(true)` is never called anywhere. Confirmed dead (File-menu comment: "old region-scaffold slot… no longer uses"). |
| B2 | **World "Seed ↻" button** + `worldSeed` field | FrameNode.tsx:495; WorldBackground.tsx:118 | **No-op** — `WorldBackground` discards `seed` (`void sd; …star field was removed`). Button increments a counter that changes nothing. |
| B3 | **Bridge cards** (Ask Lee, Submit a Problem, Share/Invite) | elements.tsx:599-622; Palette | Placeholder — CTA `disabled`, "Coming soon", `kindBadge="soon"`. No backend. |
| B4 | **Gate nodes** (Payment/Signup gate) | elements.tsx:533-590; Palette | "Visual placeholders only — real gating ships with World v1." Non-interactive placeholder badge. |
| B5 | **Spotlight no-op API** (`move`/`tryReenter`/`editSpot`/`onReveal`/`cardDim`) + "follow-reveals" | SpotlightContext.tsx:117-126 | Deliberate no-ops "so the keymap type-checks." The Space handler still **calls `onReveal` (dead call path)** via `revealedTargetId` (route:4418-4419). |
| B6 | **Deprecated spotlight index-cursor model** (`SpotState`/`moveSpot`/`startSpot`/`spotMembership`) | spotlight.ts:80-122 | Dead code — superseded by click-toggle reducers; referenced only by `spotlight.test.ts`. |
| B7 | **`ScriptEditor.setScriptState`** | ScriptEditor.tsx:131 | Handler defined but **no control wired to it** in the file. |
| B8 | **"Spotlight follows reveals" checkbox** | route:5548 | Toggles a feature that is now a no-op (B5). Control for a dead feature. |
| B9 | **RecorderSpike** | RecorderSpike.tsx | Experiment-only, "NOT the filming flow"; in-browser capture + local download, not wired to the take board. |
| B10 | **BrandBar "menu coming soon" branch** | BrandBar.tsx:82-90 | Unreachable — route always passes 4 items. |
| B11 | **Palette floating-mode collapse/expand chrome** | Palette.tsx:249-278 | Dead — route always renders `docked`. |
| B12 | **LegendHud floating collapse header** + `sa-canvas-legend-collapsed` | LegendHud.tsx:79-86 | Hidden whenever `docked` (the only usage) → LS key effectively unused. |
| B13 | **Non-persistent "settings"** — `spotFocusDim`, `spotFollowReveals`, `cinePushMs`, `cinePushIntensity`, `cineAmbientMs`, `showFrameHeader` | route:5543/5548/5618/5622/5626/1284 | Live in settings/HUD panels but **absent from `serialize()`** → silently reset every reload/tab-switch, unlike neighbours that persist. Functional-but-leaky (soft). |
| B14 | **Setup-gated generators** (Seed Start Here, Generate drill, New account-type set, CEQ approve, effect cards) | DeckManager.tsx | Not broken — **no-op with a `setSeedNote` message** if COA/course/scenarios aren't loaded. Depends-on-setup, fails loud-ish. |

## 3.2 DEPRECATE? (abandoned or superseded workflow)

| # | Control | Where | Note |
|---|---|---|---|
| D1 | **Clean mode** (button + `clean` state) | route:5778, F | Keyboard-orphaned (`C` rebound to Choreograph). Button only ever sets `true`, uses the misleading `Film` icon, exits only via Esc rung 10. Remove or relabel + add explicit off. |
| D2 | **CEQ reveal residuals** (`revealedAnswer` flag, silent `picked` self-check) | OtherCards.tsx:243,263 | Reveal-answer button already **removed & shipped**; these data-flag remnants can be cleaned once no saved scene relies on them. |
| D3 | **Lesson "beat guides" toggle** | route:465-472 | Drives dividers that only appear in a now-"frames-only" canvas ("grid column headers… removed"). Leftover from the pre-frames beat-column layout. Confirm with Lee. |
| D4 | **Memo `memoKind` selector remnants** | MemoCardNode.tsx:206; JeCardNode.tsx:1390 | Editor kind-buttons removed (kind fixed at creation); the `MEMO_TEXT_KINDS` picker survives only in the legacy JE in-card MemoPopover. |
| D5 | **JE in-card memo leader/popover** | JeCardNode.tsx:712-715,834 | "legacy in-card leader (inert post-migration; memos are nodes now)". |
| D6 | **`FilmStatusChip` manual status-cycle** | frame-takes.tsx:363-379 | Two competing film-status models — manual cycle vs **derived** status in `TakeBoardCell`. Manual chip looks superseded. |
| D7 | **`List.definition` field** | ListCardNode.tsx:166 | Retained in type but unused (duplicate inline title removed). |
| D8 | **`worldSeed` scene-JSON field** | (with B2) | Dead weight in every saved scene once the button goes. |
| D9 | **`sa-ctrl` ctrl-drag marquee machinery** | route:1732-1745 | Orphaned relative to `selectionKeyCode={["Shift"]}`; comment out of date. |

## 3.3 CONSOLIDATE (overlapping controls)

| # | Group | Where |
|---|---|---|
| C1 | **Enter-frame ×4**: header click, `Maximize2` button, double-click stage, in-frame HUD | FrameNode.tsx:374/429/304; route HUD |
| C2 | **Duplicate-frame ×2**: header Duplicate + below-frame clone bubble | FrameNode.tsx:428/737 |
| C3 | **Add-frame-below ×3**: below-frame bubble + in-frame HUD + lesson chrome add-frame | FrameNode.tsx:736; route:5231; LessonNode:481 |
| C4 | **Pathing toggle ×2**: badge-tab Optional + hover Milestone toggle (same field) | LessonNode:360/456 |
| C5 | **Storyboard vs Rearrange share the `LayoutGrid` icon** | route:5458/5465 |
| C6 | **Sound settings in 3 places**: global mixer (Settings) + per-frame 🔊 popover + per-card keypad/confirm toggles — precedence unclear | route:5579; 5191; OtherCards/Heading/elements |
| C7 | **`showFrameHeader` toggled from 2 places**: in-frame HUD hide button + Frame-header panel on/off | route:5232/5474 |
| C8 | **Script editing ×3 surfaces** edit the same `frame.script`: Script-editor modal, Frame-script dock, Teleprompter (read) | ScriptEditor / FrameScriptDock / Teleprompter |
| C9 | **Keypad SFX can double-fire**: frame `keypadOnEntry` + per-element `keypadSfx` on the same entry edge | route:2530; elements/Heading/CEQ |
| C10 | **Formula win-sound has no toggle** while CEQ has `confirmSfx` — inconsistent; make it a toggle or route through one place | FormulaCardNode.tsx:348 |

---

# PART 4 — UX FRICTION NOTES (observations only)

- **Mid-take controls buried >2 clicks:** the **per-frame 🔊 Sounds** popover lives inside the in-frame HUD (enter frame → open HUD → open popover); **world/background/framing** all live behind the frame "Frame visuals" popover (hover frame → Film icon → scroll). Both are things Lee tweaks between takes.
- **Unlabeled / tooltip-less controls:** the `#lesson.frame` code chip (no title); several per-row cycle chips (DR/CR, difficulty) rely on a single-letter glyph; color/emoji swatch palettes have no per-swatch tooltip.
- **Settings in two places with unclear precedence:** sound (global mixer vs per-frame vs per-card, C6); `showFrameHeader` (C7); frame film-status (manual chip vs derived, D6). Focus-dim/follow-reveals live in Settings but **don't persist** (B13), so a change there silently reverts.
- **Per-card chrome crowding (button count, card-level only):**

  | Rank | Card kind | Buttons |
  |---|---|---|
  | 1 | **Heading / Big Text** | **12** |
  | 2 | **JE** | **10** |
  | 2 | **CEQ** | **10** |
  | 4 | Formula/Effect | 8 |
  | 5 | ExamCue | 7 (+11 emoji) |
  | 6 | Text, Schedule, Outline, List, Testimonial, T-account, Computation, Memorize, Video | 6 |
  | 15 | Legend, Bridge/Ask-Lee | 5 |
  | 17 | Cycle | 4 |
  | 18 | Memo, Image, Gate, CeqTease, Note | 3 |

  Two clear outliers: the **Heading 12-toggle strip** and the **JE 10-button cluster**; **CEQ ties JE at 10** once its authoring row (🔔/⌨/std/wide) is counted.

---

# PART 5 — SUGGESTED ATTENDED DEPRECATION BATCH #1

The 10 safest, highest-value removals — each is dead/unreachable/no-op with **zero user-visible behavior change** (except D1, flagged). Do these in an attended session with a build + test run per removal.

1. **Delete the region-scaffold dialog + `spawnRegionScaffold` + `scaffoldName/scaffoldCourseId`** (B1) — fully unreachable.
2. **Remove the "Seed ↻" button and the `worldSeed` field** (B2/D8) — no-op; after confirming no saved scene reads `worldSeed`.
3. **Delete the dead spotlight index-cursor model** in `spotlight.ts` (`SpotState`/`moveSpot`/`startSpot`/`spotMembership`) and update `spotlight.test.ts` (B6).
4. **Remove the no-op `onReveal` call path** in the Space handler + the `revealedTargetId` import, and drop the dead `SpotlightContext` no-op methods that nothing calls (B5).
5. **Delete the "Spotlight follows reveals" settings checkbox** (B8) — controls a removed feature.
6. **Remove `ScriptEditor.setScriptState`** (unwired) and its now-unused imports (B7).
7. **Delete the BrandBar "menu coming soon" branch** (B10) and the **Palette floating-mode collapse chrome** (B11) — both unreachable in the always-docked wiring.
8. **Remove the LegendHud floating collapse header** + `sa-canvas-legend-collapsed` usage (B12).
9. **Fix the stale marquee comment + remove the orphaned `sa-ctrl` ctrl-drag machinery** (D9) — comment says Ctrl+drag, code is Shift+drag.
10. **Relabel or remove Clean mode** (D1) — at minimum swap the misleading `Film` icon and add an explicit off control; ideally fold into film/chrome-off if redundant. *(Least "safe" — it's reachable; Lee's call on remove vs relabel.)*

**Secondary (consolidation, not removal), when Lee wants it:** collapse the 4 enter-frame / 3 add-frame-below / 2 duplicate-frame / 2 pathing-toggle paths (C1-C4); unify the 3-way sound settings and clarify precedence (C6); give the Formula win-sound a toggle (C10).

---

# PART 6 — COULD NOT BE DETERMINED STATICALLY (verify live / with Lee)

- Whether any **saved scene actually stores** `worldSeed` / CEQ `revealedAnswer` data — scan scene JSON (or accept the risk) before deleting those fields.
- Whether the **keypad SFX double-fire** (C9) is actually audible in film, or masked by de-dup — needs a live listen in film mode.
- Whether the **"beat guides"** toggle (D3) is still part of Lee's workflow — behavioral, not in code.
- Whether **Clean mode** (D1) is used at all vs. always superseded by Film — Lee's usage call.
- **Camera-bubble device picker, Take-board upload/Mux, Suggest-visual AI** need live env (webcam / `MUX_TOKEN_*` / AI gateway) to exercise — not assessable statically.
- Exact **total control count** is approximate (≈480 types); a per-instance count would require enumerating dynamic rows/segments at runtime.
