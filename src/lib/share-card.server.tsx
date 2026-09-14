// THE SHARE CARD (1200x630 PNG) — what a chapter or council link previews as in GroupMe / iMessage.
// Redesigned 2026-09-14 (Lee: "Put the surv(bolt)ve in the bottom. Use the correct fonts.
// Greek Letters / [chapter name] - [campus name] / Share [course code] exam prep", and "use less FREE").
//
//     ΑΤΩ                          the big mark — Inter ExtraBold (Rubik has no Greek)
//     Alpha Tau Omega - Ole Miss   who it's for — Inter SemiBold, muted
//     Share ACCY 201 exam prep     the ask — Rubik Black, gold
//     surv⚡ve                      the wordmark — Rubik Black, the bolt (campus colours) as its "i"
//
// Font law (see api.og.$school.$chapter.tsx): satori takes TTF ArrayBuffers only; the committed
// public/fonts files are real TTFs.
import { fetchBuf, rasterizePng } from "@/lib/rasterize.server";

export const CARD_W = 1200, CARD_H = 630;
const NAVY = "#14213D", CREAM = "#F5EFE6", GOLD = "#FCA311", WHITE = "#FFFFFF";

const BOLT_OUTER = "M85.46 8.38 L66.89 32.29 L85.06 31.98 L54.88 51.08 L77.05 50.77 L43.48 73.57 L76.74 73.57 L49.77 92.03 L63.19 94.82 L28.39 111.14 L42.56 112.07 L18.22 120.69 L22.53 128.7 L-8.27 137.63 L15.14 108.99 L-10.73 108.06 L26.85 92.35 L-11.54 90.51 L34.22 62.78 L3.83 64.94 L41.41 44 L25.99 39.73 Z";
const BOLT_RIGHT = "M84.97 8.22 L25.96 40.07 L42.92 44.46 L2.88 65.4 L34.3 61.71 L-10.67 90.66 L28.14 91.89 L-12.21 106.98 L14.99 110.04 L-10.11 138.7 L24.54 129.73 L19.03 121.61 L20.48 114.36 L23.38 107.69 L9.17 105.37 L46.87 95.8 L37.59 91.74 L61.08 78.4 L8.3 85.94 L59.34 56.36 L40.77 54.14 L70.06 35.77 L44.26 35.77 L69.77 22.72 Z";
const VB = { x: -18.21, y: -2.26, w: 109.27, h: 146.96 };
const boltDataUri = (c1: string, c2: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB.w} ${VB.h}"><g transform="translate(${-VB.x} ${-VB.y}) rotate(2 ${VB.w} ${VB.h * 0.51})"><path d="${BOLT_OUTER}" fill="${c1}" stroke="${WHITE}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/><path d="${BOLT_RIGHT}" fill="${c2}"/></g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

const fit = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The line under the mark: "Alpha Tau Omega - Ole Miss". */
export function shareWhoLine(name: string, campus: string): string {
  return fit(`${name} - ${campus}`, 44);
}
/** The ask: "Share ACCY 201 exam prep". */
export function shareAskLine(courseCode: string | null): string {
  return courseCode ? `Share ${courseCode} exam prep` : "Share intro accounting exam prep";
}

export async function renderShareCard(origin: string, o: { mark: string; who: string; ask: string; c1: string; c2: string }): Promise<Uint8Array> {
  const [inter800, inter600, rubik900] = await Promise.all([
    fetchBuf(`${origin}/fonts/Inter-ExtraBold.ttf`),
    fetchBuf(`${origin}/fonts/Inter-SemiBold.ttf`),
    fetchBuf(`${origin}/fonts/Rubik-Black.ttf`),
  ]);
  const mark = fit(o.mark, 12);
  const { default: satori } = await import("satori");
  const svg = await satori(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: NAVY, padding: "70px 56px 48px" }}>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", fontFamily: "InterX", fontSize: mark.length > 6 ? 128 : 172, color: CREAM, lineHeight: 1 }}>{mark}</div>
          <div style={{ display: "flex", marginTop: 22, fontFamily: "Inter", fontSize: 34, color: CREAM, opacity: 0.66 }}>{o.who}</div>
          <div style={{ display: "flex", marginTop: 30, fontFamily: "Rubik", fontSize: 60, color: GOLD, lineHeight: 1 }}>{o.ask}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", fontFamily: "Rubik", fontSize: 54, color: CREAM, letterSpacing: -1, lineHeight: 1 }}>
          <span>surv</span>
          <img src={boltDataUri(o.c1, o.c2)} width={30} height={42} style={{ margin: "0 1px", transform: "translateY(-3px)" }} />
          <span>ve</span>
        </div>
      </div>
    ),
    {
      width: CARD_W, height: CARD_H,
      fonts: [
        { name: "InterX", data: inter800, weight: 800, style: "normal" },
        { name: "Inter", data: inter600, weight: 600, style: "normal" },
        { name: "Rubik", data: rubik900, weight: 900, style: "normal" },
      ],
    },
  );
  return rasterizePng(origin, svg, CARD_W);
}

export const shareCardHeaders = () => ({
  "content-type": "image/png",
  "cache-control": process.env.OG_NO_STORE ? "no-store, no-cache, must-revalidate" : "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
});
