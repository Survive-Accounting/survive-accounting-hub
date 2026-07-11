// Scene-level settings shared by cards: uniform JE width, the default JE preset,
// and the grouped chart of accounts. Provided by the canvas route; width/preset
// persist inside the scene payload (sceneSettings).
import { createContext, useContext } from "react";

import type { CoaGroup, JePreset } from "./je-logic";

export interface CanvasSettings {
  /** ALL JE cards render at this width (px). One knob, scene-wide. */
  jeCardWidth: number;
  /** Default settings preset stamped onto newly spawned JE cards. */
  jePreset: JePreset;
  /** Grouped chart of accounts ([] until loaded / unavailable). */
  coa: CoaGroup[];
  /** Flat canonical names for free-text autocomplete. */
  coaNames: string[];
  setJeCardWidth: (n: number) => void;
  setJePreset: (p: JePreset) => void;
}

export const JE_WIDTH_DEFAULT = 380;

export const CanvasSettingsContext = createContext<CanvasSettings>({
  jeCardWidth: JE_WIDTH_DEFAULT,
  jePreset: "guided",
  coa: [],
  coaNames: [],
  setJeCardWidth: () => {},
  setJePreset: () => {},
});

export const useCanvasSettings = () => useContext(CanvasSettingsContext);
