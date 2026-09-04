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

/** ADD-MENU ids are DERIVED from the element label so the menu and this manifest
 *  can never drift apart: the button and the entry call the same function. A new
 *  STAGE_ELEMENTS entry logs immediately (unknown id, still recorded); adding its
 *  line below is what gives it a label and makes "never rendered" answerable. */
export const addMenuElementId = (label: string): string =>
  `add-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

/** CARD KINDS carry `node-<kind>` (BaseCard, ExhibitShell and the element cards
 *  each stamp their own root). One impression per kind per session answers "which
 *  card kinds does Lee actually put on a canvas", which is the bloat question. */
export const nodeElementId = (kind: string): string => `node-${kind}`;

/** PER-OPERATOR IDENTITY (guardrail 8: per-user, never merged). `user_id` is a
 *  uuid column and the canvas has no Supabase auth session — only the AdminGate's
 *  "lee" | "king" choice — so each operator gets a stable synthetic uuid. Null
 *  (no identity chosen in this browser) stays null: unattributed is honest;
 *  defaulting to Lee would silently merge King's sessions into his. */
export const OPERATOR_UUID: Record<"lee" | "king", string> = {
  lee: "5a17e11e-0000-4000-8000-000000000001",
  king: "5a17e11e-0000-4000-8000-000000000002",
};
export const operatorUuid = (who: "lee" | "king" | null): string | null =>
  who ? OPERATOR_UUID[who] : null;

/** Card kinds, mirrored from types.ts CardKind. A kind missing here still logs —
 *  it just reads as an unlabelled `node-<kind>` row in the report. */
const NODE_KINDS: { kind: string; label: string }[] = [
  { kind: "ceq", label: "CEQ card" },
  { kind: "je", label: "Journal entry" },
  { kind: "schedule", label: "Schedule / statement" },
  { kind: "computation", label: "Computation" },
  { kind: "taccount", label: "T-account" },
  { kind: "memorize", label: "Memorize" },
  { kind: "formula", label: "Formula (A = L + E)" },
  { kind: "note", label: "Note" },
  { kind: "memo", label: "Memo" },
  { kind: "video", label: "Video" },
  { kind: "list", label: "Bulleted list" },
  { kind: "outline", label: "Outline list" },
  { kind: "image", label: "Image" },
  { kind: "legend", label: "Legend" },
  { kind: "testimonial", label: "Testimonial" },
  { kind: "heading", label: "Heading / Big text" },
  { kind: "text", label: "Text block" },
  { kind: "examcue", label: "Exam cue" },
  { kind: "ceqtease", label: "CEQ tease" },
  { kind: "ceqhook", label: "CEQ hook" },
  { kind: "framebolt", label: "Frame bolt" },
  { kind: "cornerbolt", label: "Corner bolt" },
  { kind: "logo", label: "Logo" },
  { kind: "intro", label: "Intro card" },
  { kind: "outro", label: "Outro lockup" },
  { kind: "bridge", label: "Bridge card" },
  // exhibits (ExhibitShell)
  { kind: "cycle", label: "Exhibit: Accounting Cycle" },
  { kind: "users", label: "Exhibit: Who's It For?" },
  { kind: "standards", label: "Exhibit: Rulebook & Cops" },
  { kind: "basis", label: "Exhibit: When It Counts" },
  { kind: "careers", label: "Exhibit: Accounting Careers" },
  { kind: "classification", label: "Exhibit: 5 Types of Accounts" },
  // Blast Off frames (registered 08-30 by the frames session; kinds from types.ts)
  { kind: "blastintro", label: "Blast Off: intro" },
  { kind: "blastfoye", label: "Blast Off: found on your exam" },
  { kind: "blastphrase", label: "Blast Off: phrase" },
  { kind: "blastcheat", label: "Blast Off: cheat code" },
  { kind: "blasttip", label: "Blast Off: tip / trick" },
  { kind: "blastoutro", label: "Blast Off: outro" },
  // gates / student-flow cards
  { kind: "paygate", label: "Pay gate" },
  { kind: "signupgate", label: "Signup gate" },
  { kind: "asklee", label: "Ask Lee" },
  { kind: "submitproblem", label: "Submit a problem" },
  { kind: "shareinvite", label: "Share invite" },
];

/** Add-menu entries, mirrored from STAGE_ELEMENTS labels (stage-elements.tsx). */
const ADD_MENU_LABELS: string[] = [
  "Blast Off intro", "Found on your exam", "Phrase", "Cheat code", "Tip / Trick", "Blast Off outro",
  "A = L + E", "Accounting Cycle", "Computation", "Journal Entry", "Memorize", "T-Account",
  "Who's It For?", "Rulebook & Cops", "When It Counts", "Accounting Careers", "5 Types of Accounts",
  "Big Text", "Bulleted List", "Heading", "Memo", "Note", "Outline List", "Text",
  "Amortization", "Balance sheet", "Bank rec", "Depreciation", "FIFO/LIFO layers",
  "Income statement", "Legend", "Table",
  "CEQ Tease", "Corner bolt", "Exam Cue", "Intro card", "Logo", "Outro lockup", "Bolt",
  "Outro card", "Testimonial", "Image", "Video",
];

export const USAGE_ELEMENTS: Record<UsageSurface, UsageElement[]> = {
  // Navbar + File menu are element-level. The Studio (top bar, status strip, set
  // strip, spine, preview transport, View menu, Add menu) is element-level for
  // every control Lee touches in a run, and container-level for whole panels —
  // a panel that never logs an impression was never on screen.
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

    // ---- OUTLINE DOCK (left) — the ONE cross-set navigation in v2 chrome.
    { id: "outline-panel", label: "Outline (topic → set → stem tree)", panel: "outline", region: "left" },
    { id: "outline-rail", label: "Outline collapsed rail (reopen)", panel: "outline", region: "left" },
    { id: "outline-collapse", label: "Collapse the outline", panel: "outline", region: "left" },
    { id: "outline-resize", label: "Outline width grip", panel: "outline", region: "left" },

    // ---- STUDIO TOP BAR
    { id: "studio-tab-ceqs", label: "Tab: CEQs", panel: "studio-topbar", region: "top" },
    { id: "studio-tab-publish", label: "Tab: Publish", panel: "studio-topbar", region: "top" },
    { id: "studio-mode-toggle", label: "Authoring ⇄ Pipeline", panel: "studio-topbar", region: "top" },
    { id: "studio-elements", label: "Elements (memo library handle)", panel: "studio-topbar", region: "top" },
    { id: "studio-auto-advance", label: "Auto-advance after a keep", panel: "studio-topbar", region: "top" },
    { id: "studio-takes", label: "Takes inbox", panel: "studio-topbar", region: "top" },
    { id: "studio-idea-bank", label: "Idea bank (pin)", panel: "studio-topbar", region: "top" },

    // ---- STATUS STRIP (renders in Pipeline/filming mode only)
    { id: "studio-status-strip", label: "Filming status strip", panel: "studio-status-strip", region: "top" },
    { id: "studio-orient-landscape", label: "Orientation 16:9", panel: "studio-status-strip", region: "top" },
    { id: "studio-orient-vertical", label: "Orientation 9:16", panel: "studio-status-strip", region: "top" },
    { id: "studio-platform-tiktok", label: "Platform guides: TikTok", panel: "studio-status-strip", region: "top" },
    { id: "studio-platform-reels", label: "Platform guides: Reels", panel: "studio-status-strip", region: "top" },
    { id: "studio-platform-shorts", label: "Platform guides: YT Shorts", panel: "studio-status-strip", region: "top" },
    { id: "studio-capture-launch", label: "Launch capture window (strip)", panel: "studio-status-strip", region: "top" },

    // ---- THE V3 BAR (2026-09-03) — the bare film surface the Blast Off handoff opens
    { id: "v3-capture", label: "v3: open capture window", panel: "v3-bar", region: "top" },
    { id: "v3-teleprompter", label: "v3: open teleprompter (follows the frame)", panel: "v3-bar", region: "top" },
    { id: "v3-studio-tools", label: "v3: bring the full Studio back", panel: "v3-bar", region: "top" },

    // ---- SET ACTION STRIP (above the spine)
    { id: "studio-slim-strip", label: "Set action strip", panel: "studio-slim-strip", region: "top" },
    { id: "studio-batch-takes", label: "Batch takes dropzone", panel: "studio-slim-strip", region: "top" },
    { id: "studio-room-tone", label: "Room tone upload", panel: "studio-slim-strip", region: "top" },
    { id: "studio-set-intro", label: "Set intro frame", panel: "studio-slim-strip", region: "top" },
    { id: "studio-layout-q0", label: "0 · Layout (baseline stage)", panel: "studio-slim-strip", region: "top" },
    { id: "studio-add-menu", label: "Add element (opens the Add menu)", panel: "studio-slim-strip", region: "top" },
    { id: "studio-staged-toggle", label: "Staged element: show/hide on camera", panel: "studio-slim-strip", region: "top" },
    { id: "studio-staged-copy", label: "Staged element: copy", panel: "studio-slim-strip", region: "top" },
    { id: "studio-staged-remove", label: "Staged element: remove", panel: "studio-slim-strip", region: "top" },
    { id: "studio-ready-to-film", label: "Ready to film? (readiness check)", panel: "studio-slim-strip", region: "top" },
    { id: "studio-rehearse", label: "Rehearse", panel: "studio-slim-strip", region: "top" },
    { id: "studio-clear-stars", label: "Clear all stars", panel: "studio-slim-strip", region: "top" },
    { id: "studio-copy-memos", label: "Copy selected memos", panel: "studio-slim-strip", region: "top" },
    { id: "studio-paste-memos", label: "Paste memos", panel: "studio-slim-strip", region: "top" },

    // ---- THE SPINE (SetFilmstrip). NOTE: authoring only — Pipeline mode drops it,
    // so a filming-run report showing no spine impressions is expected, not dead UI.
    { id: "spine", label: "Frame spine (filmstrip)", panel: "spine", region: "center-left" },
    { id: "spine-frame-row", label: "Spine frame row", panel: "spine", region: "center-left" },
    { id: "spine-run-map", label: "Run map rail", panel: "spine", region: "center-left" },
    { id: "spine-menu", label: "Spine ⋮ menu", panel: "spine", region: "center-left" },
    { id: "spine-density", label: "Spine density step", panel: "spine", region: "center-left" },
    { id: "spine-shuffle-choices", label: "Shuffle choices", panel: "spine", region: "center-left" },
    { id: "spine-mark-star", label: "Mark star", panel: "spine", region: "center-left" },
    { id: "spine-mark-boss", label: "Mark boss", panel: "spine", region: "center-left" },
    { id: "spine-mark-chaching", label: "Mark chaching", panel: "spine", region: "center-left" },
    { id: "spine-mark-short", label: "Mark short", panel: "spine", region: "center-left" },
    { id: "spine-mark-free", label: "Mark free", panel: "spine", region: "center-left" },
    { id: "spine-frame-mode", label: "Frame mode (note/intro/outro)", panel: "spine", region: "center-left" },
    { id: "spine-arm-uploads", label: "Arm uploads", panel: "spine", region: "center-left" },
    { id: "spine-upload-clip", label: "Upload clip", panel: "spine", region: "center-left" },
    { id: "spine-reveal-answers", label: "Answers revealed (set)", panel: "spine", region: "center-left" },
    { id: "spine-ignore-layout", label: "Ignore set layout", panel: "spine", region: "center-left" },
    { id: "spine-production-profile", label: "Production profile…", panel: "spine", region: "center-left" },
    { id: "spine-dissect", label: "Dissect…", panel: "spine", region: "center-left" },

    // ---- PREVIEW TRANSPORT + VIEW MENU (the row Lee lives in during a run)
    { id: "preview-transport", label: "Preview transport row", panel: "preview-transport", region: "center-bottom" },
    { id: "film-row", label: "Film V1 (sit down to film)", panel: "preview-transport", region: "center-bottom" },
    { id: "film-v2", label: "Film V2 (experiment)", panel: "preview-transport", region: "center-bottom" },
    { id: "film-capture", label: "Capture window (1920×1080 popout)", panel: "preview-transport", region: "center-bottom" },
    { id: "preview-close-film", label: "Close the film window", panel: "preview-transport", region: "center-bottom" },
    { id: "preview-fade", label: "Frame crossfade duration", panel: "preview-transport", region: "center-bottom" },
    { id: "preview-bolt-cursor", label: "Brand cursor on/off", panel: "preview-transport", region: "center-bottom" },
    { id: "preview-view-menu", label: "View menu", panel: "preview-transport", region: "center-bottom" },
    { id: "preview-standard-landscape", label: "Standard landscape baseline", panel: "preview-transport", region: "center-bottom" },
    { id: "view-student-chrome", label: "View: student chrome", panel: "preview-view-menu", region: "center-bottom" },
    { id: "view-guides", label: "View: composition guides", panel: "preview-view-menu", region: "center-bottom" },
    { id: "view-shorts-safe-zone", label: "View: shorts safe zone", panel: "preview-view-menu", region: "center-bottom" },
    { id: "view-platform-tiktok", label: "View: TikTok safe area", panel: "preview-view-menu", region: "center-bottom" },
    { id: "view-platform-reels", label: "View: Reels safe area", panel: "preview-view-menu", region: "center-bottom" },
    { id: "view-platform-shorts", label: "View: YT Shorts safe area", panel: "preview-view-menu", region: "center-bottom" },
    { id: "view-edit-set-layout", label: "View: edit set layout", panel: "preview-view-menu", region: "center-bottom" },
    { id: "view-layout-overlay", label: "View: layout overlay", panel: "preview-view-menu", region: "center-bottom" },
    { id: "view-overview", label: "View: overview (stack frames)", panel: "preview-view-menu", region: "center-bottom" },
    { id: "view-world-picker", label: "View: world backdrop", panel: "preview-view-menu", region: "center-bottom" },

    // ---- STUDIO PANELS (container-level: "was this panel ever on screen?")
    { id: "capture-window", label: "Capture window (pull-out)", panel: "capture", region: "overlay" },
    { id: "pipeline-cut-room", label: "Pipeline cut room", panel: "pipeline", region: "center" },
    { id: "publish-blast", label: "Publish: blast", panel: "pipeline", region: "center" },
    { id: "publish-lookback", label: "Publish: lookback", panel: "pipeline", region: "center" },
    { id: "publish-short", label: "Publish: short", panel: "pipeline", region: "center" },
    { id: "studio-shorts-queue", label: "Shorts queue", panel: "shorts-queue", region: "overlay" },
    { id: "memo-library", label: "Memo library pane", panel: "memo-library", region: "right" },

    // ---- ADD MENU (the one door for everything that goes on a question)
    { id: "add-menu-panel", label: "Add menu", panel: "add-menu", region: "overlay" },
    { id: "add-menu-filter", label: "Add menu filter", panel: "add-menu", region: "overlay" },
    { id: "add-menu-paste", label: "Add menu: paste element", panel: "add-menu", region: "overlay" },
    ...ADD_MENU_LABELS.map((label) => ({ id: addMenuElementId(label), label: `Add: ${label}`, panel: "add-menu", region: "overlay" })),

    // ---- NODE TYPES on the canvas surface
    ...NODE_KINDS.map(({ kind, label }) => ({ id: nodeElementId(kind), label, panel: "canvas", region: "center" })),
  ],
  growth: [],
};

export const elementsFor = (s: UsageSurface): UsageElement[] => USAGE_ELEMENTS[s] ?? [];
export const elementIndex = (s: UsageSurface): Map<string, UsageElement> => new Map(elementsFor(s).map((e) => [e.id, e]));

// PROTECTED — a manual allowlist of elements exempt from removal suggestions regardless
// of usage. Some things are used once a month and critical when they are. Adding to it is
// a one-line edit here. (Growth will seed refund handling / attribution overrides in part 4.)
export const PROTECTED_ELEMENTS: Record<UsageSurface, string[]> = {
  "study-canvas": [
    // ("film-v1" / "film-ready" lived here before those controls were instrumented;
    //  their real ids are film-row and studio-ready-to-film, both protected below.)
    "film-capture", "file-save",
    // The filming path itself is never a removal candidate on usage grounds: a
    // run uses each of these a handful of times and cannot happen without them.
    "film-row", "studio-capture-launch", "capture-window", "studio-takes",
    "v3-capture", "v3-teleprompter", "v3-studio-tools",
    "studio-ready-to-film", "studio-mode-toggle", "spine-arm-uploads",
    // Publish is used once per set, at the end. Rare by design.
    "publish-blast", "publish-lookback", "publish-short",
  ],
  growth: [],
};

// Layout version stamp shown in the exported prompt + bug reports. Part 3 (versioned
// layouts) will read this from the active dashboard_layouts row instead of a constant.
export const CURRENT_LAYOUT_VERSION: Record<UsageSurface, string> = {
  "study-canvas": "v2-instrumented",
  growth: "v1",
};
