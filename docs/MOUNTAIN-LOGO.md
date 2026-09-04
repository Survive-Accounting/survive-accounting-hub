# The mountain, made in Recraft

The mark between the v's. Recraft is the one AI tool that outputs **real vector SVG** rather than tracing a picture, which is what this needs: the mountain has to come back as a few closed shapes so school colours, the white keyline and the boil apply the way they do to the bolt.

## Setup

1. recraft.ai, sign in, **New project**.
2. In the right-hand panel set **Image type → Vector Illustration** (not Raster). This is the whole trick — raster gives a picture, vector gives paths.
3. Style: pick **Flat / Icon** if offered. Leave "detailed", "3D", "shadow" styles alone.
4. Size: **1:1**.

## The prompt

Paste this as written:

```
flat vector logo of a single mountain peak, front view, symmetrical simple geometry,
exactly three solid shapes: the sunlit left face, the shaded right face, and a snow cap
on the summit. hard straight edges, no gradients, no outlines, no shading, no texture,
no background, no text, no sky, no sun, no trees. two flat colors plus white snow.
centered, fills the frame.
```

Then generate 4 at a time and keep going until the silhouette reads at thumbnail size. Judgement: squint at it. If you can still tell it is a mountain at the size of a favicon, it works.

**Variations worth trying**, one line swapped in:

- `...with a second lower peak on the right` — a range instead of a triangle.
- `...with one stepped ridge on each slope` — the long-hike feel.
- `...tall narrow peak, steep sides` — better inside the wordmark's x-height.
- `...wide low peak, heavy base` — better as a standalone sticker.

## Getting it out

1. Hover the image you like → **Download → SVG**. (Free plan allows SVG export; if it offers PNG only, the image was generated in raster mode — regenerate with Image type set to Vector.)
2. Optional cleanup in Inkscape (already installed): open the SVG, `Ctrl+Shift+X` to see the XML, delete any background rectangle, then `Path → Union` within each colour so you end up with one path per colour. Save as **Plain SVG**.

## What to send me

The `.svg` file, with:

- **three closed paths at most** — lit face, shaded face, snow cap (two is fine if it has no snow)
- **solid fills, no strokes, no gradients, no clip paths, no `<image>` tag**
- no background rectangle

Anything else is fixable, it just costs a round trip. Drop the file anywhere and tell me the path, or paste the SVG source into the chat.

## Then

I convert those paths into the same ring structure the bolt uses (`lib/survive-mountain.ts`), so the mark gets: the two school colours per campus, the white keyline around the union, the hand-drawn boil, the wordmark's "i", the cursor, the OG image and the flyer, with nothing else to change. `/survive-bolt` gets it as a sixth mountain option next to the five coded ones, so you can compare before it goes anywhere near the site.

## If Recraft disappoints

Draw it. You already hand-drew the portrait and Inkscape is installed: marker on paper, photo, `Path → Trace Bitmap` (Brightness cutoff), `Path → Simplify` once or twice, delete everything but the three shapes. The wobble that comes with a real pen is what the boil animation was built to sit on top of, and no generator will reproduce it.
