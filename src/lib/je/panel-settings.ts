// Panel-visibility config for /je. Global defaults live in localStorage (cheaper than a
// settings table — no schema/migration/round-trip; it's an admin display preference, not
// shared state). A doc may override the globals via its additive `ui.panels` field.
//
// localStorage is only touched inside functions (guarded), so this module is safe to import
// from the importer / node context where `localStorage` doesn't exist.

export const PANEL_KEYS = ["ledger", "statements", "equation", "schedule", "presentation"] as const;
export type PanelKey = (typeof PANEL_KEYS)[number];

/** Simplified defaults: schedule + presentation on; ledger/statements/equation off. */
export const DEFAULT_PANELS: Record<PanelKey, boolean> = {
  schedule: true,
  presentation: true,
  ledger: false,
  statements: false,
  equation: false,
};

const LS_KEY = "sa-je-panels";

export function getGlobalPanels(): Record<PanelKey, boolean> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (raw) return { ...DEFAULT_PANELS, ...(JSON.parse(raw) as Partial<Record<PanelKey, boolean>>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PANELS };
}

export function setGlobalPanels(panels: Record<PanelKey, boolean>): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(panels));
  } catch {
    /* ignore */
  }
}

/**
 * Effective visibility for a scenario. When a doc declares `ui.panels`, that list IS the
 * set of visible panels (overriding globals); otherwise the globals apply.
 */
export function resolveVisiblePanels(
  docPanels: string[] | undefined,
  globals: Record<PanelKey, boolean>,
): Record<PanelKey, boolean> {
  if (docPanels) {
    const out = {} as Record<PanelKey, boolean>;
    for (const k of PANEL_KEYS) out[k] = docPanels.includes(k);
    return out;
  }
  return globals;
}
