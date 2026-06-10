import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { CeqEditor } from "@/components/ceq/ceq-editor";

export const Route = createFileRoute("/ceq/create")({
  head: () => ({ meta: [{ title: "New CEQ — Survive Accounting" }] }),
  component: CreateCeq,
});

function CreateCeq() {
  return (
    <AdminShell>
      <CeqEditor mode="create" />
    </AdminShell>
  );
}
