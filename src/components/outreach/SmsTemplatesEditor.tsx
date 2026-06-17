// SMS template editor — operator-editable copy for the auto-replies and the
// summary texts Lee receives. Tokens shown beneath each field are the only
// placeholders the webhook expands.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { fetchSmsTemplates, updateSmsTemplate, type SmsTemplate } from "@/lib/outreach-api";

const TOKENS_BY_KEY: Record<string, string[]> = {
  lee_new_summary: ["{ref}", "{campus}", "{tester_flag}", "{from}", "{body}"],
  lee_followup_summary: ["{ref}", "{campus}", "{tester_flag}", "{body}", "{facts}"],
};

export function SmsTemplatesEditor() {
  const qc = useQueryClient();
  const tplQuery = useQuery({ queryKey: ["sms-templates"], queryFn: fetchSmsTemplates });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const serverBodiesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!tplQuery.data) return;
    const previousServerBodies = serverBodiesRef.current;
    const latestServerBodies: Record<string, string> = {};
    for (const t of tplQuery.data) latestServerBodies[t.key] = t.body;
    // Keep drafts in sync with server-side template changes, but don't wipe an
    // in-progress local edit that differs from the last server value we saw.
    setDrafts((prev) => {
      const next = { ...prev };
      for (const t of tplQuery.data!) {
        if (next[t.key] === undefined || next[t.key] === previousServerBodies[t.key]) next[t.key] = t.body;
      }
      return next;
    });
    serverBodiesRef.current = latestServerBodies;
  }, [tplQuery.data]);

  const isDirty = (t: SmsTemplate) => (drafts[t.key] ?? t.body) !== t.body;

  const save = async (t: SmsTemplate) => {
    const next = drafts[t.key];
    if (next == null || next === t.body) return;
    setSavingKey(t.key);
    const res = await updateSmsTemplate(t.key, next);
    setSavingKey(null);
    if (res.ok) {
      toast.success(`Saved ${t.label}`);
      qc.invalidateQueries({ queryKey: ["sms-templates"] });
    } else toast.error(res.error ?? "Save failed");
  };

  const reset = (t: SmsTemplate) => setDrafts((d) => ({ ...d, [t.key]: t.body }));

  if (tplQuery.isLoading) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto h-4 w-4 animate-spin" /> Loading templates…
      </Card>
    );
  }
  if (tplQuery.error) {
    return <Card className="p-6 text-sm text-destructive">Failed to load templates.</Card>;
  }

  return (
    <div className="space-y-3">
      {(tplQuery.data ?? []).map((t) => {
        const value = drafts[t.key] ?? t.body;
        const tokens = TOKENS_BY_KEY[t.key];
        const dirty = isDirty(t);
        return (
          <Card key={t.key} className="p-3 gap-2">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="text-sm font-semibold">{t.label}</div>
                {t.description && (
                  <p className="text-[11px] text-muted-foreground">{t.description}</p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {value.length} chars · {Math.ceil(value.length / 160)} SMS segment{Math.ceil(value.length / 160) === 1 ? "" : "s"}
              </span>
            </div>
            <Textarea
              rows={Math.max(4, Math.min(12, value.split("\n").length + 1))}
              value={value}
              onChange={(e) => setDrafts((d) => ({ ...d, [t.key]: e.target.value }))}
              className="text-xs font-mono"
            />
            <div className="flex flex-wrap items-center gap-2">
              {tokens && (
                <span className="text-[10px] text-muted-foreground">
                  Tokens: {tokens.map((tok) => (
                    <code key={tok} className="mx-0.5 rounded bg-muted px-1 py-0.5">{tok}</code>
                  ))}
                </span>
              )}
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => reset(t)} disabled={!dirty}>
                  <RotateCcw className="h-3 w-3" /> Revert
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={() => save(t)} disabled={!dirty || savingKey === t.key}>
                  {savingKey === t.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default SmsTemplatesEditor;
