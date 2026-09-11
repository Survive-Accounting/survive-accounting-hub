// THE FRAME STEP — what the film surface tells a slide that walks itself with the spacebar: the
// step it is on. One context for every such kind (the rubric's reveal, Survibes' props); the map
// keeps its richer ClusterFilmContext. Provided by BlastOffCapture only; absent everywhere else,
// which every reader takes as "at rest, everything revealed".
import { createContext } from "react";

export interface FrameStep { step: number }
export const FrameStepContext = createContext<FrameStep | null>(null);
