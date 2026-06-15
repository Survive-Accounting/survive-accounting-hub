// Per-course-family CTA list driven by getEffectiveCourseAvailability().
//
// CTA decision tree (per course family):
//   effective === "unavailable"                         → hidden
//   textbook_match_status === "not_offered"             → hidden (campus does not offer it)
//   effective === "available" && match === "matched"    → Book Tutoring (+ syllabus upload helper copy)
//   all other visible cases (incl. likely_match,
//     unknown, not_matched, waitlist)                   → Join Waitlist (+ syllabus upload)
//
// Note: "likely_match" is intentionally NOT bookable yet — only confirmed "matched".
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import {
  COURSE_FAMILIES,
  getEffectiveCourseAvailability,
  type CourseFamily,
  type EffectiveCourseAvailability,
} from "@/lib/outreach-api";
import CourseWaitlistModal from "./CourseWaitlistModal";

const NAVY = "#14213D";

interface Props {
  campusId: string;
  schoolName: string;
  familyCodes?: Record<string, string> | null;
  onBookTutoring: (family: CourseFamily, courseCode: string | null) => void;
}

export default function CourseCtaList({ campusId, schoolName, familyCodes, onBookTutoring }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["effective-course-availability", campusId],
    queryFn: () => getEffectiveCourseAvailability(campusId),
    retry: 1,
  });

  const [waitlistOpen, setWaitlistOpen] = useState<{ family: CourseFamily; label: string; code: string | null } | null>(null);

  const visible = useMemo<EffectiveCourseAvailability[]>(
    () =>
      (data ?? []).filter(
        // Hide unavailable courses, and hide anything the campus does not actually offer.
        (d) => d.effective !== "unavailable" && d.textbook_match_status !== "not_offered",
      ),
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!visible.length) return null;

  return (
    <section style={{ background: "#FFFFFF", padding: "32px 16px", borderBottom: "1px solid #E5E7EB" }}>
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <h2
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
            fontWeight: 700,
            color: "#6B7280",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            textAlign: "center",
            marginBottom: 18,
          }}
        >
          Your Courses
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((row) => {
            const meta = COURSE_FAMILIES.find((f) => f.key === row.family)!;
            const code = familyCodes?.[row.family]?.trim() || null;
            const isBookable = row.effective === "available" && row.textbook_match_status === "matched";
            const isWaitlist = row.effective === "waitlist" || (row.effective === "available" && row.textbook_match_status !== "matched");
            return (
              <div
                key={row.family}
                className="flex flex-col gap-3 rounded-xl border bg-white p-4"
                style={{ borderColor: "#E5E7EB" }}
              >
                <div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, color: NAVY }}>
                    {meta.shortLabel}
                    {code ? <span style={{ marginLeft: 8, fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#6B7280" }}>{code}</span> : null}
                  </div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                    {meta.label}
                  </div>
                </div>
                {isBookable ? (
                  <button
                    onClick={() => onBookTutoring(row.family, code)}
                    style={{
                      width: "100%", padding: "10px 16px", borderRadius: 10,
                      background: NAVY, color: "#FFFFFF", border: "none",
                      fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    Book Tutoring →
                  </button>
                ) : isWaitlist ? (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setWaitlistOpen({ family: row.family, label: meta.shortLabel, code })}
                      style={{
                        width: "100%", padding: "10px 16px", borderRadius: 10,
                        background: "#F59E0B", color: "#FFFFFF", border: "none",
                        fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      Join Waitlist
                    </button>
                    <button
                      onClick={() => setWaitlistOpen({ family: row.family, label: meta.shortLabel, code })}
                      style={{
                        width: "100%", padding: "9px 16px", borderRadius: 10,
                        background: "#FFFFFF", color: NAVY, border: `1.5px solid ${NAVY}`,
                        fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Upload Syllabus
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {waitlistOpen && (
        <CourseWaitlistModal
          open={!!waitlistOpen}
          onOpenChange={(o) => { if (!o) setWaitlistOpen(null); }}
          campusId={campusId}
          schoolName={schoolName}
          family={waitlistOpen.family}
          familyLabel={waitlistOpen.label}
          courseCode={waitlistOpen.code}
        />
      )}
    </section>
  );
}
