# Branded intro / outro / corner cards — add & film

Three branded, full-frame (1920×1080) video cards are now droppable **elements** in the study
canvas: **Intro card**, **Outro card**, and **Corner bolt** (watermark). They render the Survive
FINAL bolt logo and animate their own entrance, and they behave like any other design element
(resize, position-lock, choreograph reveal, film chrome-hiding).

Standalone preview of all three (no canvas needed): **`/intro-outro`**.

## Add one to a frame

From either palette surface:

- **Toolbar → Palette / Add Elements** → **Intro card** / **Outro card** / **Corner bolt**, or
- **Left drawer → Elements** group → same three.

Drop it **onto a frame** so it parents to that frame (that's what lets it film in the frame's
walk). It arrives at 800×450 (16:9). Drag a corner handle to resize — **aspect is locked to
16:9**, so it always stays frame-shaped. Size it to fill the frame (or the whole frame is fine).

## Configure (hover the card in authoring — the toolbar is hidden in film)

- **Intro card** — a text box for the **Title** (topic name, no chapter number — that's all the
  plate shows now), a **navy / keyed** toggle (keyed = transparent background for OBS chroma
  keying), and **▶** to replay the entrance.
- **Outro card** — **navy / keyed** toggle + **▶** replay. (Tagline + url are fixed brand copy.)
- **Corner bolt** — four **corner** buttons (↖ ↗ ↙ ↘) to place the watermark, and a
  **keyed / navy** toggle (defaults keyed/transparent so it overlays cleanly).

The bolt is Lee's baked FINAL logo everywhere — no per-card colour picker (by design).

## Film them (choreograph + entrance)

Because they're **elements**, they work with the existing filming flow with no special steps:

- **Choreograph reveal** — in a frame's choreograph/cue sheet, an intro/outro/corner reveals as a
  **single whole-card step** (it has no internal parts). Add a `reveal`/`deal` cue for it wherever
  you want it to appear in the walk, exactly like any element.
- **Entrance ("typewriter-in" style)** — each card carries its OWN entrance (Intro: bolt flash →
  wordmark snap → title plate wipe; Outro: tagline fades up, then the url). That entrance
  **re-fires automatically when you space-walk INTO the card's frame in film**, so it plays fresh
  on every take. The **▶** button replays it while authoring.
- **Film mode** hides all the edit chrome (border, resize handles, toolbar) automatically, so the
  camera sees only the clean composition. Spotlight (Ctrl+click) works on the whole card too.

## Capture

Film the frame full-screen in OBS like any other frame. For a card set to **keyed**
(transparent), the background drops out so you can chroma-key / composite it; **navy** bakes the
brand navy into the take.

## Reshaping the logo later

The bolt geometry is baked in `src/components/canvas/brand.tsx` (`BOLT_OUTER` / `BOLT_RIGHT` /
`BOLT_VIEWBOX`) and `src/components/brand-cards/bolt-boil.tsx` (`FINAL_OUTER` / `FINAL_SEAM`).
Rebuild in `/logo-lab`, then paste the new paths into those two files — the cards and the wordmark
placement follow automatically.

---

### Where this lives in code (for future edits)

- Brand compositions: `src/components/brand-cards/{IntroCard,OutroCard,CornerBolt,bolt-boil}.tsx`
- Element node components: `src/components/canvas/cards/elements.tsx`
  (`IntroCardNode` / `OutroCardNode` / `CornerBoltNode`, modeled on `LogoCardNode`)
- Kind registration: `types.ts` (`CardKind`, `KIND_CATEGORY`, the `*Element` interfaces,
  `CardData` union), `templates.ts` (`blankCard` cases, `CARD_KIND_LABEL`)
- Palettes: `study_.canvas.tsx` (`nodeTypes`, `ADD_ELEMENT_BLANKS`) + `Palette.tsx`
  (`ELEMENT_BLANKS`)
- Sizing: the node renders the 1920×1080 card at `scale = w / 1920`, aspect-locked to 16:9.
