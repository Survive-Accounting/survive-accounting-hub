// CHAPTER FINDER — school + chapter -> /go/<school>/<chapter>. Phase 1.
//
// Two surfaces use it and they want opposite things from the same two picks:
//
//   * /chapters (an exec looking for their own chapter) NAVIGATES to the page.
//   * a /go/ page (a student who arrived on the wrong chapter's link) SELF-REPORTS, writing an
//     attribution row with source "self_report" and staying where they are.
//
// One component, one `onPick`, because the pick is the same act either way — the difference is
// what the caller does with it, not what the student does.
//
// `card` mode is the /chapters hero. The two dropdowns and the button used to sit bare on the page
// with an unrelated link floating under them, which read as three loose controls rather than one
// thing to do. In a card with a header they read as a form, and the escape hatches sit inside it
// where someone who has just failed to find themselves will actually look.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { Bolt } from "@/components/canvas/brand";
import { ALL_SCHOOLS, boltForSlug, CONFERENCE_ORDER, schoolBySlug } from "@/lib/schools";
import { listCampusIntroCodes, type CampusIntroCode } from "@/lib/default-map.functions";
import { PickerNotListed, SearchPicker } from "@/components/site/SearchPicker";
import { ChapterSelfCreate } from "@/components/site/ChapterSelfCreate";
import { NotListedForm } from "@/components/site/NotListedForm";
import { listGoChapters } from "@/lib/greek-go.functions";

export interface FinderSchool { slug: string; name: string }

export function ChapterFinder({ schools, onPick, cta = "Go to my chapter", busy = false, note, card = false, header, escapeHatches = false, initialSchool, codes, autoPick = false }: {
  schools: FinderSchool[];
  onPick: (schoolSlug: string, chapterSlug: string, chapterName: string) => void;
  cta?: string;
  busy?: boolean;
  note?: string;
  /** Wrap in the panel styling used by "Set up your chapter". */
  card?: boolean;
  /** Optional heading inside the card. /chapters passes none: the page headline already says
   *  "Find your chapter." and repeating it inside the card was one heading too many. */
  header?: string;
  /** Course codes resolved by the caller (route loader) so the rows carry them on first paint.
   *  The client query below still runs and wins once it answers. */
  codes?: CampusIntroCode[];
  /** Offer the "Don't see your school or chapter?" write-in beneath the controls. */
  escapeHatches?: boolean;
  /** Pre-selected school slug. A campus page's "For fraternities & sororities" link arrives
   *  already knowing the school, so making the visitor find it again in a dropdown is a step
   *  that exists only to be redone. Ignored unless it matches a listed school. */
  initialSchool?: string;
  /** Picking a chapter fires onPick immediately and the confirm button is not rendered. The
   *  portal uses this: the chapter IS the decision. The self-report on a chapter page keeps the
   *  button, because there the pick writes an attribution row and deserves a deliberate press. */
  autoPick?: boolean;
}) {
  const [school, setSchool] = useState(() => (initialSchool && schools.some((s) => s.slug === initialSchool) ? initialSchool : ""));
  const [chapter, setChapter] = useState("");
  const [notListed, setNotListed] = useState<null | "school" | "chapter">(null);

  // Only fetched once a school exists: the chapter list is per-campus and there are 1,107 rows
  // overall, so there is no meaningful "all chapters" list to show first.
  // Course codes for the picker rows. Same source as the landing picker, so a school shows the
  // same code in both places or no code in both places — never one and not the other.
  // Caller-supplied codes seed the cache, so a route that loaded them on the server never refetches
  // them on mount and the rows never flip from "no code" to "code".
  const codesQ = useQuery({
    queryKey: ["campus-intro-codes"],
    queryFn: () => listCampusIntroCodes({ data: { ids: ALL_SCHOOLS.map((x) => x.campusId) } }),
    staleTime: 600_000, networkMode: "always",
    initialData: codes,
  });
  const codeData = useMemo(() => codesQ.data ?? codes ?? [], [codesQ.data, codes]);

  const q = useQuery({
    queryKey: ["go-chapters", school],
    queryFn: () => listGoChapters({ data: { schoolSlug: school } }),
    enabled: !!school,
    networkMode: "always",
    staleTime: 300_000,
  });
  const chapters = useMemo(() => q.data ?? [], [q.data]);
  const picked = chapters.find((c) => c.slug === chapter);
  const schoolName = schools.find((s) => s.slug === school)?.name;

  // The option lists are built once per data change, not per keystroke: each school row carries a
  // Bolt element, and SearchPicker filters the SAME array reference on every character typed.
  const schoolItems = useMemo(() => {
    const codeByCampus = new Map(codeData.map((r) => [r.campusId, r.code]));
    // Group by conference, same order and Ole-Miss-first-in-SEC rule as every other school picker
    // (see orderedSchoolsForPicker in schools.ts). Conference is looked up per slug because the
    // FinderSchool prop only carries slug + name; an unresolved slug sorts to the end as "Other".
    const rank = (slug: string) => { const i = CONFERENCE_ORDER.indexOf((schoolBySlug(slug)?.conference ?? "Other") as (typeof CONFERENCE_ORDER)[number]); return i < 0 ? CONFERENCE_ORDER.length : i; };
    const isOle = (slug: string) => slug === "university-of-mississippi";
    const ordered = [...schools].sort((a, b) => {
      const ra = rank(a.slug), rb = rank(b.slug);
      if (ra !== rb) return ra - rb;
      if (schoolBySlug(a.slug)?.conference === "SEC" && isOle(a.slug) !== isOle(b.slug)) return isOle(a.slug) ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return ordered.map((s) => ({
      value: s.slug,
      label: s.name,
      meta: codeByCampus.get(schoolBySlug(s.slug)?.campusId ?? "") ?? "",
      group: schoolBySlug(s.slug)?.conference,
      // The bolt is the school's own colourway — the row reads as that school at a glance
      // rather than as a line of text in a list.
      icon: <span className="block shrink-0" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(s.slug)} /></span>,
    }));
  }, [schools, codeData]);
  const chapterItems = useMemo(() => chapters.map((c) => ({
    value: c.slug,
    label: c.name,
    // Search aliases, never displayed: a student types "ADPi", "Alpha Chi" or the Greek letters
    // ("ΑΔΠ") and still lands on the one canonical row. The full org name stays the label so
    // every chapter reads the same shape in the list.
    aliases: [c.nickname, c.letters].filter(Boolean) as string[],
  })), [chapters]);

  const body = (
    <div className="flex w-full flex-col gap-2" style={{ fontFamily: BRAND_SANS }}>
      {notListed ? (
        // A chapter needs a campus, so self-creation is offered only once a school is chosen.
        // Without one we fall back to the plain write-in, which can at least capture who asked.
        notListed === "chapter" && school ? (
          // A school IS picked, so the strongest answer is not a form: they pick their org from
          // the national list and land on a working /go/ page for it.
          <ChapterSelfCreate schoolSlug={school} schoolName={schoolName} onClose={() => setNotListed(null)} />
        ) : (
          // No school picked — one form covers both halves of "don't see your school or chapter".
          <NotListedForm
            kind={notListed}
            school={notListed === "chapter" ? schoolName : undefined}
            askChapter
            title="Which school and chapter?"
            onClose={() => setNotListed(null)}
          />
        )
      ) : (
        <>
          {/* The site's own picker, not a native <select>. A native dropdown renders as an OS
              list — white, system font, nothing to do with the page around it. */}
          <SearchPicker
            items={schoolItems}
            value={school || null}
            placeholder="Pick your school to start"
            searchPlaceholder={`Search ${schools.length} schools…`}
            collapsibleGroup="Other"
            onPick={(v) => { setSchool(v); setChapter(""); }}
            footer={escapeHatches ? <PickerNotListed label="Don't see your school?" onClick={() => setNotListed("school")} /> : undefined}
          />

          {/* The control stays mounted and in place while its options load — only its label
              changes. Before a school exists it says so, rather than claiming there are no
              chapters. */}
          <SearchPicker
            items={chapterItems}
            value={chapter || null}
            placeholder={!school ? "Pick your school first" : q.isLoading ? "Loading chapters…" : chapters.length ? "Your chapter…" : "No chapters listed yet"}
            searchPlaceholder={`Search ${chapters.length} chapters…`}
            disabled={!school || q.isLoading}
            disabledHint="Pick your school first"
            onPick={(v) => {
              setChapter(v);
              if (autoPick) { const c = chapters.find((x) => x.slug === v); if (c) onPick(school, c.slug, c.name); }
            }}
            footer={escapeHatches && school ? <PickerNotListed label="Don't see your chapter?" onClick={() => setNotListed("chapter")} /> : undefined}
          />

          {/* An empty list is stated, not hidden. A school whose roster we don't have yet is a real
              answer, and silently showing an empty dropdown reads as the page being broken. */}
          {school && !q.isLoading && !chapters.length && (
            <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
              I don&apos;t have chapters listed for that school yet — tell me below and I&apos;ll add yours.
            </p>
          )}

          {!autoPick && (
            <button
              type="button"
              disabled={!picked || busy}
              onClick={() => picked && onPick(school, picked.slug, picked.name)}
              className="w-full rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40"
              style={{ minHeight: 48, background: "var(--accent)", color: "#0B1220" }}
            >
              {busy ? "…" : cta}
            </button>
          )}

          {/* The escape hatches now live INSIDE each picker as the orange v1 "Don't see your
              school?" / "Don't see your chapter?" footer row (see the SearchPicker footer props
              above), so there is no separate stacked link here any more. */}

          {note && <p className="text-center text-[12px]" style={{ color: "var(--text-muted)" }}>{note}</p>}
        </>
      )}
    </div>
  );

  if (!card) return body;

  return (
    <div className="w-full rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
      {header && <h2 className="mb-3 text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{header}</h2>}
      {body}
    </div>
  );
}
