// TAKE NAMING (pure) — the Mux passthrough convention that keeps the asset
// library organized without Lee ever touching asset IDs:
//   {COURSE}-{LESSON}-{beat}-f{row} → "SH-L01-hook-f2"   (server appends -tN)
// Course → initials ("Start Here" → SH); lesson label → its chapter number
// ("Ch 4 · Debits & Credits" → L04); frame → its row within the beat column.
// Mirrors the OBS filename convention in docs/FILMING-WORKFLOW.md.

const clean = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "");

/** "Start Here" → "SH", "Intro 1" → "I1", null/empty → "SA". */
export function courseCode(course: string | null | undefined): string {
  const words = (course ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "SA";
  const code = words.map((w) => clean(w).charAt(0).toUpperCase()).join("");
  return code || "SA";
}

/** "Ch 4 · Debits" → "L04"; no number → sanitized label slice ("Wrapup"). */
export function lessonCode(label: string | null | undefined): string {
  const m = (label ?? "").match(/\b(\d+)\b/);
  if (m) return `L${m[1].padStart(2, "0")}`;
  const word = clean(label ?? "");
  return word ? word.slice(0, 8) : "L00";
}

/** The frame's passthrough stem (server appends "-t{n}" per take). */
export function takePassthrough(course: string | null | undefined, lessonLabel: string | null | undefined, beat: string, subIndex: number): string {
  return `${courseCode(course)}-${lessonCode(lessonLabel)}-${clean(beat) || "frame"}-f${subIndex + 1}`;
}
