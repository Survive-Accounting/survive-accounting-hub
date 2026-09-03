// THE VOUCHED BANNER (learn-share-flow, Phase 3) — the highest-leverage element on /learn.
//
// Shown ONLY for ?by=<uuid> (a human sharer), at the top of the dashboard:
//
//     Sarah Chen · Panhellenic scholarship chair · shared this with you
//
// It turns a cold link into a vouched one. NEVER shown for ?ref= (that's the contact WE messaged —
// telling them someone shared it would be wrong), and never a bare id: with no name on file it
// falls back to the org ("Ole Miss Panhellenic shared this with you"), and with nothing resolvable
// it renders nothing at all.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { NEON } from "@/components/canvas/theme";
import { BRAND_SANS } from "@/components/canvas/brand";
import { resolveShareContact, councilTypeLabel, type ShareContact } from "@/lib/engaged-contacts.functions";

export type ShareContext = {
  contact: ShareContact | null;
  /** True only when a `by` (sharer) resolved — the banner shows; `ref`-only never shows a banner. */
  showBanner: boolean;
  /** ref OR by sits on a council → CTA state B. Independent of showBanner. */
  isCouncil: boolean;
};

const BANNER_FIXTURE: ShareContact = {
  name: "Sarah Chen",
  role: "Panhellenic scholarship chair",
  campusName: "Ole Miss",
  councilType: "panhellenic",
  isCouncil: true,
};

/** Resolve the sharer/recipient once, for both the banner and the CTA bar. `by` (sharer) drives the
 *  banner; either `by` or `ref` can drive the council state. `?test=banner` uses a fixture, no DB. */
export function useShareContext({ by, ref, test }: { by?: string | null; ref?: string | null; test?: string }): ShareContext {
  const isBannerTest = (test ?? "").toLowerCase() === "banner";
  // The id to resolve: the sharer wins (that's who we'd vouch); fall back to the recipient for the
  // council check only.
  const id = by || ref || null;
  const q = useQuery({
    queryKey: ["share-contact", id],
    queryFn: () => resolveShareContact({ data: { id: id! } }),
    enabled: !isBannerTest && !!id,
    staleTime: 600_000,
    networkMode: "always",
  });

  return useMemo<ShareContext>(() => {
    if (isBannerTest) return { contact: BANNER_FIXTURE, showBanner: true, isCouncil: true };
    const contact = q.data ?? null;
    return {
      contact,
      showBanner: !!by && !!contact,
      isCouncil: !!contact?.isCouncil,
    };
  }, [isBannerTest, q.data, by]);
}

/** The vouching line for a sharer, or the org fallback. Returns null when there's nothing to say. */
function vouchLine(c: ShareContact): string | null {
  if (c.name) {
    const bits = [c.name, c.role].filter(Boolean);
    return `${bits.join(" · ")} · shared this with you`;
  }
  // No name on file → the org, never a bare id.
  const council = councilTypeLabel(c.councilType);
  const org = [c.campusName, council].filter(Boolean).join(" ");
  return org ? `${org} shared this with you` : null;
}

export function ShareBanner({ ctx }: { ctx: ShareContext }) {
  if (!ctx.showBanner || !ctx.contact) return null;
  const line = vouchLine(ctx.contact);
  if (!line) return null;
  return (
    <div
      className="flex shrink-0 items-center gap-2 px-3 py-2"
      style={{ background: "rgba(252,163,17,0.12)", borderBottom: `1px solid ${NEON.border}`, fontFamily: BRAND_SANS }}
    >
      <Users size={14} style={{ color: NEON.yellow, flexShrink: 0 }} />
      <span className="min-w-0 truncate text-[12.5px] font-bold" style={{ color: NEON.text }}>{line}</span>
    </div>
  );
}
