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
import { ALL_SCHOOLS, boltForSlug, schoolBySlug } from "@/lib/schools";
import { listCampusIntroCodes, type CampusIntroCode } from "@/lib/default-map.functions";
import { SearchPicker } from "@/components/site/SearchPicker";
import { ChapterSelfCreate } from "@/components/site/ChapterSelfCreate";
import { NotListedForm } from "@/components/site/NotListedForm";
import { listGoChapters } from "@/lib/greek-go.functions";

export interface FinderSchool { slug: string; name: string }

export function ChapterFinder({ schools, onPick, cta = "Go to my chapter", busy = false, note, card = false, header, escapeHatches = false, initialSchool, codes }: {
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
  /** Offer "My school / chapter isn't listed" beneath the button. */
  escapeHatches?: boolean;
  /** Pre-selected school slug. A campus page's "For fraternities & sororities" link arrives
   *  already knowing the school, so making the visitor find it again in a dropdown is a step
   *  that exists only to be redone. Ignored unless it matches a listed school. */
  initialSchool?: string;
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
    return schools.map((s) => ({
      value: s.slug,
      label: s.name,
      meta: codeByCampus.get(schoolBySlug(s.slug)?.campusId ?? "") ?? "",
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
          <ChapterSelfCreate schoolSlug={school} schoolName={schoolName} onClose={() => setNotListed(null)} />
        ) : (
          <NotListedForm kind={notListed} school={notListed === "chapter" ? schoolName : undefined} onClose={() => setNotListed(null)} />
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
            onPick={(v) => { setSchool(v); setChapter(""); }}
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
            onPick={setChapter}
          />

          {/* An empty list is stated, not hidden. A school whose roster we don't have yet is a real
              answer, and silently showing an empty dropdown reads as the page being broken. */}
          {school && !q.isLoading && !chapters.length && (
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              I don&apos;t have chapters listed for that school yet — tell me below and I&apos;ll add yours.
            </p>
          )}

          <button
            type="button"
            disabled={!picked || busy}
            onClick={() => picked && onPick(school, picked.slug, picked.name)}
            className="w-full rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40"
            style={{ minHeight: 48, background: "var(--accent)", color: "#0B1220" }}
          >
            {busy ? "…" : cta}
          </button>

          {escapeHatches && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <button type="button" onClick={() => setNotListed("school")} className="text-[12px] underline underline-offset-4" style={{ color: "var(--text-muted)" }}>
                My school isn&apos;t listed →
              </button>
              <button type="button" onClick={() => setNotListed("chapter")} className="text-[12px] underline underline-offset-4" style={{ color: "var(--text-muted)" }}>
                My chapter isn&apos;t listed →
              </button>
            </div>
          )}

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
