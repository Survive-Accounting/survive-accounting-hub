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
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { ShareFootnote, ShareHeading, ShareScreen } from "@/components/site/share/ShareScreen";
import { SHARE_ICONS, ShareOption, useCopyRow } from "@/components/site/council/CouncilShareOptions";
import { BRAND_SANS } from "@/components/canvas/brand";
import { listGoChapters } from "@/lib/greek-go.functions";
import { COUNCILS, councilBySlug, councilMatches } from "@/lib/greek-councils.functions";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { boltForSlug, schoolBySlug } from "@/lib/schools";
import { LEE_PHONE_DISPLAY, LEE_SMS_HREF, councilChapterLinksPost, councilPortalPost } from "@/lib/partners";
import { currentContactRef, withRef } from "@/lib/contact-ref";
import { useRecordRefVisit } from "@/components/site/share/useRecordRefVisit";

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
      campusId: school.campusId,
    };
  },
  staleTime: 600_000,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: CouncilSharePage,
});

function CouncilSharePage() {
  const { code, name, slug, campusId } = Route.useLoaderData();
  const { c: councilParam } = Route.useSearch();
  const council = councilBySlug((councilParam ?? "").trim().toLowerCase());
  const bolt = boltForSlug(slug);

  useRecordRefVisit(campusId);
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

  // ── THE PRIMARY SHARE: ONE LINK ────────────────────────────────────────────────────────────
  // /s/<campus> — the picker every chapter can find itself in. Carries the ref that brought her,
  // which is how one DM to one officer becomes twenty attributed chapter visits without her
  // having to choose the right row out of eighteen.
  const portalMessage = useMemo(
    () => councilPortalPost({
      courseCode: code,
      schoolName: name,
      portalUrl: withRef(`${ORIGIN}/s/${slug}`, ref),
    }),
    [code, name, slug, ref],
  );

  // THE SAME BULK MESSAGE THE FULL PAGE BUILDS — one implementation, so the DM front door and the
  // email destination can never hand out two different posts.
  const bulkMessage = useMemo(
    () => councilChapterLinksPost({
      courseCode: code,
      chapters: chapters.map((c) => ({
        name: c.name,
        url: withRef(`${ORIGIN}/go/${slug}/${c.slug}`, ref),
      })),
    }),
    [code, chapters, slug, ref],
  );

  const portal = useCopyRow(portalMessage);
  const bulk = useCopyRow(bulkMessage);

  // Whichever message was last acted on — shown so she can see exactly what she is about to
  // paste, and shown even when the copy FAILED so she can select it by hand instead of walking
  // away thinking she has it.
  const shown = portal.copied || portal.failed ? portalMessage : bulk.copied || bulk.failed ? bulkMessage : null;
  const shownFailed = portal.failed || bulk.failed;

  return (
    <ShareScreen boltVars={bolt}>
      <ShareHeading
        title="Share with your chapters"
        sub={<>One link. Every chapter finds its own page.</>}
      />

      {council && (
        <p className="mt-2 text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.14em" }}>
          {council.name} <span aria-hidden style={{ opacity: 0.5 }}>·</span> {name}
        </p>
      )}

      {/* ── THE FOUR OPTIONS, IN ORDER ────────────────────────────────────────────────────────
          Portal first and marked Default; bulk second for councils who prefer it; then one
          chapter at a time; then the meeting materials. See CouncilShareOptions.tsx for why the
          order is the way round it is. */}
      <div className="mt-6 flex w-full flex-col gap-2.5">
        <ShareOption
          tone="primary"
          badge="Default"
          icon={SHARE_ICONS.portal}
          title={portal.copied ? "Copied — paste it in your group chat" : "Share the portal link"}
          sub="One link. Chapters find themselves."
          confirmed={portal.copied}
          onClick={() => void portal.copy()}
        />

        <ShareOption
          icon={SHARE_ICONS.bulk}
          title={bulk.copied ? "Copied — all chapter links" : "Bulk message with every chapter link"}
          sub={q.isLoading ? "Loading chapters…" : `${chapters.length} link${chapters.length === 1 ? "" : "s"}, one paste.`}
          confirmed={bulk.copied}
          disabled={q.isLoading || chapters.length === 0}
          onClick={() => void bulk.copy()}
        />

        <ShareOption
          icon={SHARE_ICONS.chapter}
          title="Share individual chapters"
          sub="Pick one, get that chapter's link."
          href={withRef(`/s/${slug}`, ref)}
        />

        <ShareOption
          icon={SHARE_ICONS.materials}
          title="Flyers and slides"
          sub="A printable flyer and a one-slide deck for chapter meeting."
          href={withRef(`/partners/council/${slug}/${council?.slug ?? COUNCILS[0].slug}#materials`, ref)}
        />
      </div>

      {/* ── WHAT LANDED ON THE CLIPBOARD, WHEN IT ACTUALLY DID ────────────────────────────────
          Shown after a copy, and shown INSTEAD of a silent nothing when the browser blocked it.
          The riskiest second on this page is the one after the tap: the exec has something
          invisible on her clipboard and is about to paste it, under her own name, into a chat
          full of chapter presidents. */}
      {shown && (
        <div className="mt-3 w-full text-left">
          {shownFailed && (
            <p role="alert" className="mb-1.5 text-[12.5px] leading-snug" style={{ color: "#F3C6CC", fontFamily: BRAND_SANS }}>
              This browser blocked the copy — select the message below and copy it by hand.
            </p>
          )}
          <pre
            className="w-full overflow-y-auto whitespace-pre-wrap break-words rounded-xl px-3.5 py-3 text-[12.5px] leading-relaxed"
            style={{
              maxHeight: 240, background: "rgba(0,0,0,0.3)",
              border: "1px solid var(--border-default)", color: "var(--brand-cream)",
              fontFamily: BRAND_SANS, overscrollBehavior: "contain",
            }}
          >
            {shown}
          </pre>
        </div>
      )}

      {/* ── THE ROSTER COUNT, AND THE WAY TO FIX IT ───────────────────────────────────────────
          14 campuses have incomplete rosters, so a council exec may well look at this number and
          know it is wrong. Saying the count out loud and offering the fix in the same breath is
          the difference between "this product doesn't know my campus" and "one text and it's
          handled".

          DELIBERATELY NOT IN THE PASTEABLE MESSAGE. That message should not plant the idea that
          anything is incomplete in a room full of chapter presidents; this line is for the one
          person who can actually do something about it. */}
      {!q.isLoading && chapters.length > 0 && (
        <ShareFootnote>
          {chapters.length} chapter{chapters.length === 1 ? "" : "s"}. Missing one?{" "}
          <a href={LEE_SMS_HREF} className="font-bold underline underline-offset-4" style={{ color: "var(--accent)" }}>
            Text Lee at {LEE_PHONE_DISPLAY}
          </a>{" "}
          and it&apos;s added right away.
        </ShareFootnote>
      )}

      {/* An empty roster is stated, not hidden: a campus we have not scraped yet is a real answer,
          and a bulk button promising "all 0 chapter links" is worse than saying so. The portal
          link above still works — it is the picker, and it will fill in as chapters land. */}
      {!q.isLoading && chapters.length === 0 && (
        <ShareFootnote>
          I don&apos;t have {name}&apos;s chapters listed yet.{" "}
          <a href={LEE_SMS_HREF} className="font-bold underline underline-offset-4" style={{ color: "var(--accent)" }}>
            Text Lee at {LEE_PHONE_DISPLAY}
          </a>{" "}
          and they&apos;re added right away.
        </ShareFootnote>
      )}
    </ShareScreen>
  );
}
