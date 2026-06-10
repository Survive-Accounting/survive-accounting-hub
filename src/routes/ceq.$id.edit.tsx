import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { CeqEditor } from "@/components/ceq/ceq-editor";

export const Route = createFileRoute("/ceq/$id/edit")({
  head: () => ({ meta: [{ title: "Edit CEQ — Survive Accounting" }] }),
  component: EditCeq,
});

function EditCeq() {
  const { id } = Route.useParams();
  return (
    <AdminShell>
      <CeqEditor mode="edit" ceqId={id} />
    </AdminShell>
  );
}
