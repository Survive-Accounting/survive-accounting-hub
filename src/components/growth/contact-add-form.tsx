// The one-at-a-time contact form, shared by the Enrichment page and the sending Schedule so the two
// never drift. `AddForm` is presentational (a controlled draft + callbacks); Enrichment wires it to
// its queue, and `ContactAddForm` is the self-contained wrapper the Schedule drops inline on a gap
// or an existing org — same fields, same "switching type clears everything" rule, saved without
// leaving the page.
import { useState } from "react";
import { Recycle, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { growthSaveCampusContacts } from "@/lib/growth-tranche.functions";
import { cn } from "@/lib/utils";

// Just the fields the form reads/writes. The Enrichment page's richer Row type is a structural
// superset, so it can be passed straight in.
export interface ContactDraft {
  label: string;
  isPerson: boolean;
  notFound: boolean;
  isRoleAccount: boolean;
  roleAcctTouched: boolean;
  name: string;
  role: string;
  email: string;
  instagram: string;
}
export const emptyDraft = (o: Partial<ContactDraft> = {}): ContactDraft => ({
  label: o.label ?? "", isPerson: o.isPerson ?? false, notFound: o.notFound ?? false,
  isRoleAccount: o.isRoleAccount ?? false, roleAcctTouched: o.roleAcctTouched ?? false,
  name: o.name ?? "", role: o.role ?? "", email: o.email ?? "", instagram: o.instagram ?? "",
});

// Emails whose local part looks like a rotating position, not a person.
const ROLE_LOCALPART = /^(president|pres|vp|vicepresident|treasurer|scholarship|academic|ifc|panhellenic|panhel|nphc|mgc|recruitment|rush|info|contact|secretary|exec|board|greeklife|fsl|chapter)/;
export const suggestRoleAccount = (email: string) => {
  const lp = (email.split("@")[0] ?? "").toLowerCase().replace(/[._+-]/g, "");
  return !!lp && ROLE_LOCALPART.test(lp);
};
// Typing/pasting a bare handle auto-gets an @; a handle that already has @ or is a full URL is left alone.
export const atHandle = (v: string) => (v && !v.startsWith("@") && !/^https?:|instagram\.com/i.test(v) ? `@${v}` : v);

// Prefilled role chips — order is priority. Scholarship chair first: chapter GPA is their job.
export const ROLE_CHIPS = ["Scholarship / Academic Chair", "President", "Vice President", "Treasurer"];

const rowHasContent = (d: ContactDraft) => !!(d.name.trim() || d.email.trim() || d.instagram.trim() || d.role.trim());
const modeLabel = (m: "org" | "person" | "notfound") => (m === "person" ? "Person" : m === "org" ? "Organization" : "Not found");

// The presentational form. Org / Person / Not found. The parent owns the draft and decides what Add
// does (queue vs. save now).
export function AddForm({ draft, editing, notFoundPending, onChange, onSwitch, onAdd, onCancel, onMarkNotFound }: {
  draft: ContactDraft; editing: boolean; notFoundPending?: boolean;
  onChange: (p: Partial<ContactDraft>) => void; onSwitch: (m: "org" | "person" | "notfound") => void;
  onAdd: () => void; onCancel: () => void; onMarkNotFound: () => void;
}) {
  const mode: "org" | "person" | "notfound" = draft.notFound ? "notfound" : draft.isPerson ? "person" : "org";
  const person = mode === "person";
  const onEmail = (email: string) => {
    const patch: Partial<ContactDraft> = { email };
    if (!draft.roleAcctTouched) patch.isRoleAccount = suggestRoleAccount(email); // auto-suggest until manually set
    onChange(patch);
  };
  const canAdd = !!(draft.name.trim() || draft.email.trim() || draft.instagram.trim());
  return (
    <div className="rounded-md border border-primary/40 bg-card p-2">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="inline-flex overflow-hidden rounded border border-border text-[10px]">
          <button type="button" onClick={() => onSwitch("org")} className={cn("px-2 py-0.5", mode === "org" ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Organization</button>
          <button type="button" onClick={() => onSwitch("person")} className={cn("px-2 py-0.5", mode === "person" ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Person</button>
          <button type="button" onClick={() => onSwitch("notfound")} className={cn("px-2 py-0.5", mode === "notfound" ? "bg-amber-500/15 text-amber-500" : "text-muted-foreground")}>Not found</button>
        </div>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground/60">{editing ? "editing" : "new"}</span>
        <button type="button" onClick={onCancel} title="Cancel" className="ml-auto text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
      </div>

      {mode === "notfound" ? (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">Nothing turned up for <strong className="text-foreground">{draft.label || "this organization"}</strong>. Mark it not found so it stops showing as a gap. You can undo it later.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onMarkNotFound} disabled={notFoundPending} className="rounded-md bg-amber-500/90 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40">{notFoundPending ? "Saving…" : "Yes, not found"}</button>
            <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1 text-[11px] text-muted-foreground">Cancel</button>
          </div>
        </div>
      ) : person ? (
        <>
          <div className="mb-1.5 flex flex-wrap gap-1">
            {ROLE_CHIPS.map((role, i) => (
              <button key={role} type="button" onClick={() => onChange({ role })} className={cn("rounded-full border px-2 py-0.5 text-[10px]", draft.role === role ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted", i === 0 && draft.role !== role && "border-primary/40")}>
                {role}
              </button>
            ))}
          </div>
          {/* Instagram sits beside name, above email — a personal IG is the highest-value field. */}
          <div className="mb-1.5 grid grid-cols-2 gap-1.5">
            <input autoFocus value={draft.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Name" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
            <input value={draft.instagram} onChange={(e) => onChange({ instagram: atHandle(e.target.value) })} placeholder="@personal IG" className="rounded border border-pink-500/30 bg-background px-2 py-1 text-[11px]" />
          </div>
          <input value={draft.role} onChange={(e) => onChange({ role: e.target.value })} placeholder="Role (or pick a chip above)" className="mb-1.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px]" />
          <input value={draft.email} onChange={(e) => onEmail(e.target.value)} placeholder="Email" className="w-full rounded border border-border bg-background px-2 py-1 text-[11px]" />
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px]">
            <label className="inline-flex items-center gap-1 text-muted-foreground" title="This is a role/position account (president@…) that turns over each year — recheck it each semester">
              <input type="checkbox" checked={draft.isRoleAccount} onChange={(e) => onChange({ isRoleAccount: e.target.checked, roleAcctTouched: true })} />
              <Recycle className="size-3" /> role account
            </label>
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={onCancel} className="rounded border border-border px-2.5 py-0.5 text-muted-foreground hover:bg-muted">Cancel</button>
              <button type="button" onClick={onAdd} disabled={!canAdd} title={canAdd ? undefined : "Add a name, email, or Instagram first"} className="rounded bg-primary px-3 py-0.5 font-semibold text-primary-foreground disabled:opacity-40">{editing ? "Update" : "Add"}</button>
            </div>
          </div>
        </>
      ) : (
        // Organization: email + Instagram only. No name, no role chips, no role-account box.
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <input autoFocus value={draft.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="Email" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
            <input value={draft.instagram} onChange={(e) => onChange({ instagram: atHandle(e.target.value) })} placeholder="@org IG" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
          </div>
          <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px]">
            <button type="button" onClick={onCancel} className="rounded border border-border px-2.5 py-0.5 text-muted-foreground hover:bg-muted">Cancel</button>
            <button type="button" onClick={onAdd} disabled={!canAdd} title={canAdd ? undefined : "Add an email or Instagram first"} className="rounded bg-primary px-3 py-0.5 font-semibold text-primary-foreground disabled:opacity-40">{editing ? "Update" : "Add"}</button>
          </div>
        </>
      )}
    </div>
  );
}

// Self-contained: owns one draft, switches type (clearing every field so nothing bleeds across),
// and saves the single contact (or a not-found marker) straight to the campus. Used by the Schedule.
export function ContactAddForm({ campusId, orgKey, orgLabel, onSaved, onCancel }: {
  campusId: string; orgKey: string; orgLabel: string; onSaved: () => void; onCancel: () => void;
}) {
  const [k, rest] = orgKey.split(":");
  const kind = (k === "council" ? "council" : k === "chapter" ? "chapter" : "club") as "council" | "chapter" | "club";
  const [draft, setDraft] = useState<ContactDraft>(() => emptyDraft({ label: orgLabel }));
  const onChange = (patch: Partial<ContactDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const switchMode = (mode: "org" | "person" | "notfound") => {
    const cur = draft.notFound ? "notfound" : draft.isPerson ? "person" : "org";
    if (cur === mode) return;
    if (rowHasContent(draft) && !window.confirm(`Switch to ${modeLabel(mode)}? This clears what you've typed.`)) return;
    setDraft(emptyDraft({ label: orgLabel, isPerson: mode === "person", notFound: mode === "notfound" }));
  };
  const contact = (notFound: boolean) => ({
    kind, entityId: kind === "council" ? null : rest, councilType: kind === "council" ? rest : null,
    newClubName: null, newClubCategory: kind === "club" ? "women_in_business" : null,
    isPerson: draft.isPerson, notFound, isRoleAccount: draft.isRoleAccount, igRoleAccount: false,
    name: notFound ? null : draft.name || null, role: notFound ? null : draft.role || null,
    email: notFound ? null : draft.email || null, instagram: notFound ? null : draft.instagram || null,
  });
  const save = useMutation({
    mutationFn: () => growthSaveCampusContacts({ data: { campusId, contacts: [contact(false)] } }),
    onSuccess: (r) => { if (r.saved > 0) { toast.success("Contact added."); onSaved(); } else toast.error(r.errors?.[0] ?? "Nothing saved — add an email or Instagram."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
  const notFoundMut = useMutation({
    mutationFn: () => growthSaveCampusContacts({ data: { campusId, contacts: [contact(true)] } }),
    onSuccess: () => { toast.success("Marked not found."); onSaved(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
  const markNotFound = () => { if (window.confirm(`Mark ${orgLabel} as not found?\n\nNothing turned up for it. It stops appearing as a gap — you can undo this later.`)) notFoundMut.mutate(); };
  return (
    <div className="mt-1.5">
      <AddForm draft={draft} editing={false} notFoundPending={notFoundMut.isPending} onChange={onChange} onSwitch={switchMode} onAdd={() => save.mutate()} onCancel={onCancel} onMarkNotFound={markNotFound} />
    </div>
  );
}
