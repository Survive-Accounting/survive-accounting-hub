// MEASURING TYPE for the SVG art. SVG <text> neither wraps nor fits itself, so every layout in the
// kit is handed a measure function; in the browser it is a 2D canvas set in the same face the
// <text> uses (the page already loads Rubik and Inter from Google Fonts, and the export embeds the
// identical Google TTFs, so the metrics agree). Before the fonts land, and on the server, it
// estimates — useKitFontsReady re-renders the art once they have.
let ctx: CanvasRenderingContext2D | null = null;

export function measureText(text: string, size: number, weight: number, family: string, trackingEm = 0): number {
  const tracking = text.length * trackingEm * size;
  if (typeof document === "undefined") return text.length * size * 0.6 + tracking;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * size * 0.6 + tracking;
  ctx.font = `${weight} ${size}px ${family}`;
  return ctx.measureText(text).width + tracking;
}

export type Measure = (text: string, size: number) => number;
