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
  /** THE BRIEF (2026-09-05): Lee's spoken words, the AI's summary of the prompt it prepped
   *  (a title and three bullets), and the slide whose picture this one rhymes with. */
  brief?: string | null;
  summary?: { title: string; bullets: string[] } | null;
  referenceFrameId?: string | null;
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
  /** Recraft `controls`: the ground is black (stripped to alpha after generation — see
   *  recraft.server.ts), the palette is the house palette. An optional `weight` biases how much
   *  of each colour the model reaches for; white dominant, the rest occasional accents. */
  controls: { background_color: { rgb: [number, number, number] }; colors: { rgb: [number, number, number]; weight?: number }[] };
  /** The env var that may hold a Recraft custom style id for this preset. */
  styleIdEnv: string;
  defaultAnimation: AnimationPreset;
}

// SURVIVE WATERCOLOR v1 — the house default (Lee, 2026-09-05, on the monoline-on-black
// experiment: "white pencil drawn isn't going to work. We need SOME colour... watercolor
// maybe?... simple illustrations that help me teach, that's it... I don't think we want faces
// really. We can opt for behind the head... walking up the stairs to the NYSE"). A soft
// watercolor wash with a loose ink/pencil line under it — colour without going cartoonish, a
// clean readable silhouette so it still lands at a glance on a phone. People are staged so a
// detailed face is never needed — from behind, from the side, cropped — rather than drawn plain,
// which was v1/v2's fix for the same complaint and read as flat rather than actually avoided.
// Generated on WHITE, not black: Recraft's watercolor training is overwhelmingly "on paper," and
// a black ground fought the medium; white is also a cleaner subject-isolation ground for the same
// `removeBackground` cutout recraft.server.ts already does (any solid ground works — the cutout
// isn't a black-key, it's a general subject cutout), so nothing downstream ever sees a ground
// colour either way.
export const ILLUSTRATION_STYLES: Record<string, IllustrationStyle> = {
  "survive-watercolor": {
    id: "survive-watercolor",
    version: 1,
    label: "Survive Watercolor",
    provider: "recraft",
    model: "recraftv4_1",
    size: "1024x1024",
    promptPrefix: "A single illustration of ",
    promptSuffix: ", on a plain white background, filling most of the frame with only a small even margin around it. A loose, slightly imperfect ink or pencil outline, gently filled with a warm, muted watercolor wash — soft bleeding at the edges, a little visible paper texture, painterly but simple, a strong clear silhouette, at most two or three shapes so it reads instantly on a phone. If it includes a person, show them from behind, from the side, with their head turned away, or cropped out of frame — never a detailed front-facing face. No text, no logos, no signature, no photorealism, no glossy cartoon shading, no clip-art look.",
    controls: { background_color: { rgb: [255, 255, 255] }, colors: [{ rgb: [252, 163, 17], weight: 0.35 }, { rgb: [0, 107, 166], weight: 0.3 }] },
    styleIdEnv: "RECRAFT_STYLE_ID_WATERCOLOR",
    defaultAnimation: "boil",
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
  },
};
export const DEFAULT_STYLE_ID = "survive-watercolor";

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
export function isStaleIllustration(i: FrameIllustration | null | undefined): boolean {
  if (!i || !i.assetUrl) return false;
  const style = illustrationStyle(i.stylePreset);
  return i.styleVersion !== null && i.styleVersion < style.version;
}

/** A fresh, empty request — what the editor and the talkthrough bank both start from. */
export function emptyIllustration(seed: Partial<FrameIllustration> = {}): FrameIllustration {
  return {
    requested: true, prompt: null, teachingIntent: null, provider: null, stylePreset: DEFAULT_STYLE_ID, styleVersion: null,
    assetUrl: null, localAssetId: null, animationPreset: null, generatedAt: null, seed: null, placement: null,
    brief: null, summary: null, referenceFrameId: null, ...seed,
  };
}

/** Recraft's prompting guidance, condensed — the "?" in the editor. Kept here so the tooltip
 *  and the preset can never disagree. */
export const PROMPTING_TIPS: readonly string[] = [
  "Name ONE concrete subject, first. Earlier words get the most weight.",
  "Describe structure, not adjectives: \"a padlock with a key half-turned\" beats \"a beautiful minimal padlock\".",
  "Say what it is DOING — a pose or an action reads instantly; a list of objects does not.",
  "Keep it short. V4.1 does its best work on a sentence, not a paragraph.",
  "Don't type the style. Watercolor, ink line, background, no text — the preset already says all of it.",
  "For a metaphor, name the metaphor plainly: \"a leaky bucket labelled cash\", not the accounting concept.",
  "Skip the face. Describe a person from behind, from the side, or mid-stride instead — \"climbing the steps\", \"a back at a desk\" — the preset already avoids a detailed front-facing face, but naming the angle yourself gets a better composition.",
  "A real, specific place beats a generic one — name the actual landmark or prop if you have one in mind.",
  "Two pictures on two different slides that should pair up (an inside one and an outside one, say) — generate the first, then pick it as the \"rhymes with\" reference for the second and describe only what's different; don't try to fit both into one picture.",
  "If it came out cluttered, remove a noun. If it came out generic, add a verb.",
  "Regenerate keeps the words and rolls a new seed; edit the words when the subject is wrong.",
];
