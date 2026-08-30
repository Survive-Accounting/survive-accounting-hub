// USAGE ELEMENT MANIFEST — the declared registry of instrumented admin elements.
//
// One `data-sa-el="<id>"` attribute in the DOM is all a surface needs; the human
// label, the panel it lives in, and its screen region live HERE, centrally. This
// registry is also what makes "never rendered" answerable: an element in the
// manifest that never logs an impression was never on screen (buried behind a
// collapsed panel or a filter nobody sets). Keep ids STABLE across restyles.
export type UsageSurface = "study-canvas" | "growth";

export interface UsageElement {
  id: string;          // stable element_id (matches data-sa-el)
  label: string;       // human name for the report
  panel: string;       // parent_panel grouping
  region?: string;     // screen_region hint
}

export const USAGE_ELEMENTS: Record<UsageSurface, UsageElement[]> = {
  // NOTE: navbar rows are element-level (each File item + nav button carries data-sa-el);
  // studio internals are container-level for now (film-row / spine / preview each carry one
  // data-sa-el, so a click anywhere inside logs the region). Finer per-button studio ids are a
  // one-line-each follow-up: add a data-sa-el to the button + an entry here.
  "study-canvas": [
    // navbar (element-level)
    { id: "nav-home", label: "Home", panel: "navbar", region: "top-left" },
    { id: "nav-file", label: "File menu", panel: "navbar", region: "top-left" },
    { id: "nav-pipeline", label: "Pipeline", panel: "navbar", region: "top-left" },
    { id: "nav-exhibit-lab", label: "Exhibit Lab", panel: "navbar", region: "top-left" },
    { id: "nav-student-view", label: "Student view", panel: "navbar", region: "top-right" },
    // File menu items (element-level)
    { id: "file-copy-activity-log", label: "Copy activity log prompt", panel: "file-menu", region: "top-left" },
    { id: "file-save", label: "Save", panel: "file-menu", region: "top-left" },
    { id: "file-save-as", label: "Save as new", panel: "file-menu", region: "top-left" },
    { id: "file-open", label: "Open (sets/folders)", panel: "file-menu", region: "top-left" },
    { id: "file-export", label: "Export (.json + .md)", panel: "file-menu", region: "top-left" },
    { id: "file-import", label: "Import from file", panel: "file-menu", region: "top-left" },
    { id: "file-new-set", label: "New set", panel: "file-menu", region: "top-left" },
    { id: "file-hotkeys", label: "Hotkeys", panel: "file-menu", region: "top-left" },
    { id: "file-open-studio", label: "Open Studio", panel: "file-menu", region: "top-left" },
    { id: "file-seed-sets", label: "Seed starter sets", panel: "file-menu", region: "top-left" },
    { id: "file-clean-names", label: "Clean set names", panel: "file-menu", region: "top-left" },
    { id: "file-reset", label: "Reset", panel: "file-menu", region: "top-left" },
    { id: "file-view-archive", label: "View archive: Dashboard v1", panel: "file-menu", region: "top-left" },
    // studio internals (container/region-level). Start with the film-control cluster (what
    // Lee hits during a run); finer per-button + spine/preview ids are a follow-up.
    { id: "film-row", label: "Film V1 (sit down to film)", panel: "studio", region: "center-bottom" },
  ],
  growth: [],
};

export const elementsFor = (s: UsageSurface): UsageElement[] => USAGE_ELEMENTS[s] ?? [];
export const elementIndex = (s: UsageSurface): Map<string, UsageElement> => new Map(elementsFor(s).map((e) => [e.id, e]));

// PROTECTED — a manual allowlist of elements exempt from removal suggestions regardless
// of usage. Some things are used once a month and critical when they are. Adding to it is
// a one-line edit here. (Growth will seed refund handling / attribution overrides in part 4.)
export const PROTECTED_ELEMENTS: Record<UsageSurface, string[]> = {
  "study-canvas": ["film-capture", "film-v1", "file-save", "film-ready"],
  growth: [],
};

// Layout version stamp shown in the exported prompt + bug reports. Part 3 (versioned
// layouts) will read this from the active dashboard_layouts row instead of a constant.
export const CURRENT_LAYOUT_VERSION: Record<UsageSurface, string> = {
  "study-canvas": "v1",
  growth: "v1",
};
