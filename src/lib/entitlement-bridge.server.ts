// THE BRIDGE — the fix for the gap the TODO at entitlements.functions.ts:17 describes.
//
// THE BUG IT CLOSES. There are two grant tables. Stripe's webhook writes `student_entitlements`;
// /learn's server-side paywall (unlockedTopicIds → getSetPlayback) reads `entitlements`. Nothing
// joined them, so a student could pay, watch the landing page tab unlock, and STILL hit a locked
// video — the worst failure this product can have, because it happens after the money moves.
//
// So every grant path (Stripe webhook and the Test Mode grant) calls this, and it writes the row
// /learn actually reads: scope 'course', expiring with the term.
//
// FAILS LOUDLY, NEVER SILENTLY. A kind we cannot map to a course returns ok:false with a reason
// and logs it. An unbridged purchase must be visible in the logs the day it happens, not
// discovered by a student who paid.
import { studyPassTerm } from "./study-pass";

type DB = { from: (t: string) => any };

export type BridgeInput = {
  userId: string;
  /** The entitlement kind the purchase carried. */
  kind: string;
  /** The course the pass covers. Required — a course-scoped grant with no course is meaningless. */
  courseId: string | null | undefined;
  /** 'stripe' | 'test' — recorded on the row so admin can tell a paid grant from a test one. */
  source: string;
};

export type BridgeResult = { ok: boolean; reason?: string; alreadyHeld?: boolean };

/** Kinds that mean "the whole course for a term". `pass` is the legacy all-exams SKU, which under
 *  the study-pass model grants the same thing. */
const COURSE_SCOPED = new Set(["study_pass", "pass"]);

export async function bridgeEntitlement(db: DB, input: BridgeInput): Promise<BridgeResult> {
  if (!COURSE_SCOPED.has(input.kind)) {
    const reason = `kind '${input.kind}' has no course mapping — /learn will stay locked for user ${input.userId}`;
    console.warn("[entitlement-bridge] NOT BRIDGED:", reason);
    return { ok: false, reason };
  }
  const courseId = (input.courseId ?? "").trim();
  if (!courseId) {
    const reason = `kind '${input.kind}' arrived without a course_id — cannot grant course scope for user ${input.userId}`;
    console.warn("[entitlement-bridge] NOT BRIDGED:", reason);
    return { ok: false, reason };
  }

  const term = studyPassTerm();
  try {
    // IDEMPOTENT. A Stripe retry, or a student buying twice in a term, must not stack rows. The
    // match is (user, scope, scope_id, expiry) — a pass for the NEXT term is a different row and
    // is deliberately allowed.
    const { data: existing } = await db.from("entitlements")
      .select("id").eq("user_id", input.userId).eq("scope", "course")
      .eq("scope_id", courseId).eq("expires_at", term.expiresAt).limit(1);
    if (Array.isArray(existing) && existing.length) return { ok: true, alreadyHeld: true };

    const { error } = await db.from("entitlements").insert({
      user_id: input.userId,
      scope: "course",
      scope_id: courseId,
      expires_at: term.expiresAt,
      source: input.source,
    });
    if (error) {
      console.warn("[entitlement-bridge] insert failed:", error.message);
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "bridge failed";
    console.warn("[entitlement-bridge] threw:", reason);
    return { ok: false, reason };
  }
}
