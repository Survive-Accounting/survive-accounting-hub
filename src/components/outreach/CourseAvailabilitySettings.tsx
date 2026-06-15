// Admin: global course-family availability defaults.
// Lee uses this to flip whole course families on/off each semester.
// Per-campus overrides still win when set in ApproveCampusModal.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  COURSE_FAMILIES,
  getCourseFamilyDefaults,
  updateCourseFamilyDefault,
  type CourseFamily,
  type TutoringAvailability,
} from "@/lib/outreach-api";

const OPTIONS: { value: TutoringAvailability; label: string; className: string }[] = [
  { value: "available", label: "Available", className: "bg-emerald-600 text-white border-emerald-600" },
  { value: "waitlist", label: "Waitlist", className: "bg-amber-500 text-white border-amber-500" },
  { value: "unavailable", label: "Unavailable", className: "bg-muted text-muted-foreground border-border" },
];

export function CourseAvailabilitySettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["course-family-defaults"],
    queryFn: getCourseFamilyDefaults,
    retry: 1,
  });

  const onChange = async (family: CourseFamily, value: TutoringAvailability) => {
    try {
      await updateCourseFamilyDefault(family, value);
      qc.invalidateQueries({ queryKey: ["course-family-defaults"] });
      toast.success(`Default updated — ${family.replace("_", " ")} → ${value}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  };

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <GraduationCap className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Course Availability — Global Defaults</h2>
        <span className="text-[11px] text-muted-foreground">
          Applies to every campus. Per-campus overrides still win when set.
        </span>
        {isLoading && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="divide-y divide-border">
        {COURSE_FAMILIES.map((f) => {
          const current = data?.[f.key];
          return (
            <div key={f.key} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-[200px] text-sm font-medium">{f.label}</div>
              <div className="ml-auto inline-flex rounded-md border border-border p-0.5">
                {OPTIONS.map((opt) => {
                  const active = current === opt.value;
                  return (
                    <Button
                      key={opt.value}
                      size="sm"
                      variant="ghost"
                      disabled={isLoading || !data}
                      onClick={() => onChange(f.key, opt.value)}
                      className={`h-7 rounded text-xs font-medium ${
                        active ? opt.className : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default CourseAvailabilitySettings;
