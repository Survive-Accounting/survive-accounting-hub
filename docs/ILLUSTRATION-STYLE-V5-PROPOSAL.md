# Survive Illustrations — v5 proposal

Lee's workshop output (2026-09-06) against `docs/STYLE-GUIDE-2026-09-06.md`. Maps to its §6:
this replaces the `promptSuffix` and `controls.colors` of `survive-watercolor` (or becomes a
new style id), plus changes to `BRIEF_SYSTEM`. Applied to the code the same night — see
`src/components/blastoff/illustration.ts` (`survive-riso`) and `illustration-brief.ts`.

---

## Diagnosis — three problems, only one of which is the medium

### 1. Watercolor cut out and placed on black is fighting itself

Watercolor is a paper medium. What makes it read as watercolor is white paper showing through
a translucent wash — the paper *is* the light source. The pipeline generates on white, strips
the background, and drops the result onto `#000000`. Every edge that made it look like
watercolor gets cut off, and the translucency now has darkness behind it instead of light.
That's most of why the color "feels off" despite the prompt being carefully written.

Two coherent fixes:

**Option A — give the wash its paper back.** Illustrations sit on a cream card (`#F5EFE6`, or
a warmer paper tone) rather than directly on the stage. Keep watercolor. Cheapest change, and
it makes the existing library look better immediately.

**Option B — switch to a medium built for dark grounds.** Gouache or risograph. Both are
opaque, both hold saturated color against black, both have visible texture. This is the bigger
change and it's the one that also solves problems 2 and 3.

### 2. Gold and blue mix to mud — this is color theory, not model failure

`#FCA311` (orange) and `#006BA6` (blue) are near-complementary. In a *flat* medium they sit
next to each other and pop. In a *translucent* medium, wherever two washes overlap or blend,
complementaries neutralize — you get brown-gray. The dull, slightly dirty quality in the
Internal Users illustration is exactly this.

Also: the weights are 0.35 + 0.30 = 0.65, leaving 35% of the palette to Recraft's discretion.
That free third is where unplanned color enters.

### 3. "Vintage educational magazine illustration" is the textbook reference

The guide asks in question 1 whether this is still right. It isn't — it's literally the
aesthetic Lee says he doesn't want. Mid-century educational illustration is *the* textbook look.

### 4. The stated goal (dreamy, surreal) is nowhere in the system

The suffix asks for "one clear subject, simplified shapes, strong readable silhouette" and the
brief says "a real, specific place or prop beats a generic one." That's a system tuned for
literal clarity. Surreality, if wanted, has to come from the **subject brief** — scale
distortion, impossible space, floating objects — not from the style suffix. Right now nothing
produces it.

### 5. The pair rule is being violated

Internal Users and External Users are supposed to be a matched pair (§2: "two full
single-subject pictures that match in rendering, world and cast"). They don't match on any
axis — one is a seated figure at human scale in near-total blue, the other is an architectural
exterior in near-total gold with a bull and a tiny figure. Different cast, different scale,
different palette.

Whatever style is chosen, **pair enforcement needs to actually run** — same seed, same cast,
and a palette that can't drift to one accent per image.

---

## Recommendation: risograph, on the black stage

Riso solves the specific problems above and matches the audience:

- **Opaque spot inks** — holds color against black, no mud from overlap
- **Limited palette by definition** — riso is printed in 2–3 inks; the constraint is native to
  the medium rather than something the prompt has to police
- **Visible grain and slight misregistration** — texture without wash unevenness
- **Contemporary to students** — it's the look of show posters, album art, zines, indie games.
  Not a textbook, not corporate, not AI-slick
- **Overprint = free third color** — where two inks overlap you get a genuine third, which is
  the "dreamy" quality without translucency's downsides

### Proposed palette controls

| Control | Value |
|---|---|
| Background | white `255,255,255` (stripped) |
| Accent 1 — Survive gold | `252,163,17` weight **0.45** |
| Accent 2 — Survive blue | `0,107,166` weight **0.35** |
| Accent 3 — cream paper | `245,239,230` weight **0.20** |

Total = 1.00. No free third for the model to fill with whatever it likes. The cream is what
gives the picture an implied paper even on black.

If a third *hue* is wanted rather than a neutral, the deep-question sky (`#7DD3FC`) is already
in the system and sits analogous to the blue rather than fighting the gold.

### Proposed prompt suffix (v5)

> , on a plain white background, filling most of the frame with only a small even margin
> around it. Risograph print illustration: two or three flat spot inks, printed with visible
> grain and a slight off-register shift between layers, where overlapping inks create a third
> deeper color. Bold simplified shapes with a confident hand-drawn contour in warm dark brown —
> never black or near-black. Flat opaque fills, no gradients, no glossy shading, no
> photorealism. Every fill sits clearly between the two extremes: never true black or
> near-black (a suit, a shadow), and never white or near-white either (skin, a pale shirt) — a
> fill that pale is indistinguishable from the white background and gets cut away with it,
> leaving a hole. Skin and faces are always a warm tan, light brown, or warm peach, visibly
> darker than the white page. High contrast, a strong readable silhouette, one clear subject
> with minimal secondary objects and no unnecessary detail, at most two or three shapes total —
> designed to be immediately recognizable at small mobile-screen size, on screen for as little
> as two seconds. Modern editorial illustration, poster composition. If it includes a person,
> show them from behind, from the side, with their head turned away, or cropped out of frame —
> never a detailed front-facing face. No text, no logos, no signature, no clip-art look.

**What was kept and why:** every empirical rule from v1–v4 survives verbatim — the brown
outline, the no-black fill, the no-near-white fill and named skin tones, the two-or-three
shapes, the no-front-face, the phone-size line. Those were earned on real failures and the
medium change doesn't retire any of them.

**What changed:** watercolor wash → flat riso inks; "no splatters / muddy / bleeding" clauses
removed (they were policing a problem the new medium doesn't have); "vintage educational
magazine" → "modern editorial illustration, poster composition"; overprint added as the source
of depth.

Version bump to **5**. Old pictures show stale and regenerate from the same subject.

---

## Two changes to `BRIEF_SYSTEM`

### 1. Add a surreality allowance

Current rules produce literal scenes. Add:

> Scale and space may be pushed: an object much larger than life, a figure standing on or
> inside something that couldn't hold them, an ordinary thing floating or repeating. Use this
> to make the idea strange enough to remember, never to make it unclear — the one clear subject
> rule still governs.

This is where "dreamy" actually gets produced. Use it on maybe one illustration in three so it
stays a surprise.

### 2. Enforce the pair rule mechanically

The Internal/External pair drifted. In `BRIEF_SYSTEM`, when briefing the second of a pair,
require the brief to restate the first's cast, scale, and dominant accent explicitly rather
than only passing a seed.

---

## On illustrating Lee

**Don't put Lee's face in the illustrations.** He's already on screen in the camera bubble in
every video — an illustrated Lee competes with the real one on the same frame, and character
consistency across generations is the single weakest thing image models do. The no-face rule
is also empirically earned.

**Do add a recurring student character.** Same figure across every illustration: consistent
hair, consistent clothing, always from behind / side / cropped. Not Lee — the student. Reasons:

- It's the differentiation Lee is after. Nobody in exam prep has a character.
- The audience identifies with the student, not the tutor.
- It works *with* the no-face rule instead of against it — a character defined by silhouette,
  posture, and a signature garment is more consistent across generations than a face ever
  would be.
- Lee is already the human presence via the camera. The illustration should be the world the
  student moves through.

Define the character once in `BRIEF_SYSTEM` as a fixed description injected into every
people-bearing subject — e.g. hair, one signature clothing item in a fixed accent color,
backpack or ledger as a recurring prop.

**One exception worth considering:** the Meet Your Tutor detour card (coral accent) is the one
slide where an illustrated Lee makes sense, because he's the subject rather than the narrator.
A single hand-drawn portrait, made once by a human, not generated per-video. The style guide
notes a "learn lime" portrait ink already parked — that's probably this.

---

## Strategy shorts get their own style

Per §6, a second entry in `ILLUSTRATION_STYLES`. The reps/chairs/founder content has a
different audience and can be looser and more surreal than exam content — which has to stay
legible under time pressure. Keep watercolor as the id for it if it's liked; it's a good
contrast to riso, and it means the existing library isn't wasted.

---

## Answers to the guide's open questions

1. **Reference** — replace "vintage educational magazine" with modern editorial / risograph
   poster.
2. **Third color** — yes, but as cream (neutral) rather than a third hue, so the weights close
   at 1.00 and nothing is left to chance.
3. **Strategy shorts** — separate style. See above.
4. **Banned subjects** — yes: money piles, handshakes, lightbulbs, gears, target with arrow,
   ladder of success, jigsaw pieces. Add to `BRIEF_SYSTEM` as an explicit reject list; these
   are what a model reaches for by default and they are the exact opposite of remarkable.
5. **No-face rule** — permanent. Recurring character instead.
6. **Canned lines** — no retirements. The bio wants a fourth: "I taught this course." Shorter
   than the others and it lands differently.
