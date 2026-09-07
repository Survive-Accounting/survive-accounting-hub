// THE SLIDE-EDIT CONTEXT — the Review stage's "click the words, change them".
// Provided around the Review phone only; FrameView reads it and hands each
// brand slide / ad an `onEdit` that patches the frame's own fields. The film,
// the arrange preview and the canvas never provide it, so their text is inert —
// with ONE exception since 2026-09-06: the 9:16 film pop-out provides it while
// its chrome is showing, so an illustration can be dragged and resized there
// (BlastOffCapture.tsx's patchCurrentFrame; PhoneFrame's `popout`). The
// in-page capture still never does.
import { createContext } from "react";

import type { BlastFrame } from "./plan";

export type SlideEdit = (patch: Partial<BlastFrame>) => void;
export const SlideEditContext = createContext<SlideEdit | null>(null);
