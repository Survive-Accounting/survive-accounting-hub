// /rep/dashboard?k=<token> — a rep's home base. The whole design serves one goal: make them share
// widely and see the results, broken down by org on their campus. So the share tools are the first
// thing and the biggest thing; the numbers sit right under them; payout + Venmo are one glance away.
//
// TOKEN, NOT LOGIN. The ?k= token from signup is the key — reps aren't admins and we don't want a
// sign-in wall between them and sharing. Bookmark the page and you're in.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { formatCents } from "@/lib/referral-shared";
import { createRepLink, getRepDashboard, simulateRepEvent, updateRepVenmo } from "@/lib/rep-portal.functions";
import type { RepDashboard } from "@/lib/rep-portal";

export const Route = createFileRoute("/rep_/dashboard")({
  validateSearch: (s: Record<string, unknown>): { k?: string; welcome?: number } => ({
    k: typeof s.k === "string" ? s.k : undefined,
    welcome: s.welcome ? 1 : undefined,
  }),
  head: () => ({ meta: [{ title: "Your rep dashboard — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: RepDashboardPage,
});

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((key: string, text: string) => {
    void (async () => { try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600); } catch { /* blocked */ } })();
  }, []);
  return { copied, copy };
}

function RepDashboardPage() {
  useNavyDocument();
  const { k, welcome } = Route.useSearch();
  const [d, setD] = useState<RepDashboard | null | "loading" | "error">("loading");
  const { copied, copy } = useCopy();

  const load = useCallback(() => {
    if (!k) { setD("error"); return; }
    void getRepDashboard({ data: { token: k, nowMs: Date.now() } })
      .then((r) => setD(r.ok ? r : "error")).catch(() => setD("error"));
  }, [k]);
  useEffect(load, [load]);

  const wrap: React.CSSProperties = { ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" };

  return (
    <div style={wrap}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>
      <SiteHeader />
      <main style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto", padding: "0 20px", width: "100%" }} className="pb-16">
        {d === "loading" && <p className="pt-16 text-center text-[14px]" style={{ color: "var(--text-muted)", fontFamily: BRAND_SANS }}>Loading your dashboard…</p>}
        {d === "error" && (
          <div className="mx-auto max-w-sm pt-16 text-center" style={{ fontFamily: BRAND_SANS }}>
            <h1 className="text-[20px] font-black">That dashboard link isn't valid.</h1>
            <p className="mt-2 text-[14px]" style={{ color: "var(--text-muted)" }}>Check the link you were sent, or sign up again.</p>
            <a href="/rep/join" className="mt-4 inline-flex items-center rounded-xl px-4 text-[14px] font-black" style={{ minHeight: 46, background: "var(--accent)", color: "#0B1220" }}>Become a rep →</a>
          </div>
        )}
        {d && typeof d === "object" && <Dashboard d={d} token={k!} welcome={!!welcome} copied={copied} copy={copy} reload={load} />}
      </main>
      <Footer />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
      <p className="text-[22px] font-black leading-none" style={{ color: accent ? "var(--accent)" : "var(--brand-cream)", fontFamily: BRAND_DISPLAY }}>{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>{label}</p>
    </div>
  );
}

function Dashboard({ d, token, welcome, copied, copy, reload }: { d: RepDashboard; token: string; welcome: boolean; copied: string | null; copy: (k: string, t: string) => void; reload: () => void }) {
  const main = d.links[0];
  const shareMsg = main ? `I'm using Survive Accounting to survive ${d.campusName ?? "our"} accounting exams — real exam-style practice, worked start to finish. Check it out: ${main.shortUrl}` : "";
  const earnedTotal = d.earnings.pendingCents + d.earnings.approvedCents + d.earnings.paidCents;

  return (
    <div style={{ fontFamily: BRAND_SANS }}>
      {welcome && (
        <div className="mt-6 rounded-xl px-4 py-3" style={{ background: "rgba(52,168,83,0.14)", border: "1px solid rgba(52,168,83,0.4)" }}>
          <p className="text-[14px] font-black" style={{ color: "#8BE28B" }}>You're in ⚡ Bookmark this page — it's your dashboard.</p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Your link and results live here. Start sharing below.</p>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-2 pt-6">
        <div>
          <h1 className="text-[24px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Hey {d.name.split(" ")[0]} — share away.</h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>{d.campusName ? `${d.campusName} · ` : ""}You earn {d.ruleLabel} of every exam prep bought through your links.</p>
        </div>
        {d.isTest && <span className="rounded-full px-2.5 py-1 text-[11px] font-black uppercase" style={{ background: "rgba(122,46,18,0.22)", color: "#FFC9A3", letterSpacing: "0.08em" }}>Test rep</span>}
      </div>

      {/* SHARE — the biggest, first thing. */}
      {main && (
        <section className="mt-4 rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--accent)" }}>
          <p className="text-[11px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.1em" }}>Your link — share it everywhere</p>
          <p className="mt-1 break-all text-[17px] font-black" style={{ color: "var(--brand-cream)" }}>{main.shortUrl.replace("https://", "")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => copy("main", main.shortUrl)} className="rounded-lg px-4 text-[14px] font-black" style={{ minHeight: 46, background: "var(--accent)", color: "#0B1220" }}>{copied === "main" ? "Copied ⚡" : "Copy link"}</button>
            <button type="button" onClick={() => copy("msg", shareMsg)} className="rounded-lg px-4 text-[14px] font-black" style={{ minHeight: 46, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>{copied === "msg" ? "Copied ⚡" : "Copy a ready message"}</button>
            <a href={`sms:?&body=${encodeURIComponent(shareMsg)}`} className="inline-flex items-center rounded-lg px-4 text-[14px] font-black" style={{ minHeight: 46, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Text it</a>
          </div>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>Drop it in your GroupMe, class group chats, and stories. The more you share, the more you earn.</p>
        </section>
      )}

      {/* STATS */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Clicks" value={String(d.totals.clicks)} />
        <Stat label="Signups" value={String(d.totals.signups)} />
        <Stat label="Purchases" value={String(d.totals.purchases)} />
        <Stat label="Earned" value={formatCents(earnedTotal)} accent />
      </div>

      {/* PAYOUT + VENMO */}
      <PayoutCard d={d} token={token} reload={reload} />

      {/* ORG BREAKDOWN */}
      <section className="mt-6">
        <h2 className="text-[16px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Your links, by page</h2>
        <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Make a link for each chapter you promote — you'll see exactly which ones are working.</p>
        <div className="mt-3 grid gap-2">
          {d.links.map((l) => (
            <div key={l.code} className="rounded-xl px-3.5 py-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>{l.label || l.destinationLabel}</p>
                  <p className="truncate text-[12px]" style={{ color: "var(--text-muted)" }}>{l.destinationLabel} · {l.shortUrl.replace("https://", "")}</p>
                </div>
                <button type="button" onClick={() => copy(l.code, l.shortUrl)} className="shrink-0 rounded-lg px-3 text-[12.5px] font-black" style={{ minHeight: 40, background: "rgba(252,163,17,0.14)", color: "var(--accent)" }}>{copied === l.code ? "Copied ⚡" : "Copy"}</button>
              </div>
              <div className="mt-2 flex gap-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
                <span><b style={{ color: "var(--brand-cream)" }}>{l.clicks}</b> clicks</span>
                <span><b style={{ color: "var(--brand-cream)" }}>{l.signups}</b> signups</span>
                <span><b style={{ color: "var(--brand-cream)" }}>{l.purchases}</b> purchases</span>
                <span><b style={{ color: "var(--accent)" }}>{formatCents(l.earnedCents)}</b> earned</span>
              </div>
            </div>
          ))}
        </div>
        <AddLink token={token} reload={reload} />
      </section>

      {d.isTest && <TestTools d={d} token={token} reload={reload} />}
    </div>
  );
}

function PayoutCard({ d, token, reload }: { d: RepDashboard; token: string; reload: () => void }) {
  const [venmo, setVenmo] = useState(d.venmo ?? "");
  const [saved, setSaved] = useState<"idle" | "saving" | "done">("idle");
  const save = () => { setSaved("saving"); void updateRepVenmo({ data: { token, venmo } }).then(() => { setSaved("done"); reload(); window.setTimeout(() => setSaved("idle"), 1500); }).catch(() => setSaved("idle")); };
  return (
    <section className="mt-4 rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase" style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>Next payout</p>
          <p className="text-[20px] font-black" style={{ color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY }}>{d.payout.nextLabel} · {formatCents(d.payout.dueCents)} due</p>
        </div>
        <div className="flex gap-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
          <span>Pending <b style={{ color: "var(--brand-cream)" }}>{formatCents(d.earnings.pendingCents)}</b></span>
          <span>Paid <b style={{ color: "var(--brand-cream)" }}>{formatCents(d.earnings.paidCents)}</b></span>
        </div>
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>Payouts go out by Venmo on the 1st of October, November, December and January. Purchases are confirmed before payout.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="flex-1" style={{ minWidth: 200 }}>
          <label className="mb-1 block text-[11px] font-bold uppercase" style={{ color: "var(--text-secondary, #AAB4C8)", letterSpacing: "0.06em" }}>Venmo — where you get paid</label>
          <input value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="@your-venmo" className="sa-field w-full" style={{ minHeight: 44, borderRadius: 10, padding: "0 12px", background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)", color: "var(--brand-cream)", fontSize: 16, outline: "none" }} />
        </div>
        <button type="button" onClick={save} className="rounded-lg px-4 text-[13px] font-black" style={{ minHeight: 44, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>{saved === "done" ? "Saved ⚡" : saved === "saving" ? "Saving…" : "Save Venmo"}</button>
      </div>
    </section>
  );
}

function AddLink({ token, reload }: { token: string; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const add = () => {
    if (!dest.trim() || busy) return;
    setBusy(true); setErr(null);
    void createRepLink({ data: { token, label: label.trim() || null, destinationUrl: dest.trim() } })
      .then((r) => { if (r.ok) { setOpen(false); setLabel(""); setDest(""); reload(); } else setErr(r.error ?? "Couldn't add that link."); })
      .catch(() => setErr("Couldn't reach the server."))
      .finally(() => setBusy(false));
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[13px] font-bold underline underline-offset-4" style={{ color: "var(--accent)", minHeight: 40 }}>+ Add a link for a chapter</button>;
  return (
    <div className="mt-3 rounded-xl p-3.5" style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-default)" }}>
      <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Paste a Survive page to track — a chapter page like <span style={{ color: "var(--brand-cream)" }}>/go/your-school/their-chapter</span>, or any campus page.</p>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Kappa Alpha Theta)" className="sa-field mt-2 w-full" style={{ minHeight: 42, borderRadius: 10, padding: "0 12px", background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)", color: "var(--brand-cream)", fontSize: 16, outline: "none" }} />
      <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="/go/your-school/their-chapter" className="sa-field mt-2 w-full" style={{ minHeight: 42, borderRadius: 10, padding: "0 12px", background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)", color: "var(--brand-cream)", fontSize: 16, outline: "none" }} />
      {err && <p className="mt-2 text-[12px]" style={{ color: "#F3C6CC" }}>{err}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={add} disabled={busy} className="rounded-lg px-3 text-[13px] font-black disabled:opacity-40" style={{ minHeight: 40, background: "var(--accent)", color: "#0B1220" }}>{busy ? "…" : "Add link"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 text-[13px] font-bold" style={{ minHeight: 40, background: "transparent", color: "var(--text-muted)" }}>Cancel</button>
      </div>
    </div>
  );
}

function TestTools({ d, token, reload }: { d: RepDashboard; token: string; reload: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const code = d.links[0]?.code;
  const sim = (kind: "click" | "signup" | "purchase") => {
    if (!code) return;
    setBusy(kind); setMsg(null);
    void simulateRepEvent({ data: { token, code, kind, amountCents: kind === "purchase" ? 5000 : undefined } })
      .then((r) => { setMsg(r.ok ? `Simulated a ${kind}.` : (r.error ?? "Failed.")); reload(); })
      .catch(() => setMsg("Couldn't reach the server."))
      .finally(() => setBusy(null));
  };
  return (
    <section className="mt-6 rounded-2xl px-4 py-4" style={{ background: "rgba(122,46,18,0.14)", border: "1px solid #C2571F" }}>
      <p className="text-[11px] font-black uppercase" style={{ color: "#FFC9A3", letterSpacing: "0.1em" }}>Test tools</p>
      <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Simulate activity on your main link to watch the numbers move. These are is_test — never counted for real.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(["click", "signup", "purchase"] as const).map((kind) => (
          <button key={kind} type="button" disabled={busy !== null || !code} onClick={() => sim(kind)} className="rounded-lg px-3 text-[13px] font-black capitalize disabled:opacity-40" style={{ minHeight: 40, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>
            {busy === kind ? "…" : `Simulate ${kind}`}
          </button>
        ))}
      </div>
      {msg && <p className="mt-2 text-[12.5px]" style={{ color: "#FFC9A3" }}>{msg}</p>}
    </section>
  );
}
