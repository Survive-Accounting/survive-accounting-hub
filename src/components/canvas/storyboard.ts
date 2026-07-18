// STORYBOARD (pure) — the whole course as a board of frame cards in the exact
// FILM ORDER (lesson path order › beat columns › rows). It's a bird's-eye read
// of the lesson: each cell carries its beat, title, script state, film status,
// the World it'll wear, and how many cards live on it. Read-only navigation —
// nothing here mutates a scene.
import { BEAT_LABEL } from "./frames";
import { hasScript, scriptTree, type ScriptNode, type ScriptState } from "./script-doc";
import type { Beat, FilmStatus } from "./types";

export interface StoryboardCell {
  frameId: string;
  /** 1-based order within the lesson's walk. */
  n: number;
  beat: Beat;
  beatLabel: string;
  title: string;
  state: ScriptState;
  filmStatus: FilmStatus;
  /** Effective World: the frame's own, else the lesson default. */
  world?: string;
  /** Number of child cards on the frame. */
  cardCount: number;
  hasScript: boolean;
}

export interface StoryboardLesson {
  lessonId: string;
  label: string;
  pathOrder: number;
  cells: StoryboardCell[];
}

/** Build the storyboard for every lesson, in film order. Reuses scriptTree so
 *  the ordering + state + film status match the script editor exactly. */
export function storyboardLessons(nodes: ScriptNode[]): StoryboardLesson[] {
  const tree = scriptTree(nodes);
  return tree.map((l) => {
    const lessonNode = nodes.find((n) => n.id === l.lessonId);
    const worldDefault = (lessonNode?.data as { worldDefault?: string } | undefined)?.worldDefault;
    const cells: StoryboardCell[] = l.beats.flatMap((g) => g.frames).map((f) => {
      const frameNode = nodes.find((n) => n.id === f.frameId);
      const fb = frameNode?.data as { world?: string } | undefined;
      const cardCount = nodes.filter((n) => n.parentId === f.frameId).length;
      return {
        frameId: f.frameId,
        n: f.n,
        beat: f.beat,
        beatLabel: BEAT_LABEL[f.beat],
        title: f.title,
        state: f.state,
        filmStatus: f.filmStatus,
        world: fb?.world ?? worldDefault,
        cardCount,
        hasScript: hasScript(f.script),
      };
    });
    return { lessonId: l.lessonId, label: l.label, pathOrder: l.pathOrder, cells };
  });
}

/** Flatten to a single ordered sequence (the whole-course shot list). */
export function storyboardSequence(nodes: ScriptNode[]): StoryboardCell[] {
  return storyboardLessons(nodes).flatMap((l) => l.cells);
}
