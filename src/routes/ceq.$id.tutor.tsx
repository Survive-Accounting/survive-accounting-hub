import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell, PageHeader } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/ceq/$id/tutor")({
  head: () => ({ meta: [{ title: "Tutor mode — Survive Accounting" }] }),
  component: TutorCeq,
});

function TutorCeq() {
  const { id } = Route.useParams();
  return (
    <AdminShell>
      <PageHeader
        title="Tutor mode"
        description={`Walk a student through CEQ #${id} step by step.`}
        actions={
          <Button variant="outline" asChild>
            <Link to="/ceq">Exit</Link>
          </Button>
        }
      />
      <div className="p-6 sm:p-10 max-w-3xl space-y-4">
        <Card>
          <CardContent className="py-8 space-y-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Question
            </div>
            <p className="font-display text-2xl leading-snug">
              Placeholder CEQ prompt #{id} — this will be loaded from the content engine.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground border-2 border-dashed rounded-md flex flex-col items-center gap-3">
            <GraduationCap className="size-6" />
            Tutor chat interface coming soon.
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
