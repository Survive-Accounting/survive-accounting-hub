// PARTNER PAGE KIT — the pieces every partner surface is built from.
//
// ONE VISUAL SYSTEM WITH THE STUDENT PAGES. These are outbound B2B-ish pages, but they are not a
// microsite: same navy surfaces, same cream display type, same orange action colour, same bolt,
// same spacing rhythm, same navbar and footer. A council officer who lands here and then opens a
// chapter page must not feel handed to a different company.
//
// WHAT DIVERGES IS THE MIDDLE. A student page's job is to start a video; a partner page's job is
// to show a governing body its chapters and hand it the means to distribute. So the hero, proof
// and footer are shared, and the overview / entity table / toolkit are new.
//
// NO INVENTED NUMBERS, ANYWHERE. PartnerMetrics renders a dash and an honest label for anything
// not instrumented yet, and PartnerDemoBadge marks any surface showing illustrative figures.
import { useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { AnimatedBoltHero, type BoltHeroStop } from "@/components/site/AnimatedBolt";

// ── hero ───────────────────────────────────────────────────────────────────────────────────────
export function PartnerHero({ eyebrow, headline, subhead, body, actions, bolt, boltLabel, onBolt }: {
  /** Small partner identifier above the headline — "IFC AT OLE MISS", "KAPPA × SURVIVE". */
  eyebrow: string;
  /** The problem line. Campus surfaces name the course; others use the generic sentence. */
  headline: string;
  /** The partner's move, one line: "Help every chapter get ahead of it." */
  subhead: string;
  body: string;
  actions: React.ReactNode;
  /** Campus colourways for the bolt. One stop = static; several = the campus sweep. */
  bolt: BoltHeroStop[];
  boltLabel?: string;
  onBolt?: (stop: BoltHeroStop) => void;
}) {
  return (
    <section className="grid items-center gap-10 pt-10 pb-4 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
      <div className="text-center lg:text-left">
        <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em", fontFamily: BRAND_SANS }}>{eyebrow}</p>
        <h1 className="mt-3 text-[28px] font-black leading-[1.1] sm:text-[38px] lg:text-[44px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>
          {headline}
        </h1>
        <p className="mt-3 text-[19px] font-black leading-snug sm:text-[22px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{subhead}</p>
        <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed lg:mx-0 mx-auto" style={{ color: "var(--text-muted)", fontFamily: BRAND_SANS }}>{body}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">{actions}</div>
      </div>
      {/* THE SAME BOLT the student pages use — campus colours included, so a council page wears
          its own school and a national page can sweep through the campuses it covers. */}
      <div className="mx-auto w-[min(300px,70vw)] lg:w-[min(340px,100%)]">
        <AnimatedBoltHero stops={bolt} ariaLabel={boltLabel ?? "Survive Accounting"} onActivate={(s) => onBolt?.(s)} />
      </div>
    </section>
  );
}

/** The hero's primary action. Orange stays the one action colour across the whole site. */
export function PartnerPrimary({ children, onClick, href }: { children: React.ReactNode; onClick?: () => void; href?: string }) {
  const cls = "inline-flex items-center justify-center rounded-xl px-6 text-[15.5px] font-black transition-transform hover:scale-[1.03]";
  const style = { minHeight: 54, background: "var(--accent)", color: "#0B1220", fontFamily: BRAND_SANS } as const;
  return href
    ? <a href={href} className={cls} style={style}>{children}</a>
    : <button type="button" onClick={onClick} className={cls} style={style}>{children}</button>;
}

export function PartnerSecondary({ children, onClick, href, disabled, title }: { children: React.ReactNode; onClick?: () => void; href?: string; disabled?: boolean; title?: string }) {
  const cls = "inline-flex items-center justify-center rounded-xl px-5 text-[15px] font-black disabled:opacity-45";
  const style = { minHeight: 54, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", fontFamily: BRAND_SANS } as const;
  return href && !disabled
    ? <a href={href} className={cls} style={style}>{children}</a>
    : <button type="button" onClick={onClick} disabled={disabled} title={title} className={cls} style={style}>{children}</button>;
}

// ── demo badge ─────────────────────────────────────────────────────────────────────────────────
/** Marks a surface whose numbers are ILLUSTRATIVE. Loud enough that nobody mistakes an outreach
 *  mock-up for a live dashboard — that mistake would be the fastest way to lose a partner. */
export function PartnerDemoBadge({ what = "Sample data" }: { what?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase" style={{ background: "rgba(0,107,166,0.28)", color: "var(--accent-info-text)", letterSpacing: "0.1em", fontFamily: BRAND_SANS }}>
      <span aria-hidden>●</span> Demo — {what}
    </span>
  );
}

// ── metrics ────────────────────────────────────────────────────────────────────────────────────
export type PartnerMetric = {
  label: string;
  /** null renders the honest empty state instead of a number. */
  value: string | number | null;
  /** Shown under the value when it is null — "not tracked yet", never a zero pretending to be data. */
  empty?: string;
  demo?: boolean;
};

export function PartnerMetrics({ metrics }: { metrics: PartnerMetric[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" style={{ fontFamily: BRAND_SANS }}>
      {metrics.map((m) => (
        <div key={m.label} className="rounded-2xl px-4 py-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
          <p className="text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>{m.label}</p>
          {m.value == null ? (
            <>
              <p className="mt-1 text-[26px] font-black leading-none" style={{ color: "var(--text-tertiary)", fontFamily: BRAND_DISPLAY }}>—</p>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{m.empty ?? "not tracked yet"}</p>
            </>
          ) : (
            <p className="mt-1 text-[26px] font-black leading-none" style={{ color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY }}>
              {m.value}{m.demo ? <span className="ml-1.5 align-middle text-[11px] font-black" style={{ color: "var(--accent-info-text)" }}>DEMO</span> : null}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── entity table ───────────────────────────────────────────────────────────────────────────────
export type PartnerColumn = { key: string; label: string; align?: "right" };
export type PartnerRow = {
  id: string;
  cells: Record<string, React.ReactNode>;
  /** Rendered in the Action column — usually a link to the chapter's existing /go/ page. */
  action?: React.ReactNode;
};

/** Table on desktop, cards on a phone. Same rows, same order, no second data path. */
export function PartnerEntityTable({ columns, rows, empty }: { columns: PartnerColumn[]; rows: PartnerRow[]; empty?: string }) {
  if (!rows.length) return <p className="text-[14px]" style={{ color: "var(--text-muted)", fontFamily: BRAND_SANS }}>{empty ?? "Nothing on file yet."}</p>;
  return (
    <div style={{ fontFamily: BRAND_SANS }}>
      {/* desktop */}
      <div className="hidden overflow-hidden rounded-2xl sm:block" style={{ border: "1px solid var(--border-default)" }}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr style={{ background: "var(--bg-surface)" }}>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-2.5 text-[11px] font-black uppercase ${c.align === "right" ? "text-right" : ""}`} style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>{c.label}</th>
              ))}
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 text-[14px] ${c.align === "right" ? "text-right tabular-nums" : ""}`} style={{ color: "var(--brand-cream)" }}>{r.cells[c.key]}</td>
                ))}
                <td className="px-4 py-3 text-right">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* phone */}
      <div className="grid gap-2 sm:hidden">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl px-3.5 py-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold" style={{ color: "var(--brand-cream)" }}>{r.cells[columns[0].key]}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {columns.slice(1).map((c) => <span key={c.key}>{r.cells[c.key]}</span>)}
                </div>
              </div>
              <div className="shrink-0">{r.action}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Live / claimed / not launched — the words the rest of the product already uses. */
export function PartnerStatus({ claimed }: { claimed: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-black" style={{ background: claimed ? "rgba(0,107,166,0.28)" : "rgba(245,239,230,0.06)", color: claimed ? "var(--accent-info-text)" : "var(--text-muted)" }}>
      {claimed ? "Claimed" : "Not launched"}
    </span>
  );
}

/** A row action: opens the chapter's real page, or copies its real link. Nothing here mints a
 *  second identity for a chapter. */
export function PartnerRowAction({ href, copy }: { href: string; copy?: string }) {
  const [done, setDone] = useState(false);
  if (copy) {
    return (
      <button
        type="button"
        onClick={async () => { try { await navigator.clipboard.writeText(copy); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* clipboard blocked */ } }}
        className="rounded-lg px-3 text-[13px] font-black"
        style={{ minHeight: 40, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: done ? "var(--accent-info-text)" : "var(--brand-cream)" }}
      >
        {done ? "Copied ⚡" : "Copy link"}
      </button>
    );
  }
  return (
    <a href={href} className="inline-flex items-center rounded-lg px-3 text-[13px] font-black" style={{ minHeight: 40, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>
      View chapter →
    </a>
  );
}

// ── toolkit ────────────────────────────────────────────────────────────────────────────────────
export type ToolkitItem = {
  title: string;
  body: string;
  /** Copy-to-clipboard text. Present = the action works today. */
  copy?: string;
  href?: string;
  cta: string;
  /** True for things that are not built yet — rendered visibly disabled, never as a dead link. */
  soon?: boolean;
};

/** THE DISTRIBUTION SECTION. V1 is copy-to-clipboard and real links; anything not implemented
 *  (flyer/kit generation) is shown as "coming" rather than as a button that downloads nothing. */
export function PartnerToolkit({ title, items }: { title: string; items: ToolkitItem[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <section style={{ fontFamily: BRAND_SANS }}>
      <h2 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.title} className="flex flex-col rounded-2xl px-4 py-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
            <p className="text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>{it.title}</p>
            <p className="mt-1 flex-1 text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{it.body}</p>
            {it.soon ? (
              <span className="mt-3 inline-flex items-center gap-2 self-start rounded-lg px-3 text-[13px] font-black" style={{ minHeight: 40, background: "rgba(245,239,230,0.05)", border: "1px dashed var(--border-default)", color: "var(--text-muted)" }}>
                {it.cta} · coming
              </span>
            ) : it.href ? (
              <a href={it.href} className="mt-3 inline-flex items-center self-start rounded-lg px-3 text-[13px] font-black" style={{ minHeight: 40, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>{it.cta}</a>
            ) : (
              <button
                type="button"
                onClick={async () => { if (!it.copy) return; try { await navigator.clipboard.writeText(it.copy); setCopied(it.title); setTimeout(() => setCopied(null), 1800); } catch { /* clipboard blocked */ } }}
                className="mt-3 inline-flex items-center self-start rounded-lg px-3 text-[13px] font-black"
                style={{ minHeight: 40, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: copied === it.title ? "var(--accent-info-text)" : "var(--brand-cream)" }}
              >
                {copied === it.title ? "Copied ⚡" : it.cta}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Section heading + optional right-hand slot (the demo badge lives there). */
export function PartnerSection({ title, note, right, children, id }: { title: string; note?: string; right?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-14" style={{ fontFamily: BRAND_SANS }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{title}</h2>
          {note && <p className="mt-1 text-[13.5px]" style={{ color: "var(--text-muted)" }}>{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
