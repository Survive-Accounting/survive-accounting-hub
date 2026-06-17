// SMS template editor — operator-editable copy for the auto-replies and the
// summary texts Lee receives. Tokens shown beneath each field are the only
// placeholders the webhook expands.
//
// Resilience:
//  - Drafts are persisted to localStorage, so a refresh or accidental nav
//    never loses unsaved work.
//  - Drafts auto-save 1.2s after you stop typing (and on blur).
//  - Background refetches NEVER overwrite an in-progress edit.
//  - We warn before unload if anything is dirty.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { fetchSmsTemplates, updateSmsTemplate, type SmsTemplate } from "@/lib/outreach-api";

const TOKENS_BY_KEY: Record<string, string[]> = {
  lee_new_summary: ["{ref}", "{campus}", "{tester_flag}", "{from}", "{body}"],
  lee_followup_summary: ["{ref}", "{campus}", "{tester_flag}", "{body}", "{facts}"],
};

const DRAFT_STORAGE_KEY = "sa-sms-template-drafts-v1";
const AUTOSAVE_DELAY_MS = 1200;

function loadStoredDrafts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function persistDrafts(drafts: Record<string, string>) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    /* ignore quota */
  }
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function SmsTemplatesEditor() {
  const qc = useQueryClient();
  const tplQuery = useQuery({
    queryKey: ["sms-templates"],
    queryFn: fetchSmsTemplates,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60_000,
  });

  const [drafts, setDrafts] = useState<Record<string, string>>(() => loadStoredDrafts());
  const [statusByKey, setStatusByKey] = useState<Record<string, SaveStatus>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  // Sync server template bodies into drafts ONLY for keys the user hasn't
  // touched. Once a key has a local draft, we never overwrite it from the
  // server — the user can click "Revert" to discard.
  useEffect(() => {
    if (!tplQuery.data) return;
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const t of tplQuery.data!) {
        if (next[t.key] === undefined) {
          next[t.key] = t.body;
          changed = true;
        }
      }
      if (changed) persistDrafts(next);
      return changed ? next : prev;
    });
  }, [tplQuery.data]);

  const setDraft = useCallback((key: string, value: string) => {
    setDrafts((prev) => {
      const next = { ...prev, [key]: value };
      persistDrafts(next);
      return next;
    });
    setStatusByKey((s) => (s[key] === "idle" ? s : { ...s, [key]: "idle" }));
  }, []);

  const save = useCallback(
    async (t: SmsTemplate, opts?: { silent?: boolean }) => {
      const next = draftsRef.current[t.key];
      if (next == null || next === t.body) return;
      setStatusByKey((s) => ({ ...s, [t.key]: "saving" }));
      const res = await updateSmsTemplate(t.key, next);
      if (res.ok) {
        setStatusByKey((s) => ({ ...s, [t.key]: "saved" }));
        if (!opts?.silent) toast.success(`Saved ${t.label}`);
        // Update cache without triggering a refetch that could race with
        // further edits.
        qc.setQueryData<SmsTemplate[]>(["sms-templates"], (prev) =>
          prev?.map((row) => (row.key === t.key ? { ...row, body: next } : row)),
        );
        // Drop saved value from persisted drafts (it now matches server).
        setDrafts((prev) => {
          const copy = { ...prev };
          delete copy[t.key];
          persistDrafts(copy);
          // Re-seed from server so the textarea stays populated.
          copy[t.key] = next;
          return copy;
        });
      } else {
        setStatusByKey((s) => ({ ...s, [t.key]: "error" }));
        toast.error(res.error ?? "Save failed");
      }
    },
    [qc],
  );

  // Per-key autosave timers.
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scheduleAutosave = useCallback(
    (t: SmsTemplate) => {
      const existing = timersRef.current[t.key];
      if (existing) clearTimeout(existing);
      timersRef.current[t.key] = setTimeout(() => {
        void save(t, { silent: true });
      }, AUTOSAVE_DELAY_MS);
    },
    [save],
  );

  // Flush timers on unmount.
  useEffect(() => {
    return () => {
      for (const id of Object.values(timersRef.current)) clearTimeout(id);
    };
  }, []);

  // Warn before unload if anything is dirty.
  const anyDirty = useMemo(() => {
    if (!tplQuery.data) return false;
    return tplQuery.data.some((t) => {
      const d = drafts[t.key];
      return d != null && d !== t.body;
    });
  }, [drafts, tplQuery.data]);

  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  const reset = useCallback(
    (t: SmsTemplate) => {
      const existing = timersRef.current[t.key];
      if (existing) clearTimeout(existing);
      setDrafts((prev) => {
        const next = { ...prev, [t.key]: t.body };
        persistDrafts(next);
        return next;
      });
      setStatusByKey((s) => ({ ...s, [t.key]: "idle" }));
    },
    [],
  );

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
        const dirty = value !== t.body;
        const status = statusByKey[t.key] ?? "idle";
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
                {value.length} chars · {Math.ceil(value.length / 160)} SMS segment
                {Math.ceil(value.length / 160) === 1 ? "" : "s"}
              </span>
            </div>
            <Textarea
              rows={6}
              value={value}
              onChange={(e) => {
                setDraft(t.key, e.target.value);
                scheduleAutosave(t);
              }}
              onBlur={() => {
                if (dirty) {
                  const existing = timersRef.current[t.key];
                  if (existing) clearTimeout(existing);
                  void save(t, { silent: true });
                }
              }}
              className="text-xs font-mono min-h-[6rem]"
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center gap-2">
              {tokens && (
                <span className="text-[10px] text-muted-foreground">
                  Tokens:{" "}
                  {tokens.map((tok) => (
                    <code key={tok} className="mx-0.5 rounded bg-muted px-1 py-0.5">
                      {tok}
                    </code>
                  ))}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <SaveStatusBadge status={status} dirty={dirty} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => reset(t)}
                  disabled={!dirty}
                >
                  <RotateCcw className="h-3 w-3" /> Revert
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => save(t)}
                  disabled={!dirty || status === "saving"}
                >
                  {status === "saving" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
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

function SaveStatusBadge({ status, dirty }: { status: SaveStatus; dirty: boolean }) {
  if (status === "saving")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  if (dirty)
    return <span className="text-[10px] text-amber-700">Unsaved changes</span>;
  if (status === "saved")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700">
        <Check className="h-3 w-3" /> Saved
      </span>
    );
  return null;
}

export default SmsTemplatesEditor;
