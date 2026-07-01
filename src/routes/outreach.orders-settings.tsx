// /outreach/orders-settings — "Edit Student Flow". Lets Lee edit every piece of
// copy the student sees at /order, grouped in flow order. Saves override the
// singleton order_flow_copy row; /order reads it live (blank = falls back to the
// built-in default). Renders inside the AdminGate /outreach shell.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getOrderCopy, updateOrderCopy, DEFAULT_ORDER_COPY, COPY_FIELDS, type OrderCopy,
} from "@/lib/order-copy.functions";

export const Route = createFileRoute("/outreach/orders-settings")({
  head: () => ({ meta: [{ title: "Request settings — Survive Accounting" }] }),
  component: RequestSettings,
});

function RequestSettings() {
  const getFn = useServerFn(getOrderCopy);
  const saveFn = useServerFn(updateOrderCopy);
  const q = useQuery({ queryKey: ["order-flow-copy"], queryFn: () => getFn() });

  const [draft, setDraft] = useState<OrderCopy>({ ...DEFAULT_ORDER_COPY });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (q.data) setDraft({ ...DEFAULT_ORDER_COPY, ...q.data }); }, [q.data]);

  const saved = q.data ?? DEFAULT_ORDER_COPY;
  const dirty = COPY_FIELDS.some((f) => (draft[f.key] ?? "") !== (saved[f.key] ?? DEFAULT_ORDER_COPY[f.key] ?? ""));

  // Group the (already flow-ordered) fields.
  const groups = useMemo(() => {
    const out: { name: string; fields: typeof COPY_FIELDS }[] = [];
    for (const f of COPY_FIELDS) {
      let g = out[out.length - 1];
      if (!g || g.name !== f.group) { g = { name: f.group, fields: [] }; out.push(g); }
      g.fields.push(f);
    }
    return out;
  }, []);

  const set = (key: string, v: string) => setDraft((d) => ({ ...d, [key]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await saveFn({ data: { copy: draft } });
      toast.success("Saved — live on /order now.");
      await q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const resetAll = () => setDraft({ ...DEFAULT_ORDER_COPY });

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <div className="sticky top-12 z-10 -mx-6 mb-5 flex flex-wrap items-center gap-3 border-b bg-background/95 px-6 py-3 backdrop-blur">
        <div>
          <h1 className="text-lg font-semibold">Edit Student Flow</h1>
          <p className="text-xs text-muted-foreground">The copy students see at <span className="font-mono">/order</span>. Blank fields use the default.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a href="/order" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            Open /order <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={resetAll} title="Reset every field to the built-in default">
            <RotateCcw className="h-3.5 w-3.5" /> Reset all
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…</> : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="py-16 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.name}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{g.name}</h2>
              <div className="space-y-4">
                {g.fields.map((f) => {
                  const value = draft[f.key] ?? "";
                  const isDefault = value === (DEFAULT_ORDER_COPY[f.key] ?? "");
                  return (
                    <div key={f.key}>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">{f.label}</label>
                        {!isDefault && (
                          <button type="button" className="text-[11px] text-muted-foreground underline hover:text-foreground"
                            onClick={() => set(f.key, DEFAULT_ORDER_COPY[f.key] ?? "")}>
                            reset to default
                          </button>
                        )}
                      </div>
                      {f.multiline ? (
                        <textarea rows={3} value={value} onChange={(e) => set(f.key, e.target.value)}
                          className="w-full rounded-md border border-input bg-background p-2 text-sm" />
                      ) : (
                        <Input value={value} onChange={(e) => set(f.key, e.target.value)} className="text-sm" />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
