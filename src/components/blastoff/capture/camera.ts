// THE CAPTURE CAMERA — zoom (wheel / pinch), O pull-back, and the Alt latch for
// Alt+drag move and the alt-hover grips. SLOT (2026-09-04): returns the
// at-rest values until the camera lands.
import type { CSSProperties, RefObject, WheelEvent } from "react";

export interface CaptureCamera {
  /** Transform applied to the slide (PhoneFrame `stageStyle`). */
  stageStyle?: CSSProperties;
  /** Extra classes on the film-mode root — `sa-alt` while Alt is latched. */
  rootClass: string;
  onWheel?: (e: WheelEvent<HTMLDivElement>) => void;
  /** Contexts the live card reads for Alt-move / grips, provided by the caller. */
  moveBy: (id: string, dx: number, dy: number) => void;
  setWidth: (id: string, w: number) => void;
  setScale: (id: string, s: number) => void;
  persist: (id: string) => void;
}

export function useCaptureCamera(_opts: { hostRef: RefObject<HTMLDivElement | null>; frameId: string }): CaptureCamera {
  return { rootClass: "", moveBy: () => {}, setWidth: () => {}, setScale: () => {}, persist: () => {} };
}
