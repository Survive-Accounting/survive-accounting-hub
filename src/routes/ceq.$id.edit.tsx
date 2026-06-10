import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell, PageHeader } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/ceq/$id/edit")({
  head: () => ({ meta: [{ title: "Edit CEQ — Survive Accounting" }] }),
  component: EditCeq,
});

function EditCeq() {
  const { id } = Route.useParams();
  return (
    <AdminShell>
      <PageHeader
        title={`Edit CEQ #${id}`}
        description="Update this conceptual exam question."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/ceq">Back</Link>
            </Button>
            <Button>Save changes</Button>
          </>
        }
      />
      <div className="p-6 sm:p-10 max-w-3xl">
        <Card>
          <CardContent className="space-y-5 py-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" defaultValue={`CEQ ${id}`} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic">Topic</Label>
              <Input id="topic" defaultValue="Financial Accounting" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea id="prompt" rows={6} defaultValue="" placeholder="Question prompt…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="solution">Worked solution</Label>
              <Textarea id="solution" rows={6} defaultValue="" placeholder="Solution…" />
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
