# Course Intel — utilities

Tested, pure (no-I/O) building blocks for tomorrow's Course Intel pipeline. See the audit at
[`COURSE_INTEL_DISCOVERY_AUDIT.md`](../../COURSE_INTEL_DISCOVERY_AUDIT.md) and the design at
[`COURSE_INTEL_ARCHITECTURE.md`](../../COURSE_INTEL_ARCHITECTURE.md).

## `lib.mjs`
- `normalizeTextbook({title,authors,isbn,publisher})` → stable `editionKey` (`title|author|edition`);
  collapses bundle/looseleaf/Connect variants; flags unknown edition with `|?`.
- `parseEditionNumber(str)` — "12th Edition" / "12e" / "12/e" / "Twelfth Edition" → number.
- `canonicalTitle(str)` — strips format + edition noise.
- `parseExamChapterRanges(text)` — "Exam 1 covers Ch 1-3, 5" → `[{exam:"exam 1",chapters:[1,2,3,5]}]`.
- `scoreConfidence(signals)` → `{level:"High|Medium|Low", points}` (no fake decimals).
- `classifyDocument({title,url,snippet})` → `{type, tier}` (Tier 1 exam evidence … Tier 4 identity).
- `freshnessWeight(docYear, currentYear)` → `{weight, label}`.
- `chooseMappingSource({professorMapping,courseMapping,genericMapping})` → professor→course→generic.

## Tests
```bash
node --test scripts/course-intel/lib.test.mjs   # 13/13 pass
```

These are the deterministic pieces; the network adapters (see `SYLLABUS_ADAPTER_PLAN.md`) and the
AI parsing are built tomorrow on top of them.
