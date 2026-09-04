// STAGE ELEMENTS (Lee, Add menu) — ONE registry for everything the "Add" menu can
// put on a CEQ's surface, and the node-type map the previewer uses to render those
// cards as their REAL selves (not a reimplementation that would drift from canvas).
//
// The two old menus this replaces (ADD_CARD_KINDS + ADD_ELEMENT_BLANKS in
// study_.canvas.tsx) were wired to the v1 toolbar, which v2 chrome hides — that's
// why the palette "disappeared". They live here now, merged, grouped, and sorted
// alphabetically inside each group.
import { BlastBioNode, BlastCheatNode, BlastFoyeNode, BlastIntroNode, BlastOpenNode, BlastOutroNode, BlastPhraseNode, BlastTipNode } from "./cards/BlastOffNodes";
import { blankCard, formulaAle, scheduleTemplate } from "./templates";
import { cardId, type CardData } from "./types";

import { HeadingCardNode } from "./cards/HeadingCardNode";
import { ListCardNode } from "./cards/ListCardNode";
import { NoteCardNode } from "./cards/NoteCardNode";
import { JeCardNode } from "./cards/JeCardNode";
import { ImageCardNode } from "./cards/ImageCardNode";
import { LegendCardNode } from "./cards/LegendCardNode";
import { TestimonialCardNode } from "./cards/TestimonialCardNode";
import { FormulaCardNode } from "./cards/FormulaCardNode";
import { ScheduleCardNode } from "./cards/ScheduleCardNode";
import { VideoCardNode } from "./cards/VideoCardNode";
import { OutlineCardNode } from "./cards/OutlineCardNode";
import { CycleNode } from "./cards/CycleNode";
import { UsersNode } from "./cards/UsersNode";
import { StandardsNode } from "./cards/StandardsNode";
import { BasisNode } from "./cards/BasisNode";
import { CareersNode } from "./cards/CareersNode";
import { ClassificationNode } from "./cards/ClassificationNode";
import { MemoCardNode } from "./cards/MemoCardNode";
import { ComputationCardNode, TAccountCardNode, MemorizeCardNode } from "./cards/OtherCards";
import {
  TextElementNode, ExamCueNode, CeqTeaseNode, CeqHookNode, FrameBoltNode,
  LogoCardNode, IntroCardNode, OutroCardNode, CornerBoltNode,
} from "./cards/elements";

/** What the Add menu offers. `group` drives the headings; entries sort A→Z inside. */
export interface StageElementSpec {
  label: string;
  group: "Blast Off" | "Teaching" | "Text" | "Data" | "Brand" | "Media";
  make: () => CardData;
  /** Rough on-stage size, so a fresh element lands centred and unclipped. */
  size?: { w: number; h: number };
}

export const STAGE_ELEMENTS: StageElementSpec[] = [
  // — Blast Off: the vertical 9:16 frames. Authored at 540x960 (half capture).
  { label: "Blast Off cold open", group: "Blast Off", make: () => blankCard("blastopen"), size: { w: 540, h: 960 } },
  { label: "Blast Off intro", group: "Blast Off", make: () => blankCard("blastintro"), size: { w: 540, h: 960 } },
  { label: "Found on your exam", group: "Blast Off", make: () => blankCard("blastfoye"), size: { w: 540, h: 960 } },
  { label: "Phrase", group: "Blast Off", make: () => blankCard("blastphrase"), size: { w: 540, h: 960 } },
  { label: "Cheat code", group: "Blast Off", make: () => blankCard("blastcheat"), size: { w: 540, h: 960 } },
  { label: "Tip / Trick", group: "Blast Off", make: () => blankCard("blasttip"), size: { w: 540, h: 960 } },
  { label: "Blast Off bio", group: "Blast Off", make: () => blankCard("blastbio"), size: { w: 540, h: 960 } },
  { label: "Blast Off outro", group: "Blast Off", make: () => blankCard("blastoutro"), size: { w: 540, h: 960 } },
  // — Teaching: the accounting objects Lee draws on while explaining
  { label: "A = L + E", group: "Teaching", make: () => formulaAle() },
  { label: "Accounting Cycle", group: "Teaching", make: () => blankCard("cycle"), size: { w: 900, h: 560 } },
  { label: "Computation", group: "Teaching", make: () => blankCard("computation") },
  { label: "Journal Entry", group: "Teaching", make: () => blankCard("je") },
  { label: "Memorize", group: "Teaching", make: () => blankCard("memorize") },
  { label: "T-Account", group: "Teaching", make: () => blankCard("taccount") },
  { label: "Who's It For?", group: "Teaching", make: () => blankCard("users"), size: { w: 960, h: 560 } },
  { label: "Rulebook & Cops", group: "Teaching", make: () => blankCard("standards"), size: { w: 960, h: 540 } },
  { label: "When It Counts", group: "Teaching", make: () => blankCard("basis"), size: { w: 960, h: 560 } },
  { label: "Accounting Careers", group: "Teaching", make: () => blankCard("careers"), size: { w: 1000, h: 600 } },
  { label: "5 Types of Accounts", group: "Teaching", make: () => blankCard("classification"), size: { w: 1100, h: 620 } },

  // — Text: plain copy furniture
  { label: "Big Text", group: "Text", make: () => ({ kind: "heading", text: "A = L + E", level: 1, spartan: true, underline: false, w: 480, h: 150 }) },
  { label: "Bulleted List", group: "Text", make: () => ({ kind: "list", title: "List", bulleted: true, showChips: false, rows: [{ id: cardId("r"), text: "" }, { id: cardId("r"), text: "" }, { id: cardId("r"), text: "" }], editMode: true }) },
  { label: "Heading", group: "Text", make: () => blankCard("heading") },
  { label: "Memo", group: "Text", make: () => blankCard("memo") },
  { label: "Note", group: "Text", make: () => blankCard("note") },
  { label: "Outline List", group: "Text", make: () => ({ kind: "list", title: "Course outline", bulleted: false, showChips: false, outlineBind: true, rows: [] }) },
  { label: "Text", group: "Text", make: () => blankCard("text") },

  // — Data: tables + the generated schedules
  { label: "Amortization", group: "Data", make: () => scheduleTemplate("amortization") },
  { label: "Balance sheet", group: "Data", make: () => scheduleTemplate("balancesheet") },
  { label: "Bank rec", group: "Data", make: () => scheduleTemplate("bankrec") },
  { label: "Depreciation", group: "Data", make: () => scheduleTemplate("depreciation") },
  { label: "FIFO/LIFO layers", group: "Data", make: () => scheduleTemplate("fifo") },
  { label: "Income statement", group: "Data", make: () => scheduleTemplate("incomestmt") },
  { label: "Legend", group: "Data", make: () => blankCard("legend") },
  { label: "Table", group: "Data", make: () => scheduleTemplate("generic") },

  // — Brand: the on-camera furniture
  { label: "CEQ Tease", group: "Brand", make: () => blankCard("ceqtease") },
  { label: "Corner bolt", group: "Brand", make: () => blankCard("corner") },
  { label: "Exam Cue", group: "Brand", make: () => blankCard("examcue") },
  { label: "Intro card", group: "Brand", make: () => blankCard("intro") },
  { label: "Logo", group: "Brand", make: () => blankCard("logo") },
  { label: "Outro lockup", group: "Brand", make: () => ({ ...(blankCard("logo") as unknown as Record<string, unknown>), mode: "outro", w: 620, h: 300 } as unknown as ReturnType<typeof blankCard>), size: { w: 620, h: 300 } },
  { label: "Bolt", group: "Brand", make: () => ({ ...(blankCard("logo") as unknown as Record<string, unknown>), mode: "bolt", w: 90, h: 120 } as unknown as ReturnType<typeof blankCard>), size: { w: 90, h: 120 } },
  { label: "Outro card", group: "Brand", make: () => blankCard("outro") },
  { label: "Testimonial", group: "Brand", make: () => blankCard("testimonial") },

  // — Media
  { label: "Image", group: "Media", make: () => blankCard("image") },
  { label: "Video", group: "Media", make: () => blankCard("video") },
];

export const STAGE_GROUPS = ["Blast Off", "Teaching", "Text", "Data", "Brand", "Media"] as const;

/** Grouped + alphabetised, ready to render. */
export function groupedStageElements(query = ""): { group: string; items: StageElementSpec[] }[] {
  const q = query.trim().toLowerCase();
  return STAGE_GROUPS.map((group) => ({
    group,
    items: STAGE_ELEMENTS.filter((e) => e.group === group && (!q || e.label.toLowerCase().includes(q))).sort((a, b) => a.label.localeCompare(b.label)),
  })).filter((g) => g.items.length > 0);
}

/** The REAL card components, keyed by node type — so a staged element renders in the
 *  previewer exactly as it does on canvas (same code path, no drift). Element kinds
 *  are unwrapped (they never deck, so no face-down wrapper). */
export const STAGE_NODE_TYPES = {
  blastopen: BlastOpenNode,
  blastintro: BlastIntroNode,
  blastfoye: BlastFoyeNode,
  blastphrase: BlastPhraseNode,
  blastcheat: BlastCheatNode,
  blasttip: BlastTipNode,
  blastbio: BlastBioNode,
  blastoutro: BlastOutroNode,
  heading: HeadingCardNode,
  text: TextElementNode,
  list: ListCardNode,
  note: NoteCardNode,
  je: JeCardNode,
  taccount: TAccountCardNode,
  computation: ComputationCardNode,
  memorize: MemorizeCardNode,
  formula: FormulaCardNode,
  schedule: ScheduleCardNode,
  legend: LegendCardNode,
  testimonial: TestimonialCardNode,
  image: ImageCardNode,
  video: VideoCardNode,
  outline: OutlineCardNode,
  cycle: CycleNode,
  users: UsersNode,
  standards: StandardsNode,
  basis: BasisNode,
  careers: CareersNode,
  classification: ClassificationNode,
  memo: MemoCardNode,
  examcue: ExamCueNode,
  ceqtease: CeqTeaseNode,
  ceqhook: CeqHookNode,
  framebolt: FrameBoltNode,
  logo: LogoCardNode,
  intro: IntroCardNode,
  outro: OutroCardNode,
  corner: CornerBoltNode,
} as const;

/** Node type for a card kind (schedules/formulas keep their own renderers). */
export const stageNodeType = (kind: string): string => (kind in STAGE_NODE_TYPES ? kind : "note");
