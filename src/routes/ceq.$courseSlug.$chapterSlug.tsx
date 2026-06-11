// /ceq/:courseSlug/:chapterSlug — the chapter workspace.
// Stage 1 (Resource Bank): star core problems, review notes, grow teaching blocks.
// Stages 2 (Build CEQs / dictation) and 3 (Film) come next pass.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronDown, ChevronRight, Clapperboard, FileText, Library, Loader2, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  fetchChapterAssets, fetchChapterBlocks, fetchChapterBySlug, fetchChapterNotes,
  setAssetCore, type TeachingAssetRow,
} from "@/lib/ceq-api";
import { ResourceBankSection } from "@/components/ceq/ResourceBankSection";

export const Route = createFileRoute("/ceq/$courseSlug/$chapterSlug")({
  component: ChapterWorkspace,
});

const COURSE_TITLES: Record<string, string> = {
  ia1: "Intermediate Accounting 1",
  ia2: "Intermediate Accounting 2",
  intro1: "Intro Accounting 1",
  intro2: "Intro Accounting 2",
};

function ChapterWorkspace() {
  const { courseSlug, chapterSlug } = Route.useParams();
  const chapterNumber = Number(chapterSlug.replace(/^ch/i, ""));
  const qc = useQueryClient();

  const chapterQuery = useQuery({
    queryKey: ["ceq-chapter", courseSlug, chapterNumber],
    queryFn: () => fetchChapterBySlug(courseSlug, chapterNumber),
    retry: 1,
  });
  const chapter = chapterQuery.data;

  const assetsQuery = useQuery({
    queryKey: ["ceq-assets", chapter?.id],
    queryFn: () => fetchChapterAssets(chapter!.id),
    enabled: !!chapter?.id,
  });
  const notesQuery = useQuery({
    queryKey: ["ceq-notes", chapter?.id],
    queryFn: () => fetchChapterNotes(chapter!.id),
    enabled: !!chapter?.id,
  });
  const blocksQuery = useQuery({
    queryKey: ["ceq-blocks", chapter?.id],
    queryFn: () => fetchChapterBlocks(chapter!.id),
    enabled: !!chapter?.id,
  });

  const assets = assetsQuery.data ?? [];
  const notes = notesQuery.data ?? [];
  const blocks = blocksQuery.data ?? [];
  const coreCount = assets.filter((a) => a.is_core).length;

  if (chapterQuery.isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!chapter) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-lg font-bold">Chapter not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          No chapter {chapterNumber} in {COURSE_TITLES[courseSlug] ?? courseSlug}.{" "}
          <Link to="/ceq" className="underline">Back to dashboard</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Link to="/ceq" className="text-xs text-muted-foreground hover:text-foreground">← Dashboard</Link>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">
        Ch {chapter.chapter_number} · {chapter.chapter_name}
      </h1>
      <p className="text-sm text-muted-foreground">
        {COURSE_TITLES[courseSlug] ?? courseSlug} · {assets.length} source problems
      </p>

      {/* Stage pills */}
      <div className="mt-4 flex flex-wrap items-center gap-1 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#14213D] bg-[#14213D]/5 px-3 py-1.5 font-semibold">
          <BookOpen className="h-3.5 w-3.5" /> 1. Resource Bank
          <span className="font-normal text-muted-foreground">{coreCount} core · {notes.length} notes</span>
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-muted-foreground" title="Dictation studio — next build pass">
          <Sparkles className="h-3.5 w-3.5" /> 2. Build CEQs <span className="text-[10px]">(soon)</span>
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-muted-foreground">
          <Clapperboard className="h-3.5 w-3.5" /> 3. Film CEQs
        </span>
      </div>

      <div className="mt-5 space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Teaching Resources</h2>

        {/* Textbook problems */}
        <Collapsible
          icon={<BookOpen className="h-4 w-4" />}
          title="Textbook Problems"
          badge={`${assets.length} problems · ${coreCount} core`}
          defaultOpen
        >
          {assetsQuery.isLoading ? (
            <div className="p-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <ProblemGroups
              assets={assets}
              onToggleCore={async (a) => {
                try {
                  await setAssetCore(a.id, !a.is_core);
                  qc.invalidateQueries({ queryKey: ["ceq-assets", chapter.id] });
                } catch (e: any) { toast.error(e?.message ?? "Failed"); }
              }}
            />
          )}
        </Collapsible>

        {/* Tutoring notes */}
        <Collapsible icon={<FileText className="h-4 w-4" />} title="Tutoring Notes" badge={`${notes.length} notes`}>
          {notes.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No notes yet for this chapter. PDF upload + OCR lands with the dictation studio (next pass) — your
              migrated notes from the old app appear here automatically.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {notes.map((n) => (
                <div key={n.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{n.file_name ?? "Untitled"}</span>
                  {n.page_count != null && <span className="text-muted-foreground">{n.page_count} pages</span>}
                  <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1">{n.ocr_status ?? "—"}</Badge>
                </div>
              ))}
            </div>
          )}
        </Collapsible>

        {/* Resource bank blocks */}
        <Collapsible
          icon={<Library className="h-4 w-4" />}
          title="Resource Bank"
          badge={`${blocks.length} blocks`}
          defaultOpen
        >
          <div className="p-3">
            <ResourceBankSection
              chapterId={chapter.id}
              blocks={blocks}
              onChanged={() => qc.invalidateQueries({ queryKey: ["ceq-blocks", chapter.id] })}
            />
          </div>
        </Collapsible>
      </div>
    </div>
  );
}

function Collapsible({ icon, title, badge, defaultOpen, children }: {
  icon: React.ReactNode; title: string; badge: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30">
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition", !open && "-rotate-90")} />
        {icon}
        <span className="text-sm font-semibold">{title}</span>
        <Badge variant="outline" className="ml-auto text-[10px] h-5 px-1.5">{badge}</Badge>
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  );
}

function ProblemGroups({ assets, onToggleCore }: {
  assets: TeachingAssetRow[];
  onToggleCore: (a: TeachingAssetRow) => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, TeachingAssetRow[]>();
    for (const a of assets) {
      const key = a.source_type ?? "Problems";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    }
    return Array.from(m.entries());
  }, [assets]);

  return (
    <div>
      {groups.map(([type, items]) => (
        <ProblemGroup key={type} type={type} items={items} onToggleCore={onToggleCore} />
      ))}
    </div>
  );
}

function ProblemGroup({ type, items, onToggleCore }: {
  type: string; items: TeachingAssetRow[]; onToggleCore: (a: TeachingAssetRow) => void;
}) {
  const [open, setOpen] = useState(true);
  const core = items.filter((i) => i.is_core).length;
  return (
    <div className="border-b border-border last:border-0">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 bg-muted/30 px-3 py-1.5 text-left">
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition", !open && "-rotate-90")} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{type}</span>
        <span className="text-[10px] text-muted-foreground">· {items.length}</span>
        <Badge className={cn("ml-auto text-[9px] h-4 px-1", core > 0 ? "bg-[#14213D]" : "bg-muted text-muted-foreground")}>
          {core} core
        </Badge>
      </button>
      {open && items.map((a) => <ProblemRow key={a.id} a={a} onToggleCore={() => onToggleCore(a)} />)}
    </div>
  );
}

function ProblemRow({ a, onToggleCore }: { a: TeachingAssetRow; onToggleCore: () => void }) {
  const [showSolution, setShowSolution] = useState(false);
  return (
    <div className="border-t border-border/50 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <button onClick={onToggleCore} title={a.is_core ? "Core — click to unstar" : "Mark as core (CEQ source material)"}>
          <Star className={cn("mt-0.5 h-4 w-4 transition", a.is_core ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 hover:text-amber-400")} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold">{a.source_ref}</span>
            {a.problem_title && <span className="text-xs text-muted-foreground">{a.problem_title}</span>}
            {a.difficulty && <Badge variant="outline" className="text-[9px] h-4 px-1">{a.difficulty}</Badge>}
          </div>
          {(a.survive_problem_text || a.problem_context) && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/90">
              {a.survive_problem_text ?? a.problem_context}
            </p>
          )}
          {a.instructions.length > 0 && (
            <ol className="mt-1 space-y-0.5">
              {a.instructions.map((ins, i) => (
                <li key={i} className="flex gap-1.5 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">{i + 1}.</span> <span>{ins}</span>
                </li>
              ))}
            </ol>
          )}
          {a.survive_solution_text && (
            <>
              <button onClick={() => setShowSolution((s) => !s)} className="mt-1 text-[11px] text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
                {showSolution ? "Hide explanation" : "Show explanation"}
              </button>
              {showSolution && (
                <pre className="mt-1 whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">{a.survive_solution_text}</pre>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
