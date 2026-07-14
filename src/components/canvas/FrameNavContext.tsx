// FRAME NAVIGATION — the route owns the camera + current-frame state; frames and
// the outline consume it to enter/exit/step. Kept in a context so FrameNode
// (rendered deep in React Flow) and OutlinePanel share one implementation.
import { createContext, useContext } from "react";

export interface FrameNav {
  /** The frame currently framed by the camera (null = lesson/free view). */
  currentFrameId: string | null;
  /** Fit the camera exactly to a frame's bounds and mark it current. */
  enter: (frameId: string) => void;
  /** Leave frame view (back to the lesson / free canvas). */
  exit: () => void;
  /** Move to the prev (-1) / next (+1) frame in the same lesson; stops at edges. */
  step: (dir: -1 | 1) => void;
  /** Whether stepping in `dir` is possible (for arrow enable/disable). */
  canStep: (frameId: string, dir: -1 | 1) => boolean;
  /** Append a blank frame to a lesson (lesson hover chrome "+ frame"). */
  addFrame: (lessonId: string) => void;
  /** REORDER a frame within its lesson (swap order with the -1/+1 neighbour). */
  reorder: (frameId: string, dir: -1 | 1) => void;
}

const noop = () => {};
export const FrameNavContext = createContext<FrameNav>({
  currentFrameId: null,
  enter: noop,
  exit: noop,
  step: noop,
  canStep: () => false,
  addFrame: noop,
  reorder: noop,
});

export const useFrameNav = () => useContext(FrameNavContext);
