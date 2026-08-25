// Internal, token-gated backfill runner. Runs the SAME per-campus stage
// sequence as the Course Intel cockpit's Backfill tab (course code → Greek orgs
// → council contacts → professors → RMP Intro-1 qualify → syllabi), but as an
// HTTP endpoint so an operator script can drive the batch server-side with its
// own concurrency/pacing/logging instead of the browser worker pool.
//
// AUTH: requires `Authorization: Bearer <BACKFILL_TOKEN>` matching the
// BACKFILL_TOKEN env var. Fails CLOSED when the env var is unset — never open.
// This is NOT part of the admin UI gate; keep BACKFILL_TOKEN secret.
//
// Stage skip logic mirrors backfillOne(): a stage a campus already satisfies is
// skipped; the Greek-eligibility gate skips the expensive academic stages for
// confidently no-social-greek, non-picker campuses. Public sources only.
import { createFileRoute } from "@tanstack/react-router";
import { researchProgramCourses } from "@/lib/program-courses.functions";
import { scrapeCampusGreek } from "@/lib/greekrank-scrape.functions";
import { discoverCouncilContacts } from "@/lib/council-contacts.functions";
import { autoDiscoverCampusUrls } from "@/lib/auto-scrape.functions";
import { scrapeCampusFaculty } from "@/lib/faculty-scrape.functions";
import { enrichProfintelCampus } from "@/lib/rmp-scrape.functions";
import { discoverCourseDocuments } from "@/lib/syllabus-intel.functions";
import { ALL_SCHOOLS } from "@/lib/schools";
import { isCommunityCollege, highValueCampusIds } from "@/lib/campus-classify";

const FACULTY_MAX_PAGES = 3; // conservative pagination cap (was default 5)

// Single-orchestrator advisory lock. When a caller passes `lockOwner`, only one
// owner may run at a time — prevents the concurrent-orchestrator clobbering that
// corrupted a run before. Backward compatible: no lockOwner → no locking.
async function acquireLock(admin: any, owner: string): Promise<{ ok: true } | { ok: false; heldBy: string }> {
  const now = Date.now();
  const expires = new Date(now + 120_000).toISOString(); // 2-min lease, renewed each call
  try {
    const { data: cur } = await admin.from("backfill_lock").select("owner,expires_at").eq("id", "global").maybeSingle();
    const held = cur && cur.expires_at && new Date(cur.expires_at).getTime() > now && cur.owner !== owner;
    if (held) return { ok: false, heldBy: cur.owner };
    await admin.from("backfill_lock").upsert({ id: "global", owner, expires_at: expires, updated_at: new Date(now).toISOString() }, { onConflict: "id" });
    return { ok: true };
  } catch { return { ok: true }; } // fail open if the lock table isn't migrated
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function hasIntro1Code(cfc: unknown, cc: unknown): boolean {
  for (let j of [cfc, cc]) {
    if (typeof j === "string") { try { j = JSON.parse(j); } catch { continue; } }
    if (!j || typeof j !== "object") continue;
    const o = j as Record<string, unknown>;
    const v = o.intro_1 ?? (o as Record<string, unknown>)["intro-accounting-1"];
    if (typeof v === "string" && v.trim()) return true;
    if (v && typeof v === "object") {
      const vc = v as Record<string, unknown>;
      if ((vc.local_course_code && String(vc.local_course_code).trim()) || (vc.code && String(vc.code).trim())) return true;
    }
  }
  return false;
}

type Stages = { code: boolean; greek: boolean; council: boolean; profs: boolean; enrich: boolean; syllabi: boolean };
const DEFAULT_STAGES: Stages = { code: true, greek: true, council: true, profs: true, enrich: true, syllabi: false };

async function handle({ request }: { request: Request }): Promise<Response> {
  const configured = process.env.BACKFILL_TOKEN || "";
  if (!configured) return json({ error: "BACKFILL_TOKEN not configured" }, 503);
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== configured) return json({ error: "Unauthorized" }, 401);

  let body: { campusId?: string; stages?: Partial<Stages>; lockOwner?: string; forceStages?: boolean };
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const campusId = body.campusId;
  if (!campusId) return json({ error: "campusId required" }, 400);
  const stages: Stages = { ...DEFAULT_STAGES, ...(body.stages ?? {}) };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Single-orchestrator lock (opt-in via lockOwner).
  if (body.lockOwner) {
    const lock = await acquireLock(supabaseAdmin, body.lockOwner);
    if (!lock.ok) return json({ error: "locked", heldBy: lock.heldBy }, 409);
  }

  // Current per-campus state → drives the same skip gates as the UI row.
  const { data: campus } = await (supabaseAdmin.from("campuses") as any)
    .select("id,display_name,name,institution_type,school_type,greek_eligibility,course_family_codes_json,course_codes_json").eq("id", campusId).maybeSingle();
  if (!campus) return json({ error: "campus not found" }, 404);

  // Community-college gate: skip the expensive council + faculty stages (they
  // legitimately have neither) UNLESS explicitly marked high-value. Overridable
  // per-request with forceStages, or globally via HIGH_VALUE_CAMPUS_IDS.
  const isCC = isCommunityCollege(campus);
  const highValue = body.forceStages === true || highValueCampusIds().has(campusId);
  const ccGated = isCC && !highValue;

  const [{ count: greekCount }, { count: profCount }] = await Promise.all([
    (supabaseAdmin.from("campus_greek_chapters") as any).select("id", { count: "exact", head: true }).eq("campus_id", campusId),
    (supabaseAdmin.from("campus_lead_suggestions") as any).select("id", { count: "exact", head: true }).eq("campus_id", campusId).is("archived_at", null),
  ]);
  const inPicker = ALL_SCHOOLS.some((s: { campusId: string }) => s.campusId === campusId);
  const codeAlready = hasIntro1Code(campus.course_family_codes_json, campus.course_codes_json);

  const o: Record<string, string> = { campus: campus.display_name || campus.name, code: "", greek: "", council: "", profs: "", enrich: "", syllabi: "" };
  const id = campusId;

  if (stages.code) { if (!codeAlready) { try { const cr = await researchProgramCourses({ data: { campusId: id, force: true } }) as { course_family_codes_json?: Record<string, string> }; o.code = cr?.course_family_codes_json?.intro_1 || "—"; } catch (e) { o.code = "err"; } } else o.code = "✓"; }

  let greekN = greekCount ?? 0;
  if (stages.greek) { if (greekN === 0) { try { const gr = await scrapeCampusGreek({ data: { campusId: id } }) as { inserted?: number }; greekN = gr?.inserted ?? 0; o.greek = `+${greekN}`; } catch { o.greek = "err"; } } else o.greek = `${greekN}`; }

  const noGreek = !inPicker && greekN === 0 && campus.greek_eligibility === "no_social_greek";
  const skipSecondary = noGreek || ccGated; // council + faculty stages

  if (stages.council) { if (!skipSecondary) { try { const cc = await discoverCouncilContacts({ data: { campusId: id } }) as { contactsInserted?: number }; o.council = `+${cc?.contactsInserted ?? 0}`; } catch { o.council = "err"; } } else o.council = ccGated ? "skip(cc)" : "skip"; }

  if (stages.profs) {
    if (skipSecondary) o.profs = ccGated ? "skip(cc)" : "skip(no greek)";
    else if ((profCount ?? 0) === 0) {
      try {
        const d = await autoDiscoverCampusUrls({ data: { campusId: id } }) as { facultyUrls?: string[]; noAccountingDept?: boolean };
        if (d?.facultyUrls?.length && !d.noAccountingDept) { const fac = await scrapeCampusFaculty({ data: { campusId: id, urls: d.facultyUrls, allowNoContact: true, maxPages: FACULTY_MAX_PAGES } }) as { inserted?: number }; o.profs = `+${fac?.inserted ?? 0}`; }
        else o.profs = "no dept";
      } catch { o.profs = "err"; }
    } else o.profs = `${profCount}`;
  }

  if (stages.enrich && !noGreek) { try { const er = await enrichProfintelCampus({ data: { campusId: id, limit: 150 } }) as { withTargetMatch?: number }; o.enrich = `${er?.withTargetMatch ?? 0}`; } catch { o.enrich = "err"; } }

  if (stages.syllabi && !noGreek) { try { const sr = await discoverCourseDocuments({ data: { campusId: id } }) as { inserted?: number }; o.syllabi = `${sr?.inserted ?? 0}`; } catch { o.syllabi = "err"; } }

  return json({ ok: true, result: o });
}

export const Route = createFileRoute("/api/backfill")({
  server: { handlers: { POST: handle } },
} as never);
