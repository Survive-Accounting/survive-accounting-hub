// Pure routing logic for /start student intake submissions.
// A course is bookable only if:
//   - course availability = "available"
//   - textbook_match_status = "matched"
//   - course_family is currently enabled globally (outreach_settings.<family>_availability = "available")
//   - syllabus_file_url exists  → otherwise needs syllabus
// Otherwise: waitlist_review.
import { supabase } from "@/integrations/supabase/client";

export type CourseFamily = "intro_1" | "intro_2" | "intermediate_1" | "intermediate_2" | "other";
export type RoutingResult = "bookable_ready" | "bookable_needs_syllabus" | "waitlist_review";

export interface RoutingDecision {
  result: RoutingResult;
  reason: string;
  bookingUrl: string | null;
}

interface InputArgs {
  campusId: string | null;
  courseFamily: string;
  hasSyllabus: boolean;
}

const FAMILY_KEYS: CourseFamily[] = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"];

export async function computeIntakeRouting(args: InputArgs): Promise<RoutingDecision> {
  const fam = args.courseFamily as CourseFamily;
  if (!FAMILY_KEYS.includes(fam)) {
    return { result: "waitlist_review", reason: "Course family not yet supported", bookingUrl: null };
  }

  // Global outreach settings (singleton row id = 1)
  const { data: settings } = await (supabase.from("outreach_settings" as never) as any)
    .select("intro_1_availability,intro_2_availability,intermediate_1_availability,intermediate_2_availability,square_booking_url,square_booking_url_intro_1,square_booking_url_intro_2,square_booking_url_intermediate_1,square_booking_url_intermediate_2")
    .eq("id", 1)
    .maybeSingle();

  const globalAvail: string | null = settings?.[`${fam}_availability`] ?? null;
  if (globalAvail !== "available") {
    return { result: "waitlist_review", reason: `Global ${fam} availability is ${globalAvail ?? "unset"}`, bookingUrl: null };
  }

  // Campus-specific availability + textbook match
  let campusAvail: string | null = null;
  let textbookMatch: string | null = null;
  let campusBookingUrl: string | null = null;
  if (args.campusId) {
    const { data: avail } = await (supabase.from("campus_course_availability" as never) as any)
      .select("tutoring_availability,textbook_match_status,booking_url")
      .eq("campus_id", args.campusId)
      .eq("course_family", fam)
      .maybeSingle();
    campusAvail = avail?.tutoring_availability ?? null;
    textbookMatch = avail?.textbook_match_status ?? null;
    campusBookingUrl = avail?.booking_url ?? null;
  } else {
    // No campus selected → can't verify; route to waitlist
    return { result: "waitlist_review", reason: "No campus identified", bookingUrl: null };
  }

  if (campusAvail !== "available") {
    return { result: "waitlist_review", reason: `Campus ${fam} availability is ${campusAvail ?? "unset"}`, bookingUrl: null };
  }
  if (textbookMatch !== "matched") {
    return { result: "waitlist_review", reason: `Textbook not matched (status: ${textbookMatch ?? "unknown"})`, bookingUrl: null };
  }

  const bookingUrl: string | null =
    campusBookingUrl ||
    settings?.[`square_booking_url_${fam}`] ||
    settings?.square_booking_url ||
    null;

  if (!args.hasSyllabus) {
    return { result: "bookable_needs_syllabus", reason: "Bookable but syllabus missing", bookingUrl };
  }
  return { result: "bookable_ready", reason: "Bookable and syllabus uploaded", bookingUrl };
}
