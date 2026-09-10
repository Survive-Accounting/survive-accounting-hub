// PICK YOUR SCHOOL, WITHOUT LEAVING /learn (Lee, 2026-09-10). The top bar's "pick school" used to
// be a link to "/" — a student mid-study was thrown to the homepage to change one field. Now it
// opens this sheet in place; picking hands the school to LearnShell, which rewrites the address to
// /learn?campus=<id> so the theme and course logic re-run and the page re-themes where it stands.
//
// THE SAME PICKER, ON PURPOSE. Chrome, search, group rhythm and rows are the homepage sheet's
// (home-two-door/SchoolPickerSheet — its PICKER_CSS is imported, not copied, the way
// ChapterPickerSheet already borrows it) and the ORDER is the one every picker shares
// (orderedSchoolsForPicker: SEC → Big Ten → Big 12 → ACC → Other, Ole Miss / LSU / Tennessee
// pinned). Why not mount SchoolPickerSheet itself: its "Don't see your school?" row is wired
// straight to campus.clearSchool() with no callback, and here that row has to open the write-in
// (NotListedForm — the same four-field capture the homepage and /rep use) instead of resetting a
// campus context /learn does not run. The list is a thin composition of the shared parts; nothing
// about ordering or search is re-decided here.
//
// Colours: the picker CSS reads --bg-overlay / --brand-cream / --accent etc.; learn-theme's
// themeStyle maps those onto the Blackboard, so this sheet is black-and-chalk with the school
// accent, not the marketing navy.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Bolt, BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { PICKER_CSS } from "@/components/site/home-two-door/SchoolPickerSheet";
import { NotListedForm } from "@/components/site/NotListedForm";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { ALL_SCHOOLS, boltForSlug, orderedSchoolsForPicker, searchSchools, type School } from "@/lib/schools";
import { useDismiss } from "@/lib/use-dismiss";

/** The tail every picker folds behind a counted toggle. */
const COLLAPSED_GROUP = "Other";

export function LearnSchoolSheet({ current, onClose, onPick }: {
  /** The school /learn is showing now — its row is marked and scrolled into view on open. */
  current: School | null;
  onClose: () => void;
  onPick: (school: School) => void;
}) {
  const [q, setQ] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(false);
  const [writeIn, setWriteIn] = useState(false);
  const [autoFocusSearch, setAutoFocusSearch] = useState(false);
  useDismiss<HTMLDivElement>(onClose, { outside: false });
  // A pointer device gets the search focused; a phone would get its keyboard over the list.
  useEffect(() => { setAutoFocusSearch(!!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches); }, []);

  // Same key + staleTime as every other picker, so the codes come from a warm cache.
  const codesQ = useQuery({
    queryKey: ["campus-intro-codes"],
    queryFn: () => listCampusIntroCodes({ data: { ids: ALL_SCHOOLS.map((s) => s.campusId) } }),
    staleTime: 600_000,
    networkMode: "always",
  });
  const codeByCampus = useMemo(() => new Map((codesQ.data ?? []).map((r) => [r.campusId, r.code])), [codesQ.data]);

  const searching = !!q.trim();
  const ordered = useMemo(() => orderedSchoolsForPicker(), []);
  const results = useMemo(() => (searching ? searchSchools(q, ALL_SCHOOLS) : ordered), [q, searching, ordered]);
  const groups = useMemo(() => {
    const out: { label: string; rows: School[] }[] = [];
    for (const s of results) {
      const label = s.conference || COLLAPSED_GROUP;
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(s); else out.push({ label, rows: [s] });
    }
    return out;
  }, [results]);
  const other = groups.find((g) => g.label === COLLAPSED_GROUP);

  const currentRow = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = currentRow.current;
    const box = el?.closest(".sa-sp-list") as HTMLElement | null;
    if (!el || !box) return;
    const br = box.getBoundingClientRect(), er = el.getBoundingClientRect();
    box.scrollTop += (er.top - br.top) - (br.height / 2 - er.height / 2);
  }, [current?.id]);

  function row(s: School) {
    const code = codeByCampus.get(s.campusId) || s.courseCode || "";
    const { c1, c2 } = boltForSlug(s.slug);
    const on = s.id === current?.id;
    return (
      <button
        key={s.id} type="button" ref={on ? currentRow : undefined}
        className={`sa-sp-row${on ? " sa-sp-row--on" : ""}`} title={s.name}
        onClick={() => onPick(s)}
        onMouseEnter={() => setHoverId(s.id)} onMouseLeave={() => setHoverId((h) => (h === s.id ? null : h))}
        onFocus={() => setHoverId(s.id)} onBlur={() => setHoverId((h) => (h === s.id ? null : h))}
      >
        <span className="sa-sp-bolt" aria-hidden>
          {hoverId === s.id ? <BoltBoil height={22} red={c1} blue={c2} /> : <span style={{ display: "block", width: 16, height: 22 }}><Bolt c1={c1} c2={c2} /></span>}
        </span>
        <span className="sa-sp-name">{s.name}</span>
        <span className="sa-sp-code">{code}</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center sm:px-4" style={{ background: "rgba(0,0,0,0.72)" }} onClick={onClose}>
      <style>{PICKER_CSS}</style>
      <div
        role="dialog" aria-label="Which school are you at?"
        className="flex w-full max-w-[430px] flex-col rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", maxHeight: "min(78vh, 640px)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Which school are you at?</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--brand-cream)", background: "none", border: 0, cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        {writeIn ? (
          <div className="overflow-y-auto">
            <NotListedForm kind="school" title="Which school are you at?" onClose={() => setWriteIn(false)} />
          </div>
        ) : (
          <>
            <input autoFocus={autoFocusSearch} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${ALL_SCHOOLS.length} schools…`} aria-label="Search schools" className="sa-sp-search" />
            <div className="sa-sp-list" role="listbox" aria-label="Schools">
              {results.length === 0 && <p className="sa-sp-empty">No school by that name — try &ldquo;Don&rsquo;t see your school?&rdquo; below.</p>}
              {searching ? results.map(row) : groups.filter((g) => g.label !== COLLAPSED_GROUP).map((g) => (
                <div key={g.label}>
                  <p className="sa-sp-group">{g.label}</p>
                  {g.rows.map(row)}
                </div>
              ))}
              {!searching && other && (
                <>
                  <button type="button" className="sa-sp-toggle" aria-expanded={showOther} onClick={() => setShowOther((v) => !v)}>
                    <span>Other schools</span>
                    <span className="sa-sp-toggle-count">{other.rows.length}</span>
                    <span className="sa-sp-toggle-chev" aria-hidden style={{ transform: showOther ? "rotate(180deg)" : "none" }}>▾</span>
                  </button>
                  {showOther && other.rows.map(row)}
                </>
              )}
            </div>
            <button type="button" className="sa-sp-notlisted" onClick={() => setWriteIn(true)}>Don&apos;t see your school?</button>
          </>
        )}
      </div>
    </div>
  );
}
