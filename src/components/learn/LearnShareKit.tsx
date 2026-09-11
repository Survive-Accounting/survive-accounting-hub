// THE SHARE KIT ON /learn (Lee, 2026-09-11, the night before the IFC DMs: "I'm tempted to just
// send a IFC scholarship chair to the learn dashboard itself. There could be an announcement at
// the top for share tools … this way, they're on the student facing part and can see what they're
// sharing. Same with an individual chapter scholarship chair … a tag that gives them a similar
// announcement and 'claim this page' link … keep this super simple and easy to navigate for a
// cold outreach DM … Probably a list of each chapter and just a tool to share each link
// individually or share all links at once (for group me)").
//
// Two tags on the pretty /learn URLs, both stripped from anything the Share button copies:
//
//   /learn/<school>?share=council&c=ifc      THE COUNCIL KIT — "Share Survive with your chapters":
//     every chapter in the council (listGoChapters, filtered by councilMatches; every council when
//     ?c is absent), each with its own pretty link and a Copy; "Copy all chapter links" makes the
//     GroupMe post (lib/partners' councilChapterLinksPost); "Copy the campus link" is /learn/<school>.
//   /learn/<school>/<chapter>?share=chair    THE CHAIR CARD — "This is <Chapter>'s page.": Copy link,
//     Copy a GroupMe message (ChapterShare's groupMeMessage), and "Claim this page →", which opens
//     the existing claim sheet on /go/<school>/<chapter>?claim=1 (greek-claims' submitChapterClaim).
//
// Sits at the top of the home column, above the hero, in the room's own card. The X removes the
// tag from the address so the chair can see the page as a student will. No grades, no counts a
// student cannot see; nothing here is a second copy of the old /s/<campus>/council page — it is
// the same three actions, on the student page.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Copy, X } from "lucide-react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { LK } from "@/components/learn/learn-theme";
import { groupMeMessage } from "@/components/site/ChapterShare";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { councilBySlug, councilMatches } from "@/lib/greek-councils.functions";
import { listGoChapters, type GoChapterListItem } from "@/lib/greek-go.functions";
import { councilChapterLinksPost } from "@/lib/partners";
import type { School } from "@/lib/schools";
import { buildShareUrl } from "@/lib/share-url";

export type ShareKitMode = "council" | "chair";

export function LearnShareKit({ mode, councilSlug, school, chapter, contactRef, narrow, onClose }: {
  mode: ShareKitMode;
  councilSlug: string | null;
  school: School;
  chapter: { slug: string; name: string | null; letters: string | null } | null;
  contactRef: string | null;
  narrow: boolean;
  onClose: () => void;
}) {
  return (
    <section aria-label={mode === "council" ? "Share with your chapters" : "Share with your chapter"} className="lk-card" style={{ padding: narrow ? 16 : 20, marginBottom: narrow ? 14 : 18, fontFamily: BRAND_SANS, position: "relative" }}>
      <button type="button" onClick={onClose} aria-label="Hide the share tools" title="See the page as a student" className="absolute grid h-8 w-8 place-items-center rounded-full" style={{ right: 12, top: 12, background: LK.border, color: LK.text, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
      {mode === "council" ? <CouncilKit councilSlug={councilSlug} school={school} contactRef={contactRef} narrow={narrow} /> : <ChairKit school={school} chapter={chapter} contactRef={contactRef} narrow={narrow} />}
    </section>
  );
}

function useCopy(): [string | null, (key: string, text: string) => Promise<void>] {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => { const ok = await copyToClipboard(text); setCopied(ok ? key : `!${key}`); window.setTimeout(() => setCopied(null), 2000); };
  return [copied, copy];
}

function CopyBtn({ id, copied, onCopy, children, primary }: { id: string; copied: string | null; onCopy: () => void; children: string; primary?: boolean }) {
  const on = copied === id, failed = copied === `!${id}`;
  return (
    <button type="button" onClick={onCopy} className={primary ? "lk-btn lk-btn-acc" : "lk-btn lk-btn-ghost"} style={{ minHeight: 40, fontSize: 12.5 }} aria-live="polite">
      {on ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {on ? "Copied" : failed ? "Couldn't copy" : children}
    </button>
  );
}

/** THE COUNCIL KIT — the roster, each chapter's own link, and the one GroupMe post with all of them. */
function CouncilKit({ councilSlug, school, contactRef, narrow }: { councilSlug: string | null; school: School; contactRef: string | null; narrow: boolean }) {
  const council = councilSlug ? councilBySlug(councilSlug) : null;
  const q = useQuery({ queryKey: ["go-chapters", school.slug], queryFn: () => listGoChapters({ data: { schoolSlug: school.slug } }), staleTime: 300_000, networkMode: "always" });
  const chapters = useMemo<GoChapterListItem[]>(() => {
    const all = q.data ?? [];
    return council ? all.filter((c) => councilMatches(council, c.council)) : all;
  }, [q.data, council]);
  const [copied, copy] = useCopy();
  const linkFor = (c: GoChapterListItem) => buildShareUrl({ campus: school.id, chapter: c.slug, contactRef });
  const campusLink = buildShareUrl({ campus: school.id, contactRef });
  const allPost = () => councilChapterLinksPost({ courseCode: school.courseCode, chapters: chapters.map((c) => ({ name: c.name, letters: c.letters, url: linkFor(c) })) });
  const who = council ? `${council.name} chapters` : "your chapters";
  return (
    <div className="flex flex-col" style={{ gap: 12, paddingRight: 36 }}>
      <div>
        <p className="lk-disp" style={{ margin: 0, fontSize: narrow ? 20 : 24, lineHeight: 1.1 }}>Share Survive with {who}</p>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: LK.muted, lineHeight: 1.45 }}>Exam 1 is free for every chapter. Each chapter has its own page — send each one its link, or post them all at once.</p>
      </div>
      <div className="flex flex-wrap" style={{ gap: 8 }}>
        <CopyBtn id="all" copied={copied} onCopy={() => void copy("all", allPost())} primary>Copy all chapter links</CopyBtn>
        <CopyBtn id="campus" copied={copied} onCopy={() => void copy("campus", campusLink)}>Copy the campus link</CopyBtn>
      </div>
      {q.isLoading ? (
        <p style={{ margin: 0, fontSize: 12.5, color: LK.dim }}>Loading chapters…</p>
      ) : q.isError ? (
        <p style={{ margin: 0, fontSize: 12.5, color: LK.red }}>Couldn't load the chapters — refresh to try again.</p>
      ) : chapters.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: LK.dim }}>No chapters listed for {school.name} yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 6 }}>
          {chapters.map((c) => (
            <li key={c.slug} className="flex items-center justify-between gap-2 rounded-lg" style={{ padding: "6px 8px 6px 10px", background: LK.surface2, border: `1px solid ${LK.border}` }}>
              <span className="min-w-0 truncate" style={{ fontSize: 13.5, fontWeight: 700 }}>{c.letters ? `${c.letters} · ` : ""}{c.name}</span>
              <button type="button" onClick={() => void copy(c.slug, linkFor(c))} className="inline-flex shrink-0 items-center gap-1 rounded-md" style={{ minHeight: 30, padding: "0 10px", border: `1px solid ${copied === c.slug ? LK.acc : LK.border2}`, background: copied === c.slug ? LK.acc : "transparent", color: copied === c.slug ? LK.accInk : LK.text, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }} aria-label={`Copy ${c.name}'s link`}>
                {copied === c.slug ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === c.slug ? "Copied" : "Copy link"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** THE CHAIR CARD — this chapter's page: send it, post it, claim it. */
function ChairKit({ school, chapter, contactRef, narrow }: { school: School; chapter: { slug: string; name: string | null; letters: string | null } | null; contactRef: string | null; narrow: boolean }) {
  const [copied, copy] = useCopy();
  if (!chapter) {
    return <p style={{ margin: 0, paddingRight: 36, fontSize: 13.5, color: LK.muted }}>Pick your chapter from the menu and this becomes its page.</p>;
  }
  const short = chapter.letters ?? chapter.name ?? "your chapter";
  const link = buildShareUrl({ campus: school.id, chapter: chapter.slug, contactRef });
  const post = groupMeMessage({ shortName: short, courseLabel: school.courseCode ?? "intro accounting", url: link });
  const claim = `/go/${school.slug}/${chapter.slug}?claim=1`;
  return (
    <div className="flex flex-col" style={{ gap: 12, paddingRight: 36 }}>
      <div>
        <p className="lk-disp" style={{ margin: 0, fontSize: narrow ? 20 : 24, lineHeight: 1.1 }}>This is {chapter.name ?? short}'s page.</p>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: LK.muted, lineHeight: 1.45 }}>Send it to your chapter — Exam 1 is free for everyone in it. Claim the page to see who signs up.</p>
      </div>
      <div className="flex flex-wrap" style={{ gap: 8 }}>
        <CopyBtn id="link" copied={copied} onCopy={() => void copy("link", link)} primary>Copy the link</CopyBtn>
        <CopyBtn id="post" copied={copied} onCopy={() => void copy("post", post)}>Copy a GroupMe message</CopyBtn>
        <a href={claim} className="lk-btn lk-btn-ghost" style={{ minHeight: 40, fontSize: 12.5, textDecoration: "none" }}>Claim this page <ChevronRight className="h-4 w-4" /></a>
      </div>
    </div>
  );
}
