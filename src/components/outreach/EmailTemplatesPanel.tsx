// Ported from the original app (ProfessorOutreach.tsx — TemplatesPanel + TemplateFormDialog).
// Templates are held in memory until Supabase is wired.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Send } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  MOCK_TEMPLATES,
  TEMPLATE_KIND_META,
  TEMPLATE_KIND_ORDER,
  TEMPLATE_VARIANT_LABEL,
  TEMPLATE_VARIANT_ORDER,
  type EmailTemplate,
  type TemplateKind,
  type TemplateVariant,
} from "@/lib/outreach-mock";
import { fetchTemplates, saveTemplateDb, sendTestEmail, TEST_RECIPIENTS } from "@/lib/outreach-api";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function EmailTemplatesPanel() {
  const qc = useQueryClient();
  const templatesQuery = useQuery({ queryKey: ["outreach-templates"], queryFn: fetchTemplates, retry: 1 });
  const usingMock = templatesQuery.isError;
  const [localTemplates, setLocalTemplates] = useState<EmailTemplate[]>(MOCK_TEMPLATES);
  const templates = usingMock ? localTemplates : (templatesQuery.data ?? []);
  const setTemplates = setLocalTemplates;
  const [editing, setEditing] = useState<{ kind: TemplateKind; variant: TemplateVariant; template?: EmailTemplate } | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<TemplateKind, Map<TemplateVariant, EmailTemplate>>();
    for (const t of templates) {
      if (!m.has(t.kind)) m.set(t.kind, new Map());
      const inner = m.get(t.kind)!;
      const existing = inner.get(t.variant);
      if (!existing || (t.is_active && !existing.is_active)) inner.set(t.variant, t);
    }
    return m;
  }, [templates]);

  const handleSave = (payload: Omit<EmailTemplate, "id">, existingId?: string) => {
    if (!usingMock) {
      saveTemplateDb(payload, existingId)
        .then(() => {
          qc.invalidateQueries({ queryKey: ["outreach-templates"] });
          toast.success("Saved");
        })
        .catch((e) => toast.error(`Save failed: ${e?.message ?? "unknown error"}`));
      setEditing(null);
      return;
    }
    setTemplates((prev) => {
      let next = prev;
      if (payload.is_active) {
        next = next.map((t) =>
          t.kind === payload.kind && t.variant === payload.variant && t.id !== existingId
            ? { ...t, is_active: false }
            : t,
        );
      }
      if (existingId) {
        next = next.map((t) => (t.id === existingId ? { ...t, ...payload } : t));
      } else {
        next = [...next, { ...payload, id: `local-${Date.now()}` }];
      }
      return next;
    });
    toast.success("Saved");
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 p-6 text-center">
        <div className="text-xl font-semibold">🚧 Email scheduling tools coming this week</div>
        <div className="mt-1 text-sm text-muted-foreground">For now, manage your template drafts below.</div>
      </div>
      <Card className="overflow-hidden py-0 gap-0">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <h2 className="text-sm font-semibold">Email Templates</h2>
        </div>
        <div className="space-y-6 p-3">
          {TEMPLATE_KIND_ORDER.map((kind) => {
            const meta = TEMPLATE_KIND_META[kind];
            const variantMap = grouped.get(kind) ?? new Map<TemplateVariant, EmailTemplate>();
            return (
              <div key={kind}>
                <div className="mb-2 flex items-center gap-2">
                  <div className="text-sm font-semibold">{meta.label}</div>
                  <div className="text-[11px] text-muted-foreground">— click a version to open its draft</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_VARIANT_ORDER.map((variant) => {
                    const t = variantMap.get(variant);
                    const active = !!t?.is_active;
                    return (
                      <button
                        key={variant}
                        type="button"
                        onClick={() => setEditing({ kind, variant, template: t })}
                        className={cn(
                          "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-muted/60",
                        )}
                        title={t ? "Open draft" : "Create draft"}
                      >
                        <span className="font-medium">{TEMPLATE_VARIANT_LABEL[variant]}</span>
                        {active ? (
                          <Badge className="text-[10px] px-1.5 py-0">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t ? "Inactive" : "Empty"}</Badge>
                        )}
                        <Pencil className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <TemplateFormDialog
          open={!!editing}
          kind={editing?.kind ?? "initial"}
          variant={editing?.variant ?? "default"}
          template={editing?.template}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      </Card>
    </div>
  );
}

function TemplateFormDialog({
  open, kind, variant, template, onClose, onSave,
}: {
  open: boolean;
  kind: TemplateKind;
  variant: TemplateVariant;
  template?: EmailTemplate;
  onClose: () => void;
  onSave: (payload: Omit<EmailTemplate, "id">, existingId?: string) => void;
}) {
  const meta = TEMPLATE_KIND_META[kind];
  const variantLabel = TEMPLATE_VARIANT_LABEL[variant];
  const buildDefaults = (): Partial<EmailTemplate> => ({
    name: `${meta.label} — ${variantLabel}`,
    subject: "", body: "", is_locked: true, is_active: true, kind, variant,
  });
  const [form, setForm] = useState<Partial<EmailTemplate>>(template ?? buildDefaults());
  const [testTo, setTestTo] = useState<string>(TEST_RECIPIENTS[0]);
  const [testSending, setTestSending] = useState(false);

  const sendTest = async () => {
    const subject = (form.subject ?? "").trim();
    const bodyText = (form.body ?? "").trim();
    if (!subject || !bodyText) { toast.error("Add a subject and body first"); return; }
    setTestSending(true);
    const res = await sendTestEmail(testTo, subject, bodyText);
    setTestSending(false);
    if (res.ok) toast.success(`Test sent to ${testTo} — check the inbox (and spam folder)`);
    else toast.error(res.error ?? "Test send failed");
  };

  useEffect(() => {
    if (!open) return;
    setForm(template ?? buildDefaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id, kind, variant]);

  const save = () => {
    const subject = (form.subject ?? "").trim();
    if (!subject) { toast.error("Subject required"); return; }
    onSave(
      {
        name: (form.name ?? `${meta.label} — ${variantLabel}`).trim(),
        subject,
        body: form.body ?? "",
        is_locked: !!form.is_locked,
        is_active: !!form.is_active,
        kind,
        variant,
      },
      template?.id,
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit — {meta.label} · {variantLabel}</DialogTitle>
          <DialogDescription>
            Merge tags: <code>{"{first name}"}</code> ("Dr. Lastname" for PhDs), <code>{"{program}"}</code> (e.g. "Patterson School of Accountancy"), <code>{"{courses}"}</code> (e.g. "ACCY 201 and ACCY 303"), <code>{"{phone}"}</code> (the campus texting number — sends fail safely if the campus has none), <code>{"{surviveaccounting.com}"}</code> (the professor's personalized landing link).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Subject"><Input value={form.subject ?? ""} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
          <Field label="Body"><Textarea rows={12} className="font-mono text-xs" value={form.body ?? ""} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={!!form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} id="active" />
              <Label htmlFor="active" className="text-xs">Active (used when this step fires)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={!!form.is_locked} onCheckedChange={(v) => setForm({ ...form, is_locked: v })} id="lock" />
              <Label htmlFor="lock" className="text-xs">Locked (VAs cannot edit body when sending)</Label>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2.5">
          <span className="text-xs font-medium text-muted-foreground">Send test email to</span>
          <Select value={testTo} onValueChange={setTestTo}>
            <SelectTrigger className="h-8 w-[240px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TEST_RECIPIENTS.map((e) => (
                <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={sendTest} disabled={testSending} className="h-8">
            {testSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send test
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Sends this draft as-is (saved or not) with sample merge values, subject prefixed [TEST].
          </span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EmailTemplatesPanel;
