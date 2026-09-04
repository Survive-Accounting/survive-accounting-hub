// THE SLIDE-EDIT CONTEXT — the Review stage's "click the words, change them".
// Provided around the Review phone only; FrameView reads it and hands each
// brand slide / ad an `onEdit` that patches the frame's own fields. The film,
// the arrange preview and the canvas never provide it, so their text is inert.
import { createContext } from "react";

import type { BlastFrame } from "./plan";

export type SlideEdit = (patch: Partial<BlastFrame>) => void;
export const SlideEditContext = createContext<SlideEdit | null>(null);
