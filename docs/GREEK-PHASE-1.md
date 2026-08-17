# Greek Vertical — Phase 1

Branch: `greek-phase-1`, on top of `main` @ `05dba48` (Landing Pass 5). Per the sequencing call,
Pass 5 landed on main first, so there is no collision in the player's panel-state code.

**Phase 1 is code-complete but NOT live-verified.** It cannot be until `0115` is applied and the
slug backfill runs — see *Gate* at the bottom.

---

## The shape change

0111 modelled Greek as **claim-first**: a chapter did not exist until an exec signed up, verified a
phone over SMS, and had a `/c/<slug>` link minted. That is why `greek_chapters` has 0 rows — the
1,107 real chapters already in `campus_greek_chapters` had no way to be represented.

Phase 1 inverts it. Every roster chapter is **public from day one**:

```
/go/<campuses.slug>/<campus_greek_chapters.slug>
```

Both halves come from rows that already exist. Nothing is seeded, nothing is imported.

### Why (school, chapter) and not one flat slug

`/c/olemiss-ato` was a single global namespace, so 'ato' at sixteen SEC campuses had to fight over
one string. Scoping the slug to the campus makes it unique where it actually needs to be unique —
`campus_greek_chapters_campus_slug_idx` is a partial unique index on `(campus_id, slug)`.

---

## Link law

**No surface generates a `/c/` link any more.** `goPath()` in `greek-go.functions.ts` is the single
place a chapter URL is built; every other surface calls it. Three emitters were rewritten:

| Surface | Was | Now |
|---|---|---|
| `verifyChapterPhone` (signup confirmation) | `/c/${slug}` | `goUrlForChapter()` |
| `getChapterDashboard` (exec dashboard, copy button + QR) | `/c/${slug}` | `goUrlForChapter()` |
| Landing chapter banner claim | `claimChapterAccess({slug})` | `tagChapterMember({schoolSlug, chapterSlug})` |

`goUrlForChapter()` returns **null** when a chapter has no roster row behind it. That is deliberate:
the dashboard shows "your share link is being set up" instead of falling back to a `/c/` URL and
minting a fresh legacy link at the moment we're trying to retire them. `/c/$slug` is now
`beforeLoad` + `throw redirect(301)` with no component at all.

---

## The invariant

> one account per student, chapter membership as an attribute; zero member rows duplicated or
> orphaned across old/new keying.

Three things enforce it:

1. `greek_chapter_members.user_id` → `auth.users(id)` — **confirmed as the identity table**;
   `profiles` is live but has 0 rows and could not report a shape.
2. `greek_chapter_members_chapter_user_idx` — unique on `(chapter_id, user_id)`. A second join from
   the same account is a no-op upsert, not a second person.
3. `tagChapterMember` de-dupes anonymous tags on phone, the only stable handle a student without an
   account has.

Nothing is re-keyed or migrated, because **both 0111 tables are empty** (re-verified immediately
before 0115 was finalised). There is no old data to orphan.

### Shell chapter rows

A chapter can bank members before anyone claims it, but `greek_chapter_members` keys to
`greek_chapters`. So the first join materialises an unclaimed shell row — which is what the three
relaxed `admin_*` NOT NULLs in 0115 are for. `school_name` / `chapter_name` / `slug` stay NOT NULL
because all three are fillable from the roster row: a shell is a complete chapter record that simply
has no admin yet.

**One link, one direction**: `greek_chapters.campus_greek_chapter_id` (unique). An earlier draft of
0115 also put `greek_chapter_id` on `campus_greek_chapters`; two FKs between the same two tables can
disagree, so that one was dropped before the file was sent.

---

## Slugs

Source is the **greek_orgs name**, audited before choosing:

- all 1,107 rows have a `greek_org_id` (0 missing globally) — the name is always reachable;
- `greek_orgs.letters` is empty across all 150 orgs — unusable;
- `nickname` exists for roughly half and is absent for every NPHC org — using it would give a URL
  scheme whose shape depended on which council a chapter belonged to.

`greekChapterSlug()` strips the organisational tail so `"Alpha Kappa Alpha Sorority, Inc."` and
`"Alpha Kappa Alpha"` land on **one** slug. It lives in `src/lib/greek-slug.ts` with its own test
file, and the backfill script imports it rather than re-implementing it — these URLs go on printed
flyers, so the rule that generated a URL in August must still generate it in November.

---

## Attribution

`greek_chapter_members.source` is `link` | `self_report` | `exec_invite`.

Chapter links get forwarded. A student arriving from a friend in another house would otherwise be
credited to whichever flyer they scanned, quietly making every chapter's count wrong. The `/go/`
page carries a **self-report** at the foot — closed by default, because the student came to study
and their social life is not worth interrupting that for.

---

## Files

| File | |
|---|---|
| `migration/supabase-migrations/0115_greek_phase1.sql` | new — **not applied** |
| `migration/supabase-migrations/backfill_greek_slugs.ts` | new — dry-run by default, `--apply` to write |
| `migration/supabase-migrations/audit_greek_live.ts` | new — read-only schema audit |
| `src/lib/greek-go.functions.ts` | new — `getGoChapter`, `listGoSchools`, `listGoChapters`, `tagChapterMember`, `resolveLegacyChapterSlug`, `goPath` |
| `src/lib/greek-slug.ts` + `.test.ts` | new — the slug rule, 6 tests |
| `src/components/site/ChapterFinder.tsx` | new — school + chapter picker, shared by both surfaces |
| `src/routes/go.$school.$chapter.tsx` | new — canonical page + self-report |
| `src/routes/c.$slug.tsx` | rewritten — 301 only |
| `src/routes/chapters.tsx` | leads with "find your chapter"; signup demoted to "my chapter isn't listed" |
| `src/routes/chapters_.dashboard.tsx` | handles a null share link |
| `src/routes/landing.tsx` | `chapterSlug` → `goChapter: {schoolSlug, chapterSlug}` |

---

## Verification

**Passing now:** `tsc --noEmit` clean · `bun test` 1055 pass / 0 fail (6 new) · production build
clean · zero console errors on `/go/…` and `/chapters`.

**Verified in the browser (pre-migration):**

- `/go/university-of-mississippi/phi-kappa-psi` → 200, renders the full player, **indexable** (no
  `noindex`, unlike `/c/`).
- Degrades correctly without 0115: `getGoChapter` returns null, so the page falls through to the
  plain landing page — no crash, no 404. A bad flyer QR lands the student on something that works.
- `/c/<slug>` issues a **server-side redirect** (`redirected: true`, `opaqueredirect` under
  `redirect: "manual"`), never renders a component.
- `/chapters` shows the finder, the CTA, the "my chapter isn't listed" fallback and the reworked
  three beats; the signup flow is still reachable at `#signup`.

**NOT verified — and cannot be until the gate clears:**

1. Any `/go/` page resolving to a **real chapter** — needs `slug` to exist and be backfilled. Today
   the school dropdown is correctly empty and every `/go/` URL falls through.
2. The `/c/` → `/go/` **resolving** branch. The redirect mechanism is verified; the lookup is not,
   because `greek_chapters` has 0 rows, so there is no legacy link in existence to resolve. It
   currently redirects to `/`, which is the correct unresolvable-slug behaviour.
3. `tagChapterMember` writing a row, and the unique-index upsert actually collapsing a second join.
4. The invariant counts.

---

## Gate

1. Apply `0115` (sent for copy/paste into the Supabase SQL editor — idempotent, safe to re-run).
2. `bun run migration/supabase-migrations/backfill_greek_slugs.ts` — **dry run**, review the plan.
3. Same command `--apply`.
4. Then: re-run the audit, verify member counts and the two unique indexes, and walk a real `/go/`
   page end to end — including a double-join to prove one account produces one row.

Nothing merges to `main` until step 4 reports clean.
