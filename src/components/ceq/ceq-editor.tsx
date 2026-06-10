import { Link } from "@tanstack/react-router";
import { Save, Copy, Trash2, Play, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Mode = "create" | "edit";

const CEQ_TYPES = [
  { value: "short_answer", label: "Short Answer" },
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "journal_entry", label: "Journal Entry" },
  { value: "t_account", label: "T-Account" },
  { value: "computation", label: "Computation" },
];

const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const STATUSES = [
  { value: "drafted", label: "Drafted" },
  { value: "approved", label: "Approved" },
  { value: "ready_to_tutor", label: "Ready to Tutor" },
  { value: "ready_to_film", label: "Ready to Film" },
  { value: "published", label: "Published" },
];

const EXISTING_CEQS = [
  { id: "v1", title: "Variant — same numbers", status: "drafted" },
  { id: "v2", title: "Variant — harder", status: "approved" },
];

export function CeqEditor({ mode, ceqId }: { mode: Mode; ceqId?: string }) {
  const headerTitle =
    mode === "edit"
      ? `Edit CEQ${ceqId ? ` · #${ceqId}` : ""}`
      : "New CEQ";

  return (
    <div className="p-6 sm:p-10 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/ceq"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-1 font-mono text-lg font-semibold">{headerTitle}</h1>
          <p className="text-xs text-muted-foreground">
            ACCT 201 · Ch 3 · Source problem BE3-4
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <Button variant="outline" size="sm">
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/ceq/$id/tutor" params={{ id: ceqId ?? "new" }}>
              <Play className="h-3.5 w-3.5" /> Tutor mode
            </Link>
          </Button>
          <Button size="sm">
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* LEFT — Textbook source */}
        <Card className="p-4 h-fit lg:sticky lg:top-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Textbook Source
          </h2>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Instruction
              </div>
              <p className="whitespace-pre-wrap">
                On December 31, the company has earned $1,200 of service revenue
                that has not yet been billed. Prepare the adjusting journal
                entry.
              </p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Solution
              </div>
              <p className="whitespace-pre-wrap font-mono text-xs">
                Dr. Accounts Receivable      1,200{"\n"}
                {"   "}Cr. Service Revenue         1,200
              </p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                JE Block
              </div>
              <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
{`Date | Account              | Dr     | Cr
12/31| Accounts Receivable  | 1,200  |
     | Service Revenue      |        | 1,200`}
              </pre>
            </div>
          </div>
        </Card>

        {/* RIGHT — CEQ form */}
        <div className="space-y-4">
          {/* Existing CEQs switcher */}
          <Card className="p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Existing CEQs for this problem
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button className="rounded border border-primary bg-primary/10 px-2 py-1 text-xs">
                + New
              </button>
              {EXISTING_CEQS.map((c) => (
                <button
                  key={c.id}
                  className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {c.title} · {c.status}
                </button>
              ))}
            </div>
          </Card>

          {/* Metadata */}
          <Card className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select defaultValue="short_answer">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CEQ_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Difficulty</Label>
                <Select defaultValue="medium">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select defaultValue="drafted">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Concept tags</Label>
                <Input placeholder="accruals, revenue recognition" />
              </div>
            </div>

            <div>
              <Label>Title (optional)</Label>
              <Input placeholder="Short title for this CEQ" />
            </div>
          </Card>

          {/* Prompt + solution */}
          <Card className="space-y-3 p-4">
            <div>
              <Label>Draft instruction (internal)</Label>
              <Textarea
                rows={3}
                placeholder="Notes to yourself about how this CEQ should teach…"
              />
            </div>
            <div>
              <Label>Student prompt</Label>
              <Textarea rows={5} placeholder="What the student sees…" />
            </div>
            <div>
              <Label>Answer</Label>
              <Textarea
                rows={3}
                className="font-mono text-sm"
                placeholder="Final answer…"
              />
            </div>
            <div>
              <Label>Explanation</Label>
              <Textarea
                rows={4}
                className="font-mono text-sm"
                placeholder="Worked explanation…"
              />
            </div>
          </Card>

          {/* Teaching blocks */}
          <Card className="space-y-4 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Teaching Blocks
            </div>

            <BlockToggle label="Formula block" defaultChecked={false}>
              <Textarea rows={3} placeholder="Formula(s) used…" />
            </BlockToggle>

            <BlockToggle label="Journal Entry block" defaultChecked={true}>
              <Textarea
                rows={4}
                className="font-mono text-sm"
                placeholder={`Dr. Account            X\n   Cr. Account            X`}
              />
            </BlockToggle>

            <BlockToggle label="T-Account block" defaultChecked={false}>
              <Textarea
                rows={4}
                className="font-mono text-sm"
                placeholder="T-account layout…"
              />
            </BlockToggle>

            <BlockToggle label="Teaching script" defaultChecked={true}>
              <Textarea rows={4} placeholder="How Lee would walk through this on camera…" />
            </BlockToggle>

            <BlockToggle label="Common mistake" defaultChecked={false}>
              <Textarea rows={3} placeholder="What students typically get wrong…" />
            </BlockToggle>

            <BlockToggle label="Student-friendly explanation" defaultChecked={false}>
              <Textarea rows={3} placeholder="Plain-English re-explanation…" />
            </BlockToggle>
          </Card>

          {/* Variants */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Spin off variants
              </div>
              <Badge variant="outline" className="text-[10px]">
                Coming soon
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                "Same concept, different numbers",
                "Same concept, different CEQ type",
                "Adjacent concept",
                "Harder version",
                "Easier version",
              ].map((label) => (
                <label
                  key={label}
                  className="flex items-center gap-1.5 rounded border border-border px-2 py-1"
                >
                  <Checkbox defaultChecked />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <Button variant="outline" size="sm" disabled>
              <Wand2 className="h-3.5 w-3.5" /> Generate variants
            </Button>
          </Card>

          {/* Admin notes */}
          <Card className="p-4">
            <Label>Admin notes</Label>
            <Textarea rows={3} placeholder="Internal notes only — never shown to students." />
          </Card>
        </div>
      </div>
    </div>
  );
}

function BlockToggle({
  label,
  defaultChecked,
  children,
}: {
  label: string;
  defaultChecked: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded border border-border bg-muted/20 p-3">
      <label className="flex items-center gap-2 text-xs font-medium">
        <Checkbox defaultChecked={defaultChecked} />
        <span>Include {label.toLowerCase()}</span>
      </label>
      {children}
    </div>
  );
}
