# Shorts polish pass — audit and plan

Pre-implementation audit (§36 style) for the final polish pass on the Survive Shorts production/capture system. Repo `C:/Users/lee/Documents/sa-film-camera`, branch `film/free-camera-pinned-ceq`, HEAD 3be23310. Synthesized from twelve subsystem maps plus the Recraft API note; the load-bearing lines (PhoneFrame.tsx:85-149, AdSlide.tsx:54-99, layout.ts:41-73, text-highlights.tsx:69-71, blastoff.functions.ts:20-46, BlastOffCapture.tsx:96-134) were re-read from disk and match the maps. Nothing was modified.

Conventions: paths are relative to `src/` unless they start with `docs/`, `scripts/`, `public/` or `migration/`. "Both schemas" always means `lib/blastoff.functions.ts:20-44 frameSchema` and `lib/blastoff-sync.functions.ts:43-65 frameIn`.

---

## 1. Who controls each of the 17 systems

| # | System | Path | Role (with the lines that matter) |
|---|---|---|---|
| 1 | Slide schema | `components/blastoff/plan.ts` | The model. `BLAST_FRAME_KINDS` :23-30, `BlastFrame` :34-90 (every field after `kind` optional; "absent = the default rule"), `BlastPlan` :92-98, `INSERT_KINDS` :103, `FULL_FRAME_KINDS`/`isFullFrame` :113-114, `INSERT_CALLOUT` :140-144, `reconcilePlan` :197-229, `duplicateFrame` :273-279 (deep-copies only `prompter`), `patchFrame` :287-288. |
| | | `lib/blastoff.functions.ts` | Persistence. `frameSchema` :20-44 (plain `z.object`, Zod 3 → unknown keys STRIPPED), `loadBlastPlan` :49-65 (malformed → null → client regenerates), `saveBlastPlan` :69-95 (whole-plan replace of `deck.blastOff` inside `canvas_scenes.nodes_json`). No table/column/migration of its own. |
| | | `lib/blastoff-sync.functions.ts` | "Send to film". Hand-copied second schema `frameIn` :43-65; ad enum retyped :59; staged elements :154-174, :326-351; ceq early-return :245-260. |
| | | `components/blastoff/ad-kinds.ts` | `AD_KINDS` :4 split out so the canvas never imports plan.ts (TDZ). |
| | | `lib/learn-plan.ts` | `/learn` reader :20-33 passes whole frames through; projections :39-70 are fixed-field. |
| 2 | Generation pipeline | `components/canvas/talkthrough-pass.ts` | All prompt builders/parsers (pure). `buildGenerationQueue` :530-572, `IDEA_KINDS` :391, `REVIEW_RULES` :325-342, `buildIdeaMessages` :629-644 (`HIS FOLLOW-UP TAP` :640), `parseIdeaDraft` :655-668. |
| | | `components/canvas/talkthrough-review.ts` | Client runner + `sa-tt-genstate` store :29-70; `queueIncrementalReview` :311-386; `runGenTask` idea branch :454-479; `sweepStrandedReviews` :101-115. |
| | | `lib/talkthrough.functions.ts` | Server fns: `runMicro` :318-328 (the per-slide door Review already uses), `runTalkthroughReview` :354-382, `applyCeqEdit` :388. |
| | | `lib/ai.server.ts`, `lib/ai-registry.ts` | `runAiTask` :32-60 over the Vercel AI Gateway; `AiTask = 'micro'|'synthesis'` :18 — text only, no image lane. |
| | | `components/talkthrough/GenerationDock.tsx` | The bottom-right dock; rows from `listSessions × reviewStateOf` :85-92, `busy` :96, bolt tick :109-113, Resume :141-147, pill :216-221. |
| 3 | Talkthrough processing (dictation) | `components/canvas/talkthrough-import.ts` | `STAMP_CUES` :41-60 (no illustration cue), `isCue` :75-79, `parseRun` :95-145, `buildImportRows` :188-207 (tag note null at :204). |
| | | `components/canvas/talkthrough.ts` | `StampKind2` :196-200, `STAMP_KINDS` :212-221, `STAMP_LABELS` :235-242, `styleKindForKind` :555-561, `fromTagRow` :627 whitelist. |
| | | `components/talkthrough/Booth.tsx` | Visual follow-up note :725-751 (the only structured metadata on a stamp); ImportPanel help :900-901. |
| | | `components/blastoff/prompter.ts` | `STAMPS_FOR_KIND` :54-59, `frameKindForStamp` :62-68. |
| 4 | Renderer | `components/blastoff/frame-view.tsx` | The ONE renderer. Props :49-59, `s = scale*0.34` :60, open/intro→BoltZoom :74-77, bio column (LeePortrait + SetCard — the only stacked-visual precedent) :79-90, bolt :96, ad :97-98, ceq :100-119, exhibit→hand-copied `ExhibitDetour` :124/:145-163, inserts :126-139. |
| | | `components/blastoff/SetCard.tsx` | Navy pad + real `CeqPreviewNode`; `s = scale*(scaleMul??1)` :98, `data-sa-card-scale` :106-107 (pinned by camera.test.ts). |
| | | `components/canvas/CeqPreviewer.tsx` | The card itself: root `[data-ceq-card]` :723, detour box :754, KindChip :753, stem/choices :805-870, `PV_CSS` :156-316 (embeds `SEL_EMPH_CSS` at :241). |
| | | `components/canvas/cards/CalloutCard.tsx` | Detour skin: `DETOUR` :85-91, `detourAccent` :96-102, corner triangle :142, heading :181-186, bullets :199-203, `KindChip` :233-238. |
| 5 | Editor | `components/blastoff/ReviewDeck.tsx` | Review (/results). `usePlan` :193, `patch` :229, `menuFor` :280-307, `SlidePane` + `SlideEditContext.Provider` :479-487, `SlideEditor` :501-630 (camera chips :612-621, banner :622-626), `Prompter` proofread state :741-793. |
| | | `components/blastoff/BlastOffEditor.tsx` | `usePlan` :36-86 (500 ms debounced `saveBlastPlan`; `setLayout` saves at once :74-83); Arrange preview `PhoneFrame w=270` :238; Q-counter over ALL frames :97-100. |
| | | `components/blastoff/slide-edit.ts` | `SlideEditContext` :9-10 (Review stage only). |
| 6 | Capture renderer | `components/blastoff/BlastOffCapture.tsx` | /film. Providers :150-156, `film-mode` host :157, `PhoneFrame … capture` :159-160, the only slide-advance keydown :115-134, `resetTake` :101 (cannot reach `moment`). |
| | | `components/blastoff/PhoneFrame.tsx` | The one 9:16 phone. `phoneScale` :36-41, cam resolution :87-89, `moment` :93-95, `cardBox` measure :96-113 (gated `capture && cam !== 'off'`), root :120, banner :121, watermark :124-128, stage :129-135, `WebcamFrame` :136-140, safe bands :141-147. |
| | | `components/blastoff/capture/popout.ts` | ?popout=1 same-page reopen, 1080×1920 snap :62-100. |
| 7 | Camera positioning | `components/blastoff/capture/webcam-spots.ts` | `CAM_SPOTS` :23-25, `defaultCamFor` :33-37, `camRect` :48-58 (home d=.24w; hero = the ONLY rectangle, cw=.62w, ch=1.2cw, top .11h), `avoidCard` :71-85, `nextCamSpot` :88-92. |
| | | `components/blastoff/layout.ts` | `SAFE` :41, `cardPlacement` :52-59, `camDefault` :62-68 (pass2 intro `top` .34, else `home` .30), `introWordmarkTop` :71-73. |
| 8 | Camera animation | `components/blastoff/capture/Webcam.tsx` | Ring transitions `left/top/width/height 480ms cubic-bezier(0.34,1.3,0.64,1)` :104-105, box-shadow/radius 480ms ease :111-112, zIndex 12/30 :103, `momentRect` :27-30. |
| | | `components/blastoff/capture/camera.ts` | Stage zoom/pan `transform 120ms ease-out` :266-271, dragging kills the transition; keys Alt/O/0 :175-217. |
| 9 | Camera emphasis | `components/blastoff/capture/Webcam.tsx` | ctrl/meta pointerdown → `onMoment` :76-78. |
| | | `components/blastoff/PhoneFrame.tsx` | `moment` state + stage blur :93-95, :132; `onMoment` only when `capture` :138. |
| | | `components/brand-cards/BoltZoom.tsx` | Brand-slide wordmark lives INSIDE the stage: `wordmarkBlock` :324-332, `GlowWordmark` :141-196, `WORDMARK_TOP/SIZE` :53-54. |
| | | `components/brand-cards/bolt-boil.tsx` | `SurviveWordmark` :120-144 (the card-slide watermark), `BoltBoil` :71-115. |
| 10 | Annotations / highlights | `components/canvas/text-highlights.tsx` | `SEL_EMPH_CSS` :69-71 (font-weight 900 + padding → reflow), `Emph` :123-134 (splits the text node), `readRangeIn`/`wordRangeAtPoint`. |
| | | `components/canvas/CeqPreviewer.tsx` | Gestures :810-811, :839-840 (choice `onClick` does NOT bail on ctrlKey), :856-866; `containSpot` :321-336 keeps `fontWeight 700` from `SpotlightContext.tsx:134`. |
| | | `components/canvas/FilmOverlays.tsx` | `FLAME_CSS` :200-269 (flame, bolt signature). |
| | | `components/canvas/spotlight.ts` | Pure reducers :119-136. |
| 11 | Whisper integration | `scripts/captions.ts` | CLI: ffmpeg → Whisper word timings :76-88 → `.words.json`/`.ass`/`.srt` → libass burn :153-156; `--cam home|none` :115-116 is the only camera awareness. |
| | | `lib/transcribe.functions.ts` | Studio server fn (same endpoint), idempotent by storage path :55-58; `TranscriptWord` :32 duplicates `Word`. |
| 12 | Caption timing | `lib/captions.ts` | `cardsFromWords` :39-60 (5 words / 1.2 s / 0.45 s gap), `splitLines` :63-74, `shortsStyle` :91-96 (left .31 with home cam, bottom .78, size .046h — pass-1 geometry), `assFromCards` :114-138 (`\k` per word). `captions.test.ts:41-42` pins the ASS style line. |
| 13 | Ad components | `components/blastoff/AdSlide.tsx` | `ADS` :25-47 (send :40-46), `AD_LABEL` :49, `adCopyOf` :54-64 (always `base.url`/`base.banner`), wordmark band :74-76 (centred), copy column :77-87, CTA :88-96. |
| | | `components/blastoff/ad-kinds.ts`, `ReviewDeck.tsx:58-67` QUICK chips, `lib/blastoff*.functions.ts:38/:59` retyped enums, `canvas/cards/BlastOffNodes.tsx:93-107`, `routes/branding.tsx:68-70`, `routes/send.tsx`. | |
| 14 | Asset persistence | `lib/canvas.functions.ts` | `uploadCanvasMedia` :518-547 (base64 ≤ ~6.5 MB → `canvas-media` bucket, path `canvas/<ts36>-<rand>.<ext>`, returns `{ url }` only). |
| | | `lib/ideas-inbound.functions.ts:41-58` | Fetch-remote-bytes-then-upload precedent (`ingest`) — the shape a Recraft result needs (their URLs expire in ~24 h). |
| | | `lib/publish.functions.ts:359-376`, `components/canvas/ceq-takes.ts:39-60` | Signed-upload path for big files. |
| | | `migration/supabase-migrations/0085_canvas_media_bucket.sql` | Public read, service-role writes. |
| 15 | API / server | `lib/api/example.functions.ts:6-22` | The `createServerFn({method:'POST'}).inputValidator(zod).handler` pattern; module scope ships to the client. |
| | | `integrations/supabase/client.server.ts:33-42` | `supabaseAdmin` proxy; import dynamically inside handlers. |
| | | `lib/suggest-visual.functions.ts:38-72`, `lib/mux.server.ts:1-46` | Env-read-in-handler + AbortController; `.server.ts` wrapper shape. |
| | | `lib/admin-session.functions.ts:120-170` | `assertAdmin()` — the only server-side gate; Blast Off fns are unauthenticated today. |
| 16 | Env conventions | `lib/config.server.ts:3-17`, `.env.example`, `.env` | `<SERVICE>_API_KEY` server-only, read inside handlers, never `VITE_`; `RECRAFT_API_KEY` absent from `.env` and Vercel. |
| 17 | Theme tokens | `components/blastoff/stage.tsx` | `V` :25, `BRAND_FONT`/`DISPLAY_FONT` :28-29 — the natural token home (on the TDZ graph, baselined at 2). |
| | | `components/brand-cards/bolt-boil.tsx:17-24` | `BRAND_CREAM #F5EFE6`, `BRAND_NAVY #111A32`, bolt colours. |
| | | `components/v3/Shell.tsx:24-30`, `BlastOffEditor.tsx:26-31`, `canvas/theme.ts:27-41` | Three parallel, unlinked chrome/card token sets; GOLD `#FCA311` is a literal in ≥10 files. `routes/__root.tsx:113` loads Rubik 500/600/700/900 — no 800. |

---

## 2. What will be modified, per polish item

### 2.1 Camera sizing (incl. the intro rectangular camera)

Today the intro defaults to `corner` (pass1) / `top` .34 (pass2) (`layout.ts:64-66`); `hero` — the only rectangular spot (`webcam-spots.ts:52-54`: cw = .62w, ch = 1.2·cw, top .11h, portrait radius .09·cw) — is reachable only per-slide or via B. Making the intro camera rectangular means defaulting pass2 intro to `hero`, and the size must be re-derived: at .62w the hero's bottom lands at .11h + 1.2·.62·(9/16)h ≈ **0.529h**, which is BELOW the pass2 wordmark block at `introWordmarkTop = 0.44h` (`layout.ts:72`). Two consistent options:

- `camDefault('pass2','intro') → { spot:'hero', size: 0.48 }` (bottom ≈ .434h, clears the wordmark by ~1 % h), or
- keep .62w and raise `introWordmarkTop('pass2')` to ≈ 0.56.

Modify:
- `layout.ts:62-68` `camDefault` (intro → hero + size) and possibly `:71-73`. `layout.test.ts:15-20` pins `camDefault('pass2','intro')` = `{top, .34}` and `:21-28` the wordmark ordering — update those assertions deliberately (never weaken; re-pin the new numbers, keep the "hero bottom < wordmark top" invariant as a new case).
- `webcam-spots.ts:52-54` if the hero ratio changes; `webcam-spots.test.ts:15-28` pins anchors.
- `PhoneFrame.tsx:89` — `frame.camSize` currently applies to whatever spot is current, so a saved home/free size leaks onto a B-override spot. Change to `frame.camSize ?? def.size` only when `cam === (frame.cam ?? def.spot)`; otherwise use the spot's own default.
- `PhoneFrame.tsx:97` — the `[data-ceq-card]` measurement is gated on `capture && cam !== 'off'`; the Review placeholder ring never avoids a tall card. Drop the `capture` half of the gate (measure whenever a camera or a rail is on). The ResizeObserver at :108-111 does not see CSS transforms, so `avoidCard` goes stale after wheel/O/Alt-move — re-run `measure()` from `useCaptureCamera`'s zoom/pull-back changes (pass a `measureKey` prop or observe `stageStyle.transform` in the effect deps at :113).
- Pass-2 home camera .30 (`layout.ts:67`) vs the caption rail (below): decide .30 vs .26 once — it fixes the rail's left edge.

### 2.2 Fixed caption rail

Captions are burned in post (`scripts/captions.ts`) from `shortsStyle` (`lib/captions.ts:91-96`), whose left .31 is pass-1 geometry: in pass2 the home camera's right edge is .35w, so today's captions overlap the camera by ~4 % w, and the text bottom (.78h) sits inside the CampusBanner band (.745-.791h, `BoltZoom.tsx:115`). Nothing renders captions in the phone.

Modify:
- `layout.ts` — add `CAPTION_RAIL = { top: 0.61, bottom: 0.735, left: 0.37, right: 0.84, wideLeft: 0.07, size: 0.036, lineHeight: 1.12, maxLines: 2, ink, spoken, stroke, strokeW }` and hoisted `function captionRailRect(w,h,wide)`, `captionLineChars(railWpx, fontPx)`, `captionRailClear(rail, card, cam, banner)` (reuse `overlaps` from `webcam-spots.ts:62-64`). Left .37 = pass2 home right edge .35 + a breath; if the home camera goes to .26 the rail can start at .33.
- `lib/captions.ts:91-96` — `shortsStyle` becomes an adapter over `CAPTION_RAIL` (relative import, `layout.ts:24-25` is type-only-safe for Bun); `cardsFromWords` gets `lineChars` from `captionLineChars` instead of the fixed 16 (`:32`); soften `spoken` (the full `#FCA311` fill is not "subtle" — ASS karaoke can only swap Secondary→Primary colour).
- `lib/captions.test.ts:41-42` — re-pin the `Style: Cram,Rubik,…` line and the `,2,MarginL,MarginR,MarginV,1` numbers; add a fit test.
- `scripts/captions.ts:115-116` — `--cam home|none` → `--wide`.
- `PhoneFrame.tsx` — mount `<CaptionRail mode='reserve'|'check'|'live'>` between the stage (:135) and `WebcamFrame` (:136): absolute, `pointerEvents:'none'`, hidden while `moment`, drawn as a dashed reservation when `safe` (:141-147), and in capture reporting `captionRailClear` to the chrome bar (`BlastOffCapture.tsx:165-180`: "captions: clear | on the card | under the camera").
- `docs/CAPTIONS.md:26`.
- Hard fact to surface: a pass-2 CEQ card with four choices reaches ≈ .65-.70h — into the rail. The rail must be enforced by shrinking the card (`cardPlacement` scaleMul / grips) plus the runtime readout, never by moving the rail.

### 2.3 Camera emphasis + wordmark hero

Bugs first: the "moment" is PhoneFrame-private (`:94-95`), so backtick (`BlastOffCapture.tsx:101`) cannot end it despite the comments at `Webcam.tsx:14` and `PhoneFrame.tsx:93`; B→off during a moment unmounts the ring but leaves the stage blurred (`:132` keys on `moment`, `:136` unmounts `WebcamFrame`).

Modify:
- `BlastOffCapture.tsx:111-113` — lift to `const [hero, setHero] = useState<null|'camera'|'wordmark'>(null)`; reset on `frameId` (:112), in `resetTake` (:101) and in the B→`off` branch (:130). Pass `hero`/`onHero` into `PhoneFrame` at :159 beside `camSpot`. One enum makes camera-moment and wordmark-hero mutually exclusive by construction.
- `PhoneFrame.tsx:93-95` — replace the local `moment` with the props; `:132` stage dim keyed on `hero !== null`; `:137-138` `moment={hero==='camera'}`.
- `PhoneFrame.tsx:124-128` — watermark wrapper: `pointerEvents: capture ? 'auto' : 'none'`, `onPointerDown` with the exact guard `Webcam.tsx:77` uses (`if (!(e.ctrlKey||e.metaKey)) return; e.preventDefault(); e.stopPropagation(); onHero('wordmark')`), `transform: translate(dx,dy) scale(k)` with `transition: transform 480ms cubic-bezier(0.34,1.3,0.64,1)` (camera parity), `zIndex: hero==='wordmark' ? 31 : undefined` (above moment 30, below arrows 40). Animate `transform`, not font-size — `SurviveWordmark`'s bolt is JS-sized (`bolt-boil.tsx:140`).
- `webcam-spots.ts` — add pure `wordmarkRect(w, h, hero): { left, top, scale }` + a test case (house pattern). Target per the brief: bottom-fifth centre — but y .8-1.0h is the platform caption/title zone (`PhoneFrame.tsx:144`, `SAFE.bottom .78`). Recommend the hero's bottom edge at .78h (same rule as the baked captions) — see open question 4.
- `BoltZoom.tsx:324-332` only if the intro/open GlowWordmark must hero too (it is inside the stage, zoomed and blurred by a moment); function declarations only there.
- `capture-arrows.test.ts:35,42` pin the Escape/Backquote lines in BlastOffCapture byte-for-byte — do not reformat them; `:173` help string gains the gesture.

### 2.4 Ad wordmark left-align

One line. `AdSlide.tsx:74`: `left: 0, right: 0, … justifyContent: "center"` → `left: pad, right: pad, … justifyContent: "flex-start"` (`pad` is computed at :71 and is the copy column's left at :77 and the CTA's at :88). `GlowWordmark`'s root (`BoltZoom.tsx:183`) is shrink-to-fit with no `second` line on ads, so the wrapper decides x. Applies to Review, Arrange, /film, the canvas `blastad` element and /branding at once (they all mount `AdSlide`). Optional: `marginLeft: -Math.round(size*0.02)` for Rubik's side bearing. Open/intro/summary use their own wrappers — the "wordmark never moves between slide one and two" invariant (`BoltZoom.tsx:51-53`) is untouched.

### 2.5 Live capture highlighting

The highlight is an in-flow span, not an overlay: `.sa-sel-emph { font-weight: 900; padding: 0 2px }` (`text-highlights.tsx:70`) rewraps choices (Inter 600→800, Rubik has no 800 loaded) and shifts lines; a stem highlight drops `renderInline`'s authored `==marks==` (`CeqPreviewer.tsx:816` vs `Emph :126`); the spotlight also reflows via `spotStyle.fontWeight 700` (`SpotlightContext.tsx:134`, kept by `containSpot :321-336`).

Modify:
- `text-highlights.tsx:69-71` — paint-only: drop `font-weight` and `padding`; keep background/colour/radius/`box-decoration-break`; fake the 2 px inset with `box-shadow: 0 0 0 2px rgba(252,163,17,0.92)`. Keep `.sa-sel-emph-spot` as a separate rule (canvas memo only, `CeqPreviewer.tsx:1049`).
- `CeqPreviewer.tsx:321-336` — `containSpot` overrides `fontWeight: 'inherit'` (leave `SpotlightContext.tsx:134` alone unless Lee wants the canvas changed too).
- `CeqPreviewer.tsx:840` — choice `onClick` bails on `altKey || inert` only; add `e.ctrlKey || e.metaKey` so a ctrl+click spotlight (pointerdown capture at :839) does not also select/resolve. Same fix on the card-root click at :723 already exists.
- Stretch (only if Lee wants authored marks to survive under a live highlight): CSS Custom Highlight API in a `useLayoutEffect` beside :669-676 (Chromium 105+; keep `Emph` as fallback) — otherwise not in this pass.
- Add a bun test pinning that `SEL_EMPH_CSS` contains no `font-weight|padding|font-size` (a reflow ratchet).
- `components/blastoff/CeqFrame.tsx` is dead (no importer) and injects its own `SEL_EMPH_CSS`; leave it or delete it in a separate commit.

### 2.6 Optional illustration slot

Type (plan.ts, after `prompter` at :89):

```ts
illustration?: FrameIllustration | null;   // absent = never asked; null = Lee cleared it
export interface FrameIllustration {
  requested: boolean; provider: string|null; stylePreset: string|null; styleVersion: number|null;
  prompt: string|null; teachingIntent: string|null; assetUrl: string|null; localAssetId: string|null;
  animationPreset: string|null; generatedAt: string|null; seed: number|null;
}
```

Modify:
- `plan.ts:34-90` (field), `:277` `duplicateFrame` deep-copies it like `prompter`.
- BOTH schemas: `illustration: illustrationSchema.nullable().optional()` — mandatory in the same change (see §4, strip hazard).
- `ReviewDeck.tsx:501-630` `SlideEditor` — a block after the camera block (:612-621): requested chip, `teachingIntent` textarea, style/animation chips, seed, "clear" (`onPatch({ illustration: null })`), a status line (⚡/✕/✓ per `Booth.tsx:854-857`) and the `[Generate]` button; `menuFor` (:280-307) gets `🖼 Illustration…` beside the camera item (:301); a `🖼` spine badge beside `🗒{n}` (:375) because the Editor face is hidden while the Teleprompter face is up (:100-103, :409-420). Seed `teachingIntent` from `insertStem(f)`+`frameBullets(f)` / the ceq stem / `BIO_CARD.title`.
- `PhoneFrame.tsx` — an `IllustrationLayer` as a sibling rendered AFTER `<FrameView/>` inside `[data-sa-stage]` (:129-135): the stage is `display:grid; placeItems:center` with no template, so a second child auto-places as a second row under the card (pass2-native), inherits the capture camera's transform, and is re-keyed per frame so the entrance replays. Union its rect into `measure()` (:100-105) so `avoidCard` keeps the ring off it. In pass1 the card lifts by half the picture's height on illustrated slides — acceptable, or position absolutely from `cardBox`.
- `layout.ts` — `illustrationPlacement(layout, kind)` beside `cardPlacement`: the band from the measured card bottom + .02h down to `CAPTION_RAIL.top - .01`, x `SAFE.left..SAFE.right`, collapsing to nothing when the card is tall (editor then shows "no room"). Alternative fixed slot = the home camera's rect on `cam:'off'` slides.
- `frame-view.tsx` — untouched (mounting in PhoneFrame keeps `camera.test.ts`'s `<SetCard` / `{...ov}` count pin intact).
- v1 scope: card kinds + `bolt`; hide the block for other `isFullFrame` kinds.
- Optional canvas parity (`blastoff-sync.functions.ts`): stage an `image` element (`types.ts:590-595`) with a NEW id `blast-il-<frameId>` (the `blast-el-` id is taken at :158), its own cleanup line at :370-377, and the branch must run before the ceq early-return at :245-260; add a size case to `exhibit-stage.test.ts`. Defer unless Lee films from the canvas.
- Tests: `plan.test.ts` (duplicate deep-copy; `{illustration:null}` clears), `learn-plan.test.ts` (cram output unchanged with an illustration present), `layout.test.ts` (slot inside SAFE / above the rail).

### 2.7 Recraft provider abstraction + secure server endpoint

No image call exists anywhere (`ai.server.ts` is `generateText` only; `AiTask` is two text lanes). Recraft is not an LLM, so the "one AI door" rule (`talkthrough.functions.ts:13`, `BUILD-NOTES.md:223`) does not literally apply, but a new paid provider needs Lee's explicit OK (open question 1).

New `lib/recraft.server.ts` (dynamic-import only; `mux.server.ts` shape): an `ImageProvider` interface `{ id: string; generate(req: IllustrationRequest): Promise<{ bytes: Uint8Array; contentType: string; providerAssetId: string|null; revisedPrompt: string|null }> }` and the Recraft implementation: `POST https://external.api.recraft.ai/v1/images/generations`, `Authorization: Bearer ${process.env.RECRAFT_API_KEY}` read per call, body `{ prompt, model: 'recraftv4_1', size: '1024x1024', n: 1, random_seed, controls: { background_color: { rgb:[0,0,0] }, colors: [{ rgb:[255,255,255] }] }, response_format: 'url' }`, `if (!res.ok) throw new Error(\`Recraft ${res.status}: ${text.slice(0,300)}\`)`, then fetch `data[0].url` immediately (URLs expire ~24 h) into bytes. Cost 35 units ($0.035) per image; rate limit 100/min, 5 req/s — irrelevant at Lee's volume. Optional `removeBackground` (10 units) only if an illustration must sit on the navy card rather than the black ground (`image_format: 'png'`).

New `lib/illustrate.functions.ts` — `generateIllustration = createServerFn({method:'POST'}).inputValidator(z.object({ setId: z.string().min(1).max(120), frameId: z.string().min(1).max(80), teachingIntent: z.string().trim().min(1).max(600), stylePreset: z.string().max(40), seed: z.number().int().min(0).max(4294967295).optional(), force: z.boolean().optional() }))`. Handler: `await assertAdmin()` (`admin-session.functions.ts`) — this costs money per call and the other Blast Off fns are unauthenticated; resolve the preset server-side from the registry (§2.9) so the client never sends a raw prompt; dedupe by `sha256(presetId|version|teachingIntent|seed)` (the `scrape-cache.ts` shape, Web Crypto not node:crypto) unless `force`; 60 s `AbortController`; upload (§2.8); return `{ url, path, prompt, provider:'recraft', model, seed, generatedAt, styleVersion }`. Never return bytes across the RPC (Vercel body limit, `publish.functions.ts:362-363`). Missing key → `throw new Error("RECRAFT_API_KEY is not configured on the server — set it in .env (local) and Vercel env")`. No `api.*.tsx` route (no external caller; avoids the site-qa manifest).

Env: `RECRAFT_API_KEY` (server-only, no `VITE_`), optional `RECRAFT_MODEL`, `RECRAFT_STYLE_ID_DREAMSTATE`; add a commented block to `.env.example`; add to this worktree's `.env` and to Vercel, then redeploy.

### 2.8 Asset persistence

- Bucket: `canvas-media` (public read, service-role write, 5 GiB cap) — no migration. Folder `illustrations/<setId>/<frameId>-<ts36>.<ext>`, `upsert:false` (every generation kept; a re-roll never overwrites; history stays revertable). `contentType` from Recraft's response header; `cacheControl: '31536000'`; bucket-missing hint naming 0085 as at `canvas.functions.ts:522-523,541`.
- `lib/canvas.functions.ts:531-548` `uploadCanvasMedia` — return `{ url, path }` so `path` can be stored as `localAssetId` (today only `url`, :547). `ImageCardNode.tsx:30-35` ignores the extra key.
- The plan stores the URL + path only, never base64 (the plan rides in `nodes_json` and is rewritten on every debounced save; 400 frames × 2000-char prompt ≈ 0.8 MB already).
- Public-read is world-readable by URL — fine for slide art; a private bucket + `createSignedUrl` (`inbound-files.functions.ts:63-71`) would need a migration under `docs/SESSION-CONTEXT.md:49-73` rules and a signed-URL read path in PhoneFrame. Not recommended.
- Pre-existing race to note: the canvas loads deck objects verbatim (`set-files.core.ts:163`) and writes `decks: [deck]` back on save (`:101` → `set-files.functions.ts:107-110`), so a canvas save after a /v3 edit clobbers `blastOff` with its stale copy. Not illustration-specific; log it.

### 2.9 Survive Dreamstate preset with versioning

New plan-free module `components/blastoff/illustration.ts` (function declarations only; `ad-kinds.ts` pattern):

```ts
export const ILLUSTRATION_STYLES = {
  "survive-dreamstate": {
    id: "survive-dreamstate", version: 1, label: "Survive Dreamstate",
    provider: "recraft", model: "recraftv4_1", size: "1024x1024",
    promptPrefix: "Hand-drawn white ink line illustration, monoline, slightly irregular hand-drawn outline, centered, isolated on a solid black background, generous empty space around the subject: ",
    promptSuffix: ". No shading, no gradients, no text, no background objects, one subject only.",
    controls: { background_color: { rgb: [0,0,0] }, colors: [{ rgb: [255,255,255] }] },
    styleIdEnv: "RECRAFT_STYLE_ID_DREAMSTATE",   // once Lee approves one image → POST /v1/styles → recraftv4_styles + style_match:'precise'
  },
} as const;
export function illustrationStyle(id: string | null) { … }   // null → the house default
export function isStaleIllustration(i: FrameIllustration | null | undefined): boolean { … }  // styleVersion < registry version
```

The prompt follows the Recraft note's structure (subject first, medium + line behaviour, in-prompt negatives, `background_color` reinforcement, no adjective stacking; V4.1 has no `negative_prompt`). Versioning: bump `version` whenever prefix/suffix/controls/model/style_id change; `frame.illustration.styleVersion` is stamped at generation and compared by `isStaleIllustration` → a "stale · regenerate" chip in the editor. Locking the look for a series: after Lee approves one image, `POST /v1/styles` (5 units) with it, put the returned id in `RECRAFT_STYLE_ID_DREAMSTATE`, switch the preset to `recraftv4_styles` + `style_match:'precise'` and bump `version` to 2. `seed` (`random_seed`, uint32) gives reproducibility per frame.

### 2.10 Survive Boil for raster

The brand boil is a pre-baked 4-frame vector flipbook swapped by a discrete CSS opacity animation with a `boilFrame` pin (`bolt-boil.tsx:44-55, 63-69, 82-84, 93-95`); no raster boil exists. Recommended: a seeded, pre-baked N-state (default 4) transform flipbook of stacked `<img>` copies — the same contract on bitmaps.

New `components/brand-cards/raster-boil.ts` (pure): `rasterBoilStates({ states, seed, intensity, translationAmount, rotationAmount, dpr })` → `{tx,ty,rot}[]` using mulberry32 copied from `survive-bolt.ts:66-74`; state 0 = identity (the raster analogue of pinning tip/base); tx/ty snapped to integer DEVICE pixels (`round(tx*dpr)/dpr`, `capture-quality.test.ts:100-104`); defaults N=4, intensity 1, translation 1.5 px, rotation 0.6°. New `RasterBoil.tsx` mirroring `BoltBoil` props (`src, width, height, boilFrame?, boilSeconds?, seed?, intensity?, states?, anchor?, live?`): undefined `boilFrame` = CSS flipbook with per-layer negative delay `-(boilSeconds/N)*k`; a number = one `<img>`, no class; OWN class `.sa-rboil-f` (`.sa-boil-f` is global — `BoltBadge.tsx:19-22`); `live=false` → `animation-play-state: paused`; reduced-motion → first child. Fallback mode: N=2, rotation 0, 1 px, 1.2 s. The feTurbulence/feDisplacement "ink" mode (`HomeFold.tsx:112-124` precedent) is deferred: SMIL is wall-clock (unpinnable) and a displacement pass re-rasterises the full layer per paint.

Used by the `IllustrationLayer` (§2.6) via `animationPreset: 'boil' | 'boil-calm' | 'none'`; shares `boilSeconds` (0.5 / 1.2) with the bolt so both boil on one clock. Never nest under `GlowWordmark`'s drop-shadow wrapper (`BoltZoom.tsx:183`). Lab: a tile on `routes/branding.tsx:49-74` with sliders (no new route → no manifest entry).

### 2.11 Talkthrough illustration-directive extraction

"Illustration idea: a vault with two doors" parses today as an unstamped block (no cue; `talkthrough-import.ts:41-60`) and never becomes metadata.

- `talkthrough-import.ts:41-60` — add `[/illustration(?:\s+ideas?)?/i, 'illustration']` FIRST (longer cues first, comment :39-40); `isCue` :75-79 already handles sentence start / colon; `buildImportRows:204` sets `note` = the block text for this stamp (makeTag's null today).
- `talkthrough-import.test.ts:21-32` — the all-cues enumeration must gain it; add a sentence-start/colon case.
- `talkthrough.ts` — new `StampKind2` `'illustration'` (:196-200), `STAMP_KINDS` (:212-221; `fromTagRow:627` whitelists against it), `STAMP_LABELS` (:235-242), optional bank-group button (:230); `styleKindForKind` → the `exhibit` bucket. DB column `tag` is `z.string().max(20)` — no migration. This is a TAG kind, not a fourth CARD kind, so `REVIEW_RULES:329` ("do not create extra ones") is not contradicted.
- `talkthrough-review.ts:454` — short-circuit at the top of the idea branch: if `task.stampKind === 'illustration'`, `putBoardItem(mkItem({ kind:'idea', title: task.spoken.slice(0,60), payload:{ kind:'visual', brief: task.spoken, origin:'lee', stamp:'illustration' }, quote: task.spoken, ceqIds }))` and return — NO model call (Transcript Law; zero cost). `buildGenerationQueue:545-548` will include it only if `'illustration'` is added to `IDEA_TASK_KINDS`/`IDEA_KINDS:391` (no `IDEA_SPEC` change needed since no prompt is sent).
- `ReviewBoard.tsx:416-432` — render the `brief` chip beside `visualKind`.
- `routes/v3.$topic.$set.blast-off.results.tsx:56-60` `addSlide` — for `payload.stamp === 'illustration'`: patch the anchored ceq frame (`task.ceqId`) with `illustration: { requested:true, teachingIntent: brief, … }` instead of inserting a frame; without a ceq anchor, insert a `blank` frame carrying it. `prompter.ts:54-59` maps `'illustration' → 'blank'` for the fallback.
- `Booth.tsx:900-901` ImportPanel help; `docs/V3-PRODUCTION-HANDOFF.md:460-480` convention table.
- Optional one line in `REVIEW_RULES:325-342`: "Illustration idea: segments are picture briefs; carry them verbatim into beat notes, never expand" — must keep the strings pinned by `talkthrough-queue.test.ts:107-116` and `talkthrough-v2.test.ts:72-85`.

### 2.12 Syllabus ad rewrite

`AdSlide.tsx:40-46` — `ADS.send` label/headline/lines/url/banner; Lee's words verbatim, no invented numbers. Keep `routes/send.tsx:78-79` in step (today the second line differs slightly: "are built from what your professor tests" vs "get built from what your professor actually tests"). `docs/V3-PRODUCTION-HANDOFF.md:587/604` are stale — update. Nothing else changes; the QUICK chip label (`ReviewDeck.tsx:66`) and `AD_LABEL.send` (:49) only if the wording moves.

### 2.13 Behind-the-scenes ad

- `ad-kinds.ts:4` — append `'building'` (or `'bts'`); `AdKind` widens; `ADS` (`AdSlide.tsx:25`) and `AD_LABEL` (:49) are `Record<AdKind,…>` so TypeScript forces the entries. `banner` is per kind (`adCopyOf:62`).
- `lib/blastoff.functions.ts:38` and `lib/blastoff-sync.functions.ts:59` — the ad enum is RETYPED `z.enum(["greek","rep","send"])`; without this a plan carrying the new kind fails to save/load loudly. Switch both to `z.enum(AD_KINDS)` (`AD_KINDS` is a `readonly` tuple; `plan.ts:20-22` already does this for kinds).
- `ReviewDeck.tsx:58-67` — a QUICK chip; the ⋯/Editor chips (:305, :591) iterate `AD_KINDS` automatically, as do `BlastOffNodes.tsx:102` and `branding.tsx:69`.
- CTA: `adCopyOf:61` always falls back to `base.url`, so the template cannot render an ad without a "go to" block. There is NO destination route for a build story (see §7). Either (a) a guard: `url: ''` in `ADS.building` and `{a.url && <CTA/>}` around `AdSlide.tsx:88-96`, or (b) a new public route + `lib/site-qa/manifest.ts` entry (pattern :147-157). The footer `FounderModal` (`SiteFooter.tsx:181-268`, "How I built this", no URL, copy says "Soon I'll share…") is the only build-story asset to lift.
- `usage-elements.ts:78-84` — pre-existing gap: `blastad` is missing from `NODE_KINDS` and "Blast Off ad" from `ADD_MENU_LABELS`; add both while here (not red today).
- Copy: no counts (campuses, students, days) Lee has not set.

### 2.14 Camera-movement audit (findings → fixes)

| Movement | Where | Finding | Fix |
|---|---|---|---|
| Spot change / B cycle / moment | `Webcam.tsx:104-105` 480 ms overshoot on left/top/width/height | Correct; the choreography curve to reuse for the hero. | Keep. |
| `avoidCard` shrink | same transition | Also overshoots when the ring shrinks — reads as a bounce on every slide entrance. | Use `transition: none` for shrink-only changes (compare prev/next rect in the effect) or a plain `ease` for size-only deltas. |
| Free-spot drag on Review | same transition | Ring lags and overshoots the pointer. | Mirror `camera.ts`'s `dragging` flag: `transition: 'none'` while `editable && dragging`. |
| Stage zoom / O / Alt-move | `camera.ts:266-271` 120 ms ease-out | `cardBox` goes stale — RO does not fire on transforms; the ring can sit on the enlarged card. | Re-measure on transform change (§2.1). |
| Moment blur | `PhoneFrame.tsx:132` 480 ms | Ends only on `frame.id`; ` and B→off cannot end it. | Lift state (§2.3). |
| `camSize` leak | `PhoneFrame.tsx:89` | Saved home/free size applied to corner/hero/top after B. | §2.1. |
| Ctrl+click on a choice | `CeqPreviewer.tsx:839-840` | Spotlight AND select fire together. | §2.5. |
| Card entrance | `PV_CSS sa-ceq-in :256` | Fine; `film-v2.test.ts:21` requires the block between `sa-ceq-v2-fade` and `BOSS MOMENT` to stay movement-free — add nothing there. | — |
| Docs | `docs/V3-PRODUCTION-HANDOFF.md:639` | Stale: nametag under the home circle (removed, `Webcam.tsx:19`); B cycle omits `top`. | Correct. |

### 2.15 Slide layout consistency audit (findings → fixes)

| Finding | Where | Fix |
|---|---|---|
| `ExhibitDetour` is a hand-copied shell that diverges from the real detour (label in-box 10.5·s vs `KindChip` above 16·s; heading 24·s/lh 1.25 no `DISPLAY_FONT` vs League Spartan 31·s/lh 1.1; padding 18/20/20 vs 16; radius 14·s vs 13·s; auto-`==highlight==` although `plan.ts:297-304` removed auto-highlight everywhere else; no typewriter). | `frame-view.tsx:145-163` | Render exhibit through `SetCard` with a new `CalloutKind 'exhibit'` (`canvas/types.ts:1681`, `CalloutCard.tsx:23-38` meta + `detourAccent:96-102`) and delete `ExhibitDetour`. |
| Two unscaled values in a ×s system: navy pad radius 12 px (`SetCard.tsx:116`, nearly double the card's 14·s≈6.7 at Review) and detour border 1.5 px (`CeqPreviewer.tsx:754`). | | `12*s`-ish (`Math.max(8, 12*s)`), `1.5*s` clamped ≥1. |
| Question card fonts inherit the page (Inter) — stem :814 / choices :855 set no `fontFamily`; detours pin Rubik/League Spartan. | `PhoneFrame.tsx:120` | Set `fontFamily: BRAND_FONT` on the phone root (phone-only; the canvas card is untouched). |
| Rubik 800 used on slides (`BoltZoom.tsx:119,287,344,353`, `AdSlide.tsx:89`, `frame-view.tsx:154`) but `__root.tsx:113` loads 500/600/700/900 → synthesized weight; the baked captions use true Rubik Black. | | Add `800` to the Google Fonts request (cheapest) or normalise to 700/900. |
| Pass-2 CEQ card (470·0.595 + pads ≈ 306 px at w=306) overflows `SAFE.right` (.84w = 257) by ~36 px; pass1 by ~30 px — contradicts `layout.ts:22-23`. `layout.test.ts:13` pins "same width as before". | `layout.ts:56` | Confirm with Lee (open question); if a bug, `cardW 440 / scaleMul 1.24` keeps type size and lands inside the column — re-pin the test. |
| Q counter: Review over `filmFrames` (`ReviewDeck.tsx:196`), Arrange over ALL frames (`BlastOffEditor.tsx:97-100`, skipped included); duplicates count twice. | | Use `filmFrames` in Arrange; count unique `ceqId`. |
| Bio sizing in two places (phone `scale·1.15`, `cardW` from placement; canvas `cardW 640` `bio-card.ts:20`). | | Document or unify to `BIO_CARD.cardW` on the phone. |
| `SlidePane` non-phone fallback (`ReviewDeck.tsx:483-485`) ignores `layout`/`cardOverride` → always pass1. | | Pass both or remove the fallback. |
| Paper vs dark callouts disagree on label placement (in-box :144 vs `KindChip` :233) and the gold corner triangle (:142) competes with an orange/sky chip on non-gold detours. | `CalloutCard.tsx` | Colour the corner with `detourAccent` on dark cards. |
| Token drift: cream `#F5EFE6` vs `#F4EFE6` (`BlastOffEditor.tsx:27`, `BankPicker.tsx`), edge `rgba(245,…)` vs `rgba(244,…)`, five navies, GOLD literal in ≥10 files, `FONT`/`HEAD_FONT` re-declared in `BoltZoom.tsx:42-43` and `AdSlide.tsx:21-22`. | | Add plain-const tokens to `stage.tsx` (GOLD, CREAM, INK_MUTED, EDGE, CARD_NAVY, GROUND) — string consts do not trip the TDZ regex; swap the literals in `frame-view.tsx:28`, `AdSlide.tsx:21-23`, `BoltZoom.tsx:42-49`, `CalloutCard.tsx:85-102`, `Webcam.tsx:24`, `PhoneFrame.tsx:120`. Chrome sets (Shell/BlastOffEditor) stay separate unless Lee says otherwise. |
| `layoutOf` honours localStorage `sa-layout-qa` on every surface (`layout.ts:35-38`) — a QA override left on the filming PC films the wrong pass. | | Show the override in the /film chrome bar; or ignore it in capture. |

---

## 3. New files that are genuinely necessary

| File | Why it cannot be an edit |
|---|---|
| `lib/blastoff-frame-schema.ts` (+ `.test.ts`) | One `frameSchema`/`illustrationSchema` imported by both `blastoff.functions.ts` and `blastoff-sync.functions.ts`, with `kind` from `BLAST_FRAME_KINDS` and `ad` from `AD_KINDS`. Closes the hand-copy drift that broke every set once (`docs/V3-PRODUCTION-HANDOFF.md:428-456`) and that still exists for fields. The test round-trips a fully-populated `BlastFrame` literal through the schema and asserts deep-equality (guards Zod-3 strip). Keep zod out of `plan.ts` (client-shipped, "no React, no network"). Note the name collision: `suggest-visual.functions.ts:29-36` also exports a `frameSchema` (canvas frame context). |
| `components/blastoff/illustration.ts` | `FrameIllustration`, `ILLUSTRATION_STYLES` (Dreamstate + version), `illustrationStyle`, `isStaleIllustration`, animation preset ids. Plan-free, function declarations only (`ad-kinds.ts:1-3` pattern) so the server fn, the editor, PhoneFrame and any future canvas element can import it without dragging `plan.ts` onto the TDZ graph. |
| `lib/recraft.server.ts` | Provider interface + Recraft impl; `.server.ts` so the key/fetch never ship to the client; dynamically imported by the server fn. |
| `lib/illustrate.functions.ts` | The `createServerFn` endpoint (§2.7). Could be appended to `blastoff.functions.ts`, but that file is the plan store and ships its module scope to the client; a separate file keeps the admin gate + provider wiring isolated. |
| `components/blastoff/capture/caption-rail.tsx` (+ `.test.ts`) | The rail layer (reserve/check/live). Test pins: sibling of the stage, hidden during a moment, no `data-sa-el`, no module-scope arrows, current-word rule = `captions.ts:130`. |
| `components/blastoff/IllustrationLayer.tsx` | The stage-sibling `<img>`/`RasterBoil` mount + placement; separate from PhoneFrame so PhoneFrame's pinned strings (`cardOverride={cardOverride}`, `camera.test.ts`) stay untouched and the file stays readable. |
| `components/brand-cards/raster-boil.ts` (+ `.test.ts`), `components/brand-cards/RasterBoil.tsx` | The raster flipbook (§2.10). `brand-cards/*` is on the TDZ graph via `CeqPreviewer.tsx:45` → function declarations only. |

Not new: caption geometry (→ `layout.ts`), wordmark hero geometry (→ `webcam-spots.ts`), tokens (→ `stage.tsx`), the illustration editor block (→ `ReviewDeck.tsx`; split into `IllustrationCard.tsx` only if ReviewDeck's 948 lines become a problem), a BTS route (only if Lee wants a real "go to" — §7). No SQL.

---

## 4. Implementation concerns and risks

**Ratchet tests that must stay green (and what each pins)**
- `canvas/tdz-graph.test.ts:183-201` — no NEW module-scope `const f = () =>` / `= function` / `= async (` in any file reachable from `CeqPreviewer.tsx`/`CeqStudio.tsx`. Reachable Shorts files: `brand-cards/*` (bolt-boil, BoltZoom, bolt-zoom, Editable), `blastoff/stage.tsx` (baselined 2), `found-on-exam.ts` (2), `AdSlide.tsx`, `ad-kinds.ts`, `ContentFrames.tsx`, `FoundOnYourExam.tsx`, `SurviveBio.tsx`, `SurviveOutro.tsx`, `canvas/text-highlights.tsx`, `canvas/cards/*`. NOT reachable today: `PhoneFrame`, `frame-view`, `layout.ts`, `SetCard`, `plan.ts`, `Webcam`, `webcam-spots`, `captions.ts`, `ReviewDeck`. Every new brand-cards/illustration/raster-boil module and every token module must be function declarations + plain consts (string/object consts do not match the regex at :74). Never import `plan.ts` from anything on the graph — that is why `ad-kinds.ts` and the new `illustration.ts` are plan-free.
- `canvas/filming-mode.test.ts` — pins CeqStudio strings; untouched by this pass unless the canvas film surface is changed.
- `lib/usage-manifest.test.ts:30-34` — any literal `data-sa-el` in src must be in `usage-elements.ts`; the rail, illustration layer and hero add none. A new canvas element kind needs a `NODE_KINDS` line.
- `lib/site-qa/manifest.coverage.test.ts` — a new route (BTS page, a lab) must be registered; a server fn needs nothing.
- `capture/camera.test.ts:78-93,104-116` — SetCard keeps `data-sa-card-scale={scale}`, `const s = scale * (scaleMul ?? 1);`, `scale: s,`; frame-view's `<SetCard` count equals its `{...ov}` count (mount the illustration in PhoneFrame, not frame-view); PhoneFrame keeps `cardOverride={cardOverride}`; camera.ts's keydown must not contain other handlers' key strings; camera.ts is function-declarations only.
- Also: `capture-arrows.test.ts:35,42,57-63` (exact Escape/Backquote lines, no data-sa-el, no arrows); `webcam-spots.test.ts` (anchors, B order); `layout.test.ts` (placement, camDefault, SAFE); `captions.test.ts:41-42` (ASS style line); `plan.test.ts:28` (kinds count — a new KIND must join INSERT/STANDARD; a new FIELD does not), `:278-296` (duplicate/patch); `learn-plan.test.ts:80-84` (4-field cram projection); `film-v2.test.ts:21`; `film-lock.test.ts:73-82`; `prompter-sync.test.ts:17-20` (sa-film-active shape — additive keys only); `talkthrough-import.test.ts:21-32`; `talkthrough-queue.test.ts:107-116,162-186`; `import-cycles.test.ts` (a job store must import neither the dock nor ReviewDeck). Never delete or weaken a test to go green; re-pin numbers deliberately.

**Zod strip (silent, not a crash).** Both frame schemas are plain `z.object` on zod ^3.24 → any key not listed is dropped on save (`saveBlastPlan:72`), on load (`loadBlastPlan:60`) and on Send to film (:190) with no error. The type and both schemas land in the same commit — or, better, the shared schema file lands first. Also the inverse hazard: a too-tight bound (e.g. `assetUrl.max(300)` shorter than a Supabase public URL) flips `loadBlastPlan` to null → the client regenerates a fresh spine → the next debounced save overwrites Lee's running order. Validate generously (`url().max(600)`), and validate on write.

**TDZ rule beyond the test.** `use-bank.ts:12-14` and `ad-kinds.ts:1-3` state the house rule: hoisted `function`s (+ `var`) in anything the canvas might reach. Apply to `illustration.ts`, `raster-boil.ts`, `RasterBoil.tsx`, `recraft.server.ts`, `caption-rail.tsx`.

**Capture determinism.** Everything on a slide must render the same pixels for the same `progress`/`boilFrame` (`stage.tsx:10-13`, `docs/BRAND-ANIMATION.md:103-108`): the raster boil is a pinned flipbook, no SMIL, no wall-clock JS ticker on the phone; the illustration `<img>` must be decoded before the slide shows (`img.decode()` in the layer, `loading='eager'`) so a take never films a half-loaded picture; state 0 of the boil = the untouched art so `live=false`/reduced-motion/pinned all show the rest pose. Snap translations to device pixels (`capture-window.ts:1-5`; 125 %/150 % scaling tables in `capture-quality.test.ts:11-16`).

**No API calls during capture.** /film reads the plan through `usePlan` (`BlastOffCapture.tsx:48`) and renders whatever `assetUrl` is already on the frame; `generateIllustration` is called only from `SlideEditor` on Review; `IllustrationLayer` takes a URL and never imports the server fn; the caption rail on /film is geometry only (no Whisper, no audio — `Webcam.tsx:63 audio:false`). Whisper stays post-only. `runMicro` (Prompter proofread) is also Review-only.

**Key handling — ctrl+click never advances slides.** `setI` is written only by Space/Shift+Space in `BlastOffCapture.tsx:119-123`; nothing on the /film mount advances on pointer events (camera.ts Alt/O/0 ignore ctrl/meta; arrows.tsx Esc/`/Delete/Backspace/F1; popout F). Keep it that way: every new gesture (hero, rail toggle) is a `pointerdown` handler with the `Webcam.tsx:77` guard (`ctrlKey||metaKey` → `preventDefault`+`stopPropagation`; otherwise return), never a `click`; any new key must not be Space and must be added to the help string at :173; the ReviewDeck Space handler (:240-253) already ignores ctrl/meta/alt. Fix the double-fire at `CeqPreviewer.tsx:840` (ctrl+click both spotlights and selects). On Windows, a lone Alt is pre-empted by `camera.ts:178-185` — never bind a hero to Alt.

**Z-order.** Proposed: content < illustration < camera < captions < branding. Recommendation, with the reason for each swap:
`content (stage, z auto) < illustration (inside the stage, second grid row, z auto — zooms and blurs with the card) < caption rail (z 10) < camera (z 12; moment z 30) < branding hero wordmark (z 31) < CaptureArrows (z 40) < BrandCursor`.
- Rail BELOW camera, not above: the in-app rail is a geometric reserve that is designed clear of every default camera and hides during a moment; the REAL captions are burned in post and are always topmost in the delivered video regardless of DOM order. Drawing a preview rail over the ring would hide the very overlap the `captionRailClear` readout is meant to catch.
- Branding last: the resting watermark never overlaps anything (top-left, z auto is fine), but the hero wordmark must paint over a camera moment (z 30) and under the arrows (40), so branding goes above camera when it is the hero. If Lee wants the ring to sink during a wordmark hero, keep it at 12 — it already paints under 31.
- Illustration inside the stage rather than a phone-level sibling: it inherits the camera transform (OBS records it zooming with the card) and is re-keyed per frame; the cost is that it is blurred during a moment, which is what the moment intends.

**Other risks**
- The Blast Off server fns run unauthenticated (`canvas.functions.ts:1-3`); a paid endpoint must `assertAdmin()`; AdminGate only gates the UI.
- Serverless time: no `maxDuration` config exists; Recraft generation is seconds, but keep the 60 s abort and never poll from /film.
- Students: `/learn` reads the plan (`learn-plan.ts:30` passes whole frames in memory); the projections are fixed-field so nothing leaks today — keep `learn-plan.test.ts:80-84` green and do not "serve the frame".
- The two-store Whisper problem (words.json vs `take_transcripts`, CLI trims words, server does not) is untouched by this pass; note it.
- `.env.example` is stale; each worktree carries its own `.env`; the key must reach this worktree AND Vercel.
- Repo is CRLF (`core.autocrlf=true`); bun, not npm; `bunx tsc --noEmit` already fails on `partner-kit.server.ts:319` unrelated to this work.
- CLAUDE.md: never merge to main from here; scene serialization is additive-only (the plan field is additive jsonb — allowed); no migrations needed.

---

## 5. Dependency-checked implementation order

The A–K labels were not included in the brief I received; I take A–K to be the first eleven items in the order listed (A camera sizing, B caption rail, C emphasis+hero, D ad align, E highlighting, F illustration slot, G Recraft, H persistence, I Dreamstate, J raster boil, K directive extraction), with the syllabus rewrite, BTS ad and the two audits after.

| Step | Item | Depends on | Why here |
|---|---|---|---|
| 0 | Old-bolt fix (§6) | — | Operational, five minutes, unblocks trustworthy QA on :8091. |
| 1 | Quick wins with no schema: D ad left-align, syllabus rewrite (once Lee gives words), E highlighting (paint-only CSS + ctrl bail), Rubik 800, tokens in `stage.tsx` | — | Zero coupling; ship while Lee answers the open questions. One STANDARD commit. |
| 2 | Shared frame schema (`blastoff-frame-schema.ts` + round-trip test), `z.enum(AD_KINDS)` | — | Every later frame field (illustration) and ad kind (BTS) depends on it; do it before any of them so a field can never be lost to strip. |
| 3 | Layout consistency audit fixes (§2.15) + camera-movement fixes (§2.14) + A camera sizing (camSize leak, measurement gate, re-measure on transform, intro hero) + lifting `moment`→`hero` | 2 for nothing; layout.test re-pins | The rail (4) and slot (6) are computed from the measured card and the chosen pass-2 home size — those numbers must be final first. Lifting the moment state is the prerequisite for C. |
| 4 | B caption rail (layout tokens → captions.ts adapter → CaptionRail → chrome readout → CLI flag) | 3 (home camera size decides `left`) | Rail geometry is the upper bound of the illustration band. |
| 5 | C wordmark hero (geometry in webcam-spots + PhoneFrame wrapper) | 3 (hero enum) | Independent of 4/6; placed here because it touches the same PhoneFrame lines as 4 and should land before the illustration layer edits the same file again. |
| 6 | F illustration slot: field + both schemas (via 2), `illustration.ts` registry incl. I Dreamstate preset (data only), editor block, `IllustrationLayer`, `illustrationPlacement`, `avoidCard` union | 2, 3, 4 | The slot's band = card bottom … rail top. The preset registry ships here (pure data) so the editor can show style chips before any provider exists. |
| 7 | H persistence (`uploadCanvasMedia` returns `{url,path}`, folder convention) | 6 (field to write into) | Tiny; must precede 8 because the endpoint uploads. |
| 8 | G Recraft provider + endpoint (+ env, `assertAdmin`, dedupe) | 6, 7, I | Wired to the `[Generate]` button; Lee's provider OK required. |
| 9 | J raster boil (`raster-boil.ts`, `RasterBoil.tsx`, branding tile) | 6 (layer to mount in) | Pure + component; can be built in parallel with 8 but is useless without an asset to boil. |
| 10 | K talkthrough directive extraction | 6 (writes `illustration.teachingIntent`) | Independent of 8/9 — it produces briefs, not images. |
| 11 | BTS ad | 2 (`z.enum(AD_KINDS)`), Lee's CTA answer | Blocked on §7 Q1. |
| 12 | Docs: `V3-PRODUCTION-HANDOFF.md` update block, `CAPTIONS.md`, `FILM-INTERACTIVITY-AUDIT.md` §2 staleness note, `.env.example` | everything | — |

Reordering vs A–K: (i) the schema consolidation is inserted before A–C because A's `camSize` fix and C's per-slide option would otherwise touch two hand-copied schemas; (ii) H and I move BEFORE G (the endpoint uploads and reads the preset; building G first means stubbing both); (iii) D and E jump to the front (no dependencies, fast); (iv) the two audits are not last — their card-geometry fixes gate B and F; (v) J and K sit after F as before. Risk tier: 2, 6, 7, 8 are RISKY (serialization/data) → commit per item, suite after each; the rest STANDARD.

---

## 6. The /v3 results old-bolt finding — exact fix

**Finding.** No code path in this checkout can draw the old tip: `grep "76\.02"` over src/, public/, scripts/, .tanstack/ is empty; commit 3be23310 ("brand: the redrawn bolt tip") replaced `M76.02 3.9` in `canvas/brand.tsx:56`, `brand-cards/bolt-boil.tsx:38-39`, the three public SVGs, `scripts/og-cards.mjs:34` and `api.og.$school.$chapter.tsx`, and is the tip of origin/main. /results and /arrange render the identical chain (`ReviewDeck.tsx:481` / `BlastOffEditor.tsx:238` → `PhoneFrame.tsx:126,134` → `frame-view.tsx:74/76/91/96/97` → `BoltZoom`/`SurviveOutro`/`AdSlide` → `BoltBoil` reading `DEFAULT_BOLT_SPEC` — no `BoltContext.Provider` on any v3 route; the only Providers are `routes/intro-outro.tsx:88` and `routes/survive-bolt.tsx:97/145`). A live probe of the :8097 tab returned every `BoltBoil <path d>` starting `M85.46 8.38`.

The old geometry comes from the OTHER dev server: PID 7228 on **:8091** serves `C:/Users/lee/Documents/sa-growth-dashboard`, whose local `main` is at b42066a1 (2026-08-31), 203 commits behind origin/main, still `BOLT_OUTER = "M76.02 3.9"` — and it has no /v3 routes at all (the "results"-shaped page it can serve is the old `routes/blast-off.tsx`). Every other sa-* worktree is equally stale. Production already serves the new tip.

**Exact fix (operational).**
1. In `C:/Users/lee/Documents/sa-growth-dashboard`: `git merge --ff-only origin/main` (0 ahead / 203 behind → clean ff; per memory, main is pushed via `tmp:main` or by the session holding main — this is a local ff, no push), then restart `growth-dashboard-dev` (:8091, serverId 4b7ebd11-a28f-45f8-a2b6-9abb2ff13308). Or stop :8091 and review /v3 only on :8097 (`film-camera-dev`, serverId e7b8bbe8-2d7a-4fed-9d24-9ed950984cd1).
2. Hard-reload (Ctrl+Shift+R) any /v3 tab opened before 7:50 PM 09-04 (the previous :8097 instance was stopped 4:10 PM and restarted 7:50 PM; brand.tsx was rewritten 7:57 PM).

**Hardening (code, this pass).**
- `brand-cards/bolt-boil.tsx:35-39,59` — stop hand-copying: `import { BOLT_OUTER, BOLT_RIGHT, BOLT_VIEWBOX, BOLT_RATIO } from "@/components/canvas/brand"` (brand.tsx imports only react; no cycle) and derive `FINAL_OUTER`/`FINAL_SEAM` with a module-scope `function pathToPoints(d: string): [number, number][]` (a `function` declaration — bolt-boil.tsx is on the TDZ graph via `CeqPreviewer.tsx:44`).
- `canvas/brand.test.ts` (next to `tip()` at :62) — assert `DEFAULT_BOLT_SPEC.frames[0].outer.startsWith(BOLT_OUTER.slice(0, BOLT_OUTER.indexOf(" L")))` so the boil's pinned tip must equal brand.tsx's.
- Stale rasters in this checkout: `public/og-card.png` and the 184 `public/og/campus/*.png` (09-02 20:11, old bolt) → regenerate per `scripts/og-cards.mjs:10-16`; `public/brand-logo.png` (09-01) is referenced only by `public/ideas.webmanifest` → re-export or point the manifest at `/brand/survive-bolt.svg`.
- Uncommitted working-tree changes here (`bolt-boil.tsx` SurviveWordmark `boltScale/boltGap`, SiteHeader/Marketing/TwoDoorHome, ideas/model.ts, new MountainBackdrop files) change no geometry but reach no other checkout until committed.

---

## 7. Open questions for Lee

1. **Behind-the-scenes ad CTA — there is no route.** `src/routes` has no about/story/building/behind/updates/founder page; the footer "Learn how →" opens a modal with no URL whose own copy says "Soon I'll share…" (`SiteFooter.tsx:235-238`); `/the-campaign` is deliberately unlisted noindex+nofollow with a referral ask; `/beyond` is career content; there is no brand social handle to "follow" (`index.tsx:20-21`). Options: (a) ship the ad with NO "go to" (needs the `adCopyOf`/CTA guard); (b) a new public route (`/building`? `/story`?) + manifest entry, possibly promoting the FounderModal; (c) point at `/` for now. Which — and what is the label/headline/lines copy, verbatim?
2. **Recraft as a new paid provider** — OK to add `RECRAFT_API_KEY` directly (image, not LLM), or must it front through the Vercel AI Gateway (unverified support)? Raster PNG on black (recommended, matches the `#000` ground, 35 units) vs `_vector` SVG (80 units)?
3. **Illustration placement** — a field on the selected slide (recommended) or its own slide kind? Card kinds + `bolt` only in v1? Given a pass-2 CEQ card can reach ~.65-.70h, are illustrations mostly for detour/phrase slides and `cam:'off'` slides, or should pass-2 CEQ cards shrink to make room? Should it reach the canvas via Send to film and /learn cram cards, or stay Review//film-only like `portrait`?
4. **Wordmark hero target** — bottom-fifth centre (y = .9h) sits under the platform's caption/title chrome; recommend bottom edge at .78h (the captions' rule). Scale ≈ 2.5-3× (≈ the intro's .078h)? Ctrl+click on the wordmark itself, or anywhere on the black? Mutually exclusive with the camera moment (recommended) or stackable? Should the ring dim/shrink during a wordmark hero? Per-take (like B) or saved per slide?
5. **Caption rail numbers** — type at 3.6-4.0 % h with the pass-2 home camera at .30 (rail 507 px wide, 3-5 words/card), or drop the home camera to .26 to buy ~45 px? Will the campus banner ever be on a captioned card slide (if never, the rail bottom can return to ~.76-.78)? Which "subtle" spoken colour (soft gold `#FFD98A`, cream `#F5EFE6`, keep `#FCA311`)?
6. **Intro rectangular camera** — hero at .48w above the pass-2 wordmark (.44h), or keep .62w and lower the wordmark to ~.56h? Pass-1 intro too?
7. **Pass-2 card width** overflows `SAFE.right` by ~36 px at Review width — intentional (the `layout.test.ts:13` pin) or a bug to fix before the rail/slot are computed against the column?
8. **Live highlighting** — keep the paint-only change on the canvas/memos too, or canvas keeps bold+grow? Should a live stem highlight preserve authored `==marks==` (needs the Custom Highlight API path; Chrome for OBS assumed)? Keep the "plain click clears this question's highlights" rule on /film?
9. **Talkthrough directive** — new `'illustration'` tag kind (recommended, raw brief, no model call) or reuse `visual` + note? Attach the brief to the anchored CEQ frame or insert its own slide?
10. **Dreamstate lock-in** — once one image is approved, create a Recraft style from it (5 units) and pin `recraftv4_styles` + `precise` as Dreamstate v2? Keep every generation (recommended) or one path per frame?
11. **Old-bolt fix** — fast-forward `sa-growth-dashboard` main now, and regenerate the OG PNG set now or after the mountain-mark decision?
12. **Illustration lab** — branding tile (no new route) vs a third tab on /survive-bolt?

---

# Completeness critique

## Verified

- `src/components/blastoff/PhoneFrame.tsx` — `:89` `const camSize = frame.camSize ?? (cam === def.spot ? def.size : undefined)` (saved size does leak onto a B-override spot); `:93-95` `moment` is local state reset only on `frame.id`; `:97` measure gate `if (!capture || cam === "off")`; `:108-113` ResizeObserver, deps `[capture, cam, frame.id, w, layout]` (no transform awareness); `:124-128` watermark `pointerEvents: "none"`; `:129-135` stage `display:grid; placeItems:center`, blur keyed on `moment` at `:132`; `:136-140` `WebcamFrame` unmounts on `cam === "off"` while `moment` persists; `:141-147` safe bands. All as claimed.
- `src/components/blastoff/layout.ts` — `SAFE` `:41`, `cardPlacement` `:52-59` (ceq 470/1.24), `camDefault` `:62-68` (pass2 intro `{top, .34}`, else `{home, .3}`), `introWordmarkTop` `:71-73` (.44/.36), `layoutOf` localStorage override `:35-38`, type-only imports `:24-25`. Hero-bottom arithmetic (.529h at .62w, .434h at .48w) checks out against `webcam-spots.ts:52` (`cw = w*.62`, `ch = cw*1.2`, `y = h*.11`).
- `src/components/blastoff/AdSlide.tsx` — `:71` `pad`, `:74-76` wordmark band `left:0,right:0 … justifyContent:"center"`, `:77` copy column at `pad`, `:88` CTA at `pad`, `:54-64` `adCopyOf` always falls back to `base.url`/`base.banner`, `:40-46` `send` copy, `:49` `AD_LABEL`, `:21-23` re-declared `FONT`/`HEAD_FONT`/`GOLD`.
- `src/components/canvas/text-highlights.tsx:69-71` — `.sa-sel-emph { font-weight: 900; … padding: 0 2px … }` (reflow) and `.sa-sel-emph-spot { font-size: 1.18em }`. `src/components/canvas/CeqPreviewer.tsx:840` choice `onClick` bails only on `altKey || inert` (ctrl+click does fall through to select/resolve while `:839` spotlights).
- `src/lib/blastoff.functions.ts:20-44` `frameSchema` is a plain `z.object` (zod `^3.24.2` in package.json → unknown keys stripped), `ad: z.enum(["greek","rep","send"])` at `:38`; `loadBlastPlan:59-61` returns null on parse failure; `src/lib/blastoff-sync.functions.ts:43-65` `frameIn` is a byte-alike hand copy, ad enum at `:59`.
- `src/components/blastoff/BlastOffCapture.tsx` — `resetTake` `:101` (cannot reach `moment`), `camOverride` `:111-113`, the single slide-advance keydown `:115-134` (Space only writes `setI`; B ignores ctrl/meta/alt).
- `src/lib/captions.ts:91-96` `shortsStyle` (left .31/.07, right .07, bottom .78, size .046, spoken `#FCA311`), `CARD_DEFAULTS.lineChars 16` at `:32`; `scripts/captions.ts:115-116` `--cam home|none`; `docs/CAPTIONS.md:26` "31 %–93 %". `BoltZoom.tsx:115` banner `top = h*.745`, `height = h*.046` → .745–.791h, so the .78h caption bottom does sit inside it. `WORDMARK_TOP/SIZE` at `BoltZoom.tsx:53-54`.
- `src/components/blastoff/capture/Webcam.tsx` — `:14` comment claims "` or the next slide ends it" (false in code), `:77` ctrl/meta guard, `:103` zIndex 30/12, `:104-105` 480 ms overshoot transition; `capture/arrows.tsx:112` zIndex 40.
- `src/components/blastoff/plan.ts:273-279` `duplicateFrame` deep-copies only `prompter`. `SetCard.tsx:98,106-107,116` (`s`, `data-sa-card-scale`, unscaled `borderRadius: 12`). `lib/canvas.functions.ts:531-547` returns `{ url }` only. `lib/ideas-inbound.functions.ts:43-58` fetch-then-upload precedent (`upsert:false`). `CeqFrame.tsx` has no importer. `usage-elements.ts:78-84` lacks `blastad`. `RECRAFT_API_KEY` absent from `.env` and `.env.example`. `layout.test.ts:13,15-20` pins as described.

## Wrong

- `assertAdmin` is at `src/lib/admin-session.functions.ts:108`, not `:120-170` (§1 row 15, §2.7).
- §2.4 / §2.1 contradiction on the wordmark invariant. `BoltZoom.tsx:51-53` says open and intro share `WORDMARK_TOP = .36` "so a cut … leaves survive exactly where it was", and §2.4 calls this "untouched" — but `frame-view.tsx:76` already passes `introWordmarkTop(layout)` (= .44 in pass2) only to the intro, while the open (`frame-view.tsx:74`) keeps the .36 default. The invariant is already broken in pass2, and §2.1's option "raise `introWordmarkTop('pass2')` to ≈ .56" widens the jump without saying whether the open moves too.
- §2.2 (`<CaptionRail mode='reserve'|'check'|'live'>`) and §3 (caption-rail test pins a "current-word rule = captions.ts:130") describe a live-rendered caption mode, while §2.2's opening sentence, §4 ("the caption rail on /film is geometry only — no Whisper, no audio") and the Z-order note ("the REAL captions are burned in post") say nothing renders captions in the phone. `'live'` mode is never specified (no word source exists at capture time; `Webcam.tsx:63` is `audio:false`) — either drop it or define where its words come from.
- §2.3/§7 Q4 hero target vs the rail: recommending the hero wordmark's bottom edge at .78h puts a 2.5–3× wordmark (≈ .05–.09h tall) squarely inside `CAPTION_RAIL` (.61–.735h). The Z-order section argues the burned captions are "always topmost in the delivered video" — so the post-burned captions will paint over the hero every time. The only rail-free band under the card is .735–.78h (4.5 % h). The plan never reconciles the two numbers.
- §2.2 says the rail "hides while `moment`", §4 says it "hides during a moment"; §2.3 replaces `moment` with a `hero` enum. Unstated whether the rail hides for `hero === 'wordmark'` — if it does, the `captionRailClear` readout is switched off exactly when the wordmark/rail collision above happens.
- §2.7 "Never return bytes across the RPC" then §2.8 "the plan stores the URL + path only" — consistent — but §2.6's `FrameIllustration` carries `prompt` (server-resolved, up to prefix+600+suffix ≈ 800 chars) per frame in `nodes_json`; §2.8's "400 frames × 2000-char prompt ≈ 0.8 MB already" contradicts §2.7's "the client never sends a raw prompt" only in direction, but the plan should state whether the resolved prompt is persisted at all (it is needed for `isStaleIllustration`? no — `styleVersion` covers that).

## Missing

- **Recraft facts are uncited.** No Recraft API note exists in the repo: `docs/MOUNTAIN-LOGO.md:20-80` is a walkthrough of the recraft.ai web app (no API, no URLs); `scripts/mountain-asset.ts` only parses an SVG export. The endpoint `https://external.api.recraft.ai/v1/images/generations`, models `recraftv4_1`/`recraftv4_styles`, `random_seed`, `controls.background_color/colors`, `style_match:'precise'`, `POST /v1/styles`, 35/10/5/80 unit costs, ~24 h URL expiry, 100/min + 5 req/s limits, and "V4.1 has no `negative_prompt`" all rest on an unnamed "Recraft API note" with no documentation URL. Every one must be verified against docs before `recraft.server.ts` is written.
- **Illustration reference survival on reopen is only half-covered.** Both schemas gaining `illustrationSchema` covers `loadBlastPlan`; but `plan.ts:197-229 reconcilePlan` is not examined — it keeps existing ceq frames by object (fields survive) yet drops any ceq frame whose card left the set, and the §2.8 canvas-save race (`set-files.core.ts:163` → `set-files.functions.ts:107-110`) can overwrite `blastOff` wholesale. Paid assets then lose their reference with no reverse index; the plan should add a recovery path (list `illustrations/<setId>/` by `frameId`) or at least state that the folder convention is the index.
- **Post-burn caption geometry has no way to learn the pass.** `scripts/captions.ts` takes only `--cam home|none`; the proposed `--wide` flag still cannot distinguish pass1 (home right edge .29w) from pass2 (.35w). Either `shortsStyle` gets a `layout` parameter and the CLI a `--pass` flag (or reads the plan), or pass1 sets bake pass2 margins.
- **`avoidCard`/measurement changes ripple into the grips.** Mounting `IllustrationLayer` as a second grid row inside `[data-sa-stage]` changes the card's y (pass1 lifts by half the picture) and therefore `cardBox`, the `camera.ts` grip targets derived from `data-sa-card-scale`, and the zoom's transform origin; the plan only mentions unioning the rect into `measure()`.
- **"No API calls during capture" ignores the `<img>` network fetch.** The illustration is a runtime fetch from the public bucket on the filming laptop; `img.decode()` handles half-loaded, not offline. No fail-loud when the fetch fails (CLAUDE.md "no silent fallbacks").
- **No timing hand-off for moment/hero.** Captions are burned across the whole take from Whisper timings; nothing records when a moment/hero happened, so the post pass cannot suppress or move captions during a hero even if wanted. State this explicitly as accepted.
- **§1 systems not evidenced.** Rows 2, 3, 10 (`spotlight.ts`, `FilmOverlays.tsx`), 11 (`transcribe.functions.ts`), 14 (`publish.functions.ts`, `ceq-takes.ts`, migration 0085), 15 (`example.functions.ts`, `mux.server.ts`), and §6's PID/port/other-checkout claims are asserted with line numbers but nothing in the plan shows they were re-read; the header says only six ranges were re-read from disk.
- **Unverified numeric claims stated as fact:** `canvas-media` "5 GiB cap"; "CaptureArrows z 40" (true, `arrows.tsx:112`) but "BrandCursor above 40" unverified; Rubik 800 "synthesized" depends on `__root.tsx:113` (not shown).
- **Concrete extension point absent** for: `captionRailClear` readout in the chrome bar (`BlastOffCapture.tsx:165-180` cited but the bar's current content/format not shown); `IllustrationLayer` re-key per frame (stage is keyed on `frame.id` only when `capture`, `PhoneFrame.tsx:129` — the layer's entrance will not replay on Review); the `🖼` spine badge (`ReviewDeck.tsx:375`) and Teleprompter face gating (`:100-103, :409-420`) are cited without content.
- **Tests named but not located:** `capture-quality.test.ts:100-104`, `film-v2.test.ts:21`, `film-lock.test.ts:73-82`, `prompter-sync.test.ts:17-20`, `import-cycles.test.ts`, `webcam-spots.test.ts:15-28` — none opened; a new `layout.test.ts` case "hero bottom < wordmark top" is proposed but the existing test file has no such geometry helper (only `introWordmarkTop` ordering at `:22`).
