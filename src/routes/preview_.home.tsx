// /preview/home — THE PREVIEW HOMEPAGE (repointed 2026-08-27).
//
// The two-portal experiment that used to live here shipped (evolved) as the real two-door "/" on
// 08-27, so this route now renders THAT page with one difference: the left door's CTA navigates
// into the PRIVATE Player V2 preview (/preview/exam1) instead of opening the public Exam 1
// waitlist. This is how Lee and beta testers experience the full future journey — preview home →
// STUDY ON YOUR OWN → Tonight's Plan — while ordinary visitors on "/" keep getting the
// September 1 waitlist.
//
// Deliberately NO loader (no campus-prefs cookie read): a design/beta preview, not an indexable
// page; the client-side campus restore still personalizes after mount.
import { createFileRoute } from "@tanstack/react-router";

import { TwoDoorHome } from "@/components/site/home-two-door/TwoDoorHome";

export const Route = createFileRoute("/preview_/home")({
  head: () => ({
    meta: [
      { title: "Preview home — Survive Accounting" },
      // A preview must never compete with the real homepage in search.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PreviewHome,
});

function PreviewHome() {
  return <TwoDoorHome previewSoloHref="/preview/exam1" />;
}
