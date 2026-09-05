// THE ILLUSTRATION SLOT — types and the style registry, on their own so the server fn, the
// editor, PhoneFrame and (one day) a canvas element can import them without dragging plan.ts
// onto the canvas render path (ad-kinds.ts pattern; the tdz-graph ratchet). Function
// declarations and plain consts only.
//
// THE PHILOSOPHY (Lee, polish pass): Recraft draws the BASE picture; our renderer owns the
// motion (the Survive Boil). Illustrations are occasional — 1–3 per Short, never automatic.
// An idea dictated in the talkthrough is BANKED here as `requested: true` with a brief, and
// nothing is generated until Lee presses Generate.

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
}

export interface IllustrationPlacement { x: number; y: number; w: number }

/** Which slides take a picture (Lee, 2026-09-05): Memorize This / a phrase, Cheat Code,
 *  Deeper Idea / a tip, and a blank slide — where the picture IS the slide (watermark,
 *  picture, optional camera, nothing else). */
export const ILLUSTRATION_KINDS = ["phrase", "cheat", "tip", "blank"] as const;
export function canIllustrate(kind: string): boolean { return (ILLUSTRATION_KINDS as readonly string[]).includes(kind); }

/** Dead centre on a blank slide (a touch above the middle so the caption rail stays clear);
 *  under the card elsewhere — only asked for when a picture is placed by hand. */
export function defaultPlacement(kind: string): IllustrationPlacement {
  return kind === "blank" ? { x: 0.5, y: 0.44, w: 0.72 } : { x: 0.5, y: 0.62, w: 0.5 };
}
/** A placed picture, or a blank slide's — the layer that sits at a spot rather than in the band. */
export function isPlaced(kind: string, i: FrameIllustration | null | undefined): boolean {
  return !!i && (kind === "blank" || !!i.placement);
}

export const ANIMATION_PRESETS = ["boil", "boil-calm", "none"] as const;
export type AnimationPreset = (typeof ANIMATION_PRESETS)[number];
export const ANIMATION_LABEL: Record<AnimationPreset, string> = { boil: "Survive boil", "boil-calm": "calm boil", none: "still" };
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
  /** Recraft `controls`: the ground is black, the palette is the house palette. */
  controls: { background_color: { rgb: [number, number, number] }; colors: { rgb: [number, number, number] }[] };
  /** The env var that may hold a Recraft custom style id for this preset. */
  styleIdEnv: string;
  defaultAnimation: AnimationPreset;
}

// SURVIVE DREAMSTATE v1. Written the way Recraft's own guide says a prompt works: subject
// first (the prefix ends where Lee's words begin), then the medium and the line behaviour,
// then the constraints as in-prompt negatives (V4.1 has no negative_prompt), then the
// background reinforced by the controls. Structure, not adjectives.
export const ILLUSTRATION_STYLES: Record<string, IllustrationStyle> = {
  "survive-dreamstate": {
    id: "survive-dreamstate",
    version: 1,
    label: "Survive Dreamstate",
    provider: "recraft",
    model: "recraftv4_1",
    size: "1024x1024",
    promptPrefix: "A single hand-drawn illustration of ",
    promptSuffix: ", centered and isolated on a solid black background with generous empty space around it. Monoline white ink lines with a slightly irregular hand-drawn outline, a strong simple silhouette, minimal flat fill in one or two colours, playful and a little dreamlike, immediately readable on a phone. No shading, no gradients, no texture, no text, no background objects, no scenery.",
    controls: { background_color: { rgb: [0, 0, 0] }, colors: [{ rgb: [255, 255, 255] }, { rgb: [252, 163, 17] }, { rgb: [0, 107, 166] }] },
    styleIdEnv: "RECRAFT_STYLE_ID_DREAMSTATE",
    defaultAnimation: "boil",
  },
};
export const DEFAULT_STYLE_ID = "survive-dreamstate";

/** The preset by id; null or unknown → the house default. */
export function illustrationStyle(id: string | null | undefined): IllustrationStyle {
  return (id && ILLUSTRATION_STYLES[id]) || ILLUSTRATION_STYLES[DEFAULT_STYLE_ID];
}

/** The full prompt the provider sees. Lee types the subject; the preset supplies everything
 *  else; the teaching intent rides last, where Recraft gives it the least weight — it is
 *  context for the subject, not a second subject. */
export function composeIllustrationPrompt(style: IllustrationStyle, visual: string, teachingIntent: string | null): string {
  const subject = visual.trim().replace(/[.\s]+$/, "");
  const intent = (teachingIntent ?? "").trim().replace(/[.\s]+$/, "");
  return style.promptPrefix + subject + style.promptSuffix + (intent ? " The idea it illustrates: " + intent + "." : "");
}

/** Made with an older registry version than the preset has now. */
export function isStaleIllustration(i: FrameIllustration | null | undefined): boolean {
  if (!i || !i.assetUrl) return false;
  const style = illustrationStyle(i.stylePreset);
  return i.styleVersion !== null && i.styleVersion < style.version;
}

/** A fresh, empty request — what the editor and the talkthrough bank both start from. */
export function emptyIllustration(seed: Partial<FrameIllustration> = {}): FrameIllustration {
  return {
    requested: true, prompt: null, teachingIntent: null, provider: null, stylePreset: DEFAULT_STYLE_ID, styleVersion: null,
    assetUrl: null, localAssetId: null, animationPreset: null, generatedAt: null, seed: null, placement: null, ...seed,
  };
}

/** Recraft's prompting guidance, condensed — the "?" in the editor. Kept here so the tooltip
 *  and the preset can never disagree. */
export const PROMPTING_TIPS: readonly string[] = [
  "Name ONE concrete subject, first. Earlier words get the most weight.",
  "Describe structure, not adjectives: \"a padlock with a key half-turned\" beats \"a beautiful minimal padlock\".",
  "Say what it is DOING — a pose or an action reads instantly; a list of objects does not.",
  "Keep it short. V4.1 does its best work on a sentence, not a paragraph.",
  "Don't type the style. Black background, hand-drawn line, no text, no scenery — the preset already says all of it.",
  "For a metaphor, name the metaphor plainly: \"a leaky bucket labelled cash\", not the accounting concept.",
  "If it came out cluttered, remove a noun. If it came out generic, add a verb.",
  "Regenerate keeps the words and rolls a new seed; edit the words when the subject is wrong.",
];
