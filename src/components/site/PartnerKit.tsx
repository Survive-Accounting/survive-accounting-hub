// PARTNER PAGE KIT — the shared pieces every partner surface is built from.
//
// ONE VISUAL SYSTEM WITH THE STUDENT PAGES. These are outbound pages, but not a microsite: same
// navy surfaces, cream display type, orange action colour, same bolt, same navbar and footer. A
// council or national officer who lands here and then opens a chapter page must not feel handed to
// a different company.
//
// WHAT THE KIT IS NOW. After the "show the product, make sharing obvious" rebuild, the partner
// pages show the student product (StudentPreview), a share modal (ShareChaptersModal) and — on the
// national page — a searchable directory (PartnerDirectory). Those carry the page-specific weight,
// so this kit is down to the frame: the hero, its two button styles, and a section heading. The
// old metrics/entity-table/toolkit/demo-badge pieces were removed with the pages that used them.
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { AnimatedCampusBolt, type BoltCampus } from "@/components/site/bolt";

// ── hero ───────────────────────────────────────────────────────────────────────────────────────
export function PartnerHero({ eyebrow, headline, subhead, body, actions, bolt, boltLabel, onBolt }: {
  /** Small partner identifier above the headline — "IFC AT ARIZONA", "KAPPA × SURVIVE". */
  eyebrow: string;
  /** The problem line. Campus surfaces name the course; others use the generic sentence. */
  headline: string;
  /** The partner's move, one line: "Help every chapter get ahead of it." */
  subhead: string;
  body: string;
  actions: React.ReactNode;
  /** Campus colourways for the bolt. One campus = it flows on that one; several = the rotation. */
  bolt: BoltCampus[];
  boltLabel?: string;
  onBolt?: (campus: BoltCampus) => void;
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
      {/* THE SAME BOLT the student pages use — campus colours included, so a council page wears its
          own school and a national page sweeps through the campuses it covers. */}
      <div className="mx-auto w-[min(300px,70vw)] lg:w-[min(340px,100%)]">
        <AnimatedCampusBolt campuses={bolt} ariaLabel={boltLabel ?? "Survive Accounting"} onActivate={(c) => onBolt?.(c)} />
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

/** Section heading + optional right-hand slot. */
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
