# Survive Illustrations — v6 direction + live style editor

Lee's second workshop output (2026-09-06, the same night v5 shipped as `survive-riso`). Two
parts: the aesthetic direction, and the spec for a style editor so the style can be changed
from the app instead of through a prompt every time.

---

# Part 1 — The direction

## The tension in the references, and the synthesis

Psychedelic and Mad Men pull opposite ways. Psychedelic poster art is organic, warped,
deliberately hard to read — illegibility was the point, it filtered for the in-crowd. Mad
Men-era commercial art is geometric, structured, controlled, built to communicate in one glance.
Pick both without resolving them and you get mush.

But they meet at a real historical moment: **1968–1973, when advertising absorbed psychedelia.**
Airline posters, corporate annual reports, album sleeves for major labels. Confident modernist
composition, mid-century figures, but rendered in psychedelic ink — hot saturated spot colors,
glowing halos, flowing edges. That's "important creative professionals in a big city, with an
altered edge," and it's a coherent style rather than two styles fighting.

**The operating rule that keeps the system intact:**

> Psychedelic in **color, texture, and light**. Modernist in **composition, figure, and
> silhouette**.

The entire pipeline rests on "readable in two seconds on a phone." Warp the color, never the
structure.

## Why this fits better than what we have

**The black stage becomes an asset.** Watercolor fought the black ground. Psychedelic poster art
is *built* for dark — saturated inks glowing against darkness is the whole visual language. The
thing that was breaking v4 becomes the thing that makes v6 work.

**Riso and psychedelic are the same production process.** Both are limited spot inks, flat,
off-register, high contrast. So the v5 riso recommendation and this direction aren't
alternatives — riso is *how* you print psychedelic. Keep the process, change the palette
temperature and the light.

**"Important people" comes from silhouette, not faces.** This is lucky, because the no-face rule
is empirical and permanent. Tailoring, posture, stride, scale against architecture — the Mad
Men title sequence is literally silhouettes and nobody doubts those men are somebody. Confidence
reads from the shoulders and the walk.

## Palette

The current gold and blue survive but the temperature shifts. Add heat.

| Control | Value | Weight |
|---|---|---|
| Survive gold | `252,163,17` | 0.35 |
| Hot magenta | `230,57,132` | 0.25 |
| Survive blue | `0,107,166` | 0.25 |
| Deep violet | `76,44,130` | 0.15 |

Total 1.00. Magenta over gold overprints to a burnt orange-red; magenta over blue gives violet;
violet against gold is the classic psychedelic vibration. Nothing is left to the model's
discretion.

Keep cream (`#F5EFE6`) available for the figure's paper-white highlights so nothing goes
near-white and gets cut by the background remover.

## Proposed prompt suffix (v6)

> , on a plain white background, filling most of the frame with only a small even margin around
> it. Late-1960s psychedelic screenprint poster illustration in a modernist composition: three or
> four flat saturated spot inks, printed with visible grain and a slight off-register shift,
> where overlapping inks create a third deeper color. A glowing halo or concentric aura radiating
> behind the subject. Confident hand-drawn contour in warm dark brown — never black or
> near-black. Flat opaque fills, no gradients, no glossy shading, no photorealism. Every fill sits
> clearly between the two extremes: never true black or near-black (a suit, a shadow), and never
> white or near-white either (skin, a pale shirt) — a fill that pale is indistinguishable from the
> white background and gets cut away with it, leaving a hole. Skin and faces are always a warm
> tan, light brown, or warm peach, visibly darker than the white page. Composition is structured
> and geometric with a strong readable silhouette — the psychedelia is in the color and the
> light, never in warped or hard-to-read shapes. One clear subject with minimal secondary objects
> and no unnecessary detail, at most two or three shapes total — designed to be immediately
> recognizable at small mobile-screen size, on screen for as little as two seconds. If it
> includes a person, show them from behind, from the side, with their head turned away, or
> cropped out of frame — never a detailed front-facing face. No text, no logos, no signature, no
> clip-art look.

Every empirical rule from v1–v4 is preserved verbatim. Only the medium, palette, and light
changed.

## Changes to `BRIEF_SYSTEM`

**Cast direction — replace the current "reads young" rule:**

> People are sharp young professionals in a major city — New York, Chicago, London. Tailored,
> confident, mid-stride or mid-work. Convey standing through posture, silhouette, tailoring, and
> scale against architecture, never through facial expression. They are creative or startup
> professionals, not corporate drones and not students at a desk.

**Setting:**

> Favor a real urban setting with recognizable architecture, elevated viewpoints, glass, steel,
> and street level — a specific place beats a generic office.

**Surreality allowance (from v5, still applies):**

> Scale and space may be pushed: an object much larger than life, a figure standing on or inside
> something that couldn't hold them, an ordinary thing floating or repeating. Never at the cost
> of readability.

## One legal flag

Generic psychedelic poster style is fine — nobody owns an aesthetic. **Grateful Dead iconography
is not.** Dancing bears, Steal Your Face, skull-and-roses, and the 13-point bolt are actively
protected marks. Add them to the reject list in `BRIEF_SYSTEM` explicitly, because a model given
"Grateful Dead" in any form will reach straight for them.

Worth noting given the wordmark already uses a bolt: keep the Survive bolt visually distinct
from the Steal Your Face bolt and you're fine.

**Reject list additions:** dancing bears, skull and roses, Steal Your Face, 13-point lightning
bolts, tie-dye spirals, plus the v5 bans (money piles, handshakes, lightbulbs, gears,
target-and-arrow, ladders, jigsaw pieces).

## Version

Bump to **6**. Old pictures show stale and regenerate from the same subject.

---

# Part 2 — Live style editor

Build a style editor so the illustration style can be changed from the app and regenerated,
without a code change each time.

**Where:** admin-only page in the app, under /admin/illustrations.

**What it edits** — the fields currently hardcoded in
`src/components/blastoff/illustration.ts`:

- `promptPrefix` — text field
- `promptSuffix` — large textarea, monospace, the main thing that will be edited
- `controls.colors` — repeatable rows of hex + weight, with a **live sum indicator** that turns
  red above 1.0 since Recraft rejects the call
- `model`, `size`
- `motion` (default animation)
- Style `id`, `name`, and `version`

**Storage:** move `ILLUSTRATION_STYLES` from hardcoded to DB-backed, seeded with the current
entries so nothing breaks. Keep `DEFAULT_STYLE_ID` configurable from this page.

**Version bumping:** a "Save as new version" button that increments the version and marks all
existing illustrations generated under the old version as stale (the existing stale mechanism
already handles the rest). Also a "Save without bumping" for typo fixes that shouldn't
invalidate the library.

**Test panel — the important part.** On the same page:
- A subject sentence input
- A "Generate 4" button that runs the current unsaved draft against that subject four times and
  shows results side by side
- A background-removed preview **on the actual black stage**, at true phone size, so the judging
  is of what students see rather than a 1024px square on white
- Buttons to try the same subject against any saved version for comparison

**Regeneration:** a "Regenerate all stale" action with a count and a confirm, plus
per-illustration regenerate from wherever they're listed today.

**Multiple styles:** the page should support creating a second style entry (for strategy shorts)
rather than only editing the default.

**Also editable from here** — `BRIEF_SYSTEM` in `illustration-brief.ts`, as a textarea. It's the
other half of what determines how pictures look; adjusting the cast direction should not need a
prompt each time.
