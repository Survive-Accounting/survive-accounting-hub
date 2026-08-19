// /rep — the generic entry point, for a visitor with no campus context.
//
// It is a school picker and nothing else. Showing the pitch here and then showing it again on the
// campus page would make the same argument twice; picking a school takes one press and the page
// they land on is the one written for them.
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Bolt, BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SearchPicker } from "@/components/site/SearchPicker";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { boltForSlug, SEC_SCHOOL_TABLE } from "@/lib/schools";

export const Route = createFileRoute("/rep")({
  head: () => ({ meta: [{ title: "Become a campus rep — Survive Accounting" }] }),
  component: RepPicker,
});

function RepPicker() {
  useNavyDocument();
  const navigate = useNavigate();

  return (
    <div style={{ background: "var(--brand-navy)", color: "var(--brand-cream)", minHeight: "100vh", fontFamily: BRAND_SANS }}>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[520px] px-5 py-16 text-center">
        <h1 className="text-[27px] font-black leading-[1.14] sm:text-[32px]" style={{ fontFamily: BRAND_DISPLAY, letterSpacing: "-0.015em" }}>
          Be a campus rep.
        </h1>
        <p className="mx-auto mt-3 max-w-[38ch] text-[15px] leading-relaxed" style={{ opacity: 0.86 }}>
          Get intro accounting cram videos in front of every chapter on your campus — and get paid
          for it. Pick your school to start.
        </p>

        <div className="mx-auto mt-8 max-w-sm text-left">
          <SearchPicker
            items={SEC_SCHOOL_TABLE.map((s) => ({
              value: s.slug,
              label: s.name,
              icon: <span className="block shrink-0" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(s.slug)} /></span>,
            }))}
            value={null}
            placeholder="Pick your school"
            searchPlaceholder={`Search ${SEC_SCHOOL_TABLE.length} schools…`}
            onPick={(slug) => void navigate({ to: "/$school/rep", params: { school: slug } })}
          />
        </div>

        {/* A school we do not list yet is still worth hearing from — Lee reads these himself. */}
        <p className="mx-auto mt-5 max-w-[36ch] text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Somewhere else? Text Lee at (662) 565-8818 and tell him where you go.
        </p>
      </main>
    </div>
  );
}
