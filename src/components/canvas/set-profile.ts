// SET TEMPLATES (P6) — save any set's profile + layout as a named template,
// apply it to another set COPY-ON-WRITE (deep-cloned; nothing links back).
// Storage v1: localStorage on Lee's machine ("sa-set-templates"). Deliberate:
// no migration needed, one author, one machine; revisit if partners arrive
// (TENANT-ZERO). Templates carry no question content — profile + layout only.
import type { DeckDef, DeckLayout, SetProfile } from "./types";

export interface SetTemplate {
  name: string;
  savedAt: string;
  profile?: SetProfile;
  layout?: DeckLayout;
  world?: string;
  worldIntensity?: number;
  worldMotion?: number;
}

const KEY = "sa-set-templates";

export function loadTemplates(): SetTemplate[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveTemplate(t: SetTemplate): SetTemplate[] {
  const list = loadTemplates().filter((x) => x.name !== t.name);
  list.unshift(t);
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40))); } catch { /* full/blocked: template just not saved */ }
  return list;
}
export function templateFromDeck(name: string, d: DeckDef): SetTemplate {
  return JSON.parse(JSON.stringify({ name, savedAt: new Date().toISOString(), profile: d.profile, layout: d.layout, world: d.world, worldIntensity: d.worldIntensity, worldMotion: d.worldMotion }));
}
/** COPY-ON-WRITE apply — returns the patch for updateDeck; everything cloned,
 *  so later edits to the set never touch the template (and vice versa). */
export function applyTemplate(t: SetTemplate): Partial<DeckDef> {
  const c: SetTemplate = JSON.parse(JSON.stringify(t));
  const patch: Partial<DeckDef> = {};
  if (c.profile) patch.profile = c.profile;
  if (c.layout) patch.layout = c.layout;
  if (c.world !== undefined) patch.world = c.world;
  if (c.worldIntensity !== undefined) patch.worldIntensity = c.worldIntensity;
  if (c.worldMotion !== undefined) patch.worldMotion = c.worldMotion;
  return patch;
}
