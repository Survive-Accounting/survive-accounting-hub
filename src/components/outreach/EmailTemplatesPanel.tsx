import { Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type VariantStatus = "active" | "inactive" | "empty";

const INITIAL_VARIANTS: { label: string; status: VariantStatus }[] = [
  { label: "Default", status: "active" },
  { label: "If PhD", status: "empty" },
  { label: "If only Intro 1 textbook match", status: "empty" },
  { label: "If only Intro 2 textbook match", status: "empty" },
  { label: "If only Intermediate textbook match", status: "empty" },
  { label: "If only Intermediate 2 textbook match", status: "empty" },
];

export function EmailTemplatesPanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 p-6 text-center">
        <div className="text-xl font-semibold">🚧 Email scheduling tools coming this week</div>
        <div className="mt-1 text-sm text-muted-foreground">
          For now, manage your template drafts below.
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <h2 className="text-sm font-semibold">Email Templates</h2>
        </div>
        <div className="space-y-6 p-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="text-sm font-semibold">Initial Email</div>
              <div className="text-[11px] text-muted-foreground">
                — click a version to open its draft
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {INITIAL_VARIANTS.map((v) => (
                <button
                  key={v.label}
                  type="button"
                  className={cn(
                    "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                    v.status === "active"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  <span className="font-medium">{v.label}</span>
                  {v.status === "active" ? (
                    <Badge className="text-[10px] px-1.5 py-0">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {v.status === "inactive" ? "Inactive" : "Empty"}
                    </Badge>
                  )}
                  <Pencil className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
