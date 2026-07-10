// /study/scenarios/{slug} — one permanent, indexable public page per PUBLIC (foundations)
// scenario. Non-public or unknown slugs redirect to the interactive /study tool (no gated
// teaser). SSR renders real teaching content — the exam-stem event, the journal entry, the
// per-line reasoning, and the memorize points — so the page is crawlable without JS.
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import SiteNavbar from "@/components/landing/SiteNavbar";
import SiteFooter from "@/components/landing/SiteFooter";
import { fmtUSD } from "@/lib/je/amortization";
import { resolveVariant } from "@/lib/je-engine";
import { fetchPublicScenario, type PublicScenario } from "@/lib/je-api";

const NAVY = "#14213D";
const RED = "#CE1126";
const canonicalFor = (slug: string) => `https://surviveaccounting.com/study/scenarios/${slug}`;

export const Route = createFileRoute("/study_/scenarios/$slug")({
  loader: async ({ params }) => {
    const scenario = await fetchPublicScenario(params.slug);
    // Not public (or not found) → send to the interactive tool rather than expose a teaser.
    if (!scenario) throw redirect({ to: "/study", statusCode: 302 });
    return scenario;
  },
  head: ({ loaderData }) => {
    const s = loaderData as PublicScenario | undefined;
    if (!s) return {};
    const chapter = s.chapter.name ?? "Accounting Foundations";
    const desc = truncate(s.doc.event, 155);
    const url = canonicalFor(s.slug);
    return {
      meta: [
        { title: `${s.title} — ${chapter} | Survive Accounting` },
        { name: "description", content: desc },
        { property: "og:title", content: `${s.title} — ${chapter}` },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        { name: "twitter:title", content: `${s.title} — ${chapter}` },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PublicScenarioPage,
});

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

function learningResourceJsonLd(s: PublicScenario) {
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: s.title,
    description: truncate(s.doc.event, 300),
    url: canonicalFor(s.slug),
    inLanguage: "en",
    educationalLevel: "Beginner",
    learningResourceType: "Worked example",
    isAccessibleForFree: true,
    isPartOf: {
      "@type": "Course",
      name: "Accounting Foundations",
      url: "https://surviveaccounting.com/study/foundations",
    },
    provider: { "@type": "EducationalOrganization", name: "Survive Accounting", "@id": "https://surviveaccounting.com/#org" },
  };
}

function PublicScenarioPage() {
  const s = Route.useLoaderData();
  const doc = s.doc;
  // The representative entry: the first variant (foundations scenarios are single-variant or
  // the first variant is the canonical illustration).
  const variant = resolveVariant(doc, {}) ?? doc.variants[0];
  const entries = variant?.entries ?? [];
  const chapterName = s.chapter.name ?? "Accounting Foundations";

  return (
    <div className="min-h-screen bg-background">
      <SiteNavbar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(learningResourceJsonLd(s)) }} />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* Breadcrumb */}
        <nav className="text-[12px] text-muted-foreground" aria-label="Breadcrumb">
          <Link to="/study/foundations" className="hover:text-foreground">{s.courseName}</Link>
          <span className="mx-1.5" aria-hidden>›</span>
          <span>{chapterName}</span>
        </nav>

        <div className="mt-2 flex items-center gap-2">
          <span className="h-5 w-1.5 rounded-full" style={{ background: RED }} aria-hidden />
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: NAVY }}>{doc.title}</h1>
        </div>

        {/* Exam-stem / event */}
        <p className="mt-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-[15px] leading-relaxed text-foreground/90">
          {doc.event}
        </p>

        {/* The journal entry (representative) */}
        {entries.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">The journal entry</h2>
            {entries.map((entry) => (
              <div key={entry.id} className="mt-2 overflow-hidden rounded-lg border border-border">
                {entry.caption && (
                  <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-[12px] font-medium text-muted-foreground">{entry.caption}</div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-1.5 text-left font-semibold">Account</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Debit</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((l) => {
                      const amt = typeof l.amount === "number" ? `$${fmtUSD(l.amount)}` : "";
                      return (
                        <tr key={l.id} className="border-t border-border">
                          <td className={`px-3 py-1.5 ${l.side === "credit" ? "pl-8 text-foreground/80" : "font-medium"}`}>{l.account}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{l.side === "debit" ? amt : ""}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{l.side === "credit" ? amt : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}

            {/* Per-line reasoning — real indexable teaching content */}
            {entries.some((e) => e.lines.some((l) => l.why)) && (
              <ul className="mt-3 space-y-2">
                {entries.flatMap((e) => e.lines).filter((l) => l.why).map((l) => (
                  <li key={l.id} className="text-[13px] leading-relaxed text-foreground/80">
                    <span className="font-semibold">{l.account} ({l.side}):</span> {l.why}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Memorize points */}
        {(doc.memorize ?? []).length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Remember this</h2>
            <ul className="mt-2 space-y-2">
              {doc.memorize!.map((m, i) => (
                <li key={i} className="rounded-lg border border-border bg-card px-3 py-2 text-[13px] leading-relaxed text-foreground/90">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{m.kind}</span>
                  <p className="mt-0.5">{m.body}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap gap-2">
          <Link to="/study" className="rounded-md px-3 py-2 text-sm font-semibold text-white" style={{ background: NAVY }}>
            Practice this interactively →
          </Link>
          <a href="/order" className="rounded-md border border-border px-3 py-2 text-sm font-semibold hover:border-foreground">
            Get personalized help
          </a>
        </div>

        {/* Related patterns */}
        {s.siblings.length > 0 && (
          <section className="mt-8 border-t border-border pt-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Related patterns</h2>
            <ul className="mt-2 space-y-1.5">
              {s.siblings.map((sib) => (
                <li key={sib.slug}>
                  <Link to="/study/scenarios/$slug" params={{ slug: sib.slug }} className="text-sm font-medium text-foreground hover:underline">
                    {sib.title} →
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/study/foundations" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
                  All of {s.courseName} →
                </Link>
              </li>
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
