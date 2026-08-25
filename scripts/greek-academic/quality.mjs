/**
 * Greek Academic Intelligence — data-quality guardrails (spec §20).
 * Never silently ingest malformed values: clamp/normalize the sane ones, null +
 * flag the impossible ones, and surface flags so the row lands in the review queue.
 */
const num = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const int = (v) => { const n = num(v); return n == null ? null : Math.round(n); };

/** Clean one parsed chapter record. Returns {clean, flags}. */
export function cleanChapter(raw, scale = 4.0) {
  const flags = [];
  const hi = scale && scale >= 4.0 ? scale + 0.05 : 5.05; // tolerate rounding at the ceiling
  const gpa = (label, v) => {
    let n = num(v);
    if (n == null) return null;
    if (n < 0 || n > hi) { flags.push(`${label}_out_of_range`); return null; }
    return Math.round(n * 1000) / 1000;
  };
  const count = (label, v) => {
    let n = int(v);
    if (n == null) return null;
    if (n < 0 || n > 100000) { flags.push(`${label}_out_of_range`); return null; }
    return n;
  };
  const pct = (label, v) => {
    let n = num(v);
    if (n == null) return null;
    if (n > 1 && n <= 100) n = n; // percent
    else if (n >= 0 && n <= 1) n = n * 100; // ratio → percent
    else { flags.push(`${label}_out_of_range`); return null; }
    return Math.round(n * 10) / 10;
  };
  return {
    flags,
    clean: {
      chapter_gpa: gpa("gpa", raw.gpa),
      active_member_gpa: gpa("active_gpa", raw.active_member_gpa),
      new_member_gpa: gpa("new_gpa", raw.new_member_gpa),
      member_count: count("members", raw.member_count),
      active_member_count: count("active", raw.active_member_count),
      new_member_count: count("new", raw.new_member_count),
      deans_list_count: count("deans", raw.deans_list_count),
      deans_list_percent: pct("deans_pct", raw.deans_list_percent),
      academic_probation_count: count("probation", raw.academic_probation_count),
      council_average_gpa: gpa("council_avg", raw.council_average_gpa),
      chapter_rank_within_council: count("rank", raw.rank_within_council),
      business_students_count: count("business", raw.business_students_count),
    },
  };
}

/** Detect duplicate reported-name rows within a report; flag the extras. */
export function flagDuplicates(chapters) {
  const seen = new Map();
  for (const c of chapters) {
    const k = (c.chapter_name_as_reported || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!k) continue;
    if (seen.has(k)) c.quality_flags = [...(c.quality_flags || []), "duplicate_reported_name"];
    else seen.set(k, true);
  }
  return chapters;
}

export { num, int };
