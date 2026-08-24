// THE PAID (TERM) DASHBOARD — seat assignment, over-cap upsell, payment history, courtesy credit.
//
// FREE STAYS GENEROUS. Nothing here replaces the free dashboard; it is added beside it once a
// chapter holds an ACTIVE, UNEXPIRED pool. A chapter that never buys keeps its roster, its
// aggregate numbers and its share tools exactly as they are.
//
// TERM-SCOPED, ALWAYS. Every count, every assignment and every sentence names the term and the
// date access ends. "14 of 20 assigned" is meaningless on its own — the same chapter can hold a
// finished Fall pool and a live Spring one at once, so the pool being managed is always the
// active unexpired one, and finished terms render as history.
//
// PRIVACY. Execs see roster membership and seat assignment. There is no per-member watch history
// anywhere in this component, and none is fetched — joining is not the same thing as being
// watched, and a member who feels monitored stops using the link.
import { useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { money } from "@/lib/terms";
import { setSeatAssignment, type ChapterSeatState, type SeatPoolRow } from "@/lib/chapter-seats.functions";

export function SeatDashboard({ state, accessToken, onBuyMore, onReload }: {
  state: ChapterSeatState;
  accessToken: string;
  /** Over-cap upsell and the next-term prompt both come back here. */
  onBuyMore: () => void;
  onReload: () => void;
}) {
  const current = state.pools.find((p) => p.id === state.currentPoolId) ?? null;
  const past = state.pools.filter((p) => p.id !== state.currentPoolId);

  return (
    <div className="grid gap-6" style={{ fontFamily: BRAND_SANS }}>
      {current ? <ActivePool pool={current} state={state} accessToken={accessToken} onBuyMore={onBuyMore} onReload={onReload} /> : null}
      {past.length > 0 && <PastTerms pools={past} onBuyMore={onBuyMore} />}
      {state.pools.length > 0 && <PaymentHistory pools={state.pools} />}
    </div>
  );
}

function ActivePool({ pool, state, accessToken, onBuyMore, onReload }: {
  pool: SeatPoolRow; state: ChapterSeatState; accessToken: string; onBuyMore: () => void; onReload: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async (memberId: string, assign: boolean) => {
    setBusy(memberId); setErr(null);
    try {
      const r = await setSeatAssignment({ data: { accessToken, poolId: pool.id, memberId, assign } });
      if (!r.ok) setErr(r.error ?? "That didn't work.");
      else onReload();
    } catch (e) { setErr(e instanceof Error ? e.message : "That didn't work."); }
    finally { setBusy(null); }
  };

  // OVER CAP. More members joined than the chapter covered — stated as the fact it is, with the
  // way to fix it, for the SAME term.
  const uncovered = Math.max(0, state.membersJoined - pool.seatsTotal);

  return (
    <section className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[20px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{pool.termLabel}</h2>
        <p className="text-[13.5px]" style={{ color: "var(--text-secondary)" }}>Access ends {pool.expiresLabel}</p>
      </div>

      <p className="mt-1 text-[15px] font-bold" style={{ color: "var(--brand-cream)" }}>
        {pool.assigned} of {pool.seatsTotal} assigned
        <span className="ml-2 text-[13.5px] font-semibold" style={{ color: pool.available > 0 ? "var(--accent-info-text)" : "var(--text-secondary)" }}>
          {pool.available > 0 ? `${pool.available} left` : "all assigned"}
        </span>
      </p>

      {uncovered > 0 && (
        <div className="mt-3 rounded-xl px-4 py-3" style={{ background: "rgba(252,163,17,0.10)", border: "1px solid rgba(252,163,17,0.40)" }}>
          <p className="text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>
            {state.membersJoined} members joined · {pool.seatsTotal} seats — cover the other {uncovered}?
          </p>
          <button type="button" onClick={onBuyMore} className="mt-2 rounded-xl px-4 text-[14px] font-black" style={{ minHeight: 44, background: "var(--accent)", color: "#0B1220" }}>
            Add seats for {pool.termLabel} →
          </button>
        </div>
      )}

      {err && <p className="mt-3 text-[13.5px]" style={{ color: "#F3C6CC" }}>{err}</p>}

      {/* ROSTER. Members who already joined are here for one tap — the exec never re-enters names
          or emails they have already given us. */}
      <div className="mt-4 grid gap-1.5">
        {state.members.map((m) => (
          <div key={m.memberId} className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5" style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-subtle)" }}>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>{m.name || m.email || "Member"}</p>
              {m.seated && <p className="text-[12.5px]" style={{ color: "var(--accent-info-text)" }}>Seated · access through {pool.expiresLabel}</p>}
            </div>
            <button
              type="button"
              disabled={busy === m.memberId || (!m.seated && pool.available <= 0)}
              title={!m.seated && pool.available <= 0 ? "No seats left" : m.seated ? "Take this seat back" : "Give this member a seat"}
              onClick={() => void toggle(m.memberId, !m.seated)}
              className="shrink-0 rounded-lg px-3 text-[13px] font-black disabled:opacity-40"
              style={{
                minHeight: 40,
                background: m.seated ? "var(--bg-surface)" : "var(--accent)",
                border: m.seated ? "1px solid var(--border-default)" : "none",
                color: m.seated ? "var(--brand-cream)" : "#0B1220",
              }}
            >
              {busy === m.memberId ? "…" : m.seated ? "Unassign" : "Assign"}
            </button>
          </div>
        ))}
        {!state.members.length && (
          <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>Nobody has joined yet — share the chapter link and they&apos;ll appear here.</p>
        )}
      </div>
    </section>
  );
}

/** FINISHED TERMS stay on the page: the record of what the chapter provided, and the prompt for
 *  the next term. Nothing is auto-renewed and nothing is auto-charged. */
function PastTerms({ pools, onBuyMore }: { pools: SeatPoolRow[]; onBuyMore: () => void }) {
  return (
    <section className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
      <h2 className="text-[18px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Earlier terms</h2>
      <div className="mt-3 grid gap-2">
        {pools.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-3" style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-subtle)" }}>
            <div>
              <p className="text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>
                {p.termLabel} {p.expired ? "complete" : p.status === "active" ? "· active" : `· ${p.status.replace("_", " ")}`}
              </p>
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                {p.assigned} member{p.assigned === 1 ? "" : "s"} covered · {p.seatsTotal} seats · access ended {p.expiresLabel}
              </p>
            </div>
            {p.expired && (
              <button type="button" onClick={onBuyMore} className="rounded-lg px-3 text-[13px] font-black" style={{ minHeight: 40, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>
                Set up next term →
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Invoices and payments, as Stripe reports them. */
function PaymentHistory({ pools }: { pools: SeatPoolRow[] }) {
  return (
    <section className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
      <h2 className="text-[18px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Invoices &amp; payments</h2>
      <div className="mt-3 grid gap-2">
        {pools.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-[13.5px]" style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-subtle)" }}>
            <span style={{ color: "var(--brand-cream)" }}>
              {p.termLabel} · {p.seatsTotal} seats · {money(p.amountCents)}
              {p.isTest && <span className="ml-2 text-[11px] font-black" style={{ color: "var(--accent-info-text)" }}>TEST</span>}
            </span>
            <span className="flex items-center gap-3" style={{ color: "var(--text-secondary)" }}>
              <span>{p.paymentMethod ?? "—"}</span>
              <span>{p.invoiceStatus ?? p.status.replace("_", " ")}</span>
              {p.invoiceNumber && <span>{p.invoiceNumber}</span>}
              {p.invoiceUrl && (
                <a href={p.invoiceUrl} target="_blank" rel="noreferrer" className="font-bold underline underline-offset-4" style={{ color: "var(--brand-cream)" }}>View →</a>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** THE COURTESY CREDIT — shown to a SEATED member, and only while their term entitlement is live.
 *  Rendered on the student side (player/chapter page), never on the exec dashboard. */
export function CourtesyCredit({ chapterName, expiresLabel }: { chapterName: string; expiresLabel: string }) {
  return (
    <p className="text-[13.5px] font-semibold" style={{ color: "var(--accent-info-text)", fontFamily: BRAND_SANS }}>
      Exams 2, 3 and the Final — courtesy of {chapterName}
      <span className="ml-1.5 font-normal" style={{ color: "var(--text-secondary)" }}>through {expiresLabel}</span>
    </p>
  );
}
