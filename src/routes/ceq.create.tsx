import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell, PageHeader } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/ceq/create")({
  head: () => ({ meta: [{ title: "New CEQ — Survive Accounting" }] }),
  component: CreateCeq,
});

function CreateCeq() {
  return (
    <AdminShell>
      <PageHeader
        title="Create CEQ"
        description="Draft a new conceptual exam question."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/ceq">Cancel</Link>
            </Button>
            <Button>Save draft</Button>
          </>
        }
      />
      <div className="p-6 sm:p-10 max-w-3xl">
        <Card>
          <CardContent className="space-y-5 py-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" placeholder="e.g. Recognizing revenue under ASC 606" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic">Topic</Label>
              <Input id="topic" placeholder="Financial Accounting" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea id="prompt" rows={6} placeholder="Write the question prompt…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="solution">Worked solution</Label>
              <Textarea id="solution" rows={6} placeholder="Step-by-step solution…" />
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
