// THE HOMEPAGE SCHOOL PICKER (p1 §2/§3/§4, 2026-09-01).
//
// ONE picker, used by both doors AND the hero swap: clicking either card opens this first, and
// picking a school proceeds into that door's flow (solo → Exam-1, chapter → waitlist). The hero's
// "change school" opens the same sheet. Same list a student meets on /chapters, so it is familiar.
//
// ORDER (§4), reusing the v1 player's grouping (landing.tsx): University of Mississippi is PINNED
// first, above the group headers, cold — before any search is typed. Then the SEC group with LSU
// first and the rest alphabetical, then every other school alphabetical. (Ordering the tail by
// estimated student count is deferred — that data isn't in the picker record yet.)
//
// Each row wears its school's own two-tone bolt; hovering a row BOILS that row's bolt only (the
// BoltBadge pattern: boilFrame=undefined animates, a number pins a static frame — so exactly one
// row animates and prefers-reduced-motion still collapses it to a still frame). Long names get a
// native tooltip and wrap to two lines on a phone, where there is no hover to reveal them.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Bolt, BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { useCampus } from "@/lib/campus-context";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { ALL_SCHOOLS, boltForSlug, searchSchools, type School } from "@/lib/schools";

const PINNED_ID = "ole-miss"; // University of Mississippi — the launch campus, always first.
const LSU_ID = "lsu"; // Louisiana State — pinned #2 inside the SEC group per §4.

/** Split a (possibly search-filtered) pool into the three ordered buckets. Ole Miss is never
 *  repeated inside SEC, so the on-screen rows and the header count agree. */
function groupsFor(pool: School[]): { pinned: School[]; sec: School[]; other: School[] } {
  const pinned = pool.filter((s) => s.id === PINNED_ID);
  const sec = pool.filter((s) => s.id !== PINNED_ID && s.isSec);
  const secOrdered = [...sec.filter((s) => s.id === LSU_ID), ...sec.filter((s) => s.id !== LSU_ID)];
  const other = pool.filter((s) => s.id !== PINNED_ID && !s.isSec);
  return { pinned, sec: secOrdered, other };
}

export function SchoolPickerSheet({ onClose, onPick, title = "Which school are you at?", showClear = false }: {
  onClose: () => void;
  /** Called with the chosen school. The caller sets the campus and proceeds into its flow. */
  onPick: (school: School) => void;
  title?: string;
  /** The hero swap shows "I'm not at any of these"; the door flows do not. */
  showClear?: boolean;
}) {
  const campus = useCampus();
  const [q, setQ] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Read after mount (never during render — this sheet is reachable from a server-rendered page).
  const [autoFocusSearch, setAutoFocusSearch] = useState(false);
  useEffect(() => {
    setAutoFocusSearch(!!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches);
  }, []);

  // Same query key + staleTime as /chapters and the campus context, so the codes come from a warm
  // cache and rows never flash without them.
  const codesQ = useQuery({
    queryKey: ["campus-intro-codes"],
    queryFn: () => listCampusIntroCodes({ data: { ids: ALL_SCHOOLS.map((s) => s.campusId) } }),
    staleTime: 600_000,
    networkMode: "always",
  });
  const codeByCampus = useMemo(
    () => new Map((codesQ.data ?? []).map((r) => [r.campusId, r.code])),
    [codesQ.data],
  );

  const results = useMemo(() => (q.trim() ? searchSchools(q, ALL_SCHOOLS) : ALL_SCHOOLS), [q]);
  const { pinned, sec, other } = useMemo(() => groupsFor(results), [results]);
  const currentId = campus.school?.id ?? null;

  const Row = (s: School) => {
    const code = codeByCampus.get(s.campusId) || s.courseCode || "";
    const { c1, c2 } = boltForSlug(s.slug);
    const boiling = hoverId === s.id;
    return (
      <button
        key={s.id}
        type="button"
        className={`sa-sp-row${s.id === currentId ? " sa-sp-row--on" : ""}`}
        title={s.name}
        onClick={() => onPick(s)}
        onMouseEnter={() => setHoverId(s.id)}
        onMouseLeave={() => setHoverId((h) => (h === s.id ? null : h))}
        onFocus={() => setHoverId(s.id)}
        onBlur={() => setHoverId((h) => (h === s.id ? null : h))}
      >
        <span className="sa-sp-bolt" aria-hidden>
          {boiling
            ? <BoltBoil height={22} red={c1} blue={c2} />
            : <span style={{ display: "block", width: 16, height: 22 }}><Bolt c1={c1} c2={c2} /></span>}
        </span>
        <span className="sa-sp-name">{s.name}</span>
        <span className="sa-sp-code">{code}</span>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center sm:px-4"
      style={{ background: "rgba(5,8,16,0.72)" }}
      onClick={onClose}
    >
      <style>{PICKER_CSS}</style>
      <div
        role="dialog"
        aria-label={title}
        className="flex w-full max-w-[430px] flex-col rounded-t-2xl p-5 sm:rounded-2xl"
        style={{
          background: "var(--bg-overlay)", border: "1px solid var(--border-default)",
          boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", maxHeight: "min(78vh, 640px)",
          paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{title}</h3>
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
          // AUTOFOCUS ON A POINTER DEVICE ONLY. On a phone, focusing this opened the keyboard the
          // instant the sheet did, which covered most of the list the visitor came here to read —
          // and nearly everyone picks their school by scrolling, not typing. Desktop still gets to
          // type immediately.
          autoFocus={autoFocusSearch}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${ALL_SCHOOLS.length} schools…`}
          aria-label="Search schools"
          className="sa-sp-search"
        />

        <div className="sa-sp-list" role="listbox" aria-label="Schools">
          {results.length === 0 && (
            <p className="sa-sp-empty">No school by that name — try &ldquo;I&rsquo;m not at any of these&rdquo;.</p>
          )}
          {pinned.map(Row)}
          {sec.length > 0 && <p className="sa-sp-group">SEC</p>}
          {sec.map(Row)}
          {other.length > 0 && <p className="sa-sp-group">Other schools</p>}
          {other.map(Row)}
        </div>

        {showClear && campus.known && (
          <button
            type="button"
            onClick={() => { campus.clearSchool(); onClose(); }}
            className="mt-3 w-full shrink-0 text-[13px] underline underline-offset-4"
            style={{ color: "var(--text-muted)", background: "none", border: 0, minHeight: 44, cursor: "pointer" }}
          >
            I&apos;m not at any of these
          </button>
        )}
      </div>
    </div>
  );
}

const PICKER_CSS = `
.sa-sp-search {
  width: 100%; min-height: 46px; padding: 0 14px; margin-bottom: 8px;
  background: rgba(0,0,0,0.30); border: 1px solid var(--border-default); border-radius: 12px;
  color: var(--brand-cream); font-size: 15px; outline: none; flex: none;
}
.sa-sp-search:focus-visible { border-color: var(--accent); }
.sa-sp-list { overflow-y: auto; -webkit-overflow-scrolling: touch; margin: 0 -6px; padding: 2px 6px; }
.sa-sp-group {
  padding: 10px 8px 4px; font-size: 11px; font-weight: 800; letter-spacing: 0.10em;
  text-transform: uppercase; color: var(--text-muted); position: sticky; top: 0;
  background: var(--bg-overlay);
}
.sa-sp-row {
  display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 12px;
  width: 100%; padding: 9px 10px; border: 0; border-radius: 12px; background: none;
  text-align: left; cursor: pointer; color: var(--brand-cream); min-height: 44px;
  transition: background-color 130ms ease;
}
.sa-sp-row:hover, .sa-sp-row:focus-visible { background: rgba(245,239,230,0.08); outline: none; }
.sa-sp-row--on { background: rgba(245,239,230,0.06); }
.sa-sp-bolt { display: grid; place-items: center; width: 22px; height: 22px; }
.sa-sp-name {
  min-width: 0; font-size: 15px; font-weight: 700;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sa-sp-code { font-size: 12.5px; font-weight: 700; color: var(--text-muted); white-space: nowrap; }
/* PHONE: no hover to reveal a truncated name, so let it wrap to two lines instead of clipping. */
@media (max-width: 639px) {
  .sa-sp-name {
    white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    line-height: 1.2;
  }
}
`;
