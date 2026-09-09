// THE ILLUSTRATION SLOT — types and the style registry, on their own so the server fn, the
// editor, PhoneFrame and (one day) a canvas element can import them without dragging plan.ts
// onto the canvas render path (ad-kinds.ts pattern; the tdz-graph ratchet). Function
// declarations and plain consts only.
//
// THE PHILOSOPHY (Lee, polish pass): Recraft draws the BASE picture; our renderer owns the
// motion (the Survive Boil). Illustrations are occasional — 1–3 per Short, never automatic.
// An idea dictated in the talkthrough is BANKED here as `requested: true` with a brief, and
// nothing is generated until Lee presses Generate.
import type { Attachment } from "@/components/ideas/model";

/** What a slide knows about its picture. Absent = never asked; null = Lee cleared it. */
export interface FrameIllustration {
  /** An idea was banked (from the talkthrough or the editor) even if nothing is generated yet. */
  requested: boolean;
  /** Lee's own words for the picture — what it shows. */
  prompt: string | null;
  /** Why the picture exists — the teaching point it serves. Kept beside the prompt so a
   *  future "suggest visual" can reason about WHY, not only WHAT. */
  teachingIntent: string | null;
  provider: string | null;
  stylePreset: string | null;
  /** The registry version the image was made with; older than the registry = stale. */
  styleVersion: number | null;
  /** The persisted copy in our own bucket — never the provider's expiring URL. */
  assetUrl: string | null;
  /** The bucket path, so the asset can be found even if the URL form changes. */
  localAssetId: string | null;
  animationPreset: AnimationPreset | null;
  generatedAt: string | null;
  /** The provider seed, for reproducibility. */
  seed: number | null;
  /** WHERE IT SITS (2026-09-05): absent = the band under the card; a value = placed by hand
   *  (dragged / resized on Review), as fractions of the phone — centre x, centre y, width. */
  placement?: IllustrationPlacement | null;
  /** THE BRIEF (2026-09-05): Lee's spoken words, the AI's summary of the prompt it prepped
   *  (a title and three bullets), and the slide whose picture this one rhymes with. */
  brief?: string | null;
  summary?: { title: string; bullets: string[] } | null;
  referenceFrameId?: string | null;
  /** A REFERENCE PHOTO (2026-09-05, "how do we keep this looking good — reference photos?"):
   *  pasted or picked by Lee for THIS generation only — never saved as a house style. Recraft
   *  treats it as a loose visual nudge (style_reference_urls, style_match: "flexible"), not a
   *  literal composite; a specific real landmark or prop is the case it earns its keep. */
  referencePhoto?: Attachment | null;
  /** A SECOND PICTURE, SIDE BY SIDE (2026-09-05: "could I add that internal one and show them
   *  side by side... set up a blank slide and add them"): a blank slide only. A snapshot of
   *  another picture's own URL and title, from the library below — not a live reference, since
   *  a library entry never changes after it's made. Cleared independently of the slide's own
   *  picture via `pairedAssetUrl: null`. */
  pairedAssetUrl?: string | null;
  pairedTitle?: string | null;
  /** THE THREE-REVISION CAP (Lee, 2026-09-07: "Max of 3 revisions for illustrations, to save
   *  on cost."): how many Recraft generations THIS subject has had on this frame — the editor's
   *  Generate / Regenerate and the bank's regenerate-in-place both count. A new brief or an
   *  edited subject resets it to 0. Absent = 0 (every picture made before today). */
  attempts?: number;
}

/** The cap itself — three draws per subject per frame, then the library or a new subject. */
export const ILLUSTRATION_REVISION_CAP = 3;
/** How many draws are left for this subject: cap minus attempts, never below 0. Pure; the
 *  panel disables Regenerate at 0 and the server refuses the next one unless overridden. */
export function revisionsLeft(i: Pick<FrameIllustration, "attempts"> | null | undefined, cap: number = ILLUSTRATION_REVISION_CAP): number {
  const n = i?.attempts;
  const used = typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return Math.max(0, cap - used);
}
/** The server's refusal and the panel's message — the same string, so the panel can recognise
 *  the refusal (an old frame with no `attempts` but three library rows) and offer "draw anyway". */
export const REVISION_CAP_MESSAGE = `${ILLUSTRATION_REVISION_CAP} of ${ILLUSTRATION_REVISION_CAP} — change the subject to draw again`;

export interface IllustrationPlacement { x: number; y: number; w: number }

/** Which slides take a picture (Lee, 2026-09-05): Memorize This / a phrase, Cheat Code,
 *  Deeper Idea / a tip, and a blank slide — where the picture IS the slide (watermark,
 *  picture, optional camera, nothing else).
 *
 *  And, since 2026-09-08, THE SLOGAN SLIDE — one of the three takes a picture and the other two
 *  are words alone (Lee: "B to an A is the picture, yes. Others just text."), which is exactly
 *  what an optional slot already means: nothing is drawn until he generates one. Being in this
 *  list is the ONLY thing the Illustrator face needs to work on a kind. */
// "tricky" joined 2026-09-08 — Lee, the moment the kind existed: "Let me illustrate on Tricky
// ones." It is the fourth of the same callout family; it was left off only because it was built
// hours after this list.
export const ILLUSTRATION_KINDS = ["phrase", "cheat", "tip", "tricky", "found", "blank", "slogan"] as const;
export function canIllustrate(kind: string): boolean { return (ILLUSTRATION_KINDS as readonly string[]).includes(kind); }

/** Dead centre on a blank slide (a touch above the middle so the caption rail stays clear);
 *  the upper third on a slogan slide, where the words sit UNDER the picture — .46 w centred at
 *  .28 h puts its bottom edge at ≈ .41 h on a 9:16 frame, just above the strip SloganCard.tsx
 *  reserves for the words (`sloganBand`), which in turn stops above the caption rail; under the
 *  card elsewhere — only asked for when a picture is placed by hand. */
export function defaultPlacement(kind: string, big = false): IllustrationPlacement {
  if (kind === "blank") return { x: 0.5, y: 0.44, w: 0.72 };
  // A BIG callout is laid out exactly like a slogan slide — full frame, words in the band
  // underneath — so its picture takes the slogan's spot, not the card's.
  if (kind === "slogan" || big) return { x: 0.5, y: 0.28, w: 0.46 };
  return { x: 0.5, y: 0.62, w: 0.5 };
}
/** A placed picture, or a blank / slogan slide's — the layer that sits at a spot rather than in
 *  the band. A slogan is a FULL-FRAME kind: it draws the whole 9:16 itself, so there is no card
 *  for a band to hang under; its picture is always the phone-level layer at the spot above. */
export function isPlaced(kind: string, i: FrameIllustration | null | undefined, big = false): boolean {
  return !!i && (kind === "blank" || kind === "slogan" || big || !!i.placement);
}

// "drift" (2026-09-06, Lee: "the boiling animations are horrible for the illustrations...
// more flowy... suspended in space... a cloudy, foggy dream space... a light touch") — one
// smooth, continuous CSS animation (DriftBoil.tsx) instead of the Boil's discrete flipbook,
// which is what reads as flicker. New default for illustrations; the Boil stays for the bolt
// and anything already using it.
export const ANIMATION_PRESETS = ["boil", "boil-calm", "drift", "none"] as const;
export type AnimationPreset = (typeof ANIMATION_PRESETS)[number];
export const ANIMATION_LABEL: Record<AnimationPreset, string> = { boil: "Survive boil", "boil-calm": "calm boil", drift: "drift", none: "still" };
export function isAnimationPreset(v: unknown): v is AnimationPreset { return typeof v === "string" && (ANIMATION_PRESETS as readonly string[]).includes(v); }

/** A style preset: everything about Survive's art direction that Lee should never have to
 *  type again. `version` is bumped whenever the prefix, suffix, controls, model or style id
 *  change; an illustration stamped with an older version shows as stale, and is never
 *  rewritten silently — the picture keeps the look it was made with. */
export interface IllustrationStyle {
  id: string;
  version: number;
  label: string;
  provider: "recraft";
  /** The provider's base model. Once a Recraft style is created from approved images, the
   *  server swaps to `recraftv4_styles` + that style id (see styleIdEnv) — v2 of this preset. */
  model: string;
  size: string;
  promptPrefix: string;
  promptSuffix: string;
  /** Recraft `controls`: the ground is black (stripped to alpha after generation — see
   *  recraft.server.ts), the palette is the house palette. An optional `weight` biases how much
   *  of each colour the model reaches for; white dominant, the rest occasional accents. */
  controls: { background_color: { rgb: [number, number, number] }; colors: { rgb: [number, number, number]; weight?: number }[] };
  /** The env var that may hold a Recraft custom style id for this preset. */
  styleIdEnv: string;
  defaultAnimation: AnimationPreset;
  /** Retired (2026-09-06, the editor): kept so old pictures resolve, never offered for new ones. */
  retired?: boolean;
  /** What changed in this version — Lee's words, the design record per row. */
  note?: string | null;
}

/** THE REGISTRY AS DATA (2026-09-06, Lee's v6 workshop — docs/ILLUSTRATION-STYLE-V6-DIRECTION.md,
 *  Part 2: "move ILLUSTRATION_STYLES from hardcoded to DB-backed, seeded with the current entries
 *  so nothing breaks"). Everything that reads a style reads it through one of these: `styles` is
 *  the latest version per id, `history` every version ever saved (the test panel compares against
 *  them; a picture stamped older than `styles[id].version` is stale). `source` says where it came
 *  from — "db" once migration 20260907_0200 has run, "code" (the seeds below, CODE_REGISTRY) until
 *  then or when the table can't be read. `briefSystem` null = the code default in
 *  illustration-brief.ts (this file can't import it — the brief imports from here). */
export interface IllustrationRegistry {
  styles: Record<string, IllustrationStyle>;
  history: IllustrationStyle[];
  defaultStyleId: string;
  strategyStyleId: string;
  briefSystem: string | null;
  source: "db" | "code";
  /** Code seeds whose (id, version) isn't a DB row yet — the editor offers to seed them. */
  unseeded?: { id: string; version: number }[];
}

// SURVIVE WATERCOLOR v4 — the house default. v1 (Lee, 2026-09-05, on the monoline-on-black
// experiment: "white pencil drawn isn't going to work. We need SOME colour... watercolor
// maybe?") landed well on four real test pictures but flagged one defect: "the black on black
// in particular" (a suited figure rendered dark-on-dark, disappearing into the generation
// ground). v2 fixed that by naming the ink outline a warm colour and banning true black or
// near-black from any fill. v3 fixed the hole v2's own fix opened in the exact place Lee found
// it — a face: pushing every fill away from black landed skin on near-white, and near-white
// sits right next to the generation ground (also white), so removeBackground's cutout couldn't
// tell "pale skin" from "the white page" and cut it away, reading as a solid black face. v3's
// fix: every fill sits in a visible MIDDLE band, clearly darker than white and clearly lighter
// than black — skin named explicitly, since that was the one place v2 pushed toward "light"
// without saying how light is still safe.
//
// v4 (2026-09-06, Lee relaying feedback from elsewhere on why "watercolor" alone sometimes reads
// splotchy — "paint bleeds, uneven opacity, muddy faces, random splatters, washed-out edges" —
// on a construction-worker generation that had real marks but wouldn't survive two seconds at
// phone size): the wash now stays CONTAINED inside the ink line instead of being told it may
// bleed loosely at the edges — magazine-editorial-and-screen-print, watercolor as texture rather
// than the whole instruction. The v2/v3 color-safety rules are NOT relaxed: the "never black,
// never near-white" middle-band rule stays exactly as it was — that was an empirical fix for a
// real Recraft failure mode (the model doesn't reliably paint a plain white background, so a
// same-tone element can vanish into whatever it actually rendered), and generic illustration
// advice from outside this codebase has no way to know that. Also new: "one clear subject,
// minimal secondary objects" and an explicit phone-scannability line, both said plainly rather
// than implied. Bumping the version is what makes this apply to work already done, on request,
// without retyping anything: any picture stamped older than 4 shows "stale — regenerate," and
// Regenerate reuses the exact same brief — the subject never changes, only the render.
//
// v5 (2026-09-06, Lee's workshop — docs/ILLUSTRATION-STYLE-V5-PROPOSAL.md) did NOT become
// watercolor v5. It became a second id, `survive-riso` below, and the house default moved to
// it; watercolor stays at v4 as the style for the STRATEGY shorts (reps / chairs / founder
// content — "a different audience and can be looser and more surreal than exam content"), so
// the existing library isn't wasted. See defaultStyleIdFor.
//
// SINCE 2026-09-06 (v6, Part 2) THIS IS THE SEED, NOT THE REGISTRY. The registry lives in
// public.illustration_styles (migration 20260907_0200) and is edited at /admin/illustrations/styles;
// these entries are the code fallback when that table is missing AND what seedIllustrationStyles
// writes into it (only the (id, version) pairs not there yet — idempotent). Server callers read
// `await getRegistry(db)` (lib/illustration-registry.functions.ts), never this object directly;
// the client reads useIllustrationRegistry(). A version saved from the editor that is newer than
// the seed wins; a seed newer than the table's latest wins until it is seeded.
export const STYLE_SEEDS: Record<string, IllustrationStyle> = {
  // SURVIVE RISO — the house default for exam content (2026-09-06, from the v5 proposal).
  // The diagnosis, in the proposal's words:
  //   "Watercolor cut out and placed on black is fighting itself." Watercolor is a paper medium
  //   — white paper showing through a translucent wash is what makes it read as watercolor; the
  //   paper IS the light source. We generate on white, strip the background and drop the result
  //   on #000000, so "every edge that made it look like watercolor gets cut off, and the
  //   translucency now has darkness behind it instead of light."
  //   "Gold and blue mix to mud — this is color theory, not model failure." #FCA311 and #006BA6
  //   are near-complementary; flat, they pop side by side, but "in a translucent medium, wherever
  //   two washes overlap or blend, complementaries neutralize — you get brown-gray." And the old
  //   weights (0.35 + 0.30 = 0.65) left a free third of the palette to Recraft's discretion —
  //   "that free third is where unplanned color enters."
  //   "'Vintage educational magazine illustration' is the textbook reference" — "literally the
  //   aesthetic Lee says he doesn't want."
  // The fix is a medium built for dark grounds: risograph. Opaque spot inks hold colour against
  // black with no mud from overlap; a 2–3 ink palette is native to the medium rather than
  // something the prompt has to police; grain and misregistration give texture without wash
  // unevenness; it's "the look of show posters, album art, zines, indie games. Not a textbook,
  // not corporate, not AI-slick"; and overprint is "a genuine third" colour — the dreamy quality
  // without translucency's downsides.
  //
  // KEPT, verbatim, every empirical v1–v4 rule above: the warm dark brown outline (v2, the
  // suited figure that vanished dark-on-dark), no black or near-black fill (v2), no white or
  // near-white fill with skin named as warm tan / light brown / warm peach (v3, the face the
  // background remover cut away), the two-or-three shapes and one clear subject, the no
  // front-facing face, and the phone-size / two-seconds line (v4). "Those were earned on real
  // failures and the medium change doesn't retire any of them."
  // CHANGED: watercolor wash → flat riso inks; the v4 "no splatters / muddy / bleeding" clauses
  // are gone ("they were policing a problem the new medium doesn't have"); "vintage educational
  // magazine" → "modern editorial illustration, poster composition"; overprint added as the
  // source of depth. Palette: gold 0.45 + blue 0.35 + cream paper 0.20 = 1.00 exactly — "no free
  // third for the model to fill with whatever it likes" (and never above 1: Recraft rejects it).
  // The cream "is what gives the picture an implied paper even on black." That was riso v1.
  //
  // RISO v2 — "psychedelic '68" (2026-09-06, the same night, Lee's second workshop —
  // docs/ILLUSTRATION-STYLE-V6-DIRECTION.md, Part 1). The doc calls this "v6" because it counts
  // the whole line (watercolor v1–v4, riso = v5); in the registry it is survive-riso VERSION 2,
  // since versions are per id — and that is what makes every riso v1 picture read STALE in the
  // bank tonight (isStaleIllustration: stamped 1 < registry 2), exactly as the doc asks: "Old
  // pictures show stale and regenerate from the same subject."
  // The synthesis: psychedelic and Mad Men "pull opposite ways" — but "they meet at a real
  // historical moment: 1968–1973, when advertising absorbed psychedelia." The operating rule:
  // "Psychedelic in color, texture, and light. Modernist in composition, figure, and silhouette."
  // "Warp the color, never the structure." Why it fits: "The black stage becomes an asset.
  // Watercolor fought the black ground. Psychedelic poster art is built for dark"; "Riso and
  // psychedelic are the same production process" — keep the process, change the palette
  // temperature and the light; "'Important people' comes from silhouette, not faces."
  // PALETTE — "The current gold and blue survive but the temperature shifts. Add heat": gold
  // 0.35 + hot magenta 0.25 + blue 0.25 + deep violet 0.15 = 1.00 exactly. "Magenta over gold
  // overprints to a burnt orange-red; magenta over blue gives violet; violet against gold is the
  // classic psychedelic vibration. Nothing is left to the model's discretion." Cream is no longer
  // a control — it stays available in words for the figure's paper-white highlights.
  // SUFFIX — the doc's "Proposed prompt suffix (v6)", verbatim. "Every empirical rule from v1–v4
  // is preserved verbatim. Only the medium, palette, and light changed."
  "survive-riso": {
    id: "survive-riso",
    version: 2,
    label: "Survive Riso — psychedelic '68",
    provider: "recraft",
    model: "recraftv4_1",
    size: "1024x1024",
    promptPrefix: "A single illustration of ",
    promptSuffix: ", on a plain white background, filling most of the frame with only a small even margin around it. Late-1960s psychedelic screenprint poster illustration in a modernist composition: three or four flat saturated spot inks, printed with visible grain and a slight off-register shift, where overlapping inks create a third deeper color. A glowing halo or concentric aura radiating behind the subject. Confident hand-drawn contour in warm dark brown — never black or near-black. Flat opaque fills, no gradients, no glossy shading, no photorealism. Every fill sits clearly between the two extremes: never true black or near-black (a suit, a shadow), and never white or near-white either (skin, a pale shirt) — a fill that pale is indistinguishable from the white background and gets cut away with it, leaving a hole. Skin and faces are always a warm tan, light brown, or warm peach, visibly darker than the white page. Composition is structured and geometric with a strong readable silhouette — the psychedelia is in the color and the light, never in warped or hard-to-read shapes. One clear subject with minimal secondary objects and no unnecessary detail, at most two or three shapes total — designed to be immediately recognizable at small mobile-screen size, on screen for as little as two seconds. If it includes a person, show them from behind, from the side, with their head turned away, or cropped out of frame — never a detailed front-facing face. No text, no logos, no signature, no clip-art look.",
    controls: { background_color: { rgb: [255, 255, 255] }, colors: [{ rgb: [252, 163, 17], weight: 0.35 }, { rgb: [230, 57, 132], weight: 0.25 }, { rgb: [0, 107, 166], weight: 0.25 }, { rgb: [76, 44, 130], weight: 0.15 }] },
    styleIdEnv: "RECRAFT_STYLE_ID_RISO",
    defaultAnimation: "drift",
    note: "v6 direction (2026-09-06): late-1960s psychedelic screenprint in a modernist composition — psychedelic in color, texture and light; modernist in composition, figure and silhouette. Palette adds heat: gold 0.35, hot magenta 0.25, blue 0.25, deep violet 0.15. Riso v1 pictures are stale.",
  },
  // SURVIVE WATERCOLOR v4 — since 2026-09-06 the style for the STRATEGY shorts only (see the
  // v5 note above); the v1–v4 history is the long comment above this registry.
  "survive-watercolor": {
    id: "survive-watercolor",
    version: 4,
    label: "Survive Watercolor (strategy shorts)",
    provider: "recraft",
    model: "recraftv4_1",
    size: "1024x1024",
    promptPrefix: "A single illustration of ",
    promptSuffix: ", on a plain white background, filling most of the frame with only a small even margin around it. Bold editorial ink illustration: a clean, controlled hand-drawn outline in a warm dark brown — never black or near-black — with a watercolor fill that stays CONTAINED inside that line. No paint splatters, no muddy or uneven washes, no cloudy or bleeding backgrounds, no loose bleeding edges outside the outline — the wash is texture, not the whole picture. Every fill sits clearly between the two extremes: never true black or near-black (a suit, a shadow), and never white or near-white either (skin, a pale shirt) — a fill that pale is indistinguishable from the white background and gets cut away with it, leaving a hole. Skin and faces are always a warm tan, light brown, or warm peach, visibly darker than the white page. Subtle paper texture, high contrast, simplified shapes, a strong readable silhouette, one clear subject with minimal secondary objects and no unnecessary detail, at most two or three shapes total — designed to be immediately recognizable at small mobile-screen size, on screen for as little as two seconds. Vintage educational magazine illustration, modern composition. If it includes a person, show them from behind, from the side, with their head turned away, or cropped out of frame — never a detailed front-facing face. No text, no logos, no signature, no photorealism, no glossy cartoon shading, no clip-art look.",
    controls: { background_color: { rgb: [255, 255, 255] }, colors: [{ rgb: [252, 163, 17], weight: 0.35 }, { rgb: [0, 107, 166], weight: 0.3 }] },
    styleIdEnv: "RECRAFT_STYLE_ID_WATERCOLOR",
    defaultAnimation: "drift",
  },
  // LEGACY (2026-09-05): the monoline-on-black look, kept only so illustrations already made
  // with it keep resolving and rendering correctly. Never the default again — colour weights
  // fixed here to sum ≤ 1 (the v2 attempt shipped broken at 1.5 and Recraft rejected every
  // generation with it: "Total color weight must be between 0 and 1").
  "survive-dreamstate": {
    id: "survive-dreamstate",
    version: 2,
    label: "Survive Dreamstate (retired)",
    provider: "recraft",
    model: "recraftv4_1",
    size: "1024x1024",
    promptPrefix: "A single hand-drawn illustration of ",
    promptSuffix: ", centered on a solid black background, filling most of the frame with only a small even margin around it. Monoline white pencil line, a slightly irregular soft hand-drawn outline, a strong simple silhouette. Plain white line with no fill anywhere, except at most one single shape may hold a soft warm gold glow or a flat colour, to draw the eye to the single most important detail — never fill more than one shape. A person's face stays plain and simple, no detailed eyes, eyebrows or mouth — a side profile, a back view, or a mostly blank face reads best. Playful and a little dreamlike, immediately readable on a phone. No shading, no gradients, no texture, no crosshatching, no text, no background objects, no scenery.",
    controls: { background_color: { rgb: [0, 0, 0] }, colors: [{ rgb: [255, 255, 255], weight: 0.5 }, { rgb: [252, 163, 17], weight: 0.3 }, { rgb: [0, 107, 166], weight: 0.15 }] },
    styleIdEnv: "RECRAFT_STYLE_ID_DREAMSTATE",
    defaultAnimation: "boil",
    retired: true,
  },
};
/** The house default — exam content. Was "survive-watercolor" until 2026-09-06 (v5 proposal).
 *  Since the same night's v6 work this is the CODE default only: the live one is
 *  site_settings.illustration.defaultStyleId ("Keep DEFAULT_STYLE_ID configurable from this
 *  page"), read through the registry's `defaultStyleId`. */
export const DEFAULT_STYLE_ID = "survive-riso";
/** The strategy shorts' style (2026-09-06, the v5 proposal: "Strategy shorts get their own
 *  style... Keep watercolor as the id for it... it's a good contrast to riso, and it means the
 *  existing library isn't wasted"). The code default; the live one is the registry's. */
export const STRATEGY_STYLE_ID = "survive-watercolor";

/** The registry as the code has it — the fallback every function below defaults to, so a call
 *  site or test that doesn't pass one behaves exactly as before the table existed. */
export const CODE_REGISTRY: IllustrationRegistry = {
  styles: STYLE_SEEDS,
  history: Object.values(STYLE_SEEDS),
  defaultStyleId: DEFAULT_STYLE_ID,
  strategyStyleId: STRATEGY_STYLE_ID,
  briefSystem: null,
  source: "code",
};

/** The topic kind a set belongs to, as the bank reports it (BoothTopic.kind): "strategy" for
 *  the reps / chairs / founder shorts, undefined for course (exam) content. */
export type IllustrationTopicKind = "strategy" | undefined;

/** Which preset a NEW picture starts in, per kind: riso for exam content, watercolor for the
 *  strategy shorts. Everything that first chooses a frame's style asks this, never
 *  DEFAULT_STYLE_ID directly, so the split lives in one place — and since v6 the ids come
 *  from the registry's settings, so Lee can move either from the editor. */
export function defaultStyleIdFor(kind: IllustrationTopicKind, registry: IllustrationRegistry = CODE_REGISTRY): string {
  return kind === "strategy" ? registry.strategyStyleId : registry.defaultStyleId;
}

/** The preset by id (its latest version); null or unknown → the house default. A registry whose
 *  default names a style it doesn't hold (a setting pointing at a deleted id) still resolves —
 *  to the code default — rather than handing back undefined into a render. */
export function illustrationStyle(id: string | null | undefined, registry: IllustrationRegistry = CODE_REGISTRY): IllustrationStyle {
  return (id && registry.styles[id]) || registry.styles[registry.defaultStyleId] || STYLE_SEEDS[DEFAULT_STYLE_ID];
}

/** One exact version of a preset, from the history — what a picture was actually made with.
 *  Null when that version was never saved (a stamp from before the table existed). */
export function illustrationStyleAt(id: string, version: number, registry: IllustrationRegistry = CODE_REGISTRY): IllustrationStyle | null {
  return registry.history.find((s) => s.id === id && s.version === version) ?? null;
}

/** The full prompt the provider sees. Lee types the subject; the preset supplies everything
 *  else; the teaching intent rides last, where Recraft gives it the least weight — it is
 *  context for the subject, not a second subject. */
export function composeIllustrationPrompt(style: IllustrationStyle, visual: string, teachingIntent: string | null): string {
  const subject = visual.trim().replace(/[.\s]+$/, "");
  const intent = (teachingIntent ?? "").trim().replace(/[.\s]+$/, "");
  // A quoted label in the subject ("OUR COMPANY" on a sign) is the one text the picture may
  // carry — the preset's "no text" steps aside for it, nothing else changes.
  const suffix = promptHasLabel(subject) ? style.promptSuffix.replace(/,?\s*no text\b/i, "") : style.promptSuffix;
  return style.promptPrefix + subject + suffix + (intent ? " The idea it illustrates: " + intent + "." : "");
}

/** A quoted label in a subject — the only text a Survive picture may carry. */
export function promptHasLabel(prompt: string): boolean {
  return /"[^"]{1,40}"|“[^”]{1,40}”/.test(prompt);
}

/** Made with an older registry version than the preset has now. */
export function isStaleIllustration(i: FrameIllustration | null | undefined, registry: IllustrationRegistry = CODE_REGISTRY): boolean {
  if (!i || !i.assetUrl) return false;
  const style = illustrationStyle(i.stylePreset, registry);
  return i.styleVersion !== null && i.styleVersion < style.version;
}

/** Pinned to a preset other than the default for its kind — a watercolor picture on an Easy
 *  Points set, a riso one on a strategy short, or the retired dreamstate anywhere. Stale is
 *  version-based and stays that way; this is the OTHER reason the panel offers "switch to
 *  <default>" (v5, 2026-09-06: riso for exam content, watercolor stays for strategy shorts).
 *  A frame with no preset yet is never off-style — it gets the right one when first chosen. */
export function isOffStyleIllustration(i: FrameIllustration | null | undefined, kind: IllustrationTopicKind, registry: IllustrationRegistry = CODE_REGISTRY): boolean {
  return !!i && !!i.stylePreset && i.stylePreset !== defaultStyleIdFor(kind, registry);
}

/** A fresh, empty request — what the editor and the talkthrough bank both start from. `kind`
 *  picks the preset (defaultStyleIdFor); callers that don't know the topic get the house
 *  default, and the panel offers the switch if that turns out to be wrong for the set. */
export function emptyIllustration(seed: Partial<FrameIllustration> = {}, kind?: IllustrationTopicKind, registry: IllustrationRegistry = CODE_REGISTRY): FrameIllustration {
  return {
    requested: true, prompt: null, teachingIntent: null, provider: null, stylePreset: defaultStyleIdFor(kind, registry), styleVersion: null,
    assetUrl: null, localAssetId: null, animationPreset: null, generatedAt: null, seed: null, placement: null,
    brief: null, summary: null, referenceFrameId: null, referencePhoto: null, pairedAssetUrl: null, pairedTitle: null, ...seed,
  };
}

/** Recraft's prompting guidance, condensed — the "?" in the editor. Kept here so the tooltip
 *  and the preset can never disagree. */
export const PROMPTING_TIPS: readonly string[] = [
  "Name ONE concrete subject, first. Earlier words get the most weight.",
  "Describe structure, not adjectives: \"a padlock with a key half-turned\" beats \"a beautiful minimal padlock\".",
  "Say what it is DOING — a pose or an action reads instantly; a list of objects does not.",
  "Keep it short. V4.1 does its best work on a sentence, not a paragraph.",
  "Don't type the style. Riso inks, watercolor, ink line, background, no text — the preset already says all of it.",
  "For a metaphor, name the metaphor plainly: \"a leaky bucket labelled cash\", not the accounting concept.",
  "Skip the face. Describe a person from behind, from the side, or mid-stride instead — \"climbing the steps\", \"a back at a desk\" — the preset already avoids a detailed front-facing face, but naming the angle yourself gets a better composition.",
  "A real, specific place beats a generic one — name the actual landmark or prop if you have one in mind.",
  "Two pictures on two different slides that should pair up (an inside one and an outside one, say) — generate the first, then pick it as the \"rhymes with\" reference for the second and describe only what's different; don't try to fit both into one picture.",
  "If it came out cluttered, remove a noun. If it came out generic, add a verb.",
  "Regenerate keeps the words and rolls a new seed; edit the words when the subject is wrong.",
];
