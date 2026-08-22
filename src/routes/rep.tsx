// /rep — the generic entry point, for a visitor with no campus context.
//
// It is a school picker and nothing else. Showing the pitch here and then showing it again on the
// campus page would make the same argument twice; picking a school takes one press and the page
// they land on is the one written for them.
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { frameThemeVars } from "@/components/frames/frame-theme";

import { Bolt, BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SearchPicker } from "@/components/site/SearchPicker";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { ogMeta } from "@/lib/og";
import { ALL_SCHOOLS, boltForSlug, schoolById } from "@/lib/schools";
import { readCampusPrefs } from "@/lib/campus-prefs.functions";

export const Route = createFileRoute("/rep")({
  // A VISITOR WHOSE CAMPUS IS ALREADY KNOWN (cookie) goes straight to their school's rep page —
  // the picker here exists only for someone the site has never placed. `?all` keeps the picker
  // reachable on purpose (the school page's "not your school?" link uses it).
  beforeLoad: async ({ search }) => {
    if ((search as { all?: string }).all !== undefined) return;
    const prefs = await readCampusPrefs().catch(() => ({ campus: null, profSkip: null }));
    const s = schoolById(prefs.campus);
    if (s?.slug) throw redirect({ to: "/$school/rep", params: { school: s.slug } });
  },
  validateSearch: (s: Record<string, unknown>): { all?: string } => ("all" in s ? { all: "" } : {}),
  head: () => ({
    meta: ogMeta({
      title: "Be the Survive Accounting rep at your school.",
      description: "Share Survive Accounting with fraternities & sororities on your campus. Get a 10% commission for every sale. Easiest side gig imaginable.",
      path: "/rep",
    }),
  }),
  component: RepPicker,
});

function RepPicker() {
  useNavyDocument();
  const navigate = useNavigate();

  return (
    <div style={{ ...frameThemeVars(), background: "var(--bg-page)", color: "var(--brand-cream)", minHeight: "100vh", fontFamily: BRAND_SANS }}>
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
            items={ALL_SCHOOLS.map((s) => ({
              value: s.slug,
              label: s.name,
              aliases: s.aliases,
              icon: <span className="block shrink-0" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(s.slug)} /></span>,
            }))}
            value={null}
            placeholder="Pick your school"
            searchPlaceholder={`Search ${ALL_SCHOOLS.length} schools…`}
            onPick={(slug) => void navigate({ to: "/$school/rep", params: { school: slug } })}
          />
        </div>

        {/* A school we do not list yet is still worth hearing from — Lee reads these himself. */}
        <p className="mx-auto mt-5 max-w-[36ch] text-[14px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Somewhere else?{" "}
          <a href="sms:+16625658818" className="font-bold underline underline-offset-4" style={{ color: "var(--brand-cream)", display: "inline-block", minHeight: 44, lineHeight: "44px" }}>Text Lee at (662) 565-8818</a>
          {" "}and tell him where you go.
        </p>
      </main>
      <Footer />
    </div>
  );
}
