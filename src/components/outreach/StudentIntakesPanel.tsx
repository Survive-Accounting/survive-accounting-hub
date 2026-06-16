// Recent /start student intake submissions with routing filter.
// Read-only admin panel; shows the newest 50 rows.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileText, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Filter = "all" | "bookable_ready" | "bookable_needs_syllabus" | "waitlist_review";

interface IntakeRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  school_name: string | null;
  campus_id: string | null;
  course_family: string | null;
  course_code_or_name: string | null;
  routing_result: string | null;
  syllabus_file_url: string | null;
  created_at: string;
}

async function fetchIntakes(filter: Filter): Promise<IntakeRow[]> {
  let q = (supabase.from("student_intake_submissions" as never) as any)
    .select("id,first_name,last_name,email,school_name,campus_id,course_family,course_code_or_name,routing_result,syllabus_file_url,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (filter !== "all") q = q.eq("routing_result", filter);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as IntakeRow[];
}

const ROUTE_LABEL: Record<string, { label: string; cls: string }> = {
  bookable_ready: { label: "Ready", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  bookable_needs_syllabus: { label: "Needs syllabus", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  waitlist_review: { label: "Waitlist", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  unsupported: { label: "Unsupported", cls: "bg-red-100 text-red-800 border-red-300" },
};

export function StudentIntakesPanel() {
  const [filter, setFilter] = useState<Filter>("all");
  const q = useQuery({
    queryKey: ["student-intakes", filter],
    queryFn: () => fetchIntakes(filter),
    staleTime: 30_000,
  });
  const rows = useMemo(() => q.data ?? [], [q.data]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <GraduationCap className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Recent /start submissions</h2>
        <div className="ml-auto flex gap-1">
          {(["all", "bookable_ready", "bookable_needs_syllabus", "waitlist_review"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className="h-7 px-2 text-[11px]"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : ROUTE_LABEL[f]?.label ?? f}
            </Button>
          ))}
        </div>
      </div>
      <Card className="overflow-hidden">
        {q.isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No submissions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">School</th>
                  <th className="px-3 py-2 text-left">Course</th>
                  <th className="px-3 py-2 text-left">Routing</th>
                  <th className="px-3 py-2 text-left">Syllabus</th>
                  <th className="px-3 py-2 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = r.routing_result ? ROUTE_LABEL[r.routing_result] : null;
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{r.email}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.school_name ?? (r.campus_id ? "(linked campus)" : "—")}</td>
                      <td className="px-3 py-2 text-xs">
                        <div>{r.course_family ?? "—"}</div>
                        <div className="text-muted-foreground">{r.course_code_or_name}</div>
                      </td>
                      <td className="px-3 py-2">
                        {meta ? (
                          <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.syllabus_file_url ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default StudentIntakesPanel;
