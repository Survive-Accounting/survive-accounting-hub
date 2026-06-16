// Data layer for the Campus Lead Stats panel. Pulls the minimum
// columns from campus_lead_suggestions and campus_course_sections,
// paginated to bypass PostgREST's 1000-row default.
import { supabase } from "@/integrations/supabase/client";

const PAGE = 1000;

export interface RawLeadRow {
  id: string;
  campus_id: string;
  confidence: number | null;
  is_phd: boolean;
  is_cpa: boolean;
  status: string | null;
  teaches_intro_1: boolean;
  teaches_intro_2: boolean;
  teaches_intermediate_1: boolean;
  teaches_intermediate_2: boolean;
  created_at: string;
}

export interface RawSectionRow {
  id: string;
  campus_id: string;
  course_family: string | null;
  term: string | null;
  created_at: string;
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // Safety cap at 50k rows.
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase
      .from(table as never)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export async function fetchLeadStatsRaw(): Promise<{
  leads: RawLeadRow[];
  sections: RawSectionRow[];
}> {
  const [leads, sections] = await Promise.all([
    fetchAll<RawLeadRow>(
      "campus_lead_suggestions",
      "id,campus_id,confidence,is_phd,is_cpa,status,teaches_intro_1,teaches_intro_2,teaches_intermediate_1,teaches_intermediate_2,created_at",
    ),
    fetchAll<RawSectionRow>(
      "campus_course_sections",
      "id,campus_id,course_family,term,created_at",
    ),
  ]);
  return { leads, sections };
}
