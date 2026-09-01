// /s/<campus>/<chapter> — THE CHAPTER SHARE SCREEN.
//
// Reached from a chapter-account DM, or after picking a chapter on /s/<campus>. One screen: the
// chapter's link, a copy button, and a ready-to-paste GroupMe message.
//
// ── WHY THIS IS NOT /go/<campus>/<chapter> ────────────────────────────────────────────────────
// The brief's routing table names /go/<campus>/<chapter> as the one-screen chapter destination,
// but that route is the FULL chapter page — hero, two doors, share kit, proof, FAQ. The same
// brief says of the council equivalent: "The full council page stays exactly as it is for email
// traffic. This is a lightweight front door to it, not a replacement." That principle is applied
// here too, so the full chapter page keeps working for every link already in the wild and this is
// the light front door beside it.
//
// If the intent really was to replace the full page, that is a routing change — this screen is a
// component and would serve either path unchanged.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { ShareButton, ShareFootnote, ShareHeading, ShareScreen } from "@/components/site/share/ShareScreen";
import { getGoChapter } from "@/lib/greek-go.functions";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { boltForSlug, schoolBySlug } from "@/lib/schools";
import { chapterShortName } from "@/components/site/ChapterShare";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { currentContactRef, withRef } from "@/lib/contact-ref";
import { useRecordRefVisit } from "@/components/site/share/useRecordRefVisit";
import { nbspCode } from "@/lib/course-code";
import { LEE_SIGNOFF } from "@/lib/partners";

const ORIGIN = "https://surviveaccounting.com";

export const Route = createFileRoute("/s/$campus/$chapter")({
  loader: async ({ params }) => {
    const school = schoolBySlug(params.campus);
    if (!school) throw notFound();
    const chapter = await getGoChapter({ data: { schoolSlug: params.campus, chapterSlug: params.chapter } }).catch(() => null);
    if (!chapter) throw notFound();
    const codes = await listCampusIntroCodes({ data: { ids: [school.campusId] } }).catch(() => []);
    return {
      code: codes.find((c) => c.campusId === school.campusId)?.code ?? null,
      schoolName: school.name,
      schoolSlug: school.slug,
      campusId: school.campusId,
      chapterSlug: params.chapter,
      chapterName: chapter.chapterName,
      letters: (chapter.letters ?? "").trim() || chapterShortName(chapter.chapterName, chapter.letters, chapter.nickname),
    };
  },
  staleTime: 600_000,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: ChapterSharePage,
  notFoundComponent: () => (
    <ShareScreen>
      <ShareHeading title="I don't have that chapter yet." sub="Check the link, or find your chapter from the front page." />
      <div className="mt-6 w-full"><ShareButton tone="chapter" href="/chapters">Find your chapter →</ShareButton></div>
    </ShareScreen>
  ),
});

function ChapterSharePage() {
  const d = Route.useLoaderData();
  const bolt = boltForSlug(d.schoolSlug);
  const [copied, setCopied] = useState<"link" | "message" | null>(null);

  useRecordRefVisit(d.campusId);
  const ref = typeof window === "undefined" ? null : currentContactRef();

  // THE LINK THEY HAND OUT CARRIES THE TAG THAT BROUGHT THEM. This is the whole mechanism by
  // which chapter-to-chapter spread becomes visible: one DM to one officer, then every member
  // who opens what she forwards is attributed back to that first contact.
  const plain = `${ORIGIN}/go/${d.schoolSlug}/${d.chapterSlug}`;
  const tagged = withRef(plain, ref);
  const course = d.code ? nbspCode(d.code) : "intro accounting";

  const message = [
    `Free prep for ${course} — the entire first exam is free.`,
    `Videos, practice questions, full walkthroughs.`,
    tagged,
    ``,
    // A PERSON, WITH A NUMBER, ON EVERY PASTEABLE MESSAGE. Whoever pastes this is putting their
    // own credibility behind it, and "text Lee Ingram, the tutor behind it" is what makes the
    // thing they pasted answerable by a human rather than by a brand.
    LEE_SIGNOFF,
  ].join("\n");

  const copy = async (what: "link" | "message", text: string) => {
    // Only ever confirm a copy that actually happened — see copyToClipboard.
    if (!(await copyToClipboard(text))) return;
    setCopied(what);
    window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2400);
  };

  return (
    <ShareScreen boltVars={bolt}>
      <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.14em", fontFamily: BRAND_SANS }}>
        {d.letters} <span aria-hidden style={{ opacity: 0.5 }}>·</span> {d.schoolName}
      </p>

      <ShareHeading title="Send this to your members" />

      {/* THE URL IN PLAIN SIGHT. Clipboard access is blocked in several of the in-app browsers a
          DM opens links in, and a link nobody can read is a dead end. Shown without the tag so it
          stays short enough to read and type. */}
      <p
        className="mt-4 w-full break-all rounded-xl px-4 py-3 text-[14px] font-bold"
        style={{ background: "rgba(0,0,0,0.28)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", fontFamily: BRAND_SANS }}
      >
        {plain.replace("https://", "")}
      </p>

      <div className="mt-3 flex w-full flex-col gap-2 sm:flex-row">
        <ShareButton tone="solo" confirmed={copied === "link"} onClick={() => void copy("link", tagged)}>
          {copied === "link" ? "Link copied ✓" : "Copy link"}
        </ShareButton>
        <ShareButton tone="chapter" confirmed={copied === "message"} onClick={() => void copy("message", message)}>
          {copied === "message" ? "Message copied ✓" : "Copy message"}
        </ShareButton>
      </div>

      <ShareFootnote>
        Want the whole semester for your chapter?{" "}
        <a href={withRef(`/go/${d.schoolSlug}/${d.chapterSlug}#claim`, ref)} className="underline underline-offset-4" style={{ color: "var(--accent)" }}>
          See chapter plans →
        </a>
      </ShareFootnote>
    </ShareScreen>
  );
}
