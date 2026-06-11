// CEQ data layer — concept-centric. Chapters are a UI proxy; concepts are truth.
import { supabase } from "@/integrations/supabase/client";

export interface CeqChapterInfo {
  id: string;
  chapter_number: number | null;
  chapter_name: string | null;
  course_id: string | null;
}

export async function fetchChapterBySlug(courseSlug: string, chapterNumber: number): Promise<CeqChapterInfo | null> {
  const { data: course } = await supabase
    .from("courses").select("id").eq("slug", courseSlug).maybeSingle();
  if (!course) return null;
  const { data } = await supabase
    .from("chapters")
    .select("id,chapter_number,chapter_name,course_id")
    .eq("course_id", (course as { id: string }).id)
    .eq("chapter_number", chapterNumber)
    .maybeSingle();
  return (data as CeqChapterInfo | null) ?? null;
}

export interface TeachingAssetRow {
  id: string;
  source_ref: string | null;
  source_type: string | null;
  problem_title: string | null;
  problem_context: string | null;
  instruction_list: string | null;
  instructions: string[];
  survive_problem_text: string | null;
  survive_solution_text: string | null;
  is_core: boolean;
  difficulty: string | null;
}

export async function fetchChapterAssets(chapterId: string): Promise<TeachingAssetRow[]> {
  const { data, error } = await supabase
    .from("teaching_assets")
    .select("id,source_ref,source_type,problem_title,problem_context,instruction_list,instruction_1,instruction_2,instruction_3,instruction_4,instruction_5,survive_problem_text,survive_solution_text,is_core,difficulty")
    .eq("chapter_id", chapterId)
    .order("source_ref");
  if (error) throw error;
  return (data ?? []).map((a: any) => ({
    id: a.id,
    source_ref: a.source_ref ?? null,
    source_type: a.source_type ?? null,
    problem_title: a.problem_title ?? null,
    problem_context: a.problem_context ?? null,
    instruction_list: a.instruction_list ?? null,
    instructions: [a.instruction_1, a.instruction_2, a.instruction_3, a.instruction_4, a.instruction_5].filter(
      (x: unknown): x is string => typeof x === "string" && x.trim().length > 0,
    ),
    survive_problem_text: a.survive_problem_text ?? null,
    survive_solution_text: a.survive_solution_text ?? null,
    is_core: a.is_core === true,
    difficulty: a.difficulty ?? null,
  }));
}

export async function setAssetCore(assetId: string, core: boolean): Promise<void> {
  const { error } = await supabase
    .from("teaching_assets").update({ is_core: core } as never).eq("id", assetId);
  if (error) throw error;
}

export interface TutoringNoteRow {
  id: string;
  file_name: string | null;
  ocr_status: string | null;
  page_count: number | null;
  created_at: string;
}

export async function fetchChapterNotes(chapterId: string): Promise<TutoringNoteRow[]> {
  const { data } = await supabase
    .from("ceq_tutoring_notes")
    .select("id,file_name,ocr_status,page_count,created_at")
    .eq("chapter_id", chapterId)
    .order("created_at", { ascending: false });
  return (data ?? []) as TutoringNoteRow[];
}

// ---- Teaching blocks (structured) ----
export type BlockType = "journal_entry" | "formula" | "concept" | "real_world" | "common_mistake";

export interface JeLine {
  account: string;
  side: "debit" | "credit";
  label: string;   // amount placeholder label, e.g. "???" or "cash received"
  tooltip: string; // behind-the-scenes explanation
}

export interface TeachingBlockRow {
  id: string;
  block_type: string;
  title: string | null;
  body: string;
  payload: { lines?: JeLine[]; [k: string]: unknown } | null;
  sort_order: number;
  concept_ids: string[];
}

export async function fetchChapterBlocks(chapterId: string): Promise<TeachingBlockRow[]> {
  const { data, error } = await supabase
    .from("ceq_teaching_blocks")
    .select("id,block_type,title,body,sort_order,payload" as never)
    .eq("chapter_id", chapterId)
    .order("sort_order");
  if (error) throw error;
  const rows = (data ?? []) as any[];
  // Fetch concept tags for all blocks at once
  const ids = rows.map((r) => r.id);
  const tagMap = new Map<string, string[]>();
  if (ids.length) {
    const { data: tags } = await (supabase.from("concept_mappings" as never) as any)
      .select("entity_id,concept_id").eq("entity_type", "teaching_block").in("entity_id", ids);
    for (const t of (tags ?? []) as { entity_id: string; concept_id: string }[]) {
      if (!tagMap.has(t.entity_id)) tagMap.set(t.entity_id, []);
      tagMap.get(t.entity_id)!.push(t.concept_id);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    block_type: r.block_type,
    title: r.title ?? null,
    body: r.body ?? "",
    payload: r.payload ?? null,
    sort_order: r.sort_order ?? 0,
    concept_ids: tagMap.get(r.id) ?? [],
  }));
}

export async function saveTeachingBlock(
  chapterId: string,
  block: { block_type: BlockType; title: string | null; body: string; payload?: unknown },
  conceptIds: string[],
  existingId?: string,
): Promise<void> {
  let blockId = existingId;
  if (existingId) {
    const { error } = await (supabase.from("ceq_teaching_blocks") as any)
      .update({ title: block.title, body: block.body, payload: block.payload ?? null })
      .eq("id", existingId);
    if (error) throw error;
  } else {
    const { data, error } = await (supabase.from("ceq_teaching_blocks") as any)
      .insert({ chapter_id: chapterId, block_type: block.block_type, title: block.title, body: block.body, payload: block.payload ?? null })
      .select("id").single();
    if (error) throw error;
    blockId = (data as { id: string }).id;
  }
  if (!blockId) return;
  // Replace concept tags (first = primary, rest = secondary)
  await (supabase.from("concept_mappings" as never) as any)
    .delete().eq("entity_type", "teaching_block").eq("entity_id", blockId);
  if (conceptIds.length) {
    await (supabase.from("concept_mappings" as never) as any).insert(
      conceptIds.map((cid, i) => ({
        concept_id: cid, entity_type: "teaching_block", entity_id: blockId, role: i === 0 ? "primary" : "secondary",
      })),
    );
  }
}

export async function deleteTeachingBlock(blockId: string): Promise<void> {
  await (supabase.from("concept_mappings" as never) as any)
    .delete().eq("entity_type", "teaching_block").eq("entity_id", blockId);
  const { error } = await supabase.from("ceq_teaching_blocks").delete().eq("id", blockId);
  if (error) throw error;
}

// ---- Concepts ----
export interface ConceptRow {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
}

export async function fetchConcepts(): Promise<ConceptRow[]> {
  const { data, error } = await (supabase.from("concepts" as never) as any)
    .select("id,slug,name,parent_id").order("sort_order");
  if (error) throw error;
  return (data ?? []) as ConceptRow[];
}

// ---- Chart of accounts (for the JE editor type-ahead) ----
export interface CoaRow {
  id: string;
  canonical_name: string;
  account_type: string;
  normal_balance: string;
}

export async function fetchChartOfAccounts(): Promise<CoaRow[]> {
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id,canonical_name,account_type,normal_balance")
    .order("canonical_name");
  if (error) throw error;
  return (data ?? []) as CoaRow[];
}
