// Scene-level settings shared by cards: uniform JE width, the default JE preset,
// and the grouped chart of accounts. Provided by the canvas route; width/preset
// persist inside the scene payload (sceneSettings).
import { createContext, useContext } from "react";

import type { CoaGroup, JePreset } from "./je-logic";
import type { LibraryItem } from "./library";
import { defaultPreviewStudent, type PreviewStudent } from "./variables";

export interface CanvasSettings {
  /** ALL JE cards render at this width (px). One knob, scene-wide. */
  jeCardWidth: number;
  /** Credit-block offset (px) — the tetris stagger. Block width = jeCardWidth − jeIndent. */
  jeIndent: number;
  /** Default settings preset stamped onto newly spawned JE cards. */
  jePreset: JePreset;
  /** Grouped chart of accounts ([] until loaded / unavailable). */
  coa: CoaGroup[];
  /** Flat canonical names for free-text autocomplete. */
  coaNames: string[];
  /** Quiz mode: face-down banners show "???" instead of the card title. */
  hideFdLabels: boolean;
  /** JE entries from the scenario library — the description picker (A12). */
  jeLibrary: LibraryItem[];
  /** SCENE COURSE CONTEXT (content reset): pickers scope to this course.
   *  null = unset → pickers show a set-the-course empty state. */
  courseId: string | null;
  chapterId: string | null;
  courseName: string | null;
  /** True while migration 0087 hasn't been applied — pickers fail loud. */
  contentResetMissing: boolean;
  /** Opens the Manage-accounts dialog (COA picker empty-state shortcut). */
  onManageAccounts: () => void;
  /** Template-variable substitution source ({first_name} …) — the PREVIEW
   *  student until live resolution ships with auth/World v1. */
  previewStudent: PreviewStudent;
  /** GLOBAL DIRECTOR NOTES keyed by beat (hook/teach/model_practice/check) — a
   *  note set on one beat's frame shows on THAT beat's frame in every lesson.
   *  Persists globally (localStorage) + travels with the scene. */
  beatNotes: Record<string, string>;
  setBeatNote: (beat: string, text: string) => void;
  setJeCardWidth: (n: number) => void;
  setJeIndent: (n: number) => void;
  setJePreset: (p: JePreset) => void;
}

// A11: default cluster widened modestly (380 → 420) for the Poppins description.
export const JE_WIDTH_DEFAULT = 420;
export const JE_INDENT_DEFAULT = 32;

export const CanvasSettingsContext = createContext<CanvasSettings>({
  jeCardWidth: JE_WIDTH_DEFAULT,
  jeIndent: JE_INDENT_DEFAULT,
  jePreset: "guided",
  coa: [],
  coaNames: [],
  hideFdLabels: false,
  jeLibrary: [],
  courseId: null,
  chapterId: null,
  courseName: null,
  contentResetMissing: false,
  onManageAccounts: () => {},
  previewStudent: defaultPreviewStudent(),
  beatNotes: {},
  setBeatNote: () => {},
  setJeCardWidth: () => {},
  setJeIndent: () => {},
  setJePreset: () => {},
});

export const useCanvasSettings = () => useContext(CanvasSettingsContext);
