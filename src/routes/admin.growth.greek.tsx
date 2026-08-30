// /admin/growth/greek — the one-time Greek classification pass. Flashcard flow over the
// biggest 'unknown' markets: three buttons (Strong / Present / None) with 1/2/3 keyboard
// shortcuts, auto-advancing. Top ~30 covers tranches 1-2; the tail rides the 0.7 default.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { growthGreekUnknowns, growthSetGreekStatus } from "@/lib/growth-tranche.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/greek")({
  component: GreekClassifyPage,
});

const CHOICES = [
  { key: "strong", label: "Strong", hint: "Large, active IFC/Panhellenic system", tone: "bg-emerald-600" },
  { key: "present", label: "Present", hint: "A Greek system exists", tone: "bg-primary" },
  { key: "none", label: "None", hint: "No meaningful Greek presence (Baruch, most commuter)", tone: "bg-muted-foreground/70" },
] as const;

function GreekClassifyPage() {
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(0);
  const q = useQuery({ queryKey: ["greek-unknowns"], queryFn: () => growthGreekUnknowns({ data: { limit: 40 } }) });
  const set = useMutation({
    mutationFn: (v: { campusId: string; status: "strong" | "present" | "none" }) =>
      growthSetGreekStatus({ data: v }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const items = q.data?.items ?? [];
  const current = items[idx];

  const classify = (status: "strong" | "present" | "none") => {
    if (!current) return;
    set.mutate({ campusId: current.campusId, status });
    setDone((d) => d + 1);
    setIdx((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1") classify("strong");
      else if (e.key === "2") classify("present");
      else if (e.key === "3") classify("none");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-primary" />
        <h1 className="sa-admin-display text-lg font-semibold uppercase tracking-wide">
          Classify Greek presence
        </h1>
        <span className="ml-auto text-xs text-muted-foreground">{done} classified</span>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Biggest unknown markets first. Keys <kbd className="rounded border border-border px-1">1</kbd>{" "}
        Strong · <kbd className="rounded border border-border px-1">2</kbd> Present ·{" "}
        <kbd className="rounded border border-border px-1">3</kbd> None. The tail can stay unknown —
        the 0.7 multiplier handles it.
      </p>

      {q.isLoading ? (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : !current ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-8 text-center">
          <Check className="mx-auto mb-2 size-6 text-emerald-400" />
          <div className="text-sm font-semibold">Top markets classified.</div>
          <div className="text-[12px] text-muted-foreground">
            {done} done. The rest ride the 0.7 unknown multiplier.
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            {idx + 1} of {items.length}
          </div>
          <div className="sa-admin-display text-xl font-semibold">{current.name}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-[12px] text-muted-foreground">
            {current.state && <span>{current.state}</span>}
            {current.courseCode && <span>· {current.courseCode}</span>}
            <span>· ~{(current.seats ?? 0).toLocaleString()} seats/yr</span>
            <span>· {current.campusStatus}</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {CHOICES.map((c, i) => (
              <button
                key={c.key}
                onClick={() => classify(c.key)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg px-3 py-3 text-white",
                  c.tone,
                )}
              >
                <span className="text-sm font-semibold">
                  {i + 1} · {c.label}
                </span>
                <span className="text-center text-[10px] opacity-90">{c.hint}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setIdx((i) => i + 1)}
            className="mt-3 w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
          >
            Skip — leave unknown
          </button>
        </div>
      )}
    </div>
  );
}
