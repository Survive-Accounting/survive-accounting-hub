# BRAND ANIMATION — BUILT 2026-08-31 (Lee's word: "build it now")

Both pieces shipped the same day the spec was parked. This doc is now the spec AND the map of
what exists:

- **Drawn wordmark — ATTEMPTED AND REJECTED (same day).** Hand-authored single-stroke glyphs +
  stroke-dashoffset draw-on shipped, Lee's verdict: "looks horrible." Deleted. The lesson: the
  draw-on idea needs REAL letterforms — traced from Lee's actual handwriting (the videos) — not
  invented curves; do not re-attempt without that input. The /learn intro instead uses the REAL
  SurviveWordmark (bolt boiling, same mark as the footer) with "Loading cram videos..." beneath,
  as a short boot splash on every arrival (`LearnIntro.tsx` — click-to-skip, reduced-motion
  never shows it). The boil IS the brand animation.
- **CampusGlobe** — `src/components/brand/CampusGlobe.tsx` + `src/lib/globe/`. Live tiers from
  campuses.campus_status (shell/backlog=dim · ready=brighter · live=lit+pulsing rings); arcs from
  REAL approved chapter claims only (zero pre-launch = zero arcs, honestly); school colours where
  known (SEC override, then reviewed DB colours). Placement: city-precise for the 119 seeded
  slugs (campus-geo.ts), state-centroid otherwise, legend says "positions approximate · +N not
  yet mapped". Landmass: vendored Natural Earth 110m countries (public/geo/land-110m.json —
  Antarctica dropped, one degenerate North Korea ring repaired: both make h3's polygonToCells
  throw). Lazy via IntersectionObserver; `eager` skips the gate for the lab and for offline
  rendering (no scrolling exists there). Mounted: /the-campaign hero (real arcs only) and
  /lab/brand (with a clearly-labelled sample-arcs preview toggle).
- **/lab/brand** — the globe standalone (with the labelled sample-arcs preview).
- NOT yet mounted: bio video intros (Remotion-side — drive the globe's `progress` per frame;
  the wordmark side waits on real traced letterforms) and /learn Review mode (possible later).

Original spec below, kept verbatim.

---

## 1. Animated wordmark (~an hour)

`survive` + `accounting` drawing itself on in the bolt style — handwritten, energetic, matching
what appears in the videos.

**Technique:** SVG paths with `stroke-dashoffset` animating from full to zero. Same approach as
the handwritten journal entry. Free, no dependencies, and it renders deterministically so
Remotion can turn it into a video clip.

```tsx
<AnimatedWordmark
  speed={1}
  progress={0..1}     // drive from a value, never wall-clock
  showAccounting      // "accounting" is harder to make look good — treat it
                      // as a separate, lighter-weight line beneath
/>
```

**Where it goes:**
- `/learn` on first arrival — full screen for a beat, then settles into the nav
- Bio video intros
- The campaign page hero

The nav already has a static version — this is the same mark, drawn.
**`accounting` is the hard part** — a long word in a style built for a short one. Try it smaller
and lighter beneath `survive` rather than matching its weight.

## 2. Campus globe (a real build)

A rotating hologram globe showing campuses, with bolts arcing between them as new ones launch.

**Library:** `react-globe.gl` (Three.js underneath, React component, supports arcs — which is the
whole point). `cobe` is smaller and gives the dot-matrix look but has no arcs.

```tsx
<CampusGlobe
  campuses={[...]}         // lit points, brightness by status
  arcs={[...]}             // bolts between recently launched campuses
  theme="hologram"
/>
```

**Driven by real data, not decoration:**
- Every campus in the system as a dim point
- Ready campuses brighter
- Launched campuses lit and pulsing
- An arc fires when a campus launches, or when a chapter claims a page
- Colors from the campus's own school colors where known

That turns it from an animation into a **live status display** — far more compelling than a
generic spinning globe, and it's the version worth showing a mentor.

**Look:** dot-matrix or low-poly mosaic, deep navy, glowing points, dark background. The BioShock
and Halo HUD reference is the right family — hard-edged type, a glowing element in darkness,
restraint everywhere else.

**Where it goes:**
- `/the-campaign` page hero — its best home
- Bio video intros
- Possibly `/learn` in Review mode

## 3. Tooling — Rive

If either grows into something with real interaction states (hover, idle, charging, active),
**Rive** is purpose-built for it: small files, runs on web, exports to video, state machines
rather than CSS you fight with. The cost is learning their editor — not worth it for these two,
worth reconsidering if brand animation becomes a recurring need.

**Skip After Effects and Lottie.** Better output, but hand-animation rather than generating from
data, and it's a separate craft.

## 4. Constraints (non-negotiable)

- Everything driven by a `progress` prop, **never wall-clock**, so it renders to video
- Globe **lazy-loads** — it's a Three.js payload and must not block first paint
- Both mount **standalone for preview**
- **No new dependencies for the wordmark** — SVG and CSS only

---

## Codebase pointers for whoever builds this (facts as of 2026-08-31, verify before use)

- Static wordmark: `SurviveWordmark` (`src/components/brand-cards/bolt-boil.tsx`) and
  `FitWordmark`/`CompactLockup` in `src/components/site/SiteHeader.tsx` — the drawn version must
  match this mark.
- School colors: SEC from `brand.tsx` (`SEC_SCHOOLS` — deliberate override of the DB; Ole Miss's
  DB pair is reversed), non-SEC from `schools.generated.ts`/campuses. Never invent a color.
- Globe data candidates: `src/lib/schools.generated.ts` (66 seeded campuses) + the `campuses`
  table (remember `.is("archived_at", null)`; 718 of 945 are archived). Launch/claim events for
  arcs: `expand_events` (`greek_*` kinds) and `campus_greek_chapters.claim_status` /
  `greek_chapter_claims`. Real counts only — the no-fake-numbers rule applies to the globe too.
- Lazy-load pattern: route files live in the client tree, so heavy deps must be `await import()`ed
  (see the flyer route's header comment for the precedent and the OOM story).
- House motion rules: `prefers-reduced-motion` respected everywhere (globe/wordmark need a static
  fallback frame); matchMedia in effects, never during render (SSR).
- New routes (e.g. a standalone preview page) must be registered in
  `src/lib/site-qa/manifest.ts` or the coverage test fails.
