// THE CHAPTER PICKER (2026-09-02) — the chapter card's switcher.
//
// Same sheet chrome, search and row rhythm as SchoolPickerSheet, because a student who has just
// met one of these lists should recognise the next one. It only ever runs for a school we already
// know, so there is no school step here: the card's line names the campus, this names the house.
//
// It REBRANDS IN PLACE. Picking a chapter does not navigate — it swaps the card's cycling Greek
// trio for that chapter's real letters and remembers the choice. The door button is still the only
// thing that goes anywhere.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { listGoChapters, type GoChapterListItem } from "@/lib/greek-go.functions";
import { PICKER_CSS } from "./SchoolPickerSheet";

export function ChapterPickerSheet({ schoolSlug, schoolName, onClose, onPick, onClear, hasChapter }: {
  schoolSlug: string;
  schoolName: string;
  onClose: () => void;
  onPick: (c: GoChapterListItem) => void;
  /** Offered only once a chapter is remembered — the way back out of a wrong pick. */
  onClear: () => void;
  hasChapter: boolean;
}) {
  const [q, setQ] = useState("");
  const chaptersQ = useQuery({
    queryKey: ["go-chapters", schoolSlug],
    queryFn: () => listGoChapters({ data: { schoolSlug } }),
    enabled: !!schoolSlug,
    staleTime: 300_000,
    networkMode: "always",
  });
  const chapters = useMemo(() => chaptersQ.data ?? [], [chaptersQ.data]);

  // Letters and nickname are SEARCHED, never shown as the row's name: a student types "ADPi" or
  // the letters and still lands on the one canonical row. Same rule the /chapters finder uses.
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return chapters;
    return chapters.filter((c) =>
      [c.name, c.nickname ?? "", c.letters ?? ""].some((h) => h.toLowerCase().includes(needle)));
  }, [chapters, q]);

  return (
    <div
      className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center sm:px-4"
      style={{ background: "rgba(5,8,16,0.72)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Which chapter at ${schoolName}?`}
        className="flex w-full max-w-[430px] flex-col rounded-t-2xl p-5 sm:rounded-2xl"
        style={{
          background: "var(--bg-overlay)", border: "1px solid var(--border-default)",
          boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", maxHeight: "min(78vh, 640px)",
          paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Same row/search rhythm as the school sheet — one stylesheet, so the two can never drift. */}
        <style>{PICKER_CSS}</style>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
            Which chapter at {schoolName}?
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10"
            style={{ color: "var(--brand-cream)", background: "none", border: 0, cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={chapters.length ? `Search ${chapters.length} chapters…` : "Search chapters…"}
          aria-label="Search chapters"
          className="sa-sp-search"
        />

        <div className="sa-sp-list" role="listbox" aria-label="Chapters">
          {chaptersQ.isPending && <p className="sa-sp-empty">Loading chapters…</p>}
          {!chaptersQ.isPending && !chapters.length && (
            <p className="sa-sp-empty">No chapters on file at {schoolName} yet — the chapter door still works.</p>
          )}
          {!chaptersQ.isPending && !!chapters.length && !results.length && (
            <p className="sa-sp-empty">No chapter by that name.</p>
          )}
          {results.map((c) => (
            <button key={c.slug} type="button" className="sa-sp-row" title={c.name} onClick={() => onPick(c)}>
              {/* The letters take the bolt's slot here — on this list they ARE the identity. */}
              <span className="sa-sp-bolt" aria-hidden style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 13, color: "var(--brand-cream)", opacity: 0.9 }}>
                {c.letters ?? ""}
              </span>
              <span className="sa-sp-name">{c.name}</span>
              <span className="sa-sp-code">{c.council ?? ""}</span>
            </button>
          ))}
        </div>

        {hasChapter && (
          <button
            type="button"
            onClick={() => { onClear(); onClose(); }}
            className="mt-3 w-full shrink-0 text-[13px] underline underline-offset-4"
            style={{ color: "var(--text-muted)", background: "none", border: 0, minHeight: 44, cursor: "pointer" }}
          >
            I&apos;m not in a chapter
          </button>
        )}
      </div>
    </div>
  );
}
