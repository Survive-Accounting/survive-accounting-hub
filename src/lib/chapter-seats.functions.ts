// TERM-SCOPED CHAPTER SEATS — pools, assignment, activation.
//
// THE MODEL. A chapter does not have "seats"; it has a SEAT POOL PER TERM:
//
//     Phi Delt → Fall 2026 → 20 purchased → 14 assigned → 6 available → expires Dec 31 2026
//
// Buying again for the same term adds to that pool. Buying for the next term creates a new one.
// Nothing rolls over: when a term ends, its entitlements lapse on their own (entitlements carries
// expires_at and the resolver already skips expired rows — see entitlements.functions.ts), and
// the pool and its assignments stay as history for the chapter's semester summary.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO YET: take money. Stripe Checkout, Stripe Invoices and
// their webhooks are gated on Test Mode, which does not exist in this repo yet — so a pool can be
// CREATED here (pending / awaiting_check) and ACTIVATED by an admin, and the card/invoice paths
// are stubs that refuse rather than half-charge. See PAYMENTS_ENABLED below.
//
// RELATIONSHIP TO greek-seats.functions.ts. That file's timeless seats_total is now legacy and is
// left untouched; this is the path new purchases take. The seat → entitlement grant is the same
// shape it uses (scope 'course', source 'greek_seat', greek_chapter_id set so a chapter can only
// ever revoke what it granted) with one addition: expires_at, which is what makes a term end.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { makeTerm, termFromId, termId, priceCentsFor, PRESALE_DISCLOSURE, SEAT_MINIMUM, money, type Term } from "@/lib/terms";
import { stripeCall, stripeReady } from "@/lib/stripe.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same shape the other greek-* server modules use
type DB = { from: (t: string) => any };
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

const ADMIN_EMAILS = ["lee@surviveaccounting.com", "king@surviveaccounting.com"];

/** PAYMENTS FOLLOW THE KEYS, AND THE KEYS ARE TEST-ONLY.
 *
 *  stripe.server refuses anything that is not sk_test_/pk_test_, so this is true by construction:
 *  a card or invoice path can only ever run against Stripe test mode, and if no test key is
 *  present the paths stay off rather than reaching for a live one. That is also the property the
 *  eventual Test Mode work needs — when it lands it takes over WHICH keys are handed back here,
 *  and nothing in this file changes.
 *
 *  Every record this creates carries is_test so the future purge can find it and so no test
 *  purchase can ever count toward real revenue, rosters or council metrics. */
export const paymentsEnabled = () => stripeReady();
/** @deprecated read paymentsEnabled() — kept so callers compiled against the constant still work. */
export const PAYMENTS_ENABLED = false;

async function emailFromToken(db: DB, accessToken: string): Promise<string | null> {
  try {
    const { data } = await (db as unknown as { auth: { getUser: (t: string) => Promise<{ data: { user: { email?: string | null } | null } }> } }).auth.getUser(accessToken);
    return (data?.user?.email ?? "").trim().toLowerCase() || null;
  } catch { return null; }
}

/** The exec who owns this chapter, or an admin. Same rule as greek-seats.chapterForActor. */
async function actorFor(db: DB, accessToken: string, chapterId: string) {
  const email = await emailFromToken(db, accessToken);
  if (!email) return null;
  const { data: ch } = await db.from("greek_chapters").select("*").eq("id", chapterId).maybeSingle();
  if (!ch) return null;
  if (ADMIN_EMAILS.includes(email)) return { ch, email, role: "admin" as const };
  if ((ch.admin_email ?? "").trim().toLowerCase() === email) return { ch, email, role: "owner" as const };
  return null;
}

/** The course a seat unlocks. Copied intent from greek-seats: NAMED by slug, never inferred, and
 *  null (not a fallback) when missing — a seat that cannot name its course must fail at the point
 *  of grant rather than unlock the wrong thing. */
const SEAT_COURSE_SLUG = "intro-accounting-1";
async function seatCourseId(db: DB): Promise<string | null> {
  const { data } = await db.from("courses").select("id,slug").eq("slug", SEAT_COURSE_SLUG).maybeSingle();
  return (data?.id as string) ?? null;
}

// ── shapes ─────────────────────────────────────────────────────────────────────────────────────
export type SeatPoolRow = {
  id: string;
  termId: string;
  termLabel: string;
  expiresAt: string;
  expiresLabel: string;
  expired: boolean;
  seatsTotal: number;
  assigned: number;
  available: number;
  status: string;
  paymentMethod: string | null;
  amountCents: number;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
  invoiceStatus: string | null;
  activatedAt: string | null;
  isTest: boolean;
};

export type SeatMemberRow = {
  memberId: string;
  name: string | null;
  email: string | null;
  joinedAt: string | null;
  /** Holds a live seat in the pool being displayed. */
  seated: boolean;
};

export type ChapterSeatState = {
  chapterId: string;
  chapterName: string;
  /** Every pool, newest term first — the paid history the dashboard shows. */
  pools: SeatPoolRow[];
  /** The pool the dashboard manages: the active, unexpired one if there is one. */
  currentPoolId: string | null;
  members: SeatMemberRow[];
  membersJoined: number;
};

const poolRow = (p: Record<string, unknown>, assigned: number): SeatPoolRow => {
  const t = termFromId(p.term_id as string);
  const expiresAt = (p.expires_at as string) ?? t?.expiresAt ?? "";
  return {
    id: p.id as string,
    termId: p.term_id as string,
    termLabel: t?.label ?? (p.term_id as string),
    expiresAt,
    expiresLabel: t?.expiresLabel ?? "",
    expired: !!expiresAt && Date.parse(expiresAt) < Date.now(),
    seatsTotal: (p.seats_total as number) ?? 0,
    assigned,
    available: Math.max(0, ((p.seats_total as number) ?? 0) - assigned),
    status: (p.status as string) ?? "pending",
    paymentMethod: (p.payment_method as string) ?? null,
    amountCents: (p.amount_cents as number) ?? 0,
    invoiceNumber: (p.invoice_number as string) ?? null,
    invoiceUrl: (p.invoice_url as string) ?? null,
    invoiceStatus: (p.invoice_status as string) ?? null,
    activatedAt: (p.activated_at as string) ?? null,
    isTest: !!p.is_test,
  };
};

// ── read ───────────────────────────────────────────────────────────────────────────────────────
/** Everything the dashboard needs: the chapter's pools, its roster, and who currently holds a
 *  seat in the live pool. Roster membership and seat assignment only — never watch history. */
export const getChapterSeatState = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    chapterId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }): Promise<ChapterSeatState | null> => {
    const db = await admin();
    const actor = await actorFor(db, data.accessToken, data.chapterId);
    if (!actor) return null;

    const { data: poolRows } = await db.from("chapter_seat_pools")
      .select("*").eq("chapter_id", data.chapterId).order("expires_at", { ascending: false }).limit(50);
    const pools = (poolRows ?? []) as Array<Record<string, unknown>>;

    const { data: asgRows } = pools.length
      ? await db.from("chapter_seat_assignments").select("id,pool_id,member_id,released_at")
          .in("pool_id", pools.map((p) => p.id as string)).is("released_at", null).limit(2000)
      : { data: [] };
    const live = (asgRows ?? []) as Array<{ pool_id: string; member_id: string | null }>;
    const countByPool = new Map<string, number>();
    for (const a of live) countByPool.set(a.pool_id, (countByPool.get(a.pool_id) ?? 0) + 1);

    const built = pools.map((p) => poolRow(p, countByPool.get(p.id as string) ?? 0));
    // The pool being managed: active and unexpired. An expired term is history, not a control.
    const current = built.find((p) => p.status === "active" && !p.expired) ?? null;
    const seatedIds = new Set(live.filter((a) => a.pool_id === current?.id).map((a) => a.member_id));

    const { data: memberRows } = await db.from("greek_chapter_members")
      .select("id,name,email,created_at").eq("chapter_id", data.chapterId).order("created_at", { ascending: true }).limit(1000);
    const members = ((memberRows ?? []) as Array<{ id: string; name: string | null; email: string | null; created_at: string | null }>)
      .map((m) => ({ memberId: m.id, name: m.name, email: m.email, joinedAt: m.created_at, seated: seatedIds.has(m.id) }));

    return {
      chapterId: data.chapterId,
      chapterName: (actor.ch.chapter_name as string) ?? (actor.ch.name as string) ?? "your chapter",
      pools: built,
      currentPoolId: current?.id ?? null,
      members,
      membersJoined: members.length,
    };
  });

// ── purchase intent ────────────────────────────────────────────────────────────────────────────
export type StartPurchaseResult =
  | { ok: true; poolId: string; status: string; checkoutUrl?: string; invoiceUrl?: string }
  | { ok: false; error: string };

/** Create (or top up) the pool for a term and start the chosen payment path.
 *
 *  CHECK works today: the pool is created `awaiting_check` and Lee activates it when the cheque
 *  clears. CARD and INVOICE refuse while PAYMENTS_ENABLED is false — see the note at the top. */
export const startSeatPurchase = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    chapterId: z.string().uuid(),
    termId: z.string().trim().min(4).max(20),
    seats: z.number().int().min(1).max(500),
    method: z.enum(["card", "invoice", "check"]),
    treasurerName: z.string().trim().max(120).optional(),
    treasurerEmail: z.string().trim().email().max(200).optional(),
    isTest: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<StartPurchaseResult> => {
    const db = await admin();
    const actor = await actorFor(db, data.accessToken, data.chapterId);
    if (!actor) return { ok: false, error: "Not authorised." };

    const term: Term | null = termFromId(data.termId);
    if (!term) return { ok: false, error: "That term isn't one we sell." };
    if (Date.parse(term.expiresAt) < Date.now()) return { ok: false, error: `${term.label} has already ended.` };
    if (data.seats < SEAT_MINIMUM) return { ok: false, error: `Seats start at ${SEAT_MINIMUM}.` };

    // FAIL CLOSED. No Stripe call is attempted, no pool is left half-created, and the exec is told
    // the truth rather than shown a broken checkout.
    if ((data.method === "card" || data.method === "invoice") && !paymentsEnabled()) {
      return { ok: false, error: "Card and invoice checkout aren't switched on yet — text Lee and he'll invoice you directly." };
    }

    const amount = priceCentsFor(data.seats);
    const status = data.method === "check" ? "awaiting_check" : "pending";

    // Top up an existing pool for this term rather than opening a second one: "14 of 20 assigned"
    // has to stay one true sentence per term.
    const { data: existing } = await db.from("chapter_seat_pools")
      .select("id,seats_total,amount_cents,status").eq("chapter_id", data.chapterId).eq("term_id", data.termId).maybeSingle();

    if (existing?.id) {
      const { error } = await db.from("chapter_seat_pools").update({
        seats_total: ((existing.seats_total as number) ?? 0) + data.seats,
        amount_cents: ((existing.amount_cents as number) ?? 0) + amount,
        // An already-active pool stays active — this is extra seats on a paid term.
        status: existing.status === "active" ? "active" : status,
        payment_method: data.method,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      if (error) return { ok: false, error: error.message };
      const topUp = await attachPayment(db, {
        poolId: existing.id as string, chapterId: data.chapterId, chapterName: (actor.ch.chapter_name as string) ?? "Chapter",
        term, seats: data.seats, amount, method: data.method,
        treasurerName: data.treasurerName, treasurerEmail: data.treasurerEmail, isTest: !!data.isTest,
      });
      if (!topUp.ok) return topUp;
      return { ok: true, poolId: existing.id as string, status: (existing.status as string) === "active" ? "active" : status, ...topUp.urls };
    }

    const { data: created, error } = await db.from("chapter_seat_pools").insert({
      chapter_id: data.chapterId,
      term_id: termId(term),
      seats_total: data.seats,
      starts_at: term.startsAt,
      expires_at: term.expiresAt,
      amount_cents: amount,
      payment_method: data.method,
      status,
      note: data.treasurerName || data.treasurerEmail ? `Treasurer: ${data.treasurerName ?? ""} ${data.treasurerEmail ?? ""}`.trim() : null,
      is_test: !!data.isTest,
      created_by: actor.email,
    }).select("id").maybeSingle();
    if (error || !created?.id) return { ok: false, error: error?.message ?? "Couldn't start that purchase." };

    const paid = await attachPayment(db, {
      poolId: created.id as string, chapterId: data.chapterId, chapterName: (actor.ch.chapter_name as string) ?? "Chapter",
      term, seats: data.seats, amount, method: data.method,
      treasurerName: data.treasurerName, treasurerEmail: data.treasurerEmail, isTest: !!data.isTest,
    });
    if (!paid.ok) return paid;

    return { ok: true, poolId: created.id as string, status, ...paid.urls };
  });

/** THE STRIPE HALF of a purchase, kept out of the pool bookkeeping above so a Stripe failure can
 *  never leave a pool in a state that claims to be paid.
 *
 *    card    → a Checkout Session; the webhook activates the pool on completion.
 *    invoice → a real Stripe Invoice, finalised and sent to the treasurer; the webhook activates
 *              the pool when it is paid. No manual step for a paid Stripe invoice.
 *    check   → the SAME invoice object, finalised but NOT sent, so the treasurer still gets a real
 *              invoice number, amount and reference to write on the cheque. Activation is Lee's
 *              explicit mark-paid.
 *
 *  Everything carries the term, the seat count and the expiry in its description and metadata, so
 *  a chapter reading its invoice sees exactly what the dashboard says. The presale disclosure
 *  rides along in the invoice footer — it must appear anywhere money is asked for. */
async function attachPayment(db: DB, o: {
  poolId: string; chapterId: string; chapterName: string;
  term: Term; seats: number; amount: number;
  method: "card" | "invoice" | "check";
  treasurerName?: string; treasurerEmail?: string; isTest: boolean;
}): Promise<{ ok: true; urls: { checkoutUrl?: string; invoiceUrl?: string } } | { ok: false; error: string }> {
  const label = `${o.seats} seat${o.seats === 1 ? "" : "s"} · ${o.term.label} — access through ${o.term.expiresLabel}`;
  const meta = {
    pool_id: o.poolId, chapter_id: o.chapterId, term_id: termId(o.term),
    seats: String(o.seats), is_test: String(o.isTest), kind: "chapter_seats",
  };

  if (o.method === "card") {
    const origin = process.env.SITE_ORIGIN ?? "https://surviveaccounting.com";
    const r = await stripeCall<{ id: string; url: string }>("checkout/sessions", {
      mode: "payment",
      success_url: `${origin}/chapters/dashboard?seats=paid&pool=${o.poolId}`,
      cancel_url: `${origin}/chapters/dashboard?seats=cancelled`,
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": o.amount,
      "line_items[0][price_data][product_data][name]": `${o.chapterName} — ${label}`,
      "line_items[0][price_data][product_data][description]": PRESALE_DISCLOSURE,
      metadata: meta,
      "payment_intent_data[metadata]": meta,
      idempotencyKey: `pool-${o.poolId}-card-${o.seats}`,
    });
    if (!r.ok) return { ok: false, error: r.error };
    await db.from("chapter_seat_pools").update({ stripe_checkout_id: r.data.id, updated_at: new Date().toISOString() }).eq("id", o.poolId);
    return { ok: true, urls: { checkoutUrl: r.data.url } };
  }

  // invoice + check share the invoice object; only "send" differs.
  const email = o.treasurerEmail?.trim();
  const cust = await stripeCall<{ id: string }>("customers", {
    ...(email ? { email } : {}),
    name: o.treasurerName?.trim() || o.chapterName,
    description: `${o.chapterName} — chapter seats`,
    metadata: meta,
    idempotencyKey: `pool-${o.poolId}-customer`,
  });
  if (!cust.ok) return { ok: false, error: cust.error };

  const inv = await stripeCall<{ id: string }>("invoices", {
    customer: cust.data.id,
    collection_method: "send_invoice",
    days_until_due: 30,
    description: `${o.chapterName} — ${label}`,
    footer: `${PRESALE_DISCLOSURE}${o.method === "check" ? " · Pay by check: Earned Wisdom LLC. Seats activate when the check clears." : ""}`,
    metadata: { ...meta, method: o.method },
    idempotencyKey: `pool-${o.poolId}-invoice`,
  });
  if (!inv.ok) return { ok: false, error: inv.error };

  const item = await stripeCall("invoiceitems", {
    customer: cust.data.id, invoice: inv.data.id, amount: o.amount, currency: "usd",
    description: `${label} (${money(o.amount)})`,
    metadata: meta,
    idempotencyKey: `pool-${o.poolId}-item-${o.seats}`,
  });
  if (!item.ok) return { ok: false, error: item.error };

  // Finalise so the invoice gets a real number and a hosted URL — the reference a treasurer needs
  // whether they pay it online or write a cheque against it.
  const fin = await stripeCall<{ id: string; number: string; hosted_invoice_url: string; invoice_pdf: string; status: string }>(
    `invoices/${inv.data.id}/finalize`, { auto_advance: o.method === "invoice" },
  );
  if (!fin.ok) return { ok: false, error: fin.error };

  if (o.method === "invoice" && email) {
    // Stripe emails it. In test mode Stripe does not deliver to real inboxes, which is exactly
    // the isolation the test lifecycle needs.
    const sent = await stripeCall(`invoices/${inv.data.id}/send`, {});
    if (!sent.ok) return { ok: false, error: sent.error };
  }

  await db.from("chapter_seat_pools").update({
    stripe_invoice_id: fin.data.id,
    invoice_number: fin.data.number ?? null,
    invoice_url: fin.data.hosted_invoice_url ?? null,
    invoice_status: o.method === "check" ? "awaiting_check" : (fin.data.status ?? "open"),
    updated_at: new Date().toISOString(),
  }).eq("id", o.poolId);

  return { ok: true, urls: { invoiceUrl: fin.data.hosted_invoice_url } };
}

/** Called by the Stripe webhook when a checkout completes or an invoice is paid. Activates the
 *  pool named in the event metadata — the only automatic activation path, and the reason a paid
 *  Stripe invoice needs no manual step. */
export async function activatePoolFromStripe(poolId: string, method: "card" | "invoice", invoiceStatus?: string): Promise<boolean> {
  try {
    const db = await admin();
    const { data: pool } = await db.from("chapter_seat_pools").select("id,status,expires_at").eq("id", poolId).maybeSingle();
    if (!pool?.id) return false;
    if (Date.parse(pool.expires_at as string) < Date.now()) return false;   // never activate a dead term
    await db.from("chapter_seat_pools").update({
      status: "active",
      activated_at: (pool.status as string) === "active" ? undefined : new Date().toISOString(),
      payment_method: method,
      ...(invoiceStatus ? { invoice_status: invoiceStatus } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", poolId);
    // Only on the transition into active — a repeated webhook must not re-alert.
    if ((pool.status as string) !== "active") void notifySeatActivation(db, poolId, method);
    return true;
  } catch { return false; }
}

/** ADMIN: mark a pool paid and activate it — the cheque cleared, or Lee is comping the term.
 *  This is the only activation path until the Stripe webhooks exist. */
export const activateSeatPool = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    poolId: z.string().uuid(),
    method: z.enum(["card", "invoice", "check", "comp"]).optional(),
    note: z.string().trim().max(300).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = await admin();
    const email = await emailFromToken(db, data.accessToken);
    if (!email || !ADMIN_EMAILS.includes(email)) return { ok: false, error: "Not authorised." };

    const { data: pool } = await db.from("chapter_seat_pools").select("id,status,expires_at").eq("id", data.poolId).maybeSingle();
    if (!pool?.id) return { ok: false, error: "No such seat pool." };
    if (Date.parse(pool.expires_at as string) < Date.now()) return { ok: false, error: "That term has already ended." };

    const { error } = await db.from("chapter_seat_pools").update({
      status: "active",
      activated_at: new Date().toISOString(),
      ...(data.method ? { payment_method: data.method } : {}),
      ...(data.note ? { note: data.note } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", data.poolId);
    if (error) return { ok: false, error: error.message };
    void notifySeatActivation(db, data.poolId, data.method ?? "check");
    return { ok: true };
  });

/** ACTIVATION NOTIFICATIONS — founder alert + exec confirmation, through the EXISTING comms
 *  layer, never a second notification path.
 *
 *  That layer already owns the rules this feature has to obey: it applies the [TEST] prefix when
 *  isTest is set, logs every send to comms_sends with is_test, rate-limits real founder alerts,
 *  and keeps test sends out of suppression and marketing caps. So a test purchase can never
 *  produce an unmarked production-style alert, and nothing here re-implements any of it.
 *
 *  Fire-and-forget: a notification failure must never leave a paid chapter without its seats.
 */
async function notifySeatActivation(db: DB, poolId: string, method: string): Promise<void> {
  try {
    const { data: pool } = await db.from("chapter_seat_pools").select("*").eq("id", poolId).maybeSingle();
    if (!pool?.id) return;
    const { data: ch } = await db.from("greek_chapters")
      .select("chapter_name,school_name,admin_email,admin_name_role,slug,campus_id").eq("id", pool.chapter_id).maybeSingle();
    const term = termFromId(pool.term_id as string);
    const seats = (pool.seats_total as number) ?? 0;
    const isTest = !!pool.is_test;

    // The course code from the ONE source, for the alert line only — never invented.
    let courseCode: string | null = null;
    try {
      if (ch?.campus_id) {
        const { data: camp } = await db.from("campuses").select("course_family_codes_json").eq("id", ch.campus_id).maybeSingle();
        const j = camp?.course_family_codes_json;
        const o = typeof j === "string" ? JSON.parse(j || "{}") : (j ?? {});
        courseCode = ((o?.intro_1 ?? "") as string).toString().trim() || null;
      }
    } catch { courseCode = null; }

    const methodLabel = method === "card" ? "Stripe card" : method === "invoice" ? "Stripe invoice paid" : method === "check" ? "check cleared" : method;
    // "Phi Delt · Ole Miss · Fall 2026 · 20 seats · $2,000 · Stripe invoice paid"
    const line = [ch?.chapter_name, ch?.school_name, term?.label, `${seats} seats`, money((pool.amount_cents as number) ?? 0), methodLabel]
      .filter(Boolean).join(" · ");

    const comms = await import("@/lib/comms/send.server");
    const ctx = {
      name: (ch?.admin_name_role as string) ?? null,
      email: (ch?.admin_email as string) ?? null,
      chapter: (ch?.chapter_name as string) ?? null,
      school: (ch?.school_name as string) ?? null,
      courseCode,
      term: term?.label ?? null,
      expiresLabel: term?.expiresLabel ?? null,
      seats,
      kind: "purchase" as const,
      note: line,
      adminLink: "https://surviveaccounting.com/chapters/dashboard",
      isTest,
    };

    await comms.founderAlert({ db, ctx, isTest }).catch(() => {});
    if (ch?.admin_email) {
      await comms.sendTemplateEmail({ db, key: "confirm_chapter_seats", ctx, to: ch.admin_email as string, isTest }).catch(() => {});
    }
  } catch { /* never block an activation on a notification */ }
}
// ── assignment ─────────────────────────────────────────────────────────────────────────────────
/** Assign / unassign / reassign a seat inside ONE term's pool.
 *
 *  The entitlement carries the term's expires_at, so access ends with the term without any job
 *  having to run: fetchMyUnlockedTopics already skips expired rows. Releasing a seat revokes only
 *  what this chapter granted (greek_chapter_id + source filter), never a student's own purchase. */
export const setSeatAssignment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    poolId: z.string().uuid(),
    memberId: z.string().uuid(),
    assign: z.boolean(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; assigned?: number; available?: number }> => {
    const db = await admin();
    const { data: pool } = await db.from("chapter_seat_pools").select("*").eq("id", data.poolId).maybeSingle();
    if (!pool?.id) return { ok: false, error: "No such seat pool." };
    const actor = await actorFor(db, data.accessToken, pool.chapter_id as string);
    if (!actor) return { ok: false, error: "Not authorised." };
    if (pool.status !== "active") return { ok: false, error: "Those seats aren't active yet." };
    if (Date.parse(pool.expires_at as string) < Date.now()) return { ok: false, error: "That term has ended." };

    const { data: member } = await db.from("greek_chapter_members")
      .select("id,user_id,email,chapter_id").eq("id", data.memberId).maybeSingle();
    if (!member || member.chapter_id !== pool.chapter_id) return { ok: false, error: "That member isn't in this chapter." };

    const counts = async () => {
      const { count } = await db.from("chapter_seat_assignments")
        .select("*", { count: "exact", head: true }).eq("pool_id", data.poolId).is("released_at", null);
      const assigned = count ?? 0;
      return { assigned, available: Math.max(0, ((pool.seats_total as number) ?? 0) - assigned) };
    };

    const { data: live } = await db.from("chapter_seat_assignments")
      .select("id,entitlement_id").eq("pool_id", data.poolId).eq("member_id", data.memberId).is("released_at", null).maybeSingle();

    if (data.assign) {
      if (live?.id) return { ok: true, ...(await counts()) };
      const c = await counts();
      if (c.available <= 0) return { ok: false, error: `No seats left — ${c.assigned} of ${pool.seats_total} are assigned.`, ...c };

      // The grant only exists once the member has an ACCOUNT; until then the assignment row is the
      // record and reconcileSeatGrants converts it on sign-in (same gap the legacy path has).
      let entitlementId: string | null = null;
      if (member.user_id) {
        const courseId = await seatCourseId(db);
        if (!courseId) return { ok: false, error: "Couldn't resolve which course a seat unlocks — tell Lee.", ...c };
        const { data: ent, error } = await db.from("entitlements").upsert({
          user_id: member.user_id, scope: "course", scope_id: courseId,
          source: "greek_seat", greek_chapter_id: pool.chapter_id,
          // THIS is the term ending. No cron, no sweep — the resolver skips expired rows.
          expires_at: pool.expires_at,
        }, { onConflict: "user_id,scope,scope_id" }).select("id").maybeSingle();
        if (error) return { ok: false, error: error.message, ...c };
        entitlementId = (ent?.id as string) ?? null;
      }

      const { error: insErr } = await db.from("chapter_seat_assignments").insert({
        pool_id: data.poolId, chapter_id: pool.chapter_id, member_id: data.memberId,
        user_id: member.user_id ?? null, member_email: member.email ?? null,
        entitlement_id: entitlementId, is_test: !!pool.is_test, assigned_by: actor.email,
      });
      if (insErr) return { ok: false, error: insErr.message, ...(await counts()) };
      return { ok: true, ...(await counts()) };
    }

    // RELEASE — the row survives (history for the semester summary); only the grant goes.
    if (live?.id) {
      await db.from("chapter_seat_assignments").update({ released_at: new Date().toISOString() }).eq("id", live.id);
    }
    if (member.user_id) {
      await db.from("entitlements").delete()
        .eq("user_id", member.user_id).eq("greek_chapter_id", pool.chapter_id).eq("source", "greek_seat");
    }
    return { ok: true, ...(await counts()) };
  });

/** Share-kit activity — which chapters are actively pitching internally. An ACTION log only:
 *  never what a member watched (see the privacy rule in the brief). */
export const logShareEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    chapterId: z.string().uuid(),
    kind: z.enum(["flyer", "treasurer_pdf", "slide", "groupchat", "treasurer_email", "invoice_link"]),
    termId: z.string().trim().max(20).optional(),
    isTest: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    try {
      const db = await admin();
      await db.from("chapter_share_events").insert({
        chapter_id: data.chapterId, kind: data.kind, term_id: data.termId ?? null, is_test: !!data.isTest,
      });
    } catch { /* logging must never block a share */ }
    return { ok: true };
  });

/** Current-term default for the purchase UI, resolved server-side so the client cannot disagree
 *  about which semester "now" is. */
export const defaultPurchaseTerm = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ termId: string; label: string; expiresLabel: string }> => {
    const t = makeTerm("fall", new Date().getUTCFullYear());
    const term = Date.parse(t.expiresAt) > Date.now() ? t : termFromId(termId(t))!;
    return { termId: termId(term), label: term.label, expiresLabel: term.expiresLabel };
  });

/** Record what Stripe says an invoice's status is — sent / open / paid / void / uncollectible.
 *  Reported verbatim on the dashboard rather than mapped into invented states. */
export async function recordInvoiceStatus(poolId: string, status: string): Promise<void> {
  try {
    const db = await admin();
    await db.from("chapter_seat_pools")
      .update({ invoice_status: status, updated_at: new Date().toISOString() })
      .eq("id", poolId);
  } catch { /* status is a nicety; never fail a webhook over it */ }
}
