// /s/<campus> — THE DM DESTINATION.
//
// Where a direct message to a person (council or chapter officer) lands. One screen, no scrolling
// on a phone, and exactly one question: which chapter are you with? Selecting one goes straight
// to that chapter's share screen — the design target is fifteen seconds from tap to a link on the
// clipboard.
//
// NO ACCOUNT, NO EMAIL, NO FORM. Nothing on this path is gated; see the rules at the bottom of
// the brief. The three answers cover everyone a DM can reach: a chapter person, a council person,
// and a student who is neither.
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Bolt, BRAND_SANS } from "@/components/canvas/brand";
import { SearchPicker } from "@/components/site/SearchPicker";
import { ShareButton, ShareFootnote, ShareHeading, ShareScreen } from "@/components/site/share/ShareScreen";
import { listGoChapters } from "@/lib/greek-go.functions";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { boltForSlug, schoolBySlug } from "@/lib/schools";
import { currentContactRef, withRef } from "@/lib/contact-ref";
import { useRecordRefVisit } from "@/components/site/share/useRecordRefVisit";
import { nbspCode } from "@/lib/course-code";

export const Route = createFileRoute("/s/$campus/")({
  // The campus must be one we know; an unknown slug is said out loud rather than rendered as a
  // generic page, because these URLs go out in DMs and a typo should be findable.
  loader: async ({ params }) => {
    const school = schoolBySlug(params.campus);
    if (!school) throw notFound();
    const codes = await listCampusIntroCodes({ data: { ids: [school.campusId] } }).catch(() => []);
    return {
      code: codes.find((c) => c.campusId === school.campusId)?.code ?? null,
      name: school.name, slug: school.slug, campusId: school.campusId,
    };
  },
  staleTime: 600_000,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: CampusSharePage,
  notFoundComponent: () => (
    <ShareScreen>
      <ShareHeading title="I don't have that campus yet." sub="Check the link, or start from the front page." />
      <div className="mt-6 w-full"><ShareButton tone="chapter" href="/">Go to Survive →</ShareButton></div>
    </ShareScreen>
  ),
});

function CampusSharePage() {
  const { code, name, slug, campusId } = Route.useLoaderData();
  const nav = useNavigate();
  const bolt = boltForSlug(slug);

  // The ref that brought them: persisted for the window, and logged so a forwarded link is
  // visible as a visit against whoever sent it.
  useRecordRefVisit(campusId);
  const ref = typeof window === "undefined" ? null : currentContactRef();

  const q = useQuery({
    queryKey: ["go-chapters", slug],
    queryFn: () => listGoChapters({ data: { schoolSlug: slug } }),
    networkMode: "always",
    staleTime: 300_000,
  });
  const chapters = useMemo(() => q.data ?? [], [q.data]);
  const items = useMemo(
    () => chapters.map((c) => ({
      value: c.slug,
      label: c.name,
      // Searched, never shown — a student types "ADPi" or the Greek letters and still lands.
      aliases: [c.nickname, c.letters].filter(Boolean) as string[],
    })),
    [chapters],
  );

  return (
    <ShareScreen boltVars={bolt}>
      <span aria-hidden className="mb-5 block" style={{ width: 34 }}>
        <Bolt c1={bolt.c1} c2={bolt.c2} title={`${name} bolt`} />
      </span>

      <ShareHeading
        title={<>Free {code ? nbspCode(code) : "accounting"} prep for {name}</>}
        sub={<>The whole first exam — videos, practice questions, walkthroughs. Nothing to buy.</>}
      />

      <div className="mt-7 w-full" style={{ fontFamily: BRAND_SANS }}>
        <p className="mb-2 text-[13px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>
          Which chapter are you with?
        </p>
        <SearchPicker
          items={items}
          value={null}
          placeholder={q.isLoading ? "Loading chapters…" : chapters.length ? "Find your chapter" : "No chapters listed yet"}
          searchPlaceholder={`Search ${chapters.length} chapters…`}
          disabled={q.isLoading || !chapters.length}
          ariaLabel="Your chapter"
          onPick={(chapter) => void nav({ to: "/s/$campus/$chapter", params: { campus: slug, chapter }, search: ref ? { ref } : undefined })}
        />

        <div className="mt-2.5 flex flex-col gap-2">
          <ShareButton tone="quiet" href={withRef(`/s/${slug}/council`, ref)}>I&apos;m with a council →</ShareButton>
          {/* A student who is neither goes to the ordinary free Exam 1 flow, not a share screen. */}
          <ShareButton tone="quiet" href={withRef(`/${slug}`, ref)}>I&apos;m just a student →</ShareButton>
        </div>
      </div>

      {chapters.length === 0 && !q.isLoading && (
        <ShareFootnote>
          I don&apos;t have {name}&apos;s chapters listed yet — the student link above still works.
        </ShareFootnote>
      )}
    </ShareScreen>
  );
}
