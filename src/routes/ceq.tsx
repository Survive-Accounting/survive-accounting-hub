import { AdminGate } from "@/components/AdminGate";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/ceq")({
  head: () => ({ meta: [{ title: "CEQ Command Center — Survive Accounting" }] }),
  component: CeqRoute,
});

type Chapter = { n: number; name: string };
type Course = { slug: string; title: string; code: string; chapters: Chapter[] };

const COURSES: Course[] = [
  {
    slug: "ia1",
    title: "Intermediate Accounting 1",
    code: "IA1",
    chapters: [
      { n: 1, name: "The Conceptual Framework" },
      { n: 2, name: "The Accounting System" },
      { n: 3, name: "The Income Statement" },
      { n: 4, name: "The Balance Sheet" },
      { n: 5, name: "Time Value of Money" },
      { n: 6, name: "Cash & Receivables" },
      { n: 7, name: "Inventories, Cost Approach" },
      { n: 8, name: "Inventories, Additional Issues" },
      { n: 9, name: "Property, Plant, and Equipment" },
      { n: 10, name: "Depreciation, Impairments, and Depletion" },
      { n: 11, name: "Intangible Assets" },
      { n: 12, name: "Current Liabilities" },
    ],
  },
  {
    slug: "ia2",
    title: "Intermediate Accounting 2",
    code: "IA2",
    chapters: [
      { n: 13, name: "Long Term Liabilities" },
      { n: 14, name: "Stockholder's Equity" },
      { n: 15, name: "Dilutive Securities and EPS" },
      { n: 16, name: "Investments" },
      { n: 17, name: "Revenue Recognition" },
      { n: 18, name: "Income Taxes" },
      { n: 19, name: "Pensions" },
      { n: 20, name: "Leases" },
      { n: 21, name: "Accounting Changes" },
      { n: 22, name: "Statement of Cash Flows" },
    ],
  },
  {
    slug: "intro1",
    title: "Intro Accounting 1",
    code: "INTRO1",
    chapters: [
      { n: 1, name: "Accounting in Business" },
      { n: 2, name: "Journalizing Transactions" },
      { n: 3, name: "Adjusting Entries" },
      { n: 4, name: "Merchandising" },
      { n: 5, name: "FIFO/LIFO" },
      { n: 6, name: "Cash & Internal Controls" },
      { n: 7, name: "Receivables" },
      { n: 8, name: "Long Term Assets" },
      { n: 9, name: "Current Liabilities" },
      { n: 10, name: "Long Term Liabilities" },
      { n: 11, name: "Equity" },
    ],
  },
  {
    slug: "intro2",
    title: "Intro Accounting 2",
    code: "INTRO2",
    chapters: [
      { n: 12, name: "Cash Flow Statements" },
      { n: 13, name: "Financial Statement Analysis" },
      { n: 14, name: "Managerial Accounting Concepts" },
      { n: 15, name: "Job Order Costing" },
      { n: 16, name: "Process Costing" },
      { n: 17, name: "Activity Based Costing" },
      { n: 18, name: "Cost Volume Profit" },
      { n: 19, name: "Variable Costing" },
      { n: 20, name: "Master Budgets" },
      { n: 21, name: "Standard Costing" },
      { n: 22, name: "Performance Measures" },
      { n: 23, name: "Relevant Costing" },
      { n: 24, name: "Capital Budgeting" },
    ],
  },
];

function CeqRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/ceq") return <Outlet />;

  const stats = { total: 0, drafted: 0, approved: 0, readyTutor: 0, readyFilm: 0, published: 0 };

  return (
    <AdminGate>

    <div className="min-h-screen bg-[hsl(210_20%_98%)]">
      {/* Top header */}
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4 sm:px-10">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-12 place-items-center rounded-md bg-blue-600 text-xs font-bold text-white">
              CEQ
            </span>
            <span className="text-base font-semibold text-foreground">Common Exam Questions</span>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8 sm:px-10">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tight">CEQ Command Center</h1>
          <p className="mt-1 text-muted-foreground">
            Build Common Exam Questions from textbook problems.
          </p>
        </div>

        {/* Stat tiles */}
        <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Total" value={stats.total} />
          <StatTile label="Drafted" value={stats.drafted} tone="amber" />
          <StatTile label="Approved" value={stats.approved} tone="blue" />
          <StatTile label="Ready to Tutor" value={stats.readyTutor} tone="violet" />
          <StatTile label="Ready to Film" value={stats.readyFilm} tone="orange" />
          <StatTile label="Published" value={stats.published} tone="emerald" />
        </div>

        {/* Courses */}
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Courses
        </h2>
        <div className="space-y-4">
          {COURSES.map((course) => (
            <section key={course.slug} className="rounded-xl border border-border bg-white p-6">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-foreground">{course.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {course.code} · {course.chapters.length} chapters
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {course.chapters.map((ch) => (
                  <a
                    key={ch.n}
                    href={`/ceq/${course.slug}/ch${ch.n}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-white px-3 py-2 text-sm transition hover:border-foreground/30 hover:bg-accent/30"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        Ch <span className="tabular-nums">{ch.n}</span>
                      </span>
                      <span className="truncate font-medium text-foreground">{ch.name}</span>
                    </span>
                    <span className="text-muted-foreground">→</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Recent CEQs */}
        <h2 className="mb-3 mt-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent CEQs
        </h2>
        <div className="rounded-xl border border-border bg-white px-6 py-10 text-center text-sm text-muted-foreground">
          No CEQs yet. Pick a chapter above, mark which textbook problems are core, then build CEQs from them.
        </div>
      </main>
    </div>
    </AdminGate>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "amber" | "blue" | "violet" | "orange" | "emerald";
}) {
  const color =
    tone === "amber" ? "text-amber-500"
    : tone === "blue" ? "text-blue-600"
    : tone === "violet" ? "text-violet-600"
    : tone === "orange" ? "text-orange-500"
    : tone === "emerald" ? "text-emerald-600"
    : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
