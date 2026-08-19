// "MY CHAPTER ISN'T LISTED" — the member creates it, and lands on a working page.
//
// The old path here was a contact form: name, email, and a wait. That asks the person who is
// trying to watch a free video to identify themselves and then come back later, which is the
// opposite order of what they came to do.
//
// Now they pick their org from the national list and go straight to their chapter's /go/ page.
// The row is created as `pending` for review, but nothing about it blocks them — see the header
// of greek-lazy-chapter.functions.ts.
//
// ONLY SHOWN WITH A SCHOOL. Creating a chapter needs a campus, so the caller falls back to the
// plain write-in form when nobody has picked a school yet.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { BRAND_SANS } from "@/components/canvas/brand";
import { SearchPicker } from "@/components/site/SearchPicker";
import { createPendingChapter, listNationalOrgs } from "@/lib/greek-lazy-chapter.functions";

/** greek_orgs.council stores the NATIONAL body; the row we create stores the CAMPUS council.
 *  Showing NIC here while writing IFC would make the picker disagree with its own result. */
const CAMPUS_COUNCIL: Record<string, string> = { NIC: "IFC", NPC: "Panhellenic" };
const campusCouncil = (c: string | null) => (c ? CAMPUS_COUNCIL[c] ?? c : undefined);

export function ChapterSelfCreate({ schoolSlug, schoolName, onClose }: {
  schoolSlug: string;
  schoolName?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const orgsQ = useQuery({
    queryKey: ["national-greek-orgs"],
    queryFn: () => listNationalOrgs(),
    staleTime: 3_600_000,   // a national list changes on the order of never
    networkMode: "always",
  });
  const orgs = orgsQ.data ?? [];

  const pick = async (orgId: string) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await createPendingChapter({ data: { schoolSlug, orgId } });
      if (!r.ok) { setErr(r.error); setBusy(false); return; }
      // Straight to the page. `created` is deliberately not surfaced: whether we made the row just
      // now or already had it is our business, not theirs.
      void navigate({ to: "/go/$school/$chapter", params: { school: schoolSlug, chapter: r.chapterSlug } });
    } catch {
      setErr("Couldn't set that up — try again in a moment.");
      setBusy(false);
    }
  };

  return (
    <div style={{ fontFamily: BRAND_SANS }}>
      <p className="text-[14.5px] font-bold" style={{ color: "var(--brand-cream)" }}>
        Which chapter are you in{schoolName ? <> at {schoolName}</> : null}?
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Pick your organization and we&apos;ll set your chapter up now.
      </p>

      <div className="mt-3">
        <SearchPicker
          items={orgs.map((o) => ({
            value: o.id,
            label: o.name,
            meta: campusCouncil(o.council),
            // Letters read faster than names to a member scanning for their own house.
            icon: <span className="block w-7 shrink-0 text-[13px] font-black" style={{ color: "var(--accent)" }} aria-hidden>{o.letters ?? ""}</span>,
            // Nicknames are what people actually type — "SigEp", "Tri Delta", "Pike".
            aliases: [o.nickname, o.orgType, o.council].filter(Boolean) as string[],
          }))}
          value={null}
          placeholder={orgsQ.isLoading ? "Loading organizations…" : "Pick your organization"}
          searchPlaceholder={`Search ${orgs.length} organizations…`}
          disabled={orgsQ.isLoading || busy}
          onPick={(id) => void pick(id)}
          ariaLabel="Pick your Greek organization"
        />
      </div>

      {err && <p className="mt-2 text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}

      <button type="button" onClick={onClose} className="mt-3 text-[12.5px] underline underline-offset-4" style={{ color: "var(--text-muted)" }}>
        ← Back
      </button>
    </div>
  );
}
