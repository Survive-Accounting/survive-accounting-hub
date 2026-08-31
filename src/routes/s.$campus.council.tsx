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
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ShareButton, ShareFootnote, ShareHeading, ShareScreen } from "@/components/site/share/ShareScreen";
import { StudentPreview, previewCampus } from "@/components/site/StudentPreview";
import { listGoChapters } from "@/lib/greek-go.functions";
import { COUNCILS, councilBySlug, councilMatches } from "@/lib/greek-councils.functions";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { boltForSlug, schoolBySlug } from "@/lib/schools";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { councilChapterLinksPost } from "@/lib/partners";
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
  const [copied, setCopied] = useState(false);
  // Collapsed until asked for, and forced open by a copy — see the note at the toggle.
  const [showPreview, setShowPreview] = useState(false);
  // TRUE only after a copy that actually failed — see the note in copy().
  const [copyFailed, setCopyFailed] = useState(false);

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

  // The campus the proof block speaks for. Colours come from the same bolt table the screen is
  // already wearing, so the outline card and the page cannot disagree about which school this is.
  const preview = useMemo(
    () => previewCampus({ key: slug, name, code, primary: bolt.c1, secondary: bolt.c2, href: `/${slug}` }),
    [slug, name, code, bolt.c1, bolt.c2],
  );

  const copy = async () => {
    const ok = await copyToClipboard(message);
    // A FAILED COPY USED TO DO NOTHING AT ALL — no state change, no message, a button that
    // visibly ignored the tap. copyToClipboard already refuses to claim success it did not have
    // (both its paths can fail in an in-app browser, which is where these links are opened), but
    // the caller then swallowed the "no". Opening the preview is the recovery: the whole message
    // is on screen, selectable, and she can copy it by hand instead of walking away thinking she
    // has it. The button stays un-confirmed, because she does not have it yet.
    setShowPreview(true);
    if (!ok) { setCopyFailed(true); return; }
    setCopyFailed(false);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2600);
  };

  return (
    <ShareScreen boltVars={bolt}>
      <ShareHeading
        title="Share with your chapters"
        sub={<>Everything in one message — paste it into your Greek exec group chat.</>}
      />

      {council && (
        <p className="mt-2 text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.14em" }}>
          {council.name} <span aria-hidden style={{ opacity: 0.5 }}>·</span> {name}
        </p>
      )}

      {/* ── THE PROOF, ABOVE THE BUTTON ────────────────────────────────────────────────────────
          An exec has to decide in seconds that this is real before she will put her own name
          behind it in a group chat. Everything above this line is a claim; this is the only thing
          on the screen she can check. It is the course's OWN topic list with its timings — the
          same block the full council page leads with — so the page proves it is built for her
          campus rather than asserting it.

          `chrome={false}` drops the mocked player frame: a static picture of a product that has
          since changed is worth less than no picture. What is left is the outline and one worked
          question, both real.

          THE VIDEO SLOT LEE ASKED ABOUT is not here. The brief offered "the topic card OR a video
          slot", and a placeholder video box is an empty rectangle where the proof should be —
          worse on the surface that most needs proof. When a real video asset lands it replaces
          this block; noted in CLEANUP-REPORT.md. */}
      <div className="mt-6 w-full text-left">
        <p className="mb-2 text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}>
          {code ? `What's actually on ${code} Exam 1` : "What's actually on Exam 1"}
        </p>
        <StudentPreview campuses={[preview]} chrome={false} />
      </div>

      <div className="mt-6 w-full">
        <ShareButton tone="solo" confirmed={copied} onClick={() => void copy()}>
          {copied
            ? "Copied — paste it in your group chat ✓"
            : q.isLoading
              ? "Loading chapters…"
              : `Copy message with all ${chapters.length} chapter links`}
        </ShareButton>
      </div>

      {/* ── THE PREVIEW, INLINE ────────────────────────────────────────────────────────────────
          It used to sit in its own bordered box, which made it a second object competing with the
          button. It is now the button's own detail: a text toggle directly underneath, collapsed,
          costing one line until someone wants it.

          IT AUTO-EXPANDS ON COPY, and that is the point of it. The riskiest moment on this page is
          the second after the tap — the exec has something invisible on her clipboard and is about
          to paste it, under her own name, into a chat full of chapter presidents. Showing her
          exactly what she is about to send is what makes her paste it instead of opening a notes
          app to check first. */}
      <div className="mt-3 w-full text-left">
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          aria-expanded={showPreview}
          className="inline-flex items-center gap-1.5 text-[13px] font-bold underline underline-offset-4"
          style={{ color: "var(--text-muted)", background: "none", border: 0, cursor: "pointer", minHeight: 40 }}
        >
          {showPreview ? "Hide preview" : "Show preview"}
          <span aria-hidden style={{ fontSize: 10 }}>{showPreview ? "▲" : "▼"}</span>
        </button>
        {copyFailed && (
          <p role="alert" className="mt-1 text-[12.5px] leading-snug" style={{ color: "#F3C6CC" }}>
            This browser blocked the copy — select the message below and copy it by hand.
          </p>
        )}
        {showPreview && (
          <pre
            className="mt-1 w-full overflow-y-auto whitespace-pre-wrap break-words rounded-xl px-3.5 py-3 text-[12.5px] leading-relaxed"
            style={{
              maxHeight: 260, background: "rgba(0,0,0,0.28)",
              border: "1px solid var(--border-default)", color: "var(--brand-cream)",
              fontFamily: "inherit", overscrollBehavior: "contain",
            }}
          >
            {message}
          </pre>
        )}
      </div>

      {/* An empty roster is stated, not hidden: a campus we have not scraped yet is a real answer,
          and a button promising "all 0 chapter links" is worse than saying so. */}
      {!q.isLoading && chapters.length === 0 && (
        <ShareFootnote>
          I don&apos;t have {name}&apos;s chapters listed yet — open the full page and I&apos;ll add them.
        </ShareFootnote>
      )}

      {/* ── MATERIALS IS THE SECOND-BIGGEST ASK, SO IT IS A DOOR ───────────────────────────────
          This was a line of grey footnote type, which is where you put something you hope nobody
          clicks. Lee's read is that after the link itself, a flyer and a one-slide projector deck
          for chapter meeting is what councils actually want. It is now a bordered secondary
          button — deliberately quieter than the copy CTA above (it must not compete with the one
          tap this page exists for) and unmistakably a control rather than fine print. */}
      <div className="mt-5 w-full">
        <ShareButton
          tone="quiet"
          href={withRef(`/partners/council/${slug}/${council?.slug ?? COUNCILS[0].slug}#materials`, ref)}
        >
          Need flyers and slides? Open the full page →
        </ShareButton>
      </div>
    </ShareScreen>
  );
}
