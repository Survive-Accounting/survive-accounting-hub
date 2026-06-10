import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AdminShell, PageHeader } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/ceq")({
  head: () => ({ meta: [{ title: "CEQ Command Center — Survive Accounting" }] }),
  component: CeqRoute,
});

// ---------- Placeholder data (mirrors shape of old store) ----------
const courses = [
  {
    id: "acct201",
    code: "ACCT 201",
    course_name: "Principles of Financial Accounting",
    chapters: [
      { id: "c1", chapter_number: 1, chapter_name: "Intro to Accounting" },
      { id: "c2", chapter_number: 2, chapter_name: "Recording Transactions" },
      { id: "c3", chapter_number: 3, chapter_name: "Adjusting Entries" },
      { id: "c4", chapter_number: 4, chapter_name: "Closing the Books" },
    ],
  },
  {
    id: "acct202",
    code: "ACCT 202",
    course_name: "Managerial Accounting",
    chapters: [
      { id: "c5", chapter_number: 1, chapter_name: "Managerial Overview" },
      { id: "c6", chapter_number: 2, chapter_name: "Job Order Costing" },
      { id: "c7", chapter_number: 3, chapter_name: "Process Costing" },
    ],
  },
  {
    id: "acct301",
    code: "ACCT 301",
    course_name: "Intermediate Accounting I",
    chapters: [
      { id: "c8", chapter_number: 7, chapter_name: "Cash & Receivables" },
      { id: "c9", chapter_number: 8, chapter_name: "Inventory Valuation" },
      { id: "c10", chapter_number: 14, chapter_name: "Long-Term Liabilities" },
    ],
  },
];

const recentCeqs = [
  { id: "1", asset_id: "a1", title: "Adjusting entry for accrued interest", status: "drafted",        updated_at: "2026-06-09T14:22:00Z" },
  { id: "2", asset_id: "a2", title: "FIFO vs LIFO under rising prices",     status: "approved",       updated_at: "2026-06-09T11:08:00Z" },
  { id: "3", asset_id: "a3", title: "Bond issued at a discount — Y1 entry", status: "ready_to_tutor", updated_at: "2026-06-08T19:45:00Z" },
  { id: "4", asset_id: "a4", title: "Bank reconciliation — outstanding checks", status: "ready_to_film", updated_at: "2026-06-08T16:01:00Z" },
  { id: "5", asset_id: "a5", title: "Closing entries from adjusted trial balance", status: "published", updated_at: "2026-06-07T09:30:00Z" },
];

const STATUS_LABEL: Record<string, string> = {
  drafted: "Drafted",
  approved: "Approved",
  ready_to_tutor: "Ready to Tutor",
  ready_to_film: "Ready to Film",
  published: "Published",
};

function CeqRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/ceq") return <Outlet />;

  const stats = {
    total: recentCeqs.length,
    drafted: recentCeqs.filter((c) => c.status === "drafted").length,
    approved: recentCeqs.filter((c) => c.status === "approved").length,
    readyTutor: recentCeqs.filter((c) => c.status === "ready_to_tutor").length,
    readyFilm: recentCeqs.filter((c) => c.status === "ready_to_film").length,
    published: recentCeqs.filter((c) => c.status === "published").length,
  };

  return (
    <AdminShell>
      <PageHeader
        title="CEQ Command Center"
        description="Build Common Exam Questions from textbook problems."
        actions={
          <Button asChild>
            <Link to="/ceq/create">
              <Plus className="size-4" /> New CEQ
            </Link>
          </Button>
        }
      />

      <div className="p-6 sm:p-10 space-y-8">
        {/* Status pills */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatPill label="Total" value={stats.total} />
          <StatPill label="Drafted" value={stats.drafted} tone="amber" />
          <StatPill label="Approved" value={stats.approved} tone="blue" />
          <StatPill label="Ready to Tutor" value={stats.readyTutor} tone="violet" />
          <StatPill label="Ready to Film" value={stats.readyFilm} tone="orange" />
          <StatPill label="Published" value={stats.published} tone="emerald" />
        </div>

        {/* Courses → chapters */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Courses
          </h2>
          <div className="space-y-4">
            {courses.map((course) => (
              <Card key={course.id} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{course.course_name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {course.code} · {course.chapters.length} chapters
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {course.chapters.map((ch) => (
                    <div
                      key={ch.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/40 cursor-pointer"
                    >
                      <span className="truncate">
                        <span className="font-mono text-xs text-muted-foreground">
                          Ch {ch.chapter_number}
                        </span>{" "}
                        <span>{ch.chapter_name}</span>
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">→</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Recent CEQs */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent CEQs
          </h2>
          <Card className="divide-y divide-border">
            {recentCeqs.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Updated {new Date(c.updated_at).toLocaleString()}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {STATUS_LABEL[c.status]}
                </Badge>
                <Link
                  to="/ceq/$id/edit"
                  params={{ id: c.id }}
                  className="text-xs text-primary hover:underline"
                >
                  Edit
                </Link>
                <Link
                  to="/ceq/$id/tutor"
                  params={{ id: c.id }}
                  className="text-xs text-primary hover:underline"
                >
                  Tutor
                </Link>
              </div>
            ))}
          </Card>
        </section>
      </div>
    </AdminShell>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "amber" | "blue" | "violet" | "orange" | "emerald";
}) {
  const color =
    tone === "amber" ? "text-amber-600"
    : tone === "blue" ? "text-blue-600"
    : tone === "violet" ? "text-violet-600"
    : tone === "orange" ? "text-orange-600"
    : tone === "emerald" ? "text-emerald-600"
    : "text-foreground";
  return (
    <Card className="px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </Card>
  );
}
