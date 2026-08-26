// /admin/growth/results — the honest scoreboard.
//
// Only observed, first-party outcomes. The deprecated special-order flow is gone; revenue is
// chapter seats + individual exam purchases + (when it ships) the $150 semester pass.
//
// SEATS ARE ALWAYS TWO NUMBERS. Bought is the money; claimed is whether members actually got
// it. A pool of 40 with 3 claimed is a support problem that a revenue figure alone hides.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { growthResults } from "@/lib/growth-results.functions";
import { Hint, Metric, money } from "@/components/growth/v2";
import { ActivityFeed } from "@/components/growth/ActivityFeed";
import { HINTS } from "@/components/growth/hints";

export const Route = createFileRoute("/admin/growth/results")({
  component: ResultsPage,
});

function ResultsPage() {
  const q = useQuery({ queryKey: ["growth-results"], queryFn: () => growthResults() });

  if (q.isLoading || !q.data) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  const r = q.data;
  const seatFillRate =
    r.seats.bought > 0 ? Math.round((r.seats.claimed / r.seats.bought) * 100) : null;

  return (
    <div className="space-y-5">
      <Group title="Today">
        <Metric
          label="Emails sent"
          value={`${r.today.emailsSent} / ${r.today.emailTarget}`}
          hint={HINTS.emailsSentToday}
        />
        <Metric
          label="Instagram DMs"
          value={`${r.today.dms} / ${r.today.dmTarget}`}
          hint="DMs you logged by hand. Instagram sending isn't automated — you send it, then log it."
        />
      </Group>

      <Group title="Revenue">
        <Metric
          label="Seats bought"
          value={r.seats.bought || null}
          hint="Total seats chapters have paid for."
          tone={r.seats.bought ? "good" : "default"}
        />
        <Metric
          label="Seats claimed"
          value={r.seats.claimed || null}
          hint="Seats members have actually redeemed. A big gap between bought and claimed means the chapter needs help distributing them."
          tone={seatFillRate != null && seatFillRate < 50 ? "warn" : "default"}
        />
        <Metric
          label="Seat revenue"
          value={money(r.seats.revenueCents)}
          hint="Paid chapter seat pools."
          tone="good"
        />
        <Metric
          label="Exam purchases"
          value={r.individual.examPurchases || null}
          hint="Individual students who bought a single exam. Dollar totals live in Stripe — exam prices vary, so we don't guess them here."
        />
        <Metric
          label="Semester passes"
          value={r.individual.passPurchases || null}
          hint="The $150 semester access pass. Zero until it ships."
        />
      </Group>

      <Group title="Students">
        <Metric label="Identified" value={r.students.identified || null} hint={HINTS.identified} />
        <Metric
          label="Paid"
          value={r.students.paid || null}
          hint={HINTS.paid}
          tone={r.students.paid ? "good" : "default"}
        />
        <Metric
          label="Questions answered"
          value={r.students.questionsAnswered || null}
          hint={HINTS.questionsAnswered}
        />
        <Metric label="Waitlist" value={r.students.waitlist || null} hint={HINTS.waitlist} />
      </Group>

      <Group title="Reach">
        <Metric
          label="Active chapters"
          value={r.greek.activeChapters}
          hint="Social Greek chapters on the roster nationwide."
        />
        <Metric
          label="Chapters claimed"
          value={r.greek.claimedChapters || null}
          hint="Chapters where a member has claimed the chapter on Survive."
          tone={r.greek.claimedChapters ? "good" : "default"}
        />
        <Metric
          label="Contacts we can email"
          value={r.reach.eligibleContacts}
          hint="Approved, unsuppressed addresses across every campus."
        />
        <Metric
          label="Campuses contacted"
          value={`${r.reach.campusesContacted} / ${r.reach.campusesContactable}`}
          hint="How many of the campuses we CAN reach we have actually reached."
        />
      </Group>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="sa-admin-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Latest activity
          </h2>
          <Hint text="The same feed as the Activity tab, trimmed to the most recent events.">
            <span className="text-[10px] text-muted-foreground">everywhere</span>
          </Hint>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <ActivityFeed compact />
        </div>
      </section>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="sa-admin-display mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{children}</div>
    </section>
  );
}
