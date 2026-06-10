import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Edit, Copy, Maximize2, Minimize2 } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ceq/$id/tutor")({
  head: () => ({ meta: [{ title: "Tutor Mode — Survive Accounting" }] }),
  component: TutorCeq,
});

type BlockKey =
  | "answer"
  | "explanation"
  | "formula"
  | "je"
  | "t_account"
  | "script"
  | "mistake"
  | "student_explanation";

const DEFAULT_VISIBLE: Record<BlockKey, boolean> = {
  answer: false,
  explanation: false,
  formula: false,
  je: false,
  t_account: false,
  script: true,
  mistake: false,
  student_explanation: false,
};

// Placeholder CEQ
const CEQ = {
  type: "Journal Entry",
  difficulty: "Medium",
  status: "Ready to Tutor",
  source: "BE3-4",
  title: "Adjusting entry for accrued service revenue",
  prompt:
    "On December 31, the company has earned $1,200 of service revenue that has not yet been billed. Prepare the adjusting journal entry on December 31.",
  answer: "Dr. Accounts Receivable 1,200 / Cr. Service Revenue 1,200",
  explanation:
    "Under accrual accounting, revenue is recognized when earned, regardless of when cash is received. Since the service has been performed, revenue must be recorded and a receivable established for the unbilled amount.",
  formula: "Adjusting entry = Earned revenue not yet recorded → Dr A/R, Cr Revenue",
  je: `Date  | Account              | Dr     | Cr
12/31 | Accounts Receivable  | 1,200  |
      | Service Revenue      |        | 1,200`,
  t_account: `Accounts Receivable        Service Revenue
   1,200 |                             |   1,200`,
  script:
    "Walk the student through WHEN revenue is earned vs. billed. Emphasize the accrual principle. Then build the JE one line at a time — pause and ask which account increases.",
  mistake:
    "Students often credit Cash instead of Service Revenue, or skip the entry entirely because no invoice was sent.",
  student_explanation:
    "You did the work — so you earned the money. Even if you haven't sent the invoice yet, the books need to show it.",
  include: {
    formula: true,
    je: true,
    t_account: false,
    script: true,
    mistake: true,
    student_explanation: true,
  },
};

function TutorCeq() {
  const { id } = Route.useParams();
  const [visible, setVisible] = useState<Record<BlockKey, boolean>>(DEFAULT_VISIBLE);
  const [focus, setFocus] = useState(false);

  const toggle = (k: BlockKey) =>
    setVisible((v) => ({ ...v, [k]: !v[k] }));
  const showAll = () =>
    setVisible({
      answer: true,
      explanation: true,
      formula: true,
      je: true,
      t_account: true,
      script: true,
      mistake: true,
      student_explanation: true,
    });
  const hideAll = () => setVisible({ ...DEFAULT_VISIBLE, script: false });

  const content = (
    <div className={cn("mx-auto space-y-4", focus ? "max-w-4xl text-lg" : "max-w-3xl")}>
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{CEQ.type}</Badge>
          <Badge variant="outline">{CEQ.difficulty}</Badge>
          <Badge variant="outline">{CEQ.status}</Badge>
          <span className="font-mono text-xs text-muted-foreground">
            from {CEQ.source}
          </span>
        </div>
        <h1 className={cn("font-bold", focus ? "text-3xl" : "text-2xl")}>
          {CEQ.title}
        </h1>
      </div>

      <Section title="Student Prompt">
        <p className="whitespace-pre-wrap">{CEQ.prompt}</p>
      </Section>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => toggle("answer")}>
          {visible.answer ? "Hide" : "Show"} Answer
        </Button>
        <Button size="sm" variant="outline" onClick={() => toggle("explanation")}>
          {visible.explanation ? "Hide" : "Show"} Explanation
        </Button>
        <Button size="sm" variant="ghost" onClick={showAll}>
          Show All Blocks
        </Button>
        <Button size="sm" variant="ghost" onClick={hideAll}>
          Hide All Blocks
        </Button>
      </div>

      {visible.answer && (
        <Section title="Answer">
          <p className="whitespace-pre-wrap font-mono text-sm">{CEQ.answer}</p>
        </Section>
      )}
      {visible.explanation && (
        <Section title="Explanation">
          <p className="whitespace-pre-wrap font-mono text-sm">{CEQ.explanation}</p>
        </Section>
      )}

      {CEQ.include.formula && (
        <BlockCard label="Formula" k="formula" visible={visible.formula} toggle={toggle}>
          <pre className="whitespace-pre-wrap font-mono text-sm">{CEQ.formula}</pre>
        </BlockCard>
      )}
      {CEQ.include.je && (
        <BlockCard label="Journal Entry" k="je" visible={visible.je} toggle={toggle}>
          <pre className="whitespace-pre-wrap font-mono text-sm">{CEQ.je}</pre>
        </BlockCard>
      )}
      {CEQ.include.t_account && (
        <BlockCard label="T-Accounts" k="t_account" visible={visible.t_account} toggle={toggle}>
          <pre className="whitespace-pre-wrap font-mono text-sm">{CEQ.t_account}</pre>
        </BlockCard>
      )}
      {CEQ.include.script && (
        <BlockCard label="Teaching Script" k="script" visible={visible.script} toggle={toggle}>
          <p className="whitespace-pre-wrap">{CEQ.script}</p>
        </BlockCard>
      )}
      {CEQ.include.mistake && (
        <BlockCard label="Common Mistake" k="mistake" visible={visible.mistake} toggle={toggle}>
          <p className="whitespace-pre-wrap">{CEQ.mistake}</p>
        </BlockCard>
      )}
      {CEQ.include.student_explanation && (
        <BlockCard
          label="Student Explanation"
          k="student_explanation"
          visible={visible.student_explanation}
          toggle={toggle}
        >
          <p className="whitespace-pre-wrap">{CEQ.student_explanation}</p>
        </BlockCard>
      )}
    </div>
  );

  const topBar = (
    <div className="mb-4 flex items-center justify-between">
      <Link to="/ceq">
        <Button size="sm" variant="ghost">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </Link>
      <div className="flex items-center gap-2">
        <Link to="/ceq/$id/edit" params={{ id }}>
          <Button size="sm" variant="outline">
            <Edit className="h-3.5 w-3.5" /> Edit
          </Button>
        </Link>
        <Button size="sm" variant="outline">
          <Copy className="h-3.5 w-3.5" /> Duplicate
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setFocus((f) => !f)}>
          {focus ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
          {focus ? "Exit Focus" : "Focus Mode"}
        </Button>
      </div>
    </div>
  );

  if (focus) {
    return (
      <div className="min-h-screen bg-background p-6">
        {topBar}
        {content}
      </div>
    );
  }
  return (
    <AdminShell>
      <div className="p-6 sm:p-10">
        {topBar}
        {content}
      </div>
    </AdminShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </Card>
  );
}

function BlockCard({
  label,
  k,
  visible,
  toggle,
  children,
}: {
  label: string;
  k: BlockKey;
  visible: boolean;
  toggle: (k: BlockKey) => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <button
        onClick={() => toggle(k)}
        className="mb-2 flex w-full items-center justify-between text-left"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">
          {visible ? "Hide" : "Show"}
        </span>
      </button>
      {visible && children}
    </Card>
  );
}
