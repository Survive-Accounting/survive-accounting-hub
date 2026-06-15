## Phase 4 — Course Availability Engine

Drive landing-page CTAs (Book / Waitlist / Hide) from course-family availability + textbook match status, with global defaults Lee can flip each semester and per-campus overrides.

---

### 1. Database changes (one migration)

**a. Extend `outreach_settings`** (singleton row) with global course-family defaults:

- `intro_1_availability text not null default 'available'`
- `intro_2_availability text not null default 'available'`
- `intermediate_1_availability text not null default 'waitlist'`
- `intermediate_2_availability text not null default 'waitlist'`

CHECK each in `('available','waitlist','unavailable')`.

**b. New table `public.campus_course_availability`** (one row per campus × course family — the per-campus override layer):

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `campus_id` | uuid FK → campuses(id) ON DELETE CASCADE | |
| `course_family` | text | CHECK in (`intro_1`,`intro_2`,`intermediate_1`,`intermediate_2`) |
| `textbook_match_status` | text | CHECK in (`matched`,`likely_match`,`not_matched`,`unknown`), default `unknown` |
| `tutoring_availability` | text nullable | CHECK in (`available`,`waitlist`,`unavailable`); NULL = inherit global default |
| `requires_syllabus_review` | boolean default false | |
| `notes` | text | |
| `created_at` / `updated_at` | timestamptz | `set_updated_at` trigger |

Unique `(campus_id, course_family)`. Index on `campus_id`. GRANTS: anon SELECT (landing page reads), authenticated full, service_role all. RLS: anon read, auth all.

**Effective availability = `coalesce(row.tutoring_availability, outreach_settings.<family>_availability)`** — computed in JS, no view needed.

**c. Re-use `outreach_waitlist_signups`** for waitlist captures. Add columns if missing:

- `course_family text` (which family they joined)
- `syllabus_file_path text` (Storage object key)
- `notes text`

(Name / email / phone / school / course already covered by existing columns — verify in migration and add only what's missing.)

**d. Storage bucket** `course-syllabi` (public read off, anon insert allowed via signed-upload policy) for syllabus uploads from the landing page.

---

### 2. API layer (`src/lib/outreach-api.ts`)

Additive — no existing function changes:

- `getOutreachSettings()` / `updateCourseFamilyDefault(family, value)`
- `getCampusCourseAvailability(campusId)` → returns 4 rows (auto-seed missing families with defaults on first read)
- `upsertCampusCourseAvailability(campusId, family, patch)`
- `getEffectiveCourseAvailability(campusId)` — merges overrides with global defaults, returns `{ family, effective, textbook_match_status, requires_syllabus_review }[]`
- `submitCourseWaitlist(payload)` — writes `outreach_waitlist_signups` + optional syllabus upload

TypeScript types: `CourseFamily`, `TutoringAvailability`, `TextbookMatchStatus`, `CampusCourseAvailability`.

---

### 3. Admin UI

**a. Outreach Settings → new "Course Availability" section** (new component `CourseAvailabilitySettings.tsx`, slotted into the existing settings area on the Email Queue tab via `ScheduleAndSettingsPanel`):

Four rows, each a 3-way segmented control (Available / Waitlist / Unavailable). Saves to `outreach_settings`. Helper copy: "Global defaults. Individual campuses can override."

**b. `ApproveCampusModal.tsx` — new "Course Availability" sub-section**:

For each of the 4 families show:
- Textbook match status dropdown (matched / likely / not_matched / unknown)
- Tutoring availability override (Inherit / Available / Waitlist / Unavailable) — Inherit shows the resolved global default inline
- "Requires syllabus review" checkbox

**Approval rule wired in:** when Lee saves the modal, any family where `textbook_match_status != 'matched'` AND override is still `Inherit` is auto-set to `waitlist` (override row written, not the global). He can manually flip back to Available afterward.

---

### 4. Landing page logic (`src/routes/outreach_.school.$slug.tsx` + `Hero` / new `CourseCtaList`)

Replace the current single "Book Tutoring" CTA with a per-course list driven by `getEffectiveCourseAvailability(campusId)`:

For each family present on the campus:

- `matched` + `available` → **Book Tutoring** button (opens existing `BookTutoringModal`, pre-fills course)
- `waitlist` (any match status) → **Join Waitlist** + **Upload Syllabus** buttons (opens new `CourseWaitlistModal`)
- `unavailable` → hide row entirely

The existing course-codes strip stays. Hybrid campuses (Intro available, Intermediate waitlist) work naturally because each family is evaluated independently.

**New component `CourseWaitlistModal.tsx`** — fields: name, email, phone (prefilled school + course family), syllabus file input (uploads to `course-syllabi`), notes. Posts via `submitCourseWaitlist`.

---

### 5. Files touched

**New**
- `supabase/migrations/<ts>_course_availability_engine.sql`
- `src/components/outreach/CourseAvailabilitySettings.tsx`
- `src/components/landing/CourseCtaList.tsx`
- `src/components/landing/CourseWaitlistModal.tsx`

**Edited**
- `src/lib/outreach-api.ts` — new functions + types
- `src/components/outreach/ApproveCampusModal.tsx` — course availability section + auto-waitlist-on-save rule
- `src/components/outreach/ScheduleAndSettingsPanel.tsx` — mount `CourseAvailabilitySettings`
- `src/routes/outreach_.school.$slug.tsx` — render `CourseCtaList`, keep current Hero as fallback when no families configured

**Untouched**
- Existing `BookTutoringModal`, manual lead import, AI lead suggestion flow, campus-level booking — none of this changes.

---

### 6. Open questions before I build

1. **Where do the 4 course families live per campus today?** `campuses.course_codes` is a free-text array (e.g. `["ACCT 201", "ACCT 311"]`). Should I (a) ask Lee to tag each course code with a family in the Approve modal, or (b) auto-classify by keyword (201/2010 → intro_1, 311/3110 → intermediate_1, etc.) with a manual override? Option (b) is faster but fuzzy.
2. **Waitlist storage bucket** — OK to enable anon uploads to a new `course-syllabi` bucket (size cap + mime filter)? Alternative is emailing the syllabus to Lee instead of storing it.
3. **Should the global defaults section live on the Email Queue tab** (where `ScheduleAndSettingsPanel` already is) **or under a new Settings tab**? Defaulting to the existing panel to avoid a new tab.
