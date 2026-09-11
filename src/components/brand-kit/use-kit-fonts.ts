// The art measures its type on a canvas, and a canvas measures in whatever face is loaded at that
// moment — so the art renders once more when the brand faces arrive, and every width is re-taken
// in the real ones.
import { useEffect, useState } from "react";

import { KIT_FONT_FILES } from "@/lib/brand-kit/tokens";

export function useKitFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) { setReady(true); return; }
    const done = () => { if (alive) setReady(true); };
    Promise.all(KIT_FONT_FILES.map((f) => fonts.load(`${f.weight} 100px "${f.family}"`))).then(done, done);
    return () => { alive = false; };
  }, []);
  return ready;
}
