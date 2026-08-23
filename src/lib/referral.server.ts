// referral.server.ts — server-only core for the referral platform. Owns: short-code generation, IP
// hashing, click recording, first-party cookie read/write, and the ONE attribution + commission
// calculation path. See referral-shared.ts for the documented attribution rule and pure helpers.
//
// BROWSER-GRAPH SAFETY: the redirect route `r.$code.tsx` is a FILE ROUTE, so Vite/rollup follows
// even its dynamic `import()` of this module into the CLIENT graph (the same trap documented in
// flyer.server.ts). Therefore this module must be *buildable* for the browser: NO `node:*` builtin
// imports. Crypto uses the isomorphic Web Crypto API (`globalThis.crypto`), which exists on both the
// Vercel server runtime and the browser. QR generation (which pulls in the `qrcode` package) is kept
// out of this module — it lives in referral-qr.server.ts, imported only from stripped *.functions.ts
// handlers, so it never enters the redirect route's graph.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ATTRIBUTION_MODEL,
  CODE_ALPHABET,
  CODE_LENGTH,
  REFERRAL_COOKIE,
  REFERRAL_WINDOW_DAYS,
  commissionCents,
  effectiveRule,
  type CommissionType,
  type ConversionKind,
} from "@/lib/referral-shared";

const ANON_COOKIE = "sa_anon";
const db = supabaseAdmin as unknown as { from: (t: string) => any };

const webcrypto = globalThis.crypto;

// ── codes ────────────────────────────────────────────────────────────────────────
function randomCode(len = CODE_LENGTH): string {
  const bytes = new Uint8Array(len);
  webcrypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** Generate a code guaranteed unique against referral_links (a few retries on the tiny collision odds). */
export async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode(CODE_LENGTH + (attempt >= 3 ? 1 : 0));
    const { data } = await db.from("referral_links").select("id").eq("code", code).maybeSingle();
    if (!data) return code;
  }
  // Fall back to a longer code that is astronomically unlikely to collide.
  return randomCode(CODE_LENGTH + 4);
}

// ── privacy ───────────────────────────────────────────────────────────────────────
function ipSalt(): string {
  return (
    (typeof process !== "undefined" && process.env.REFERRAL_IP_SALT) || "sa-referral-static-salt"
  );
}
/** SHA-256(salt:ip) truncated to 32 hex chars. Async (Web Crypto subtle). Raw IP is never stored. */
export async function hashIp(ip: string | null | undefined): Promise<string | null> {
  if (!ip) return null;
  const data = new TextEncoder().encode(`${ipSalt()}:${ip}`);
  const buf = await webcrypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

// ── cookies ────────────────────────────────────────────────────────────────────────
export type RefCookie = { code: string; atMs: number };

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** Read the first-party referral cookie (`code~epochSeconds`). Null if absent/malformed. */
export function readRefCookie(request: Request): RefCookie | null {
  const raw = parseCookies(request.headers.get("cookie"))[REFERRAL_COOKIE];
  if (!raw) return null;
  const [code, ts] = raw.split("~");
  if (!code) return null;
  const atMs = Number(ts) * 1000;
  return { code, atMs: Number.isFinite(atMs) ? atMs : 0 };
}

export function readAnonCookie(request: Request): string | null {
  return parseCookies(request.headers.get("cookie"))[ANON_COOKIE] || null;
}

/** Build the Set-Cookie headers a /r/<code> redirect emits: the ref (last-touch) + a stable anon id. */
export function buildAttributionCookies(
  code: string,
  existingAnon: string | null,
  nowMs: number,
): { anonId: string; setCookies: string[] } {
  const anonId = existingAnon || webcrypto.randomUUID();
  const isProd = typeof process !== "undefined" && process.env.NODE_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  const refValue = `${code}~${Math.floor(nowMs / 1000)}`;
  const refMaxAge = REFERRAL_WINDOW_DAYS * 24 * 60 * 60;
  const anonMaxAge = 365 * 24 * 60 * 60;
  return {
    anonId,
    setCookies: [
      // HttpOnly: only server handlers (conversion server-fns) read it — client JS never needs it,
      // and it keeps the attribution value off the page.
      `${REFERRAL_COOKIE}=${encodeURIComponent(refValue)}; Path=/; Max-Age=${refMaxAge}; HttpOnly; SameSite=Lax${secure}`,
      `${ANON_COOKIE}=${encodeURIComponent(anonId)}; Path=/; Max-Age=${anonMaxAge}; HttpOnly; SameSite=Lax${secure}`,
    ],
  };
}

// ── link resolution ─────────────────────────────────────────────────────────────
export type ResolvedLink = {
  id: string;
  code: string;
  destination_url: string;
  active: boolean;
  is_test: boolean;
  partner_id: string;
  partner_is_test: boolean;
  partner_status: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  commission_type: CommissionType | null;
  commission_rate: number | null;
  default_commission_type: CommissionType;
  default_commission_rate: number;
};

export async function resolveLinkByCode(code: string): Promise<ResolvedLink | null> {
  const { data: link } = await db
    .from("referral_links")
    .select(
      "id,code,destination_url,active,is_test,partner_id,utm_source,utm_medium,utm_campaign,utm_content,commission_type,commission_rate",
    )
    .eq("code", code)
    .maybeSingle();
  if (!link) return null;
  const { data: partner } = await db
    .from("referral_partners")
    .select("is_test,status,default_commission_type,default_commission_rate")
    .eq("id", link.partner_id)
    .maybeSingle();
  return {
    ...link,
    partner_is_test: !!partner?.is_test,
    partner_status: (partner?.status as string) ?? "active",
    default_commission_type: (partner?.default_commission_type as CommissionType) ?? "percent",
    default_commission_rate: Number(partner?.default_commission_rate ?? 0),
  };
}

/** Append the link's UTM params (and a fixed ref marker) to the destination without clobbering existing query. */
export function decorateDestination(link: ResolvedLink, baseUrl: string): string {
  let url: URL;
  try {
    // destination_url may be absolute or a site-relative path.
    url = new URL(link.destination_url, baseUrl);
  } catch {
    return link.destination_url;
  }
  const add = (k: string, v: string | null | undefined) => {
    if (v && !url.searchParams.has(k)) url.searchParams.set(k, v);
  };
  add("utm_source", link.utm_source);
  add("utm_medium", link.utm_medium);
  add("utm_campaign", link.utm_campaign);
  add("utm_content", link.utm_content);
  // A readable, non-sensitive marker so downstream pages/logs can see the source without decoding ids.
  add("ref", link.code);
  return url.toString();
}

// ── click recording ─────────────────────────────────────────────────────────────
const BOT_RE =
  /bot|crawler|spider|crawling|facebookexternalhit|slackbot|whatsapp|preview|monitor|curl|wget|headless|lighthouse/i;

export async function recordClick(input: {
  link: ResolvedLink;
  anonId: string;
  request: Request;
  nowMs: number;
}): Promise<void> {
  const { link, anonId, request } = input;
  const ua = request.headers.get("user-agent") || "";
  const isBot = BOT_RE.test(ua);
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  await db.from("referral_clicks").insert({
    link_id: link.id,
    code: link.code,
    anon_id: anonId,
    ip_hash: await hashIp(ip),
    user_agent: ua.slice(0, 400),
    referer: (request.headers.get("referer") || "").slice(0, 400) || null,
    is_bot: isBot,
    is_test: link.is_test || link.partner_is_test,
  });
}

// ── attribution + commission (the ONE path) ───────────────────────────────────────

/** Is a click timestamp inside the attribution window relative to now? */
function withinWindow(clickMs: number, nowMs: number): boolean {
  if (!clickMs) return false;
  const windowMs = REFERRAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return nowMs - clickMs <= windowMs && clickMs <= nowMs + 60_000; // small clock-skew grace
}

export type ConversionInput = {
  kind: ConversionKind;
  subjectType?: string | null;
  subjectId?: string | null;
  email?: string | null;
  userId?: string | null;
  amountCents?: number;
  /** Force is_test regardless of link (e.g. a caller already in test mode). */
  forceTest?: boolean;
};

export type ConversionResult =
  | { attributed: false; reason: string }
  | {
      attributed: true;
      deduped: boolean;
      conversionId: string;
      partnerId: string;
      commissionId: string | null;
      commissionCents: number;
      isTest: boolean;
    };

/**
 * Read the first-party cookie from `request`, resolve the eligible last-touch link, and record a
 * conversion (idempotent per subject+kind). For a purchase with revenue, also calculate + insert the
 * commission with a snapshotted rule. Revenue (`amountCents`) is trusted only from server callers —
 * never accept it from the browser.
 */
export async function recordConversionForRequest(
  request: Request,
  input: ConversionInput,
  nowMs: number = 0,
): Promise<ConversionResult> {
  const now = nowMs || readNow();
  const cookie = readRefCookie(request);
  if (!cookie) return { attributed: false, reason: "no_ref_cookie" };
  if (!withinWindow(cookie.atMs, now)) return { attributed: false, reason: "window_expired" };

  const link = await resolveLinkByCode(cookie.code);
  if (!link) return { attributed: false, reason: "unknown_code" };

  return insertConversionAndCommission(link, input, readAnonCookie(request));
}

/**
 * Trusted, code-based conversion path (no cookie/window check) for admin reconcile + manual entry.
 * The caller must itself be trusted (behind the AdminGate, or a server reconcile reading real order
 * revenue). Same idempotent + commission-calculation semantics as the cookie path.
 */
export async function recordConversionByCode(
  code: string,
  input: ConversionInput,
): Promise<ConversionResult> {
  const link = await resolveLinkByCode(code);
  if (!link) return { attributed: false, reason: "unknown_code" };
  return insertConversionAndCommission(link, input, null);
}

async function insertConversionAndCommission(
  link: ResolvedLink,
  input: ConversionInput,
  anonId: string | null,
): Promise<ConversionResult> {
  const isTest = !!input.forceTest || link.is_test || link.partner_is_test;
  const amount = Math.max(0, Math.round(input.amountCents ?? 0));

  // Idempotent insert: unique (subject_type, subject_id, kind). On conflict we look up the existing row.
  const row = {
    link_id: link.id,
    partner_id: link.partner_id,
    code: link.code,
    anon_id: anonId,
    kind: input.kind,
    subject_type: input.subjectType ?? null,
    subject_id: input.subjectId ?? null,
    user_id: input.userId ?? null,
    email: input.email ? input.email.toLowerCase() : null,
    amount_cents: amount,
    attribution_model: ATTRIBUTION_MODEL,
    is_test: isTest,
  };

  let conversionId: string | null = null;
  let deduped = false;
  const ins = await db.from("referral_conversions").insert(row).select("id").single();
  if (ins.error) {
    // Likely the unique guard — fetch the existing conversion for this subject+kind.
    if (input.subjectId) {
      const { data: existing } = await db
        .from("referral_conversions")
        .select("id")
        .eq("subject_type", input.subjectType ?? "")
        .eq("subject_id", input.subjectId)
        .eq("kind", input.kind)
        .maybeSingle();
      if (existing?.id) {
        conversionId = existing.id;
        deduped = true;
      } else {
        return { attributed: false, reason: `insert_failed:${ins.error.message}` };
      }
    } else {
      return { attributed: false, reason: `insert_failed:${ins.error.message}` };
    }
  } else {
    conversionId = ins.data.id as string;
  }

  // Commission only for purchases with a positive basis, and only once per conversion.
  let commissionId: string | null = null;
  let commission = 0;
  const isPurchase = input.kind === "purchase" || input.kind === "chapter_purchase";
  if (isPurchase && amount > 0 && !deduped) {
    const rule = effectiveRule(
      { commission_type: link.commission_type, commission_rate: link.commission_rate },
      {
        default_commission_type: link.default_commission_type,
        default_commission_rate: link.default_commission_rate,
      },
    );
    commission = commissionCents(amount, rule);
    if (rule.type !== "none") {
      const cIns = await db
        .from("referral_commissions")
        .insert({
          conversion_id: conversionId,
          partner_id: link.partner_id,
          link_id: link.id,
          basis_cents: amount,
          commission_type: rule.type,
          commission_rate: rule.rate,
          commission_cents: commission,
          status: "pending",
          is_test: isTest,
        })
        .select("id")
        .single();
      if (!cIns.error) commissionId = cIns.data.id as string;
    }
  }

  return {
    attributed: true,
    deduped,
    conversionId: conversionId!,
    partnerId: link.partner_id,
    commissionCents: commission,
    commissionId,
    isTest,
  };
}

// `Date.now()` is fine in real server code (the workflow-script restriction does not apply here);
// wrapped so callers can inject a clock in tests.
function readNow(): number {
  return Date.now();
}
