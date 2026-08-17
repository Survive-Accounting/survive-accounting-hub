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
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { BRAND_SANS } from "@/components/canvas/brand";
import { listGoChapters } from "@/lib/greek-go.functions";

export interface FinderSchool { slug: string; name: string }

export function ChapterFinder({ schools, onPick, cta = "Go to my chapter", busy = false, note }: {
  schools: FinderSchool[];
  onPick: (schoolSlug: string, chapterSlug: string, chapterName: string) => void;
  cta?: string;
  busy?: boolean;
  note?: string;
}) {
  const [school, setSchool] = useState("");
  const [chapter, setChapter] = useState("");

  // Only fetched once a school exists: the chapter list is per-campus and there are 1,107 rows
  // overall, so there is no meaningful "all chapters" list to show first.
  const q = useQuery({
    queryKey: ["go-chapters", school],
    queryFn: () => listGoChapters({ data: { schoolSlug: school } }),
    enabled: !!school,
    networkMode: "always",
    staleTime: 300_000,
  });
  const chapters = q.data ?? [];
  const picked = chapters.find((c) => c.slug === chapter);

  return (
    <div className="flex w-full flex-col gap-2" style={{ fontFamily: BRAND_SANS }}>
      <select
        value={school}
        onChange={(e) => { setSchool(e.target.value); setChapter(""); }}
        className="w-full rounded-xl px-3 text-[14px] outline-none"
        style={{ minHeight: 46, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }}
      >
        <option value="">Your school…</option>
        {schools.map((s) => <option key={s.slug} value={s.slug} style={{ color: "#0B1220" }}>{s.name}</option>)}
      </select>

      <select
        value={chapter}
        onChange={(e) => setChapter(e.target.value)}
        disabled={!school || q.isLoading}
        className="w-full rounded-xl px-3 text-[14px] outline-none disabled:opacity-45"
        style={{ minHeight: 46, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }}
      >
        <option value="">
          {!school ? "Pick a school first…" : q.isLoading ? "Loading chapters…" : chapters.length ? "Your chapter…" : "No chapters listed yet"}
        </option>
        {chapters.map((c) => <option key={c.slug} value={c.slug} style={{ color: "#0B1220" }}>{c.name}</option>)}
      </select>

      {/* An empty list is stated, not hidden. A school whose roster we don't have yet is a real
          answer, and silently showing an empty dropdown reads as the page being broken. */}
      {school && !q.isLoading && !chapters.length && (
        <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          I don&apos;t have chapters listed for that school yet — text me and I&apos;ll add yours.
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

      {note && <p className="text-center text-[12px]" style={{ color: "var(--text-muted)" }}>{note}</p>}
    </div>
  );
}
