// THE CHAPTER BAR (Lee, 2026-09-11, thirty minutes before launch): "We send IFC and scholarship
// chairs the same template page... they both can learn more about the offer, they can preview
// what their members get, then share from there." One compact card above the hero that EVERY
// visitor to /learn sees:
//
//   no chapter yet     Want to study with your chapter?  Free ACCT 200 prep for the first exam —
//                      choose your chapter.   [Council ▾] [Chapter ▾]    Copy share link · Copy
//                      GroupMe message                            Not in a chapter? Hide this
//   chapter set        ΑΤΩ · Alpha Tau Omega  Share ΑΤΩ's page with the chapter.
//                      [Copy share link] [Copy GroupMe message]   Change chapter
//
// THE PICKER is a council dropdown, then a chapter dropdown (progressive; native <select>s — fast,
// accessible, and a phone gets its own sheet). The council is preset from the link's ?c= (an
// IFC chair's link says ifc; Panhellenic's, panhellenic; NPHC's, nphc), so a chair who sends it
// on sees their own council first. Picking a chapter loads /learn/<school>/<chapter> — the
// letters go over the bolt, every email the page collects carries the chapter, and the bar turns
// into that chapter's share tools. JUST ONE LINK: the share link is the chapter's page when a
// chapter is set, the campus page otherwise (share-url's buildShareUrl); the GroupMe message
// wraps the same link. No roster of 24 links, no claim link, no preview wall.
//
// "Not in a chapter? Hide this" dismisses it on this device (localStorage) — never when a chapter
// is set or the link carries a council, because then it IS the page's point. The hamburger's
// "Study with your chapter" is the way back. Copy: no emoji; the course code once.
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { LK } from "@/components/learn/learn-theme";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { COUNCILS, councilMatches } from "@/lib/greek-councils.functions";
import { listGoChapters, type GoChapterListItem } from "@/lib/greek-go.functions";
import type { School } from "@/lib/schools";
import { buildShareUrl } from "@/lib/share-url";

const DISMISS_KEY = "sa-learn-chapterbar-hidden";
export function readChapterBarHidden(): boolean { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } }
function writeChapterBarHidden(): void { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } }

/** THE GROUPME MESSAGE — Lee's vibe, tightened: one line of what, one line of where. */
export function chapterGroupMe({ courseCode, url, chapter }: { courseCode: string | null; url: string; chapter: string | null }): string {
  const course = courseCode ?? "intro accounting";
  const who = chapter ? "our chapter" : "every chapter";
  return [
    `Hey everyone — SurviveAccounting.com is giving ${who} free ${course} cram videos + practice exams to help boost ${chapter ? "our chapter GPA" : "chapter GPAs"}. The first exam is completely free.`,
    "",
    chapter ? "Start studying here:" : "Pick your chapter and start here:",
    url,
  ].join("\n");
}

export function LearnChapterBar({ school, chapter, councilSlug, contactRef, narrow, onPick, onHide }: {
  school: School;
  /** The chapter the page is on (the pretty path or the picker), or null. */
  chapter: { slug: string; name: string | null; letters: string | null } | null;
  /** The council the link came from (?c=), or null. */
  councilSlug: string | null;
  contactRef: string | null;
  narrow: boolean;
  /** Loads /learn/<school>/<chapter>. */
  onPick: (chapterSlug: string) => void;
  /** "Not in a chapter? Hide this." */
  onHide: () => void;
}) {
  const [council, setCouncil] = useState<string>(councilSlug && COUNCILS.some((c) => c.slug === councilSlug) ? councilSlug : "");
  const [changing, setChanging] = useState(false);
  const [copied, setCopied] = useState<"link" | "post" | "!link" | "!post" | null>(null);
  const chaptersQ = useQuery({ queryKey: ["go-chapters", school.slug], queryFn: () => listGoChapters({ data: { schoolSlug: school.slug } }), staleTime: 300_000, networkMode: "always" });
  const inCouncil = useMemo<GoChapterListItem[]>(() => {
    const all = chaptersQ.data ?? [];
    const c = COUNCILS.find((x) => x.slug === council);
    return c ? all.filter((ch) => councilMatches(c, ch.council)) : all;
  }, [chaptersQ.data, council]);
  const link = buildShareUrl({ campus: school.id, chapter: chapter?.slug ?? null, contactRef });
  const post = chapterGroupMe({ courseCode: school.courseCode, url: link, chapter: chapter ? (chapter.letters ?? chapter.name) : null });
  const copy = async (what: "link" | "post") => { const ok = await copyToClipboard(what === "link" ? link : post); setCopied(ok ? what : (`!${what}` as "!link" | "!post")); window.setTimeout(() => setCopied(null), 2200); };
  const pickChapter = (e: FormEvent<HTMLSelectElement>) => { const slug = e.currentTarget.value; if (slug) onPick(slug); };
  const showPicker = !chapter || changing;
  const course = school.courseCode ?? "intro accounting";
  const short = chapter ? (chapter.letters ?? chapter.name ?? "your chapter") : null;

  const btn = (what: "link" | "post", label: string, primary: boolean) => {
    const on = copied === what, failed = copied === `!${what}`;
    return (
      <button type="button" onClick={() => void copy(what)} className={primary ? "lk-btn lk-btn-acc" : "lk-btn lk-btn-ghost"} style={{ minHeight: 38, fontSize: 11.5, padding: "0 14px" }} aria-live="polite">
        {on ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {on ? "Copied" : failed ? "Couldn't copy" : label}
      </button>
    );
  };
  const select = { minHeight: 38, borderRadius: 10, border: `1px solid ${LK.border2}`, background: LK.bg, color: LK.text, padding: "0 10px", fontFamily: BRAND_SANS, fontSize: 13.5, fontWeight: 700, maxWidth: "100%" } as const;

  return (
    <section aria-label="Your chapter" className="lk-card" style={{ padding: narrow ? "12px 14px" : "14px 18px", marginBottom: narrow ? 12 : 16, fontFamily: BRAND_SANS, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="flex flex-wrap items-center" style={{ gap: narrow ? 8 : 14 }}>
        <div className="min-w-0" style={{ flex: "1 1 260px" }}>
          {chapter && !changing ? (
            <>
              <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: narrow ? 16 : 18, lineHeight: 1.15 }}>{chapter.letters ? `${chapter.letters} · ` : ""}{chapter.name ?? short}</div>
              <div style={{ fontSize: 12.5, color: LK.muted, marginTop: 2 }}>Share {short}'s page with the chapter — free {course} prep for the first exam.</div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: narrow ? 16 : 18, lineHeight: 1.15 }}>Want to study with your chapter?</div>
              <div style={{ fontSize: 12.5, color: LK.muted, marginTop: 2 }}>Free {course} prep for the first exam — choose your chapter.</div>
            </>
          )}
        </div>
        {showPicker && (
          <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
            <select aria-label="Council" value={council} onChange={(e) => setCouncil(e.target.value)} style={select}>
              <option value="">Council…</option>
              {COUNCILS.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
            {council && (
              <select aria-label="Chapter" defaultValue="" onChange={pickChapter} style={select} disabled={chaptersQ.isLoading}>
                <option value="" disabled>{chaptersQ.isLoading ? "Loading chapters…" : inCouncil.length ? "Your chapter…" : "No chapters listed yet"}</option>
                {inCouncil.map((ch) => <option key={ch.slug} value={ch.slug}>{ch.letters ? `${ch.letters} · ` : ""}{ch.name}</option>)}
              </select>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          {btn("link", "Copy share link", true)}
          {btn("post", "Copy GroupMe message", false)}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 8, fontSize: 11.5, color: LK.dim }}>
        <span>{chapter ? "Everyone who joins from this link is counted with the chapter." : "The link is this campus's page; pick a chapter and it becomes the chapter's."}</span>
        {chapter && !changing ? (
          <button type="button" onClick={() => setChanging(true)} className="underline underline-offset-2" style={{ background: "transparent", border: 0, padding: 0, color: LK.muted, cursor: "pointer", font: "inherit", fontWeight: 700 }}>Change chapter</button>
        ) : !chapter && !councilSlug ? (
          <button type="button" onClick={() => { writeChapterBarHidden(); onHide(); }} className="inline-flex items-center gap-1 underline underline-offset-2" style={{ background: "transparent", border: 0, padding: 0, color: LK.muted, cursor: "pointer", font: "inherit", fontWeight: 700 }}><X className="h-3 w-3" /> Not in a chapter? Hide this</button>
        ) : null}
      </div>
    </section>
  );
}
