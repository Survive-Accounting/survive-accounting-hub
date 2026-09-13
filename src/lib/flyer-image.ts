// FLYER IMAGE (2026-09-13) — the house flyer as a PNG, made in the browser.
//
// Lee: "They can print a flyer for the house, they can also just download the image to share in
// texts, GroupMe's, etc." The flyer endpoint already renders the print flyer as SVG (?f=svg), and
// its QR is an inline data: URI, so the canvas is never tainted. Rasterising here keeps the server
// free of an image library — flyer.server.ts documents the out-of-memory builds that came from
// adding one.
//
// On a phone with a share sheet that accepts files, the PNG goes straight to it (Messages,
// GroupMe); otherwise it downloads.

const W = 1275, H = 1650; // half of the 2550 × 3300 print artboard — sharp on any phone.

export async function flyerPng(svgUrl: string): Promise<Blob> {
  const res = await fetch(svgUrl);
  if (!res.ok) throw new Error(`flyer ${res.status}`);
  let svg = await res.text();
  // The artwork says width="100%", which an <img> resolves to 300 × 150. Give it real pixels.
  svg = svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, "")} width="${W}" height="${H}">`);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("flyer image failed to load")); img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Share (phone) or download (desk) the flyer PNG. Resolves "shared" | "downloaded" | "cancelled". */
export async function saveFlyerImage(svgUrl: string, filename: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await flyerPng(svgUrl);
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file] }); return "shared"; }
    catch (e) { if (e instanceof Error && e.name === "AbortError") return "cancelled"; /* else download */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "downloaded";
}
