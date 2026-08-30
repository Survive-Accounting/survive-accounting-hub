// /s/<campus>/council — THE COUNCIL SHARE SCREEN.
//
// The one-screen version for a council officer who arrived by DM. One button: the whole message,
// every chapter's link in it, ready to paste into the chapter-presidents group chat she already
// has. The full council page stays exactly as it is for email traffic; this is a lightweight
// front door to it, not a replacement, and the last line is the door through.
//
// STATIC SEGMENT, DYNAMIC SIBLING: this route and /s/$campus/$chapter share a level. TanStack
// matches the static "council" first, so a chapter can never be slugged into shadowing it.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ShareButton, ShareFootnote, ShareHeading, ShareScreen } from "@/components/site/share/ShareScreen";
import { listGoChapters } from "@/lib/greek-go.functions";
import { COUNCILS, councilBySlug, councilMatches } from "@/lib/greek-councils.functions";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { boltForSlug, schoolBySlug } from "@/lib/schools";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { councilChapterLinksPost } from "@/lib/partners";
import { currentContactRef, rememberContactRef, withRef } from "@/lib/contact-ref";

const ORIGIN = "https://surviveaccounting.com";

export const Route = createFileRoute("/s/$campus/council")({
  // ?c=panhellenic — WHICH COUNCIL SHE RUNS, when the DM knew.
  //
  // Without it this screen hands a Panhellenic president every chapter on campus, fraternities
  // included, to paste into her sorority presidents' chat: 71 links where 18 were wanted. Lee
  // knows which council he is messaging when he sends the DM, so the link can say so. When it
  // does not, the screen falls back to every chapter and says which it is doing — a longer list
  // is recoverable, a silently wrong one is not.
  validateSearch: (s: Record<string, unknown>): { c?: string } =>
    typeof s.c === "string" && s.c ? { c: s.c } : {},
  loader: async ({ params }) => {
    const school = schoolBySlug(params.campus);
    if (!school) throw notFound();
    const codes = await listCampusIntroCodes({ data: { ids: [school.campusId] } }).catch(() => []);
    return {
      code: codes.find((c) => c.campusId === school.campusId)?.code ?? null,
      name: school.name,
      slug: school.slug,
    };
  },
  staleTime: 600_000,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: CouncilSharePage,
});

function CouncilSharePage() {
  const { code, name, slug } = Route.useLoaderData();
  const { c: councilParam } = Route.useSearch();
  const council = councilBySlug((councilParam ?? "").trim().toLowerCase());
  const bolt = boltForSlug(slug);
  const [copied, setCopied] = useState(false);

  useEffect(() => { rememberContactRef(currentContactRef()); }, []);
  const ref = typeof window === "undefined" ? null : currentContactRef();

  const q = useQuery({
    queryKey: ["go-chapters", slug],
    queryFn: () => listGoChapters({ data: { schoolSlug: slug } }),
    networkMode: "always",
    staleTime: 300_000,
  });
  // The council's own chapters when the link named one; everything otherwise.
  const chapters = useMemo(() => {
    const all = q.data ?? [];
    if (!council) return all;
    return all.filter((ch) => councilMatches(council, ch.council));
  }, [q.data, council]);

  // THE SAME MESSAGE THE FULL PAGE BUILDS — one implementation, so the DM front door and the
  // email destination can never hand out two different posts. Every link carries the ref that
  // brought her, which is how one DM to one officer becomes twenty attributed chapter visits.
  const message = useMemo(
    () => councilChapterLinksPost({
      courseCode: code,
      chapters: chapters.map((c) => ({
        name: c.name,
        url: withRef(`${ORIGIN}/go/${slug}/${c.slug}`, ref),
      })),
    }),
    [code, chapters, slug, ref],
  );

  const copy = async () => {
    if (!(await copyToClipboard(message))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2600);
  };

  return (
    <ShareScreen boltVars={bolt}>
      <ShareHeading
        title="Share with your chapters"
        sub={<>Everything in one message — paste it into your chapter presidents&apos; group chat.</>}
      />

      {council && (
        <p className="mt-2 text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.14em" }}>
          {council.name} <span aria-hidden style={{ opacity: 0.5 }}>·</span> {name}
        </p>
      )}

      <div className="mt-6 w-full">
        <ShareButton tone="solo" confirmed={copied} onClick={() => void copy()}>
          {copied
            ? "Copied — paste it in your group chat ✓"
            : q.isLoading
              ? "Loading chapters…"
              : `Copy message with all ${chapters.length} chapter links`}
        </ShareButton>
      </div>

      {/* An empty roster is stated, not hidden: a campus we have not scraped yet is a real answer,
          and a button promising "all 0 chapter links" is worse than saying so. */}
      {!q.isLoading && chapters.length === 0 && (
        <ShareFootnote>
          I don&apos;t have {name}&apos;s chapters listed yet — open the full page and I&apos;ll add them.
        </ShareFootnote>
      )}

      <ShareFootnote>
        Need flyers and slides instead?{" "}
        <a
          href={withRef(`/partners/council/${slug}/${council?.slug ?? COUNCILS[0].slug}#materials`, ref)}
          className="underline underline-offset-4"
          style={{ color: "var(--accent)" }}
        >
          Open the full page →
        </a>
      </ShareFootnote>
    </ShareScreen>
  );
}
