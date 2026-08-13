// READ-ONLY invariant check (map resolution layer). For Ole Miss (mapped campus) and Tennessee
// (unmapped), the RESOLVER's Exam-1 output (topic ids + order) must equal the PRE-CHANGE landing
// computation (campus map rows → default_exam_units). Prints both and diffs.
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const OLE_MISS = "7b92a320-b196-43f2-a241-77a0805816fe";
const examNum = (name: string) => { const d = (name.match(/\d+/) ?? [])[0]; if (d) return parseInt(d, 10); return /final|review/i.test(name) ? 99 : 999; };

// --- OLD path (what the landing did before this change) ---------------------------------------
async function oldExam1(campusId: string | null): Promise<string[]> {
  if (campusId) {
    const { data: ce } = await db.from("campus_exams").select("id,name,status").eq("campus_id", campusId).eq("status", "active");
    const active = (ce ?? []).filter((e: any) => examNum(e.name) === 1);
    if (active.length) {
      const { data: t } = await db.from("campus_exam_topics").select("chapter_id,position").eq("campus_exam_id", active[0].id).order("position");
      if (t?.length) return t.map((r: any) => r.chapter_id);
    }
    if ((ce ?? []).length) return []; // mapped campus, no exam 1
  }
  const { data: du } = await db.from("default_exam_units").select("unit_id,sort_order").eq("exam_number", 1).order("sort_order");
  return (du ?? []).map((r: any) => r.unit_id);
}

// --- NEW path (the resolver's semantics: professor → campus → starter → legacy default) --------
async function examsAtLevel(courseId: string, campusId: string | null, professorId: string | null) {
  let q = db.from("campus_exams").select("id,name,status").eq("course_id", courseId).eq("status", "active");
  q = campusId ? q.eq("campus_id", campusId) : q.is("campus_id", null);
  q = professorId ? q.eq("professor_id", professorId) : q.is("professor_id", null);
  const { data, error } = await q;
  if (error) throw error;
  return data?.length ? data : null;
}
async function resolverExam1(campusId: string | null): Promise<{ level: string; ids: string[] }> {
  const { data: cs } = await db.from("courses").select("id").eq("course_family", "intro_1").limit(1);
  const courseId = cs?.[0]?.id;
  let exams: any[] | null = null; let level = "none";
  try {
    if (campusId) { exams = await examsAtLevel(courseId, campusId, null); if (exams) level = "campus"; }
    if (!exams) { exams = await examsAtLevel(courseId, null, null); if (exams) level = "starter"; }
  } catch {
    // pre-0113: professor_id column missing → campus rows the old way
    if (campusId) {
      const { data: ce } = await db.from("campus_exams").select("id,name,status").eq("course_id", courseId).eq("campus_id", campusId).eq("status", "active");
      if (ce?.length) { exams = ce; level = "campus"; }
    }
  }
  if (exams) {
    const e1 = exams.find((e: any) => examNum(e.name) === 1);
    if (e1) {
      const { data: t } = await db.from("campus_exam_topics").select("chapter_id,position").eq("campus_exam_id", e1.id).order("position");
      return { level, ids: (t ?? []).map((r: any) => r.chapter_id) };
    }
    return { level, ids: [] };
  }
  const { data: du } = await db.from("default_exam_units").select("unit_id,sort_order").eq("exam_number", 1).order("sort_order");
  return { level: "starter(legacy)", ids: (du ?? []).map((r: any) => r.unit_id) };
}

// --- run ---------------------------------------------------------------------------------------
const { data: tn } = await db.from("campuses").select("id,name").ilike("name", "%tennessee%").limit(3);
const tennessee = (tn ?? []).find((c: any) => /university of tennessee/i.test(c.name)) ?? tn?.[0] ?? null;

const { data: names } = await db.from("chapters").select("id,chapter_name");
const nameOf = (id: string) => (names ?? []).find((c: any) => c.id === id)?.chapter_name ?? id.slice(0, 8);

for (const [label, campusId] of [["Ole Miss", OLE_MISS], ["Tennessee (unmapped)", tennessee?.id ?? null]] as [string, string | null][]) {
  const before = await oldExam1(campusId);
  const after = await resolverExam1(campusId);
  const same = JSON.stringify(before) === JSON.stringify(after.ids);
  console.log(`\n=== ${label} — Exam 1 ===`);
  console.log(`  OLD path : [${before.map(nameOf).join(" · ")}]`);
  console.log(`  RESOLVER : [${after.ids.map(nameOf).join(" · ")}]  (level: ${after.level})`);
  console.log(`  ${same ? "✓ IDENTICAL" : "✗ DIFF — " + JSON.stringify({ before, after: after.ids })}`);
}
console.log("\n=== done ===");
