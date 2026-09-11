// STUDENT REVIEWS (Lee, 2026-09-11, the /learn polish brief §12): "Leave a review" writes one
// row to public.student_reviews — user_id if available, name, email, campus, course, exam, the
// 1–5 rating, the comment, created_at. Nothing is published: the table's `published` defaults to
// false and no page reads it; there is no moderation workflow yet, so none is pretended.
//
// The pattern is the site's: a POST server function, zod at the door, the service-role client
// imported INSIDE the handler (never at module scope — the key stays out of the browser bundle),
// and a loud failure that names the migration when the table is not there yet.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MISSING = "student_reviews table missing — apply migration/supabase-migrations/20260911_0900_student_reviews.sql in the Supabase SQL editor";

const ReviewInput = z.object({
  name: z.string().trim().min(1, "Your name").max(120),
  email: z.string().trim().email("A real email").max(200),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1, "A few words").max(4000),
  campusId: z.string().uuid().nullable().default(null),
  campusSlug: z.string().trim().max(120).nullable().default(null),
  courseCode: z.string().trim().max(40).nullable().default(null),
  exam: z.string().trim().max(40).nullable().default(null),
  userId: z.string().uuid().nullable().default(null),
  sourcePath: z.string().max(200).default("/learn"),
  isTest: z.boolean().default(false),
});
export type ReviewInput = z.input<typeof ReviewInput>;

export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ReviewInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; id: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const { data: row, error } = await db.from("student_reviews").insert({
      user_id: data.userId,
      name: data.name,
      email: data.email,
      campus_id: data.campusId,
      campus_slug: data.campusSlug,
      course_code: data.courseCode,
      exam: data.exam,
      rating: data.rating,
      comment: data.comment,
      source_path: data.sourcePath,
      is_test: data.isTest,
    }).select("id").single();
    if (error) {
      if (/student_reviews/i.test(error.message) && /does not exist|schema cache|not find/i.test(error.message)) throw new Error(MISSING);
      throw new Error(error.message);
    }
    return { ok: true, id: String(row.id) };
  });
