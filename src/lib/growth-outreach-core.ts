// GROWTH OUTREACH — pure queue-assembly + template logic (client-safe, fully testable).
//
// The rules here are the handoff's queue contract, encoded once:
//   eligible → QC-approved → not verify-held → deduped lower(email) → not suppressed
//   → not already contacted → queued. Every exclusion keeps its reason (nothing is
//   silently dropped), and NOTHING sends without an explicit human approval + send action.

export type ContactClass = "CURRENT_HIGH" | "USABLE" | "VERIFY" | "SOCIAL" | "ADVISORY";

export interface EligibleContact {
  qcId: string;
  contactSource: string;
  campusId: string;
  chapterId: string | null;
  councilType: string | null;
  orgId: string | null;
  campaignPurpose: string | null;
  contactType: string | null;
  name: string | null;
  role: string | null;
  email: string | null;
  instagram: string | null;
  confidence: string | null;
  lastVerified: string | null;
  /** The page this contact was found on — the drawer links out to it so you can re-check. */
  sourceUrl: string | null;
  freshnessStatus: string | null;
  outreachEligible: boolean;
  reviewReason: string | null;
  qcAction: string | null;
}

/** UI classification — mirrors the handoff's display table. */
export function classifyContact(c: EligibleContact): ContactClass {
  if (c.campaignPurpose === "ADVISORY_ESCALATION" || c.contactType === "staff_advisor")
    return "ADVISORY";
  if (c.freshnessStatus === "verify_before_use") return "VERIFY";
  if (!c.email && c.instagram) return "SOCIAL";
  if (c.outreachEligible && c.confidence === "high") return "CURRENT_HIGH";
  return "USABLE";
}

/** Default pick order when an ENTITY (council/chapter/club) is checked without choosing a
 *  specific contact: durable role inbox → org-general → high-confidence named → any eligible
 *  email. VERIFY-held and ADVISORY rows are never auto-picked. Deterministic. */
export function defaultContactFor(contacts: EligibleContact[]): EligibleContact | null {
  const usable = contacts.filter(
    (c) =>
      c.email &&
      c.outreachEligible &&
      classifyContact(c) !== "VERIFY" &&
      classifyContact(c) !== "ADVISORY",
  );
  const rank = (c: EligibleContact): number =>
    c.contactType === "role_inbox"
      ? 0
      : c.contactType === "organization_general"
        ? 1
        : c.confidence === "high"
          ? 2
          : 3;
  return (
    usable.sort((a, b) => rank(a) - rank(b) || (a.email ?? "").localeCompare(b.email ?? ""))[0] ??
    null
  );
}

// ---------------------------------------------------------------------------------
// Queue assembly
// ---------------------------------------------------------------------------------

export interface QueueCheckContext {
  suppressedEmails: Set<string>; // lower(email) from comms_suppressions
  previouslyContacted: Set<string>; // lower(email) with a prior outbound growth event
}

export type HoldReason =
  | "no_email"
  | "not_eligible"
  | "qc_not_approved"
  | "verify_before_use"
  | "duplicate_in_batch"
  | "suppressed"
  | "already_contacted"
  | "advisory_gated";

export interface QueueDecision {
  contact: EligibleContact;
  ok: boolean;
  reason?: HoldReason;
}

/** Apply every hold rule to a selected batch. Order of `selected` decides which
 *  duplicate wins (first occurrence). 990-context people never reach this function —
 *  they are not in the eligibility view at all. */
export function assembleQueue(
  selected: EligibleContact[],
  ctx: QueueCheckContext,
): QueueDecision[] {
  const seen = new Set<string>();
  return selected.map((contact) => {
    const email = contact.email?.trim().toLowerCase() ?? "";
    if (!email) return { contact, ok: false, reason: "no_email" as const };
    if (contact.campaignPurpose === "ADVISORY_ESCALATION")
      return { contact, ok: false, reason: "advisory_gated" as const };
    if (!contact.outreachEligible) return { contact, ok: false, reason: "not_eligible" as const };
    if (contact.qcAction && contact.qcAction !== "approve")
      return { contact, ok: false, reason: "qc_not_approved" as const };
    if (contact.freshnessStatus === "verify_before_use")
      return { contact, ok: false, reason: "verify_before_use" as const };
    if (seen.has(email)) return { contact, ok: false, reason: "duplicate_in_batch" as const };
    if (ctx.suppressedEmails.has(email))
      return { contact, ok: false, reason: "suppressed" as const };
    if (ctx.previouslyContacted.has(email))
      return { contact, ok: false, reason: "already_contacted" as const };
    seen.add(email);
    return { contact, ok: true };
  });
}

// ---------------------------------------------------------------------------------
// Merge variables + template rendering
// ---------------------------------------------------------------------------------

export interface MergeVar {
  value: string | null;
  source: string;
  confidence: "high" | "medium" | "low";
  lastVerified: string | null;
}
export type MergeVars = Record<string, MergeVar>;

/** Render {{var}} substitutions and {{#var}}…{{/var}} conditional sections (section kept
 *  only when the var has a non-empty value). Unknown vars render empty and are reported. */
export function renderGrowthTemplate(
  template: string,
  vars: MergeVars,
): { text: string; missing: string[]; used: string[] } {
  const missing = new Set<string>();
  const used = new Set<string>();
  let out = template.replace(
    /\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key: string, body: string) => {
      const v = vars[key]?.value;
      return v ? body : "";
    },
  );
  out = out.replace(/\{\{([\w.]+)\}\}/g, (_, key: string) => {
    const v = vars[key]?.value;
    if (v == null || v === "") {
      missing.add(key);
      return "";
    }
    used.add(key);
    return v;
  });
  return { text: out.replace(/[ \t]+\n/g, "\n"), missing: [...missing], used: [...used] };
}

/** A rendered email needs review when a required var is missing/low-confidence, or the
 *  copy addresses a person whose currency is unverified. */
export function needsReview(
  rendered: { missing: string[] },
  vars: MergeVars,
  contact: Pick<EligibleContact, "freshnessStatus" | "name">,
  requiredVars: string[],
): { review: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const key of requiredVars) {
    const v = vars[key];
    if (!v?.value) reasons.push(`missing ${key}`);
    else if (v.confidence === "low") reasons.push(`low-confidence ${key}`);
  }
  for (const key of rendered.missing)
    if (requiredVars.includes(key)) {
      if (!reasons.includes(`missing ${key}`)) reasons.push(`missing ${key}`);
    }
  if (contact.freshnessStatus === "verify_before_use" && contact.name)
    reasons.push("named officer not verified for the current term");
  return { review: reasons.length > 0, reasons };
}

/* ── RECIPIENT ORDER (pre-launch simplification, 2026-08-27) ─────────────────────────
   Councils first (they unlock whole campuses), then chapters big-to-small, clubs last.
   chapter_size is nullable — unknown sizes sort after known ones, never invented. */

export interface OrderableEntity {
  kind: "council" | "chapter" | "club";
  label: string;
  size: number | null;
}

export function compareEntities(a: OrderableEntity, b: OrderableEntity): number {
  const kindOrder = { council: 0, chapter: 1, club: 2 } as const;
  if (kindOrder[a.kind] !== kindOrder[b.kind]) return kindOrder[a.kind] - kindOrder[b.kind];
  if (a.kind === "chapter" && b.kind === "chapter") {
    const as = a.size,
      bs = b.size;
    if (as != null && bs != null && as !== bs) return bs - as; // biggest first
    if (as != null && bs == null) return -1; // known size beats unknown
    if (as == null && bs != null) return 1;
  }
  return a.label.localeCompare(b.label);
}
