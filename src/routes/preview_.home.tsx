// /preview/home — THE TWO-PORTAL HOME, as an experiment. A NEW route on main: the live "/"
// (index.tsx → LandingPage) is untouched, and this page renders the SAME LandingPage with the
// experimental `portalHome` slots switched on — compressed hero, the two portal cards, the
// "COMPLETELY FREE EXAM PREP" player header, and the one pointing chevron. When the design is
// approved, promoting it is passing the same prop from index.tsx; nothing here forks the page.
//
// Deliberately NO loader (no campus-prefs cookie read): this is a design preview, not an
// indexable page, and the client-side campus restore still runs so the player behaves.
import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "./landing";
import { PORTAL_HOME_CSS, PlayerHeaderFreePrep, PortalCards } from "@/components/site/portal-home/PortalCards";

export const Route = createFileRoute("/preview_/home")({
  head: () => ({
    meta: [
      { title: "Two-portal home (preview) — Survive Accounting" },
      // An experiment must never compete with the real homepage in search.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PreviewHome,
});

function PreviewHome() {
  return (
    <LandingPage
      portalHome={{
        portals: ({ onStart }) => (
          <>
            <style>{PORTAL_HOME_CSS}</style>
            <PortalCards onStartExam1={onStart} />
          </>
        ),
        playerHeader: <PlayerHeaderFreePrep />,
      }}
    />
  );
}
