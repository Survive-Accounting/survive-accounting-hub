// THE SEAT OFFER — post-approval block, term + pack selection, and the three payment paths.
//
// PRESALE FIRST. Exams 2, 3 and the Final are still being filmed, so PRESALE_DISCLOSURE from
// lib/terms is rendered at every point where money is asked for: the offer block, the pack
// screen, and the payment step. A chapter that finds the gap after paying is the trust failure
// this component exists to avoid, so the disclosure is never a footnote and never conditional.
//
// TERM FIRST, TOO. There is no such thing as "20 seats" — only "20 seats, Fall 2026, access
// through Dec. 31, 2026". Every screen states the term and its expiry before the price, and the
// selection travels to the pool that gets created.
//
// PAYMENTS: card and invoice are visibly OFF until Test Mode exists (see PAYMENTS_ENABLED in
// chapter-seats.functions). Check works today and is presented as a first-class path, because it
// is how chapter treasurers usually pay anyway.
import { useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import {
  CHAPTER_PRESALE_TIMING_COPY, PRESALE_DISCLOSURE, SEAT_MINIMUM, SEAT_PACKS,
  money, priceCentsFor, purchasableTerms, seatCoverageLine, termId, type Term,
} from "@/lib/terms";
import { PAYMENTS_ENABLED, startSeatPurchase } from "@/lib/chapter-seats.functions";

const LEE_TEL = "+16625658818";

/** The disclosure block. One component so the sentence, its timing line and its treatment are
 *  identical everywhere it appears. */
export function PresaleDisclosure({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-xl ${compact ? "px-3 py-2" : "px-4 py-3"}`}
      style={{ background: "rgba(252,163,17,0.10)", border: "1px solid rgba(252,163,17,0.40)", fontFamily: BRAND_SANS }}
    >
      <p className={`font-bold ${compact ? "text-[13px]" : "text-[14px]"}`} style={{ color: "var(--brand-cream)" }}>
        {PRESALE_DISCLOSURE}
      </p>
      <p className={`mt-1 ${compact ? "text-[12.5px]" : "text-[13px]"}`} style={{ color: "var(--text-secondary)" }}>
        {CHAPTER_PRESALE_TIMING_COPY}
      </p>
    </div>
  );
}

// ── 1. POST-APPROVAL OFFER ─────────────────────────────────────────────────────────────────────
/** Shown on the dashboard once a chapter is approved. Dismissible — dismissing leaves the chapter
 *  on the generous free tier, and the offer stays reachable from the dashboard afterwards. */
export function SeatOfferBlock({ onChoose, onShareKit, onDismiss }: {
  onChoose: () => void;
  onShareKit: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS }}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[20px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Cover your members.</h2>
        <button type="button" onClick={onDismiss} aria-label="Dismiss the seat offer" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-secondary)" }}>
          <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>×</span>
        </button>
      </div>
      <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        Exam 1 is free for everyone. Seats cover your members for Exam 2, Exam 3 and the Final for the selected semester.
      </p>

      <div className="mt-3"><PresaleDisclosure /></div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onChoose} className="rounded-xl px-5 text-[15px] font-black transition-transform hover:scale-[1.02]" style={{ minHeight: 50, background: "var(--accent)", color: "#0B1220" }}>
          Choose your seats →
        </button>
        <button type="button" onClick={onShareKit} className="text-[14px] font-bold underline underline-offset-4" style={{ color: "var(--text-secondary)", minHeight: 44 }}>
          Not ready? Get what you need to pitch it →
        </button>
      </div>
    </section>
  );
}

// ── 2 + 3. TERM AND PACKS ──────────────────────────────────────────────────────────────────────
export function SeatPurchase({ chapterId, chapterName, courseCode, accessToken, isTest, onDone, onCancel }: {
  chapterId: string;
  chapterName: string;
  /** The campus's real intro course code, or null — never a hardcoded ACCY 201. */
  courseCode: string | null;
  accessToken: string;
  isTest?: boolean;
  onDone: (r: { poolId: string; status: string }) => void;
  onCancel: () => void;
}) {
  const terms = useMemo(() => purchasableTerms(), []);
  const [term, setTerm] = useState<Term>(terms[0]);
  const [seats, setSeats] = useState<number>(20);
  const [custom, setCustom] = useState(false);
  const [method, setMethod] = useState<"card" | "invoice" | "check">("check");
  const [treasurerName, setTreasurerName] = useState("");
  const [treasurerEmail, setTreasurerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const course = courseCode ?? "intro accounting";
  const price = priceCentsFor(seats);
  const invoiceReady = method !== "invoice" || (treasurerName.trim().length > 1 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(treasurerEmail.trim()));
  const canBuy = seats >= SEAT_MINIMUM && invoiceReady && !busy;

  const submit = async () => {
    if (!canBuy) return;
    setBusy(true); setErr(null);
    try {
      const r = await startSeatPurchase({ data: {
        accessToken, chapterId, termId: termId(term), seats, method,
        treasurerName: treasurerName.trim() || undefined,
        treasurerEmail: treasurerEmail.trim() || undefined,
        isTest: !!isTest,
      } });
      if (!r.ok) { setErr(r.error); setBusy(false); return; }
      onDone({ poolId: r.poolId, status: r.status });
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't start that — try again."); }
    finally { setBusy(false); }
  };

  const card = { background: "var(--bg-surface)", border: "1px solid var(--border-default)" } as const;

  return (
    <section className="rounded-2xl p-5" style={{ ...card, fontFamily: BRAND_SANS }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
            Cover {chapterName} for {term.label}
          </h2>
          <p className="mt-1 text-[14px]" style={{ color: "var(--text-secondary)" }}>
            Seats give assigned members access through {term.expiresLabel}.
          </p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-secondary)" }}>
          <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>×</span>
        </button>
      </div>

      {/* TERM. One purchasable term is preselected rather than forced through a pointless step; two
          or more get a real choice. A purchase without a term is never possible. */}
      {terms.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {terms.map((t) => (
            <button
              key={t.label} type="button" onClick={() => setTerm(t)}
              className="rounded-xl px-3.5 text-[14px] font-black"
              style={{
                minHeight: 44,
                background: t.label === term.label ? "rgba(0,107,166,0.28)" : "var(--bg-overlay)",
                border: `1px solid ${t.label === term.label ? "var(--accent-info)" : "var(--border-default)"}`,
                color: t.label === term.label ? "var(--accent-info-text)" : "var(--brand-cream)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* PACKS */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {SEAT_PACKS.map((p) => {
          const on = !custom && seats === p.seats;
          return (
            <button
              key={p.seats} type="button" onClick={() => { setCustom(false); setSeats(p.seats); }}
              className="rounded-2xl px-4 py-4 text-left"
              style={{ background: on ? "rgba(252,163,17,0.12)" : "var(--bg-overlay)", border: `1px solid ${on ? "var(--accent)" : "var(--border-default)"}` }}
            >
              <p className="text-[22px] font-black leading-none" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{p.seats} seats</p>
              <p className="mt-1.5 text-[18px] font-black" style={{ color: "var(--accent)" }}>{money(p.priceCents)}</p>
              {p.badge && <p className="mt-1 text-[12px] font-bold" style={{ color: "var(--accent-info-text)" }}>{p.badge}</p>}
            </button>
          );
        })}
      </div>

      {/* CUSTOM */}
      <div className="mt-3">
        {custom ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number" min={SEAT_MINIMUM} max={500} value={seats}
              onChange={(e) => setSeats(Math.max(0, Number(e.target.value) || 0))}
              className="w-28 rounded-xl px-3 outline-none"
              style={{ fontSize: 16, minHeight: 44, background: "var(--bg-input)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
            />
            <span className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
              seats · {money(price)} {seats < SEAT_MINIMUM && <b style={{ color: "#F3C6CC" }}>· {SEAT_MINIMUM} minimum</b>}
            </span>
          </div>
        ) : (
          <button type="button" onClick={() => setCustom(true)} className="text-[14px] font-bold underline underline-offset-4" style={{ color: "var(--text-secondary)", minHeight: 44 }}>
            Need a different number? →
          </button>
        )}
      </div>

      {/* CAMPUS CONTEXT — the real course code, never a hardcoded one. */}
      <p className="mt-3 text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
        Most chapters have 15–30 members in {course} at once.
      </p>
      <p className="mt-1 text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>
        These seats are for {term.label}. Member access lasts through {term.expiresLabel}.
      </p>

      <div className="mt-4"><PresaleDisclosure compact /></div>

      {/* PAYMENT */}
      <div className="mt-5">
        <p className="mb-2 text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>How you&apos;re paying</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {([
            { k: "card" as const, t: "Card", b: PAYMENTS_ENABLED ? "Instant activation." : "Not switched on yet." },
            { k: "invoice" as const, t: "Invoice the treasurer", b: PAYMENTS_ENABLED ? "Real invoice, emailed." : "Not switched on yet." },
            { k: "check" as const, t: "Check by mail", b: "Seats activate when it clears." },
          ]).map((o) => {
            const off = (o.k === "card" || o.k === "invoice") && !PAYMENTS_ENABLED;
            const on = method === o.k;
            return (
              <button
                key={o.k} type="button" disabled={off} onClick={() => setMethod(o.k)}
                className="rounded-xl px-3.5 py-3 text-left disabled:opacity-45"
                style={{ background: on ? "rgba(0,107,166,0.22)" : "var(--bg-overlay)", border: `1px solid ${on ? "var(--accent-info)" : "var(--border-default)"}` }}
              >
                <p className="text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>{o.t}</p>
                <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>{o.b}</p>
              </button>
            );
          })}
        </div>
      </div>

      {method === "invoice" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={treasurerName} onChange={(e) => setTreasurerName(e.target.value)} placeholder="Treasurer name" className="w-full rounded-xl px-3 outline-none" style={{ fontSize: 16, minHeight: 44, background: "var(--bg-input)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }} />
          <input value={treasurerEmail} onChange={(e) => setTreasurerEmail(e.target.value)} type="email" placeholder="Treasurer email" className="w-full rounded-xl px-3 outline-none" style={{ fontSize: 16, minHeight: 44, background: "var(--bg-input)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }} />
        </div>
      )}

      {method === "check" && (
        <div className="mt-3 rounded-xl px-4 py-3" style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)" }}>
          <p className="text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>Make it out to Earned Wisdom LLC.</p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Seats activate as soon as the check clears —{" "}
            <a href={`sms:${LEE_TEL}`} className="font-bold underline underline-offset-4" style={{ color: "var(--brand-cream)" }}>text me</a>{" "}
            and I&apos;ll get you started sooner if your members need access now.
          </p>
        </div>
      )}

      {err && <p className="mt-3 text-[13.5px]" style={{ color: "#F3C6CC" }}>{err}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void submit()} disabled={!canBuy} className="rounded-xl px-5 text-[15px] font-black disabled:opacity-45" style={{ minHeight: 50, background: "var(--accent)", color: "#0B1220" }}>
          {busy ? "…" : method === "check" ? `Reserve ${seats} seats · ${money(price)}` : `Continue · ${money(price)}`}
        </button>
        <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{seatCoverageLine(term, seats)}</span>
      </div>
    </section>
  );
}
