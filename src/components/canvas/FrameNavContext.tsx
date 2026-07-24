// FRAME NAVIGATION — the route owns the camera + current-frame state; frames and
// the outline consume it to enter/exit/step. Kept in a context so FrameNode
// (rendered deep in React Flow) and OutlinePanel share one implementation.
import { createContext, useContext } from "react";

export interface FrameNav {
  /** The frame currently framed by the camera (null = lesson/free view). */
  currentFrameId: string | null;
  /** Whether FILM mode is on right now (performance) — nodes gate film-only SFX. */
  film: boolean;
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
  /** Add a blank frame directly BELOW a frame — same beat column, next sub-row
   *  (big-picture "+" under a frame). */
  addBelow: (frameId: string) => void;
  /** REORDER a frame within its lesson (swap order with the -1/+1 neighbour). */
  reorder: (frameId: string, dir: -1 | 1) => void;
  /** Whether reordering in `dir` is possible (a sub-frame above/below to swap). */
  canReorder: (frameId: string, dir: -1 | 1) => boolean;
  /** DUPLICATE a frame (deep copy) to the next slot in its beat by default, or to
   *  an explicit lesson+beat. One undoable step. */
  duplicate: (frameId: string, dest?: { lessonId: string; beat: string }) => void;
  /** Open the small "duplicate to lesson + beat" dialog for a frame. */
  duplicateDialog: (frameId: string) => void;
  /** DUPLICATE a whole lesson cell (frames, cards, scripts, named decks) to the
   *  next empty region cell. One undoable step. */
  duplicateLesson: (lessonId: string) => void;
  // ---- COPY / PASTE (clipboard: in-memory + localStorage) --------------------
  /** Copy a frame (+ its cards/elements/arrows) to the clipboard. */
  copyFrame: (frameId: string) => void;
  /** Paste the copied frame immediately BELOW this frame (same beat, next row;
   *  cross-lesson allowed). Fresh ids; the source is untouched. */
  pasteFrameBelow: (frameId: string) => void;
  /** A frame is on the clipboard (enables the paste-below control). */
  hasFrameClip: boolean;
  /** Copy a lesson's FRAME SCAFFOLD (its frames + contents; NOT the lesson's
   *  type/topic/access/pathing) to the clipboard. */
  copyScaffold: (lessonId: string) => void;
  /** Paste the copied scaffold into this lesson — APPENDS frames (never
   *  overwrites); the target keeps its own type/topic/access/pathing. */
  pasteScaffold: (lessonId: string) => void;
  /** A scaffold is on the clipboard (enables the paste-scaffold control). */
  hasScaffoldClip: boolean;
  /** CRAM MODE (Lee) — chrome-filtered CEQ authoring; hides frame-visuals etc. */
  cramMode: boolean;
  /** Make a lesson the ACTIVE one (mounts its subtree, collapses the rest) and fly
   *  the camera to it. Used by the outline navigator. */
  activateLesson: (lessonId: string) => void;
}

const noop = () => {};
export const FrameNavContext = createContext<FrameNav>({
  currentFrameId: null,
  film: false,
  enter: noop,
  exit: noop,
  step: noop,
  canStep: () => false,
  addFrame: noop,
  addBelow: noop,
  reorder: noop,
  canReorder: () => false,
  duplicate: noop,
  duplicateDialog: noop,
  duplicateLesson: noop,
  copyFrame: noop,
  pasteFrameBelow: noop,
  hasFrameClip: false,
  copyScaffold: noop,
  pasteScaffold: noop,
  hasScaffoldClip: false,
  cramMode: false,
  activateLesson: noop,
});

export const useFrameNav = () => useContext(FrameNavContext);
