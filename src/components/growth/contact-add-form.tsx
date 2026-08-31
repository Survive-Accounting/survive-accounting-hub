// The one-at-a-time contact form, shared by the Enrichment page and the sending Schedule so the two
// never drift. `AddForm` is presentational (a controlled draft + callbacks); Enrichment wires it to
// its queue, and `ContactAddForm` is the self-contained wrapper the Schedule drops inline on a gap
// or an existing org — same fields, same "switching type clears everything" rule, saved without
// leaving the page.
import { useRef, useState } from "react";
import { Check, Recycle, Search, X } from "lucide-react";
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
// Which chip a free-text role maps to (for the guided stepper's "done" ticks). VP is checked before
// President so "Vice President" doesn't register as President.
export const roleChipOf = (role: string | null | undefined): string | null => {
  const r = role || "";
  if (/scholar|academ/i.test(r)) return "Scholarship / Academic Chair";
  if (/vice\s*president|\bvp\b/i.test(r)) return "Vice President";
  if (/president|\bpres\b/i.test(r)) return "President";
  if (/treasur/i.test(r)) return "Treasurer";
  return null;
};

const rowHasContent = (d: ContactDraft) => !!(d.name.trim() || d.email.trim() || d.instagram.trim() || d.role.trim());
const modeLabel = (m: "org" | "person" | "notfound") => (m === "person" ? "Person" : m === "org" ? "Organization" : "Not found");

// The presentational form. Org / Person / Not found. The parent owns the draft and decides what Add
// does (queue vs. save now).
export function AddForm({ draft, editing, notFoundPending, coveredRoles, campusName, onChange, onSwitch, onAdd, onCancel, onMarkNotFound }: {
  draft: ContactDraft; editing: boolean; notFoundPending?: boolean; coveredRoles?: string[]; campusName?: string;
  onChange: (p: Partial<ContactDraft>) => void; onSwitch: (m: "org" | "person" | "notfound") => void;
  onAdd: (patch?: Partial<ContactDraft>) => void; onCancel: () => void; onMarkNotFound: () => void;
}) {
  const mode: "org" | "person" | "notfound" = draft.notFound ? "notfound" : draft.isPerson ? "person" : "org";
  const person = mode === "person";
  // Item 2: the search is built around a PERSON. Without a name it just returns the org — a different
  // search — so clicking it empty warns and focuses the name instead of running the wrong query.
  const nameRef = useRef<HTMLInputElement>(null);
  const [searchWarn, setSearchWarn] = useState(false);
  const runPersonSearch = () => {
    if (!draft.name.trim()) { setSearchWarn(true); nameRef.current?.focus(); return; }
    const q = `"${draft.name.trim()}" "${campusName ?? ""}" ${draft.label} ${draft.role}`.replace(/\s+/g, " ").trim();
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer");
  };
  const onEmail = (email: string) => {
    const patch: Partial<ContactDraft> = { email };
    if (!draft.roleAcctTouched) patch.isRoleAccount = suggestRoleAccount(email); // auto-suggest until manually set
    onChange(patch);
  };
  const canAdd = !!(draft.name.trim() || draft.email.trim() || draft.instagram.trim());
  // Role-account gate (item 3): a president@ email on a PERSON belongs to the position, not them, and
  // rotates every year. If it looks like one and hasn't been resolved, force the choice before adding.
  const [confirmRole, setConfirmRole] = useState(false);
  const roleEmailUnresolved = person && !!draft.email.trim() && suggestRoleAccount(draft.email) && !draft.roleAcctTouched;
  const clickAdd = () => { if (roleEmailUnresolved) { setConfirmRole(true); return; } onAdd(); };
  const resolveRole = (isRole: boolean) => { setConfirmRole(false); onAdd({ isRoleAccount: isRole, roleAcctTouched: true }); };
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
          {coveredRoles ? (
            // Guided progression: the four roles as a sequence — done ones ticked, the active one lit,
            // the rest waiting. Clicking any jumps there; it's a map of what's left, not a hard order.
            <div className="mb-1.5">
              <div className="flex items-stretch gap-0.5">
                {ROLE_CHIPS.map((role, i) => {
                  const done = coveredRoles.includes(role);
                  const active = roleChipOf(draft.role) === role || draft.role === role;
                  const short = role.replace(" / Academic Chair", " Chair").replace("Vice President", "VP");
                  return (
                    <button key={role} type="button" onClick={() => onChange({ role })}
                      className={cn("flex flex-1 items-center justify-center gap-1 rounded border px-1.5 py-1 text-[9.5px] font-medium transition-all duration-200",
                        active ? "scale-[1.03] border-primary bg-primary/20 text-primary shadow-sm"
                          : done ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                            : "border-border text-muted-foreground hover:bg-muted")}
                      title={done ? `${role} — on file` : active ? `${role} — you're here` : role}>
                      {done ? <Check className="size-2.5 shrink-0" /> : <span className={cn("grid size-3.5 shrink-0 place-items-center rounded-full text-[7px]", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{i + 1}</span>}
                      <span className="truncate">{short}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-0.5 text-center text-[8.5px] uppercase tracking-wide text-muted-foreground/70">
                {coveredRoles.length}/{ROLE_CHIPS.length} on file · {roleChipOf(draft.role) ?? "pick a role"} {roleChipOf(draft.role) ? "← you're here" : ""}
              </div>
            </div>
          ) : (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {ROLE_CHIPS.map((role, i) => (
                <button key={role} type="button" onClick={() => onChange({ role })} className={cn("rounded-full border px-2 py-0.5 text-[10px]", draft.role === role ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted", i === 0 && draft.role !== role && "border-primary/40")}>
                  {role}
                </button>
              ))}
            </div>
          )}
          {/* Instagram sits beside name — a personal IG is the highest-value field, so it's called out
              and kept handle-narrow (a handle is ~15 chars; a wide box invites a paragraph). */}
          <div className="mb-0.5 grid grid-cols-[1fr_150px] gap-1.5">
            <div>
              <div className="mb-0.5 flex items-center gap-1.5">
                <label className="text-[9px] text-muted-foreground">Their name</label>
                {campusName !== undefined && (
                  <button type="button" onClick={runPersonSearch} title="Search Google for this person by name, role and campus" className="inline-flex items-center gap-0.5 rounded border border-border px-1 py-px text-[8.5px] text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Search className="size-2.5" /> Search
                  </button>
                )}
              </div>
              <input ref={nameRef} autoFocus value={draft.name} onChange={(e) => { onChange({ name: e.target.value }); if (searchWarn) setSearchWarn(false); }} placeholder="First Last" className={cn("w-full rounded border bg-background px-2 py-1 text-[11px]", searchWarn ? "border-amber-500" : "border-border")} />
              {searchWarn && <p className="mt-0.5 text-[8.5px] text-amber-500">⚠ Enter a first name first — the search looks for a specific person.</p>}
            </div>
            <div>
              <label className="mb-0.5 block text-[9px] text-pink-400">Their personal Instagram</label>
              <input value={draft.instagram} onChange={(e) => onChange({ instagram: atHandle(e.target.value) })} placeholder="@username" className="w-full rounded border border-pink-500/40 bg-background px-2 py-1 text-[11px]" />
            </div>
          </div>
          <p className="mb-1.5 text-[9px] text-muted-foreground">@username — <span className="text-foreground/80">not</span> the chapter account. <span className="font-medium text-pink-400/90">This is the most valuable thing on this page.</span></p>
          <label className="mb-0.5 block text-[9px] text-muted-foreground">Their position</label>
          <input value={draft.role} onChange={(e) => onChange({ role: e.target.value })} placeholder="e.g. Scholarship Chair (or pick a chip above)" className="mb-1.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px]" />
          <label className="mb-0.5 block text-[9px] text-muted-foreground">Their email <span className="text-muted-foreground/60">— personal if you can find it</span></label>
          <input value={draft.email} onChange={(e) => onEmail(e.target.value)} placeholder="name@school.edu" className="w-full rounded border border-border bg-background px-2 py-1 text-[11px]" />
          {confirmRole ? (
            <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/[0.06] p-2">
              <p className="text-[11px] text-foreground"><span className="font-mono text-amber-300">{draft.email.trim()}</span> looks like a role account.</p>
              <p className="mt-1 text-[10px] text-muted-foreground">It belongs to the position, not the person, and will change next semester.</p>
              <div className="mt-2 flex items-center gap-1.5">
                <button type="button" onClick={() => resolveRole(true)} className="rounded-md bg-amber-500/90 px-3 py-1 text-[11px] font-semibold text-white">It's a role account</button>
                <button type="button" onClick={() => resolveRole(false)} className="rounded-md border border-border px-3 py-1 text-[11px] text-foreground hover:bg-muted">No, it's personal</button>
              </div>
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px]">
              <label className="inline-flex items-center gap-1 text-muted-foreground" title="This is a role/position account (president@…) that turns over each year — recheck it each semester">
                <input type="checkbox" checked={draft.isRoleAccount} onChange={(e) => onChange({ isRoleAccount: e.target.checked, roleAcctTouched: true })} />
                <Recycle className="size-3" /> role account
              </label>
              <div className="ml-auto flex items-center gap-1.5">
                <button type="button" onClick={onCancel} className="rounded border border-border px-2.5 py-0.5 text-muted-foreground hover:bg-muted">Cancel</button>
                <button type="button" onClick={clickAdd} disabled={!canAdd} title={canAdd ? undefined : "Add a name, email, or Instagram first"} className="rounded bg-primary px-3 py-0.5 font-semibold text-primary-foreground disabled:opacity-40">{editing ? "Update" : "Add"}</button>
              </div>
            </div>
          )}
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
            <button type="button" onClick={() => onAdd()} disabled={!canAdd} title={canAdd ? undefined : "Add an email or Instagram first"} className="rounded bg-primary px-3 py-0.5 font-semibold text-primary-foreground disabled:opacity-40">{editing ? "Update" : "Add"}</button>
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
  const contact = (notFound: boolean, patch?: Partial<ContactDraft>) => {
    const d = { ...draft, ...(patch ?? {}) };
    return {
      kind, entityId: kind === "council" ? null : rest, councilType: kind === "council" ? rest : null,
      newClubName: null, newClubCategory: kind === "club" ? "women_in_business" : null,
      isPerson: d.isPerson, notFound, isRoleAccount: d.isRoleAccount, igRoleAccount: false,
      name: notFound ? null : d.name || null, role: notFound ? null : d.role || null,
      email: notFound ? null : d.email || null, instagram: notFound ? null : d.instagram || null,
    };
  };
  const save = useMutation({
    mutationFn: (patch?: Partial<ContactDraft>) => growthSaveCampusContacts({ data: { campusId, contacts: [contact(false, patch)] } }),
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
      <AddForm draft={draft} editing={false} notFoundPending={notFoundMut.isPending} onChange={onChange} onSwitch={switchMode} onAdd={(patch) => save.mutate(patch)} onCancel={onCancel} onMarkNotFound={markNotFound} />
    </div>
  );
}
