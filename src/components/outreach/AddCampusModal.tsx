// Quick "Add Campus" dialog for the Campuses tab.
// Two CTAs: Create Campus, or Create & Run AI Research (kicks off research
// in the existing approval modal automatically).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCampus, findCampusBySlug } from "@/lib/outreach-api";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after a campus is created. `autoResearch` true → caller should open the approval modal and auto-run research. */
  onCreated: (campus: { id: string; slug: string; name: string }, autoResearch: boolean) => void;
};

function slugifyPreview(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function AddCampusModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [website, setWebsite] = useState("");
  const [deptUrl, setDeptUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName(""); setState(""); setWebsite(""); setDeptUrl("");
      setBusy(false); setDupWarning(null);
    }
  }, [open]);

  // Cheap duplicate check on blur of the name field.
  const checkDuplicate = async () => {
    const slug = slugifyPreview(name.trim());
    if (!slug) { setDupWarning(null); return; }
    try {
      const existing = await findCampusBySlug(slug);
      setDupWarning(existing ? `A campus with slug "${slug}" already exists (${existing.name}). A new slug will be generated.` : null);
    } catch { /* non-blocking */ }
  };

  const submit = async (autoResearch: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Campus name is required"); return; }
    setBusy(true);
    try {
      const created = await createCampus({
        name: trimmed,
        state: state || null,
        website_url: website || null,
        accounting_department_url: deptUrl || null,
      });
      toast.success(`Created ${created.name}`);
      onCreated(created, autoResearch);
      onClose();
    } catch (e: any) {
      // Friendlier message if RLS / unique constraint trips.
      const msg = e?.message ?? "Could not create campus";
      // eslint-disable-next-line no-console
      console.error("[createCampus] failed:", e);
      // Try a fallback: surface auth state in case of RLS.
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) toast.error("You must be signed in to add a campus.");
        else toast.error(msg);
      } catch {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Campus</DialogTitle>
          <DialogDescription>
            Create a new campus row. Optionally run AI research right away to
            pre-fill course codes, textbooks, and lead suggestions for review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="campus-name">Campus name <span className="text-destructive">*</span></Label>
            <Input
              id="campus-name"
              autoFocus
              placeholder="University of Southern California"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={checkDuplicate}
              disabled={busy}
            />
            {dupWarning && (
              <p className="text-xs text-amber-600">{dupWarning}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="campus-state">State <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              id="campus-state"
              placeholder="CA"
              maxLength={32}
              value={state}
              onChange={(e) => setState(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="campus-website">Website <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              id="campus-website"
              placeholder="https://www.usc.edu"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="campus-dept">Accounting department URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              id="campus-dept"
              placeholder="https://www.marshall.usc.edu/departments/leventhal-school-of-accounting"
              value={deptUrl}
              onChange={(e) => setDeptUrl(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={() => submit(false)} disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Create Campus
          </Button>
          <Button onClick={() => submit(true)} disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Create & Run AI Research
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
