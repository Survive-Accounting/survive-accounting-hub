// Present Canvas — BRAND theme (matches the home page: navy table, red/gold accents,
// DM Serif Display display type). Cards are PAPER — off-white "textbook flashcards"
// with near-black ink and silver edges — so they pop off the navy table on camera.
//
// NEON keeps its historical key names (pink/yellow/cyan/…) so every consumer keeps
// working; the VALUES are remapped to the brand. Chrome panels (palette, toolbar,
// rail, tray) stay dark navy; card interiors use PAPER tokens.
export const NEON = {
  bg: "#0B1322", // deep navy table (darker sibling of brand navy #14213D)
  bg2: "#101B31",
  panel: "rgba(16,27,49,0.90)",
  panelSolid: "#101B31",
  pink: "#E0284A", // brand red, brightened to carry glow on navy
  pinkSoft: "#F26D84",
  yellow: "#FCA311", // brand gold
  cyan: "#4FA3E3", // steel-sky blue (navy family)
  green: "#2FBF71",
  red: "#FF5C6C", // error/trap
  text: "#F4F6FA",
  muted: "#93A0B4",
  border: "rgba(252,163,17,0.45)", // gold chrome edge
  borderSoft: "rgba(147,160,180,0.24)",
  glow: "0 0 0 1px rgba(252,163,17,0.4), 0 0 22px -6px rgba(252,163,17,0.55)",
} as const;

// Card surfaces — modern textbook: warm off-white, silver edge, navy header band.
export const PAPER = {
  card: "#FBF9F4",
  cardEdge: "#D8DBE2", // silver
  header: "#14213D", // brand navy band
  headerText: "#EDF1F7",
  headerMuted: "#9FB0CB",
  ink: "#1C2026",
  inkMuted: "#68707D",
  inkFaint: "#9AA1AC",
  line: "#E6E4DD", // row separators on paper
  red: "#C21832", // brand red on paper (darker for contrast)
  gold: "#8A5A00", // amber ink (gold is too light on paper as text)
  navy: "#14213D",
  green: "#1E7F4F",
} as const;

/** Canvas DISPLAY face — Sora: a slick, geometric display sans that matches the
 *  SURVIVE wordmark energy (Lee's call — the old DM Serif read "textbooky"). */
export const DISPLAY_FONT = "'Sora', 'Inter', system-ui, sans-serif";

/** BIG TEXT face — League Spartan: the heavy, tight, geometric wordmark voice
 *  that mimics the SURVIVE logo (Lee's call). Used by the "Big Text" element for
 *  huge on-camera slabs like "A = L + E". */
export const BIG_FONT = "'League Spartan', 'Sora', 'Inter', system-ui, sans-serif";

/** JE card voice (A11): transaction descriptions + badges — modern, clean. */
export const JE_FONT = "'Poppins', 'Inter', system-ui, sans-serif";

// Note-card marker colors — brand trio on paper.
export const NOTE_COLORS = [
  { name: "red", ink: "#C21832", bg: "#FDF2F2", border: "#E5B4BC" },
  { name: "amber", ink: "#8A5A00", bg: "#FDF8EC", border: "#E4CD9A" },
  { name: "navy", ink: "#14213D", bg: "#F1F4F9", border: "#B9C4D8" },
] as const;
