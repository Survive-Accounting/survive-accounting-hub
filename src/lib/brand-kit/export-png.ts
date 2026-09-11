// SVG → PNG / WebP, in the browser, with no dependency.
//
// The art is drawn once, as SVG — the preview IS the artwork. To export, the same node is cloned,
// stripped of the editor-only guides, given its target pixel size, made self-contained (fonts and
// pictures inlined as data: URLs, because an SVG painted as an image can reach nothing outside
// itself) and painted into a canvas at exactly that size.
//
// Why not the OG cards' satori + resvg: they run on the server, and the `frame` visual is a still
// grabbed from a take that only exists on Lee's machine. Everything here stays on it.
import { KIT_FONT_FILES } from "./tokens";

/** Anything carrying this attribute is shown in the editor and never exported. */
export const GUIDE_ATTR = "data-kit-guide";

export interface EmbeddedFont { family: string; weight: number; dataUrl: string }

export function fontFaceCss(fonts: readonly EmbeddedFont[]): string {
  return fonts
    .map((f) => `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:normal;src:url(${f.dataUrl}) format("truetype");}`)
    .join("");
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error("Couldn't read the file."));
    fr.readAsDataURL(blob);
  });
}

// Fonts and bank pictures never change within a visit; blob: URLs are per-object and get revoked,
// so they are fetched fresh every time.
const cache = new Map<string, Promise<string>>();

export function fetchAsDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return Promise.resolve(url);
  const load = () => fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`.trim());
    return readAsDataUrl(await r.blob());
  });
  if (url.startsWith("blob:")) return load();
  let p = cache.get(url);
  if (!p) {
    p = load();
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export type ExportType = "image/png" | "image/webp" | "image/jpeg";

export async function renderSvgToBlob(svg: SVGSVGElement, o: { width: number; height: number; type?: ExportType; quality?: number }): Promise<Blob> {
  const type = o.type ?? "image/png";
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll(`[${GUIDE_ATTR}]`).forEach((n) => n.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(o.width));
  clone.setAttribute("height", String(o.height));
  clone.removeAttribute("style");
  clone.removeAttribute("class");

  await Promise.all(Array.from(clone.querySelectorAll("image")).map(async (img) => {
    const href = img.getAttribute("href") ?? img.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (!href || href.startsWith("data:")) return;
    try {
      img.setAttribute("href", await fetchAsDataUrl(href));
    } catch (e) {
      throw new Error(`Couldn't embed a picture (${href.slice(0, 80)}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }));

  const fonts = await Promise.all(KIT_FONT_FILES.map(async (f) => {
    try {
      return { family: f.family, weight: f.weight, dataUrl: await fetchAsDataUrl(f.url) };
    } catch (e) {
      throw new Error(`Couldn't load ${f.url} to embed it: ${e instanceof Error ? e.message : String(e)}`);
    }
  }));
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = fontFaceCss(fonts);
  clone.insertBefore(style, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = o.width;
    canvas.height = o.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser wouldn't give us a canvas.");
    ctx.drawImage(img, 0, 0, o.width, o.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, o.quality));
    if (!blob) throw new Error("The image wouldn't encode.");
    if (blob.type !== type) throw new Error(`This browser can't write ${type} — it produced ${blob.type || "nothing"}.`);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked later: Chrome needs the URL alive until the click is handled.
  window.setTimeout(() => URL.revokeObjectURL(href), 4000);
}

export async function exportSvg(svg: SVGSVGElement | null, o: { width: number; height: number; type?: ExportType; quality?: number; filename: string }): Promise<Blob> {
  if (!svg) throw new Error("Nothing to export yet.");
  const blob = await renderSvgToBlob(svg, o);
  downloadBlob(blob, o.filename);
  return blob;
}
