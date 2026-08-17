// SET EXPORT (Lee) — one clean markdown document for a CEQ set, built for pasting
// into an AI chat: everything the set knows, in deck order, no UI noise. PURE —
// CeqStudio assembles the input snapshot; this module only formats, so the whole
// export is unit-testable without a canvas.
import { fmtDur } from "./ceq-takes";

export interface ExportChainItem { label: string; body?: string; sound?: string }
export interface ExportChoice { text: string; correct?: boolean; chain: ExportChainItem[] }
export interface ExportClip { name: string; duration?: number; lookback: boolean; refs: string[] }
export interface ExportQuestion {
  tqq: string; stem: string; choices: ExportChoice[];
  flags: { boss?: boolean; chachingSilenced?: boolean; short?: boolean; shortNote?: string; starred?: boolean; free?: boolean };
  scripts: { suggested?: string; revised?: string; transcript?: string };
  clips: ExportClip[];
}
export interface ExportSlot { state: "custom" | "global" | "empty"; name?: string; duration?: number }
export interface SetExportInput {
  setName: string; course?: string; topic?: string;
  freeCount: number; fullCount: number;
  runtimeFreeS: number; runtimeFullS: number;
  clipCoverage: { withBase: number; total: number };
  questions: ExportQuestion[];
  introFrame: { exists: boolean; clip?: { name: string; duration?: number } };
  wrap: { name: string; duration?: number; refs: string[] }[];
  slots: { intro: ExportSlot; outro: ExportSlot };
  /** DERIVED: slug → the questions (tqq labels) exposed to it. */
  misconceptions?: { slug: string; questions: string[] }[];
}

// Hoisted, not a const arrow — see tdz-hazards.test.ts: a module-scope arrow
// is in a temporal dead zone until the module body reaches it, and a bundler may
// render a component first. This one killed the previewer in production (08-16).
function LETTER(i: number): string { return String.fromCharCode(65 + (i % 26)); }
const flagLine = (f: ExportQuestion["flags"]): string => {
  const parts: string[] = [];
  if (f.starred) parts.push("★ starred");
  if (f.free) parts.push("FREE cut");
  if (f.boss) parts.push("boss");
  if (f.chachingSilenced) parts.push("chaching silenced");
  if (f.short) parts.push(`short${f.shortNote ? ` (${f.shortNote})` : ""}`);
  return parts.join(" · ");
};
const slotLine = (label: string, s: ExportSlot): string =>
  `- ${label}: ${s.state === "empty" ? "—" : `${s.state}${s.name ? ` (${s.name}${s.duration != null ? `, ${fmtDur(s.duration)}` : ""})` : ""}`}`;

/** Build the whole set as markdown. Deck order throughout. */
export function buildSetExport(x: SetExportInput): string {
  const L: string[] = [];
  L.push(`# ${x.setName}`);
  const where = [x.course, x.topic].filter(Boolean).join(" / ");
  if (where) L.push(`**Topic:** ${where}`);
  L.push(`**Questions:** ${x.fullCount} full · ${x.freeCount} free`);
  L.push(`**Runtime (est.):** full ${fmtDur(x.runtimeFullS)} · free ${fmtDur(x.runtimeFreeS)}`);
  L.push(`**Clip coverage:** ${x.clipCoverage.withBase} of ${x.clipCoverage.total} questions have a base clip`);
  L.push("");
  x.questions.forEach((q) => {
    L.push(`## ${q.tqq}`);
    L.push(q.stem);
    L.push("");
    q.choices.forEach((c, ci) => L.push(`- ${c.correct ? `**${LETTER(ci)}. ${c.text}** ✓` : `${LETTER(ci)}. ${c.text}`}`));
    const fl = flagLine(q.flags);
    if (fl) { L.push(""); L.push(`*Flags:* ${fl}`); }
    q.choices.forEach((c, ci) => {
      if (c.chain.length === 0) return;
      L.push("");
      L.push(`**Chain — choice ${LETTER(ci)}** (reveal order):`);
      c.chain.forEach((it, k) => L.push(`${k + 1}. ${it.label}${it.body && it.body !== it.label ? ` — ${it.body}` : ""}${it.sound ? ` *(sound: ${it.sound})*` : ""}`));
    });
    if (q.scripts.suggested || q.scripts.revised || q.scripts.transcript) {
      L.push("");
      if (q.scripts.suggested) L.push(`**Suggested script:** ${q.scripts.suggested}`);
      if (q.scripts.revised) L.push(`**Revised script:** ${q.scripts.revised}`);
      if (q.scripts.transcript) L.push(`**Transcript:** ${q.scripts.transcript}`);
    }
    if (q.clips.length > 0) {
      L.push("");
      L.push("**Clips:**");
      q.clips.forEach((c, k) => L.push(`- ${k === 0 && !c.lookback ? "base" : `lookback ${k}`}: ${c.name}${c.duration != null ? ` (${fmtDur(c.duration)})` : ""}${c.refs.length ? ` — covers: ${c.refs.join(", ")}` : ""}`));
    }
    L.push("");
  });
  L.push(`## Set assets`);
  L.push(`- Intro frame: ${x.introFrame.exists ? "created" : "not created"}${x.introFrame.clip ? ` · clip attached (${x.introFrame.clip.name}${x.introFrame.clip.duration != null ? `, ${fmtDur(x.introFrame.clip.duration)}` : ""})` : " · no clip"}`);
  if (x.wrap.length) x.wrap.forEach((w, i) => L.push(`- Wrap ${i + 1}: ${w.name}${w.duration != null ? ` (${fmtDur(w.duration)})` : ""}${w.refs.length ? ` — covers: ${w.refs.join(", ")}` : ""}`));
  else L.push("- Wrap clips: none");
  L.push(slotLine("Intro slot", x.slots.intro));
  L.push(slotLine("Outro slot", x.slots.outro));
  if (x.misconceptions && x.misconceptions.length > 0) {
    L.push("");
    L.push("## Misconceptions covered");
    x.misconceptions.forEach((m) => L.push(`- ${m.slug}: ${m.questions.join(", ")}`));
  }
  return L.join("\n");
}
