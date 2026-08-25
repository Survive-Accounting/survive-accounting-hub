// /admin/growth/results — first-party outcomes (the old Overview KPIs, reframed
// as RESULTS): students, revenue, chapters, outreach follow-ups. Everything here
// is observed product data, not modeled intelligence.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getGrowthOverview } from "@/lib/growth-admin.functions";
import { Tile, money, StorageBanner } from "@/components/growth/shared";
import { growthDailyProgress } from "@/lib/growth-queue.functions";

export const Route = createFileRoute("/admin/growth/results")({
  component: ResultsPage,
});

function ResultsPage() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["growth-overview"], queryFn: () => getGrowthOverview() });
  const daily = useQuery({ queryKey: ["growth-daily"], queryFn: () => growthDailyProgress() });
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
          {daily.data && (
            <Group title="Today">
              <Tile
                label="Emails"
                value={`${daily.data.email.done} / ${daily.data.email.target}`}
              />
              <Tile
                label="Instagram DMs"
                value={`${daily.data.instagram.done} / ${daily.data.instagram.target}`}
              />
              <Tile
                label="Follow-ups due"
                value={daily.data.followUpsDue.toLocaleString()}
                accent={daily.data.followUpsDue > 0 ? "amber" : "default"}
              />
            </Group>
          )}
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
              hint="Sum of paid/delivered order totals."
            />
            <Tile
              label="Seat revenue"
              value={money(k.seatRevenueCents)}
              accent="emerald"
              hint="Sum of active/paid chapter seat pools."
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
              label="Chapter members"
              value={k.chapterMembers.toLocaleString()}
              hint="Students who joined via a chapter link."
            />
            <Tile
              label="National orgs"
              value={k.nationalOrgs.toLocaleString()}
              onClick={() => nav({ to: "/admin/growth/orgs" })}
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
