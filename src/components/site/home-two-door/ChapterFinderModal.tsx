// THE MINIMAL CHAPTER FINDER — school → organization list → that chapter's /go page. No auth
// exists yet, so the chapter page IS the destination; the finder's only job is routing there.
//
// Moved here from portal-home/PortalCards.tsx (08-27) when the two-portal experiment was retired:
// the two-door homepage's "Find your chapter →" (button and Greek ticker) is now its only caller.
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { ChapterFinder } from "@/components/site/ChapterFinder";
import { listGoSchools } from "@/lib/greek-go.functions";

export function ChapterFinderModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const schoolsQ = useQuery({ queryKey: ["go-schools"], queryFn: () => listGoSchools(), staleTime: 600_000, networkMode: "always" });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center sm:px-4" style={{ background: "rgba(5,8,16,0.72)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Find your chapter"
        className="w-full max-w-[420px] rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Find your chapter</h3>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--brand-cream)" }} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
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
      </div>
    </div>
  );
}
