// THE HOMEPAGE'S SCHOOL SWITCHER (2026-08-29).
//
// WHAT IT FIXES. The campus line says "for ALABAMA students", and until now there was no way to
// argue with it. The campus pages have had a swap control under the bolt plate since the hero
// redesign, and the old player had "Change school" in its ⋯ menu — but on the two-door "/" there
// is no player, so that menu item pointed at "/#exam1" and landed on nothing. A visitor the
// cookie had guessed wrong about was simply stuck being told they went to the wrong school.
//
// It is the SAME searchable picker /chapters uses (SearchPicker over ALL_SCHOOLS, each row wearing
// its own bolt colourway and its verified course code), because a student who has met one of these
// lists should recognise the next one. Not a native <select>: that renders as an OS list — white,
// system font, nothing to do with the page around it.
//
// Picking writes through campus.setSessionSchool, which is the same call the player's picker made,
// so the choice is remembered in the campus cookie and the whole page — headline, code, theme,
// bolt, doors — repaints as that campus.
import { useMemo } from "react";

import { Bolt, BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SearchPicker } from "@/components/site/SearchPicker";
import { useCampus } from "@/lib/campus-context";
import { listCampusIntroCodes } from "@/lib/default-map.functions";
import { ALL_SCHOOLS, boltForSlug, schoolBySlug } from "@/lib/schools";
import { useQuery } from "@tanstack/react-query";

export function SchoolSwitchSheet({ onClose }: { onClose: () => void }) {
  const campus = useCampus();

  // Same query key and staleTime as the picker on /chapters and the campus context itself, so this
  // sheet reads from a cache that is already warm and the rows never appear without their codes.
  const codesQ = useQuery({
    queryKey: ["campus-intro-codes"],
    queryFn: () => listCampusIntroCodes({ data: { ids: ALL_SCHOOLS.map((s) => s.campusId) } }),
    staleTime: 600_000,
    networkMode: "always",
  });

  const items = useMemo(() => {
    const codeByCampus = new Map((codesQ.data ?? []).map((r) => [r.campusId, r.code]));
    return ALL_SCHOOLS.map((s) => ({
      value: s.slug,
      label: s.name,
      meta: codeByCampus.get(s.campusId) ?? "",
      icon: <span className="block shrink-0" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(s.slug)} /></span>,
    }));
  }, [codesQ.data]);

  const current = campus.school ? ALL_SCHOOLS.find((s) => s.id === campus.school!.id)?.slug ?? null : null;

  return (
    <div
      className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center sm:px-4"
      style={{ background: "rgba(5,8,16,0.72)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Change your school"
        className="w-full max-w-[420px] rounded-t-2xl p-5 sm:rounded-2xl"
        style={{
          background: "var(--bg-overlay)", border: "1px solid var(--border-default)",
          boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)",
          paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
            Which school are you at?
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

        <SearchPicker
          items={items}
          value={current}
          placeholder="Pick your school"
          searchPlaceholder={`Search ${ALL_SCHOOLS.length} schools…`}
          ariaLabel="Your school"
          onPick={(slug) => {
            const s = schoolBySlug(slug);
            if (s) campus.setSessionSchool(s.id);
            onClose();
          }}
        />

        {/* THE WAY OUT OF A WRONG GUESS. Without this, a visitor whose campus we inferred can pick
            a different one but can never get back to the neutral page — and the neutral page is
            the honest state for someone whose school we do not actually know. */}
        {campus.known && (
          <button
            type="button"
            onClick={() => { campus.clearSchool(); onClose(); }}
            className="mt-3 w-full text-[13px] underline underline-offset-4"
            style={{ color: "var(--text-muted)", background: "none", border: 0, minHeight: 44, cursor: "pointer" }}
          >
            I&apos;m not at any of these
          </button>
        )}
      </div>
    </div>
  );
}
