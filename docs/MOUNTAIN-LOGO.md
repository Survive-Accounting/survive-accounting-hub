# The mountain — the mark between the v's

Aoraki / Mount Cook, which Lee has stood at, and which the reference got close to. Two things make it ours rather than a generic triangle:

- **The summit is not a point.** Aoraki's high point sits at the end of a short ridge, so the peak steps down to the right before the long slope starts. That single step is the silhouette's signature.
- **The two faces part.** The lit face and the shaded face are separated by a white gap, so the mark reads as a peak and as the opening of a tent at the same time. Lee: "it feels like you are looking into a tent."

## What already exists

Coded, in the repo, ready to use or to feed a generator as a reference:

| File | What it is |
|---|---|
| `public/brand/survive-mountain.svg` | the icon — lit face, shaded face, two snow caps, keyline |
| `public/brand/survive-mountain-cursor.svg` | the same peak cut into a pointer |
| `public/brand/mountain-preview.html` | icon, favicon size, cursor, wordmark, four campus colourways |

Every colour is a CSS variable with a brand fallback — `--sa-lit`, `--sa-shade`, `--sa-snow`, `--sa-keyline` — so a campus recolours the mark by setting two variables, exactly as the bolt does. See it at `/brand/mountain-preview.html` on the dev server.

## Making a better one in Recraft

**Which model.** Choose by name, not by number: only a model with **Vector** in its name outputs real SVG. A "Pro" model without "Vector" is raster and gives you a picture to trace, which is the thing to avoid.

- **Vector (4.1 Vector, or whatever the current plain vector entry is called)** — start here. Flat, few shapes, clean joins. It is what a three-shape logo wants.
- **Pro Vector** — more detail and more credits. Worth one round if the plain vector edges come out mushy, but it tends to add shading and extra shapes you then delete.
- Anything labelled only **Pro** or **Raster** — skip for this.

**Steps.**

1. recraft.ai → **New project**.
2. Right panel: **Image type → Vector Illustration**. Model → the Vector entry above. Size **1:1**.
3. Optional and worth doing: upload `public/brand/survive-mountain.svg` (or the ChatGPT image) as a **style reference / image reference** so it starts from the geometry rather than from scratch.
4. Prompt:

```
flat vector logo of Aoraki Mount Cook, single peak, front view, geometric and simple.
the summit steps down to the right off the high point instead of being a plain triangle.
exactly three solid shapes: a sunlit left face, a shaded right face, and a jagged snow cap
on the summit. the two faces are separated by a clean white gap so the shape also reads as
the opening of a tent. hard straight edges, no gradients, no outlines, no shading, no
texture, no background, no sky, no sun, no trees, no text. two flat colors plus white snow.
centered, fills the frame.
```

5. Generate four at a time. Judge them squinting at thumbnail size: if it still reads as a mountain at favicon size, it works.

**One line at a time, to explore:**

- `...with a second lower peak in front on the left` — the reference's two-peak look.
- `...with one stepped ridge on each slope` — the long-hike feel.
- `...tall and narrow, steep sides` — better inside the wordmark.
- `...wide and low, heavy base` — better as a sticker.
- `...the white gap between the faces is wider` — pushes the tent reading.

**Getting it out.** Hover the one you like → **Download → SVG**. If only PNG is offered, it was generated in raster mode; regenerate with Image type set to Vector.

**Optional cleanup in Inkscape** (already installed): open it, `Ctrl+Shift+X` for the XML editor, delete any background rectangle, then `Path → Union` within each colour so each colour is a single path. Save as **Plain SVG**.

## What to send me

The `.svg`, with:

- **three closed paths at most** — lit face, shaded face, snow cap (two is fine if it has no snow)
- **solid fills, no strokes, no gradients, no clip paths, no `<image>` tag**
- no background rectangle

Anything else is fixable, it just costs a round trip. Drop the file anywhere and tell me the path, or paste the SVG source into the chat.

## Then

I convert the paths into the ring structure the mark system already uses (`src/lib/survive-mountain.ts`), which gets it, with nothing else to change:

- the two campus colours, per school
- the white keyline around the union, and the gap between the faces
- the hand-drawn boil
- the wordmark's "i", the cursor, the favicon, the OG image, the flyer

It lands on `/survive-bolt` beside the five coded mountains so you can compare before it goes anywhere near the site. Then the trademark clearance on whichever wins.

## If Recraft disappoints

Draw it. You hand-drew the portrait and Inkscape is installed: marker on paper, photo, `Path → Trace Bitmap` (Brightness cutoff), `Path → Simplify` once or twice, delete everything but the three shapes. The wobble a real pen leaves is what the boil was built to sit on, and no generator reproduces it.
