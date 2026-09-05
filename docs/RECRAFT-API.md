# Recraft API — contract, pricing, prompting (researched 2026-09-04)

# Recraft API — current official contract (verified 2026-09-04)

Sources: the official docs (`https://www.recraft.ai/docs/api-reference/*`, fetched as raw `.md` so nothing was summarized away) and the live OpenAPI spec served by the API host (`https://external.api.recraft.ai/doc/spec/internal/externalapi/api.yaml`, JSON, `openapi: 3.0.3`, title "recraft.ai external api"). Where the spec exposes something the docs pages do not, it is marked **[spec-only]**.

## 1. Base URL and auth

| Fact | Value | Source |
|---|---|---|
| Base URL | `https://external.api.recraft.ai/v1` (spec `servers[0].url` = `https://external.api.recraft.ai`) | https://www.recraft.ai/docs/api-reference/getting-started.md |
| Auth header | `Authorization: Bearer RECRAFT_API_TOKEN` (spec: `securitySchemes.auth0 = {type: http, scheme: bearer}`) | https://www.recraft.ai/docs/api-reference/endpoints.md |
| Key issuance | `https://app.recraft.ai/profile/api` → "Generate" (only if API-unit balance > 0); multiple tokens share one balance | getting-started.md |
| OpenAI SDK compatible | `OpenAI(base_url='https://external.api.recraft.ai/v1', api_key=...)`; non-standard params via `extra_body` | getting-started.md, endpoints.md |
| Swagger UI | `https://external.api.recraft.ai/doc/#/` | https://www.recraft.ai/docs/api-reference/swagger.md |
| Input formats | Every image-taking endpoint accepts `multipart/form-data` (file fields) **or** `application/json` (URL / `data:image/...;base64,...` URL) | endpoints.md "Image inputs: multipart or JSON" |

## 2. Endpoints (all `POST` unless noted)

From endpoints.md and the spec `paths`:

- `/v1/images/generations` — text-to-image; plus `/v1/images/generations/raster` and `/v1/images/generations/vector` (same body, server rejects the wrong model/style type)
- `/v1/styles` — create style; **[spec-only]** `GET /v1/styles` (list), `GET /v1/styles/{style_id}`, `DELETE /v1/styles/{style_id}`, `GET /v1/styles/basic` (curated styles with `style_id`, `style`, `model`)
- `/v1/images/imageToImage`, `/inpaint`, `/outpaint`, `/replaceBackground`, `/generateBackground`, `/eraseRegion`, `/variateImage`
- `/v1/images/vectorize`, `/v1/images/removeBackground`, `/v1/images/crispUpscale`, `/v1/images/creativeUpscale`
- `/v1/images/explore`, `/v1/images/explore/similar`, `/v1/prompts/enhance`
- `GET /v1/users/me` → `{"credits": 1000, "email": ..., "id": ..., "name": ...}`
- **[spec-only]** `GET /v1/models` (id, name, pricing.image), `/v1/images/clarityUpscale`, `/v1/images/generativeUpscale`, `/v1/colors/optimize`

## 3. Image generation request body — `POST /v1/images/generations`

Source: https://www.recraft.ai/docs/api-reference/endpoints.md ("Generate image › Parameters") unless noted.

| Field | Type / default | Notes |
|---|---|---|
| `prompt` (required) | string | Max length 10,000 chars for V4 Styles / V4 / V4.1; 1,000 for V3 / V2 (appendix.md) |
| `n` | int, default 1 | "must be between 1 and 6" |
| `model` | string, default `recraftv4_1` | Defaults to `recraftv4_styles` when style references are attached. Allowed: `recraftv4_1`, `recraftv4_1_vector`, `recraftv4_1_pro`, `recraftv4_1_pro_vector`, `recraftv4_1_utility`, `recraftv4_1_utility_vector`, `recraftv4_1_utility_pro`, `recraftv4_1_utility_pro_vector`, `recraftv4`, `recraftv4_vector`, `recraftv4_pro`, `recraftv4_pro_vector`, `recraftv4_styles`, `recraftv4_styles_vector`, `recraftv4_styles_pro`, `recraftv4_styles_pro_vector`, `recraftv3`, `recraftv3_vector`, `recraftv2`, `recraftv2_vector` |
| `size` | string or null | `WxH` or `w:h`; "If not specified, the size is auto-selected based on the prompt." Sizes per model in §4 |
| `style` | string or null | V2/V3 only in practice: a **curated style display name**, e.g. `"Hand-drawn"`, `"Photorealism"`, `"Vector art"`, `"Line art"` (styles.md, examples.md). V4/V4.1 do not use named styles |
| `style_id` | UUID or null | Custom style (from `/v1/styles` or copied from the web app). Mutually exclusive with style references |
| `style_match` | `regular` \| `precise` \| `flexible` | `regular` = V2/V3; `precise` (default) / `flexible` = V4/V4.1. Overrides the value stored on the style |
| `style_references` (multipart) / `style_reference_urls` (JSON) | files / array of strings | 1–10 PNG/JPG/WEBP, ≤10 MB each, ≤64 MB total. Server creates a private style, applies it, returns its `style_id`; billed as style creation + generation |
| `negative_prompt` | string or null | **V2 / V3 models only** |
| `random_seed` | int or null | "Seed for reproducible generation." (spec: uint32) |
| `response_format` | `url` (default) \| `b64_json` | |
| `text_layout` | array | V3 only — word + 4-point bbox |
| `controls` | object | `colors` (≤10 `{rgb:[r,g,b], weight?}`), `background_color` (`{rgb:[r,g,b]}`), `artistic_level` int `[0..5]` (V3 only), `no_text` bool (V3 only). V4/V4.1: "Partial: `colors` and `background_color`" (models/recraft-v4-1.md) |
| `substyle` | enum **[spec-only]** | Still in `GenerateImageRequestBase` in the OpenAPI spec (`ImageSubStyle` enum incl. `hand_drawn`, `hand_drawn_outline`, `line_art`, `engraving`, `linocut`, `pencil`-type values, …) but **no longer documented on the endpoints page**; the docs now steer V2/V3 users to the named `style` and everyone else to `style_id`. Treat as legacy |
| `image_format` | `png` \| `webp` **[spec-only]** on generation; documented only in the `variateImage` example (examples.md) |

Models note (https://www.recraft.ai/docs/api-reference/models/overview.md): `_vector` → SVG output; `_pro` → 2K raster; `_utility` (V4.1 only) → "clean, predictable images with flat lighting and simple composition"; `_styles` → always requires a style.

## 4. Sizes (https://www.recraft.ai/docs/api-reference/appendix.md)

- **V4 Styles / V4.1 / V4.1 Utility / V4 (1K):** `1:1`=`1024x1024`, `2:1`=`1536x768`, `1:2`=`768x1536`, `3:2`=`1280x832`, `2:3`=`832x1280`, `4:3`=`1216x896`, `3:4`=`896x1216`, `5:4`=`1152x896`, `4:5`=`896x1152`, `6:10`=`832x1344`, `14:10`=`1280x896`, `10:14`=`896x1280`, `16:9`=`1344x768`, `9:16`=`768x1344`
- **Pro variants (2K):** `2048x2048`, `3072x1536`, `1536x3072`, `2560x1664`, `1664x2560`, `2432x1792`, `1792x2432`, `2304x1792`, `1792x2304`, `1664x2688`, `2560x1792`, `1792x2560`, `2688x1536`, `1536x2688`
- **V2 / V3:** `1024x1024`, `2048x1024`, `1024x2048`, `1536x1024`, `1024x1536`, `1365x1024`, `1024x1365`, `1280x1024`, `1024x1280`, `1024x1707`, `1434x1024`, `1024x1434`, `1820x1024`, `1024x1820`
- **All `_vector` models:** aspect ratios only (`1:1` … `9:16`), no pixel sizes

## 5. Response shape

Spec `GenerateImageResponse` (required: `created`, `data`, `credits`):

```json
{
  "created": 1725000000,
  "credits": 35,
  "data": [
    { "image_id": "uuid", "url": "https://...signed...", "b64_json": "<only when response_format=b64_json>", "revised_prompt": "..." }
  ],
  "style_id": "uuid  <- present only when style references were attached"
}
```

Single-image endpoints (`vectorize`, `removeBackground`, `crispUpscale`, `creativeUpscale`, `eraseRegion`) return `ProcessImageResponse`: `{"created", "credits", "image": {"image_id", "url" | "b64_json"}}` — docs examples read `response['image']['url']`.

`/v1/styles` returns `{"id": "229b2a75-…", "style": "any", "creation_time": "...", "is_private": true, "credits": 5}` (endpoints.md).

**URL expiry** (appendix.md "Policies"): "All generated images are currently stored for approx. 24 hours"; URLs are public, unauthenticated, cryptographically signed — "restoring lost links is nearly impossible". Download immediately or use `b64_json`.

## 6. Transparent background / background removal

- **No transparency flag on generation.** The generation body has only `controls.background_color` (`{"rgb":[0,0,0]}` for black); nothing in docs or spec produces alpha directly from a prompt.
- **`POST /v1/images/removeBackground`** — described in getting-started.md as "produce a transparent-background cutout of the subject". Input `file` (multipart) or `image_url` (JSON); PNG/JPG/WEBP **or SVG**; ≤10 MB, ≤16 MP, max side 4096 px, min side 256 px. Raster in → raster out; SVG in → SVG out. Only documented param: `response_format` (`url`|`b64_json`). **[spec-only]** `image_format` (`png`|`webp`) is also accepted (`ProcessImageRequestBase`) — send `png` to be safe about alpha. Source: https://www.recraft.ai/docs/api-reference/endpoints.md
- `replaceBackground` / `generateBackground` exist but are V3-only prompt-driven background swaps, not transparency.
- **In production (2026-09-05):** `recraft.server.ts`'s `generate()` does exactly this — one `/images/generations` call, then one `image_url`-based `/images/removeBackground` call on the result, before anything is downloaded or stored. Every stored illustration is a transparent PNG; the black ground never leaves the two Recraft calls. `IllustrationResult.credits` is the sum of both calls' billing.

## 7. Vector / SVG output

- Any `_vector` model returns SVG from `/v1/images/generations` (or use `/v1/images/generations/vector` to have the server reject raster models/styles). V2/V3 curated `Vector art`, `Line art`, `Icon`, etc. are SVG styles (styles.md).
- **`POST /v1/images/vectorize`** — raster (PNG/JPG/WEBP, same size limits as above) → SVG; documented param only `response_format`. **[spec-only]** extras: `color_reduction` on/off, `max_num_colors`, `max_num_shapes`, `limit_num_shapes`, `return_gradients`, `shape_stacking` (`cut_out`|`hierarchical`), `small_shape_filter`, `strict_color_palette` (array of RGB triples), `svg_compression`. Source: endpoints.md + spec `VectorizeImageRequestBase`.

## 8. Create style — `POST /v1/styles` (https://www.recraft.ai/docs/api-reference/endpoints.md "Create style")

| Field | Notes |
|---|---|
| `files` (multipart, any field name) / `image_urls` (JSON) | PNG/JPG/WEBP, max 10 images, ≤10 MB each, ≤64 MB total. At least one of `files`, `image_urls`, `source_styles` required |
| `model` | default `recraftv4_styles`; the style "must be used with a matching model at generation time" (styles.md) |
| `match` | stored on the style: `regular` (V2/V3 default) / `precise` (V4/V4.1 default) / `flexible` |
| `style` | base style: `vector_illustration` (all), `any` (V4/V4.1), `realistic_image` / `digital_illustration` (V2/V3), `icon` (V2 only). Defaults: `vector_illustration` for vector models, `realistic_image` for V2/V3 raster, `any` for V4/V4.1 raster |
| `image_weights`, `prompt`, `palette` (`{colors:[{rgb,weight}], background_color:{rgb}}`) | all models |
| `source_styles`, `source_style_weights`, `mix_policy` (`PaletteMatch`|`MaxWeight`) | V2/V3 only |

Returns `id` (UUID) — pass it as `style_id`. V4 Styles reference guidance (https://www.recraft.ai/docs/api-reference/models/recraft-v4-styles.md): "similar references sharpen the match, diverse ones widen the range"; `precise` "follows the style meticulously, holding every detail: rendering technique, color, composition, and lighting". `style_id` also accepts IDs copied from the web app (own / public / shared styles).

## 9. Rate limits (https://www.recraft.ai/docs/api-reference/appendix.md)

"image generation rates are defined on a per-user basis and set at **100 images per minute**. In addition, requests are limited to **5 per second**."

## 10. Pricing (https://www.recraft.ai/docs/api-reference/pricing.md)

**USD $1.00 = 1,000 API units**; prepaid, non-refundable, do not expire.

| Operation | USD | Units |
|---|---|---|
| Raster: V4.1, V4.1 Utility, **V4 Styles** | $0.035 | 35 |
| Raster: V4, V3 | $0.04 | 40 |
| Raster: V2 | $0.022 | 22 |
| Raster: V4 Styles Pro | $0.10 | 100 |
| Raster: V4.1 Pro / V4.1 Utility Pro | $0.21 | 210 |
| Raster: V4 Pro | $0.25 | 250 |
| Vector: V4 Styles Vector | $0.05 | 50 |
| Vector: V4.1 / V4.1 Utility / V4 / V3 Vector | $0.08 | 80 |
| Vector: V2 Vector | $0.044 | 44 |
| Vector: V4 Styles Pro Vector | $0.12 | 120 |
| Vector: V4.1 Pro / V4.1 Utility Pro / V4 Pro Vector | $0.30 | 300 |
| **Image background removal** | **$0.01** | **10** |
| Image vectorization | $0.01 | 10 |
| Image style creation | $0.005 | 5 |
| Crisp upscale / Creative upscale | $0.004 / $0.25 | 4 / 250 |
| Erase region / Variate image / Prompt enhancement | $0.002 / $0.04 / $0.01 | 2 / 40 / 10 |
| V3 image-to-image, inpaint, outpaint, replace/generate background | $0.04 raster / $0.08 vector | 40 / 80 |

Billing basis is per image for generation (`n=4` → 4×), per request for the utilities. Attaching style references to a generation is charged as style creation + generation; the response `credits` is the sum. Caveat: the marketing page (`https://www.recraft.ai/pricing?tab=api`) lists "Style creation" at 40 units; the API pricing page, the V4 Styles page and the documented `/v1/styles` response (`"credits": 5`) all say 5 — trust the docs and check `credits` on the first call.

## 11. Style names useful for a hand-drawn look (V2/V3 `style` param, https://www.recraft.ai/docs/api-reference/styles.md)

- **Recraft V3 raster:** `Hand-drawn`, `Pencil sketch`, `Bold Sketch`, `Crosshatch`, `Outline details`, `Freehand details`, `Tablet sketch`, `Urban sketching`, `Pastel sketch`, `Noir`, `Digital engraving`, `Grain`. Default when no style: `Recraft V3 Raw`.
- **Recraft V3 Vector (SVG):** `Vector art`, `Line art`, `Thin`, `Marker outline`, `Engraving`, `Linocut`, `Bold stroke`, `Cutout`, `Sharp contrast`.
- **Recraft V2 Vector icons:** `Outline`, `Doodle`, `Pictogram`, `Broken line`, `Doodle Line art`.
- If a name exists in both V2 and V3 the API picks V3; pass `model` explicitly to pin.
- V4 / V4.1 have **no named styles** — use `style_id` / reference images (1 image is enough) with `recraftv4_styles*`.

Minimal request for the target look (V4.1, black background, one image, seedable):

```json
POST /v1/images/generations
{
  "prompt": "Hand-drawn black ink line illustration of a single vintage 35mm film camera, centered, isolated on a solid black background, white monoline strokes with slight hand wobble, no shading, no gradients, no text, generous empty space around the subject",
  "model": "recraftv4_1",
  "size": "1024x1024",
  "n": 1,
  "random_seed": 42,
  "controls": { "background_color": { "rgb": [0, 0, 0] }, "colors": [ { "rgb": [255, 255, 255] } ] },
  "response_format": "url"
}
```

## 12. Eight prompting tips for a hand-drawn, minimal, isolated-subject, black-background illustration

1. **Lead with one concrete subject, then the isolation.** "Begin image prompts by clearly stating what viewers should focus on" (subject.md); "Elements placed earlier in the prompt receive higher priority" (prompting-with-recraft-v4.md). Write `"<one object>, centered, isolated on a solid black background"` before any style words — and name exactly one object, never a list.
2. **Say the medium and the line behaviour explicitly.** Recraft's illustration structure is "Drawing style → line behaviour (clean, irregular, bold) → colour logic → surface treatment (flat, grain…)" (prompting-with-recraft-v4.md "Illustration Strength"). E.g. "black ink line drawing, monoline, consistent stroke width, slightly irregular hand-drawn outline" (see the "Line icon prompt" in logos-and-icons.md).
3. **State constraints as negatives inside the prompt, the way the official examples do.** "Flat colors only — no gradients, shadows, or texture … No text. No clutter." (prompting-with-recraft-v4.md). For V4/V4.1 there is no `negative_prompt`; these in-prompt constraints are the mechanism. Add "no shading, no crosshatching, no background objects".
4. **Reinforce the background with `controls.background_color`.** Put "solid black background" in the text and send `"background_color": {"rgb": [0,0,0]}` (documented for all models; V4/V4.1 support exactly `colors` + `background_color`). Add the stroke colour to `colors` (e.g. white) so the palette is two-tone. The V4 guide's own examples do this in words ("pure black solid shapes on a white background", "chest-up portrait on a solid black background, centered").
5. **Don't stack adjectives — describe structure.** "Avoid stacking dramatic or evaluative adjectives. Precision and concrete description produce more reliable results than exaggeration"; for vector/flat work "Avoid texture or material-focused language. Vector output responds to structural definition and geometric clarity" (prompting-with-recraft-v4.md). "minimal, few lines, simple silhouette" beats "beautiful stunning minimalist masterpiece".
6. **Pick the model/style for the job.** Short prompts work best on V4.1 ("shorter prompts produce stronger results", models/recraft-v4-1.md); `recraftv4_1_utility` gives "flat lighting, front-facing composition, simple scenes" (more predictable). If you need true line art as SVG, use `recraftv4_1_vector`, or V3 with `"style": "Line art"` / `"Hand-drawn"`. On V3 you additionally get `negative_prompt` (write the thing to exclude, e.g. `"shading, gradient, text"` — "write 'apples' rather than 'no apples'" per negative-prompts.md), `controls.no_text: true`, and `artistic_level: 0` ("static and clean").
7. **Lock consistency with a style instead of re-describing it.** For a series, generate one image you like, then `POST /v1/styles` with it (or attach it as `style_reference_urls`) and use `recraftv4_styles` with `style_match: "precise"` — "every generation holds to it, preserving rendering technique, color, texture, and composition" (recraft-v4-styles.md). Reuse the returned `style_id`; use `random_seed` for reproducibility.
8. **Use the cheap knobs before re-prompting.** `n` up to 6 per call to pick the best; keep `size` square (`1024x1024`) so the model centres the subject rather than filling a wide frame with props; if edge-cropping happens, the docs' fix is "place the image in a Frame and use Outpainting" (best-practices/prompting-and-image-generation.md). If you need alpha, generate on black then call `removeBackground` ($0.01) rather than prompting for "transparent".

Sources: https://www.recraft.ai/docs/llms.txt (index); https://www.recraft.ai/docs/api-reference/getting-started.md; https://www.recraft.ai/docs/api-reference/endpoints.md; https://www.recraft.ai/docs/api-reference/styles.md; https://www.recraft.ai/docs/api-reference/appendix.md; https://www.recraft.ai/docs/api-reference/pricing.md; https://www.recraft.ai/docs/api-reference/examples.md; https://www.recraft.ai/docs/api-reference/models/overview.md; https://www.recraft.ai/docs/api-reference/models/recraft-v4-1.md; https://www.recraft.ai/docs/api-reference/models/recraft-v4-styles.md; https://www.recraft.ai/docs/api-reference/models/recraft-v3.md; https://www.recraft.ai/docs/api-reference/models/recraft-v2.md; https://www.recraft.ai/docs/prompt-engineering-guide/prompting-with-recraft-v4.md; https://www.recraft.ai/docs/prompt-engineering-guide/core-principles/subject.md; https://www.recraft.ai/docs/prompt-engineering-guide/visual-formats/logos-and-icons.md; https://www.recraft.ai/docs/prompt-engineering-guide/visual-formats/vector-art.md; https://www.recraft.ai/docs/recraft-studio/image-generation/working-with-text-and-prompts/negative-prompts.md; https://www.recraft.ai/docs/best-practices/prompting-and-image-generation.md; https://external.api.recraft.ai/doc/spec/internal/externalapi/api.yaml (OpenAPI). Raw copies saved under `C:\Users\lee\AppData\Local\Temp\claude\C--Users-lee-Documents\63381200-7ca9-44e4-9b71-924e9318e02c\scratchpad\recraft\`.
