// /study/foundations — the free, public "Accounting Foundations" landing. Indexable:
// SSR'd list of the foundations chapters and their scenarios, each deep-linking to its own
// public page at /study/scenarios/{slug}. Foundations is the free tier — no gate here.
import { createFileRoute, Link } from "@tanstack/react-router";

import SiteNavbar from "@/components/landing/SiteNavbar";
import SiteFooter from "@/components/landing/SiteFooter";
import { fetchFoundationsIndex, type FoundationsIndex } from "@/lib/je-api";

const NAVY = "#14213D";
const RED = "#CE1126";
const CANONICAL = "https://surviveaccounting.com/study/foundations";

export const Route = createFileRoute("/study_/foundations")({
  loader: () => fetchFoundationsIndex(),
  head: () => ({
    meta: [
      { title: "Accounting Foundations — Free Journal Entry Practice | Survive Accounting" },
      {
        name: "description",
        content:
          "Free, no-login accounting foundations: the accounting equation, debits and credits, journal entries, adjusting and closing entries — worked as interactive scenarios.",
      },
      { property: "og:title", content: "Accounting Foundations — free journal-entry practice" },
      {
        property: "og:description",
        content: "Start with the free foundations: the accounting equation, debits & credits, journal entries, adjusting & closing.",
      },
      { property: "og:url", content: CANONICAL },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Accounting Foundations — free practice" },
      { name: "twitter:description", content: "The accounting equation, debits & credits, journal entries — worked interactively, free." },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: FoundationsLanding,
});

function coursesJsonLd(index: FoundationsIndex | null) {
  const total = index?.chapters.reduce((n, c) => n + c.scenarios.length, 0) ?? 0;
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: "Accounting Foundations",
    description:
      "A free introduction to financial accounting: the accounting equation, debits and credits, journal entries, receivables and payables, adjusting entries, financial statements, and the closing process.",
    url: CANONICAL,
    provider: { "@type": "EducationalOrganization", name: "Survive Accounting", "@id": "https://surviveaccounting.com/#org" },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: `${total} interactive scenarios`,
    },
  };
}

function FoundationsLanding() {
  const index = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-background">
      <SiteNavbar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(coursesJsonLd(index)) }} />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="h-px w-8" style={{ background: RED }} aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Free · no login</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight" style={{ color: NAVY }}>Accounting Foundations</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          The bedrock of financial accounting, worked as interactive scenarios: what accounting is and the
          accounting equation, accounts and debits & credits, journal entries, receivables and payables,
          adjusting entries, financial statements, and the accounting cycle. Start anywhere — it's free.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/study" className="rounded-md px-3 py-2 text-sm font-semibold text-white" style={{ background: NAVY }}>
            Open the interactive tool →
          </Link>
          <a href="/order" className="rounded-md border border-border px-3 py-2 text-sm font-semibold hover:border-foreground">
            Get personalized help
          </a>
        </div>

        {!index || index.chapters.length === 0 ? (
          <p className="mt-8 text-sm italic text-muted-foreground">Foundations content is being prepared.</p>
        ) : (
          <div className="mt-8 space-y-6">
            {index.chapters.map((ch) => (
              <section key={ch.id}>
                <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
                  {ch.number != null ? `Chapter ${ch.number} · ` : ""}{ch.name ?? "Untitled chapter"}
                </h2>
                {ch.scenarios.length === 0 ? (
                  <p className="mt-1 text-[13px] italic text-muted-foreground">Scenarios coming soon.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {ch.scenarios.map((s) => (
                      <li key={s.slug}>
                        <Link
                          to="/study/scenarios/$slug"
                          params={{ slug: s.slug }}
                          className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 text-sm transition-all hover:-translate-y-px hover:border-foreground hover:shadow-[0_2px_10px_rgba(20,33,61,0.08)]"
                        >
                          <span className="font-medium text-foreground">{s.title}</span>
                          <span className="text-muted-foreground" aria-hidden>→</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
