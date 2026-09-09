// SVG → PNG, once per instance.
//
// @resvg/resvg-wasm's initWasm() may be called EXACTLY ONCE per module instance; a second call
// throws "Already initialized. The `initWasm()` function can be used only once." Every caller
// guarding its own `let wasmReady` therefore works only while it is the only caller — the moment
// a second route rasterises in the same instance, or HMR resets one module's guard while the
// shared resvg module stays initialised, it throws. That is exactly how /api/thumb failed on its
// first run beside /api/og (2026-09-09).
//
// So the guard lives HERE, with the module it guards, and both routes come through this door.
// "Already initialized" is treated as ready rather than as an error: it means someone else won
// the race, which is the outcome we wanted anyway.
//
// Server-only by name (.server.ts) — resvg's wasm must never reach the client graph.

/** Per-instance byte cache: fonts and the wasm binary never change within a deployment. */
const cache = new Map<string, Promise<ArrayBuffer>>();
export function fetchBuf(url: string): Promise<ArrayBuffer> {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => {
      if (!r.ok) { cache.delete(url); throw new Error(`${url}: ${r.status}`); }
      return r.arrayBuffer();
    }));
  }
  return cache.get(url)!;
}

const ALREADY = /already initialized/i;
let wasmReady: Promise<void> | null = null;

/** Initialise resvg from the committed public/resvg.wasm, at most once, and never twice from a
 *  race. A genuine failure clears the guard so the next request may retry. */
async function ready(origin: string): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const resvg = await import("@resvg/resvg-wasm");
      const buf = await fetchBuf(`${origin}/resvg.wasm`);
      try {
        await resvg.initWasm(buf);
      } catch (e) {
        if (!ALREADY.test(e instanceof Error ? e.message : String(e))) throw e;
      }
    })().catch((e) => { wasmReady = null; throw e; });
  }
  await wasmReady;
}

/** Satori outlines every glyph to a path, so the rasteriser needs no fonts of its own — and must
 *  not go looking for system ones, which a serverless instance does not have. */
export async function rasterizePng(origin: string, svg: string, width: number): Promise<Uint8Array> {
  await ready(origin);
  const resvg = await import("@resvg/resvg-wasm");
  return new resvg.Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render().asPng();
}
