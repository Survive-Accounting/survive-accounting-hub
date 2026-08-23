// referral-shared.ts — PURE types + constants for the referral platform. No server imports; safe
// to import from client route files AND server modules. The single source of truth for the shapes
// the admin UI and the server functions agree on.

export const REFERRAL_COOKIE = "sa_ref";
/** Attribution window: last eligible click within this many days wins (first-party, single-touch). */
export const REFERRAL_WINDOW_DAYS = 30;
export const ATTRIBUTION_MODEL = "last_touch_30d";

// Partner types are LABELS, not codepaths. A NIL athlete, a Greek chapter and a flyer are all just
// partners with a different `type`.
export const PARTNER_TYPES = [
  "campus_rep",
  "ambassador",
  "chapter",
  "council",
  "national_org",
  "influencer",
  "alumni",
  "flyer",
  "other",
] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  campus_rep: "Campus rep",
  ambassador: "Student ambassador",
  chapter: "Greek chapter",
  council: "Greek council",
  national_org: "National org",
  influencer: "Influencer",
  alumni: "Alumni",
  flyer: "Flyer / QR",
  other: "Other",
};

export const PARTNER_STATUSES = ["active", "paused", "archived"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const COMMISSION_TYPES = ["percent", "flat", "none"] as const;
export type CommissionType = (typeof COMMISSION_TYPES)[number];

export const CONVERSION_KINDS = ["signup", "purchase", "chapter_purchase"] as const;
export type ConversionKind = (typeof CONVERSION_KINDS)[number];

export const COMMISSION_STATUSES = ["pending", "approved", "paid", "void"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

// ── shared value objects ────────────────────────────────────────────────────────
export type CommissionRule = { type: CommissionType; rate: number };

export type PartnerRow = {
  id: string;
  name: string;
  type: PartnerType;
  email: string | null;
  phone: string | null;
  social_handle: string | null;
  status: PartnerStatus;
  default_commission_type: CommissionType;
  default_commission_rate: number;
  campus_id: string | null;
  notes: string | null;
  is_test: boolean;
  created_at: string;
};

export type LinkRow = {
  id: string;
  code: string;
  partner_id: string;
  partner_name?: string | null;
  partner_type?: PartnerType | null;
  label: string | null;
  destination_url: string;
  campaign: string | null;
  commission_type: CommissionType | null;
  commission_rate: number | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  active: boolean;
  is_test: boolean;
  created_at: string;
};

export type ConversionRow = {
  id: string;
  code: string | null;
  partner_id: string | null;
  partner_name?: string | null;
  link_id: string | null;
  kind: ConversionKind;
  subject_type: string | null;
  subject_id: string | null;
  email: string | null;
  amount_cents: number;
  occurred_at: string;
  is_test: boolean;
};

export type CommissionRow = {
  id: string;
  conversion_id: string | null;
  partner_id: string;
  partner_name?: string | null;
  link_id: string | null;
  basis_cents: number;
  commission_type: CommissionType;
  commission_rate: number;
  commission_cents: number;
  status: CommissionStatus;
  is_test: boolean;
  notes: string | null;
  created_at: string;
};

/** Per-partner or per-link funnel roll-up shown in the KPI row + tables. */
export type FunnelStats = {
  clicks: number;
  signups: number;
  purchases: number;
  revenueCents: number;
  commissionCents: number;
};

// ── pure helpers (usable on client and server) ──────────────────────────────────

/** Resolve the effective commission rule for a link: link override wins, else partner default. */
export function effectiveRule(
  link: Pick<LinkRow, "commission_type" | "commission_rate">,
  partner: Pick<PartnerRow, "default_commission_type" | "default_commission_rate">,
): CommissionRule {
  if (link.commission_type != null) {
    return { type: link.commission_type, rate: Number(link.commission_rate ?? 0) };
  }
  return {
    type: partner.default_commission_type,
    rate: Number(partner.default_commission_rate ?? 0),
  };
}

/** Commission in cents for a given revenue basis. percent: rate is whole percent. flat: rate is cents. */
export function commissionCents(basisCents: number, rule: CommissionRule): number {
  if (rule.type === "none") return 0;
  if (rule.type === "flat") return Math.max(0, Math.round(rule.rate));
  // percent
  return Math.max(0, Math.round((basisCents * rule.rate) / 100));
}

/** Human label for a rule, e.g. "10%" or "$5.00 flat" or "No commission". */
export function ruleLabel(rule: CommissionRule): string {
  if (rule.type === "none") return "No commission";
  if (rule.type === "flat") return `${formatCents(rule.rate)} flat`;
  return `${trimNum(rule.rate)}%`;
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

/** Base62 alphabet for short codes — URL-safe, no lookalike-free but fine for opaque codes. */
export const CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const CODE_LENGTH = 7;
