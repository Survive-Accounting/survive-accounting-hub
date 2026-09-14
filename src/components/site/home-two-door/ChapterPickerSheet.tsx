// THE CHAPTER PICKER (2026-09-02) — the chapter card's switcher, and since 2026-09-14 the /learn
// "Find your chapter" picker too.
//
// Same sheet chrome, search and row rhythm as SchoolPickerSheet, because a student who has just
// met one of these lists should recognise the next one. It only ever runs for a school we already
// know, so there is no school step here.
//
// COUNCIL FIRST (Lee, 2026-09-14: "It lets you pick council, then choose from chapters. I want the
// chapter picker on home page to have same experience … Except, I like the STYLE of the chapter
// picking much better in / home page"). Step one lists the councils that have chapters here; a pick
// opens that council's chapters, with a back arrow. Typing in the search skips the step and searches
// every chapter. Names only — Greek letters were on some rows and not others, so no row shows them.
//
// On the home page it REBRANDS IN PLACE (the card's letters change, nothing navigates); /learn
// passes its own onPick.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { COUNCILS, councilMatches } from "@/lib/greek-councils.functions";
import { listGoChapters, type GoChapterListItem } from "@/lib/greek-go.functions";
import { PICKER_CSS } from "./SchoolPickerSheet";

/** The home page's tokens, pinned — for pages whose own theme redefines them (/learn). */
const PINNED_THEME = {
  ["--bg-overlay" as string]: "#1A2948",
  ["--brand-cream" as string]: "#F5EFE6",
  ["--text-muted" as string]: "#AAB4C8",
  ["--border-default" as string]: "#34486D",
  ["--accent" as string]: "#FFA611",
} as React.CSSProperties;

export function ChapterPickerSheet({ schoolSlug, schoolName, onClose, onPick, onClear, hasChapter, initialCouncil = null, pinnedTheme = false }: {
  schoolSlug: string;
  schoolName: string;
  onClose: () => void;
  onPick: (c: GoChapterListItem) => void;
  /** Offered only once a chapter is remembered — the way back out of a wrong pick. */
  onClear: () => void;
  hasChapter: boolean;
  /** Open straight on one council's chapters (a council link's ?c=). */
  initialCouncil?: string | null;
  /** Use the home page's colours whatever the page's theme says. */
  pinnedTheme?: boolean;
}) {
  const [q, setQ] = useState("");
  const [council, setCouncil] = useState<string | null>(initialCouncil && COUNCILS.some((c) => c.slug === initialCouncil) ? initialCouncil : null);
  const chaptersQ = useQuery({
    queryKey: ["go-chapters", schoolSlug],
    queryFn: () => listGoChapters({ data: { schoolSlug } }),
    enabled: !!schoolSlug,
    staleTime: 300_000,
    networkMode: "always",
  });
  const chapters = useMemo(() => chaptersQ.data ?? [], [chaptersQ.data]);
  const councils = useMemo(() => COUNCILS
    .map((c) => ({ ...c, count: chapters.filter((ch) => councilMatches(c, ch.council)).length }))
    .filter((c) => c.count > 0), [chapters]);
  const unassigned = useMemo(() => chapters.filter((ch) => !COUNCILS.some((c) => councilMatches(c, ch.council))), [chapters]);
  const current = council ? COUNCILS.find((c) => c.slug === council) ?? null : null;

  // Letters and nickname are SEARCHED, never shown: a student types "ADPi" or the letters and still
  // lands on the one canonical row. Same rule the /chapters finder uses.
  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    const pool = current ? chapters.filter((ch) => councilMatches(current, ch.council)) : council === "other" ? unassigned : chapters;
    if (!needle) return pool;
    return chapters.filter((c) => [c.name, c.nickname ?? "", c.letters ?? ""].some((h) => h.toLowerCase().includes(needle)));
  }, [chapters, current, council, unassigned, needle]);
  // The council step shows until one is picked — unless the campus has no councils on file, or a search is typed.
  const councilStep = !council && !needle && councils.length > 0;

  return (
    <div
      className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center sm:px-4"
      style={{ background: "rgba(5,8,16,0.72)", ...(pinnedTheme ? PINNED_THEME : {}) }}
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
          <div className="flex min-w-0 items-center gap-2">
            {council && !needle && (
              <button onClick={() => setCouncil(null)} aria-label="Back to councils" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10"
                style={{ color: "var(--brand-cream)", background: "none", border: 0, cursor: "pointer", fontSize: 18 }}>‹</button>
            )}
            <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
              {councilStep ? `Which council at ${schoolName}?` : current && !needle ? `${current.name} chapters at ${schoolName}` : `Which chapter at ${schoolName}?`}
            </h3>
          </div>
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
          placeholder={chapters.length ? `Search all ${chapters.length} chapters…` : "Search chapters…"}
          aria-label="Search chapters"
          className="sa-sp-search"
        />

        <div className="sa-sp-list" role="listbox" aria-label={councilStep ? "Councils" : "Chapters"}>
          {chaptersQ.isPending && <p className="sa-sp-empty">Loading chapters…</p>}
          {!chaptersQ.isPending && !chapters.length && (
            <p className="sa-sp-empty">No chapters on file at {schoolName} yet — the chapter door still works.</p>
          )}
          {councilStep && (
            <>
              {councils.map((c) => (
                <button key={c.slug} type="button" className="sa-sp-row" style={{ gridTemplateColumns: "1fr auto" }} onClick={() => setCouncil(c.slug)}>
                  <span className="sa-sp-name">{c.full}</span>
                  <span className="sa-sp-code">{c.count} chapter{c.count === 1 ? "" : "s"} ›</span>
                </button>
              ))}
              {unassigned.length > 0 && (
                <button type="button" className="sa-sp-row" style={{ gridTemplateColumns: "1fr auto" }} onClick={() => setCouncil("other")}>
                  <span className="sa-sp-name">Other chapters</span>
                  <span className="sa-sp-code">{unassigned.length} ›</span>
                </button>
              )}
            </>
          )}
          {!councilStep && !chaptersQ.isPending && !!chapters.length && !results.length && (
            <p className="sa-sp-empty">No chapter by that name.</p>
          )}
          {!councilStep && results.map((c) => (
            <button key={c.slug} type="button" className="sa-sp-row" style={{ gridTemplateColumns: "1fr auto" }} title={c.name} onClick={() => onPick(c)}>
              <span className="sa-sp-name">{c.name}</span>
              {needle || !current ? <span className="sa-sp-code">{c.council ?? ""}</span> : <span />}
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
