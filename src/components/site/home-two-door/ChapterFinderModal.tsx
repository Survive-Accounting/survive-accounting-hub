// THE MINIMAL CHAPTER FINDER — school → organization list → that chapter's /go page. No auth
// exists yet, so the chapter page IS the destination; the finder's only job is routing there.
//
// Moved here from portal-home/PortalCards.tsx (08-27) when the two-portal experiment was retired:
// the two-door homepage's "Find your chapter →" (button and Greek ticker) is now its only caller.
//
// ── THE SHELL IS SHARED NOW (2026-08-31) ──────────────────────────────────────────────────────
// This used to be its own hand-rolled overlay: `items-end … sm:items-center` with no height cap,
// which is a bottom sheet that grows past the top of the screen. With a long school list the
// panel's own header — and the close button in it — left the viewport with nothing to scroll,
// and the page behind it scrolled freely because the scroll lock was `overflow: hidden` on
// <html>, which iOS Safari ignores.
//
// Everything shaped about the overlay now lives in components/site/Sheet.tsx: the portal out of
// the stacking context, the 88dvh cap, the sticky header with a 40px close target, the pinned
// page behind. This file is back to being about finding a chapter.
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ChapterFinder } from "@/components/site/ChapterFinder";
import { Sheet } from "@/components/site/Sheet";
import { listGoSchools } from "@/lib/greek-go.functions";

export function ChapterFinderModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const schoolsQ = useQuery({ queryKey: ["go-schools"], queryFn: () => listGoSchools(), staleTime: 600_000, networkMode: "always" });

  return (
    <Sheet title="Find your chapter" onClose={onClose}>
      {schoolsQ.isLoading ? (
        <p className="py-6 text-center text-[13.5px]" style={{ color: "var(--text-muted)" }}>Loading schools…</p>
      ) : (
        <ChapterFinder
          schools={schoolsQ.data ?? []}
          autoPick
          escapeHatches
          onPick={(s, c) => {
            void navigate({ to: "/go/$school/$chapter", params: { school: s, chapter: c } });
          }}
        />
      )}
    </Sheet>
  );
}
