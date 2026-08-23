// /admin/growth — Overview. Only useful current-state KPIs; clicking one opens
// the underlying records (filtered) where practical. No vanity cards.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getGrowthOverview } from "@/lib/growth-admin.functions";
import { Tile, money, StorageBanner } from "@/components/growth/shared";

export const Route = createFileRoute("/admin/growth/")({
  component: OverviewPage,
});

function OverviewPage() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["growth-overview"], queryFn: () => getGrowthOverview() });
  const k = q.data;

  return (
    <div className="space-y-6">
      {k && !k.storageReady && <StorageBanner />}

      {q.isLoading || !k ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <Group title="Readiness">
            <Tile
              label="Campuses"
              value={k.campuses.toLocaleString()}
              onClick={() => nav({ to: "/admin/growth/campuses" })}
            />
            <Tile
              label="Student-ready"
              value={k.studentReadyCampuses.toLocaleString()}
              accent="emerald"
              hint="Campuses with an Intro 1 course code."
              onClick={() =>
                nav({ to: "/admin/growth/campuses", search: { filter: "student_ready" } as never })
              }
            />
            <Tile
              label="Greek-ready"
              value={k.greekReadyCampuses.toLocaleString()}
              accent="emerald"
              hint="Campuses with chapters imported."
              onClick={() =>
                nav({ to: "/admin/growth/campuses", search: { filter: "greek_ready" } as never })
              }
            />
            <Tile
              label="Outreach-ready"
              value={k.outreachReadyCampuses.toLocaleString()}
              accent="emerald"
              hint="Campuses with at least one contact on file."
              onClick={() =>
                nav({ to: "/admin/growth/campuses", search: { filter: "outreach_ready" } as never })
              }
            />
          </Group>

          <Group title="Greek footprint">
            <Tile
              label="Active chapters"
              value={k.activeChapters.toLocaleString()}
              onClick={() => nav({ to: "/admin/growth/chapters" })}
            />
            <Tile
              label="Claimed chapters"
              value={k.claimedChapters.toLocaleString()}
              accent="emerald"
              onClick={() =>
                nav({ to: "/admin/growth/chapters", search: { status: "claimed" } as never })
              }
            />
            <Tile
              label="National orgs"
              value={k.nationalOrgs.toLocaleString()}
              onClick={() => nav({ to: "/admin/growth/orgs" })}
            />
            <Tile
              label="Chapter members"
              value={k.chapterMembers.toLocaleString()}
              hint="Students who joined via a chapter link."
            />
          </Group>

          <Group title="Students & revenue">
            <Tile
              label="Paid orders"
              value={k.paidOrders.toLocaleString()}
              accent="emerald"
              hint="Orders marked paid or delivered."
            />
            <Tile
              label="Seated students"
              value={k.seatedStudents.toLocaleString()}
              hint="Members assigned a chapter-purchased seat."
            />
            <Tile
              label="Direct revenue"
              value={money(k.directRevenueCents)}
              accent="emerald"
              hint="Sum of paid/delivered order totals. Kept separate from chapter-seat revenue."
            />
            <Tile
              label="Seat revenue"
              value={money(k.seatRevenueCents)}
              accent="emerald"
              hint="Sum of active/paid chapter seat pools. Kept separate from direct student revenue."
            />
          </Group>

          <Group title="Outreach">
            <Tile
              label="Follow-ups due"
              value={k.followUpsDue.toLocaleString()}
              accent={k.followUpsDue > 0 ? "amber" : "default"}
              onClick={() => nav({ to: "/admin/growth/outreach" })}
            />
            <Tile
              label="Never contacted"
              value={k.neverContactedCampuses.toLocaleString()}
              hint="Greek-ready campuses with no outreach logged yet."
              accent={k.neverContactedCampuses > 0 ? "amber" : "default"}
              onClick={() =>
                nav({ to: "/admin/growth/outreach", search: { view: "never" } as never })
              }
            />
          </Group>
        </>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
    </section>
  );
}
