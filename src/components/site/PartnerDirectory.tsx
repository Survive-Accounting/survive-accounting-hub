// PARTNER DIRECTORY — the campus list on a national page, built to be scanned, not scrolled.
//
// A national org can have 200 campuses. Rendering them all as one table is the thing the brief
// forbids: it is slow, it buries the product demo above it, and nobody reads 200 rows. So this is
// search + a two-state filter + pagination (25 a page), rendering only the current page of rows.
// The data is already in memory (the loader returns the org's campuses once, as light rows), so
// filtering and paging are pure client work — no N+1, no per-row fetch.
//
// PUBLIC STATUS, NOT INTERNAL STATE. A campus is "Active" when a chapter exec has claimed it and
// "Ready to share" otherwise — because every /go/ page already serves Exam 1 free, so "ready" is
// true, not aspirational. The words "not launched", "unmapped" and "incomplete" never appear:
// they describe our data pipeline, which is not the officer's concern.
//
// Course code is deliberately NOT a column. It shows the moment they open a campus; in the list it
// is noise that makes 200 rows wider and harder to scan.
import { useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";

export type DirectoryRow = {
  key: string;
  name: string;
  /** claimed → "Active"; otherwise → "Ready to share". */
  active: boolean;
  /** The chapter's existing /go/ page. */
  href: string;
  /** Matched in search, never shown — abbreviations, alternate names. */
  aliases?: string[];
};

type Filter = "all" | "ready" | "active";
const PER_PAGE = 25;

export function PartnerDirectory({ rows, searchPlaceholder = "Search campuses…", openLabel = "Open chapter" }: {
  rows: DirectoryRow[];
  searchPlaceholder?: string;
  openLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);

  const activeCount = useMemo(() => rows.filter((r) => r.active).length, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "active" && !r.active) return false;
      if (filter === "ready" && r.active) return false;
      if (!needle) return true;
      const hay = [r.name, ...(r.aliases ?? [])].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const clampedPage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(clampedPage * PER_PAGE, clampedPage * PER_PAGE + PER_PAGE);

  const reset = (fn: () => void) => { fn(); setPage(0); };

  const CHIPS: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${rows.length})` },
    { key: "ready", label: `Ready to share (${rows.length - activeCount})` },
    { key: "active", label: `Active (${activeCount})` },
  ];

  return (
    <div style={{ fontFamily: BRAND_SANS }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => reset(() => setQ(e.target.value))}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="sa-field w-full sm:max-w-xs"
          style={{ minHeight: 46, borderRadius: 12, padding: "0 14px", background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)", color: "var(--brand-cream)", fontSize: 16, outline: "none" }}
        />
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button
              key={c.key} type="button" onClick={() => reset(() => setFilter(c.key))}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold"
              style={{ minHeight: 40, background: filter === c.key ? "var(--accent)" : "var(--bg-surface)", color: filter === c.key ? "#0B1220" : "var(--brand-cream)", border: "1px solid var(--border-default)" }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-[14px]" style={{ color: "var(--text-muted)" }}>No campuses match “{q}”.</p>
      ) : (
        <>
          {/* desktop: three columns, campus · status · action — no course code */}
          <div className="mt-4 hidden overflow-hidden rounded-2xl sm:block" style={{ border: "1px solid var(--border-default)" }}>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr style={{ background: "var(--bg-surface)" }}>
                  <th className="px-4 py-2.5 text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Campus</th>
                  <th className="px-4 py-2.5 text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <td className="px-4 py-3 text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>{r.name}</td>
                    <td className="px-4 py-3"><DirectoryStatus active={r.active} /></td>
                    <td className="px-4 py-3 text-right">
                      <a href={r.href} className="inline-flex items-center rounded-lg px-3 text-[13px] font-black" style={{ minHeight: 40, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>{openLabel} →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* phone: compact cards */}
          <div className="mt-4 grid gap-2 sm:hidden">
            {shown.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold" style={{ color: "var(--brand-cream)" }}>{r.name}</p>
                  <div className="mt-1"><DirectoryStatus active={r.active} /></div>
                </div>
                <a href={r.href} className="inline-flex shrink-0 items-center rounded-lg px-3 text-[12.5px] font-black" style={{ minHeight: 40, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>{openLabel} →</a>
              </div>
            ))}
          </div>

          {pageCount > 1 && (
            <Pager page={clampedPage} pageCount={pageCount} onPage={setPage} />
          )}
        </>
      )}
    </div>
  );
}

function DirectoryStatus({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-black" style={{ background: active ? "rgba(52,168,83,0.16)" : "rgba(0,107,166,0.22)", color: active ? "#69DB7C" : "var(--accent-info-text)" }}>
      {active ? "Active" : "Ready to share"}
    </span>
  );
}

/** Prev · 1 2 3 … · Next — windowed so a 200-campus org shows a handful of numbers, not fifty. */
function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  const nums: number[] = [];
  const start = Math.max(0, Math.min(page - 2, pageCount - 5));
  const end = Math.min(pageCount, start + 5);
  for (let i = start; i < end; i++) nums.push(i);
  const btn = (label: React.ReactNode, p: number, on: boolean, disabled = false) => (
    <button
      key={String(label) + p} type="button" disabled={disabled} onClick={() => onPage(p)}
      className="rounded-lg px-3 text-[13px] font-black disabled:opacity-35"
      style={{ minHeight: 40, minWidth: 40, background: on ? "var(--accent)" : "var(--bg-surface)", color: on ? "#0B1220" : "var(--brand-cream)", border: "1px solid var(--border-default)" }}
    >{label}</button>
  );
  return (
    <div className="mt-4 flex items-center justify-center gap-1.5" style={{ fontFamily: BRAND_DISPLAY }}>
      {btn("‹ Prev", page - 1, false, page === 0)}
      {nums.map((n) => btn(n + 1, n, n === page))}
      {btn("Next ›", page + 1, false, page >= pageCount - 1)}
    </div>
  );
}
