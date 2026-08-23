// /admin/growth/contacts — people with role history. Fast add (name/role/email/
// phone/instagram + "More details"); detail drawer shows every relationship over
// time (current + former), lets you add/end a role, and logs outreach.
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Plus, RotateCw, Trash2 } from "lucide-react";
import {
  deleteGrowthContact,
  endContactRole,
  getGrowthContact,
  listGrowthContacts,
  upsertContactRole,
  upsertGrowthContact,
  type Contact,
} from "@/lib/growth-contacts.functions";
import { listOutreachEvents } from "@/lib/growth-outreach.functions";
import {
  Drawer,
  EmptyRow,
  FilterSelect,
  LoadingRow,
  Pager,
  SearchInput,
  Section,
  StorageBanner,
  useGrowthWho,
} from "@/components/growth/shared";
import { OutreachActions } from "@/components/growth/OutreachActions";
import { EntityPicker, type PickedEntity } from "@/components/growth/EntityPicker";
import { Timeline } from "./admin.growth.chapters";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/growth/contacts")({
  component: ContactsPage,
});

const SCOPE_OPTS = [
  { value: "all", label: "All people" },
  { value: "current", label: "Current only" },
] as const;

function ContactsPage() {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [scope, setScope] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [dq, scope]);

  const query = useQuery({
    queryKey: ["growth-contacts", dq, scope, page],
    queryFn: () =>
      listGrowthContacts({
        data: { q: dq || undefined, currentOnly: scope === "current", page, pageSize: 50 },
      }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.rows ?? [];
  const storageReady = query.data?.storageReady ?? true;

  return (
    <div className="space-y-4">
      {!storageReady && <StorageBanner />}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, email, role, chapter…" />
        <FilterSelect value={scope} onChange={setScope} options={SCOPE_OPTS as never} />
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> Add contact
        </button>
        <button
          onClick={() => query.refetch()}
          className="ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/40"
        >
          <RotateCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-2 py-2 text-left">Role / where</th>
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left">Phone</th>
              <th className="px-2 py-2 text-left">IG</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <LoadingRow colSpan={5} />
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={5}>
                {storageReady ? "No contacts yet. Add your first one." : "Storage not provisioned."}
              </EmptyRow>
            ) : (
              rows.map((c) => <ContactRowView key={c.id} c={c} onOpen={() => setOpenId(c.id)} />)
            )}
          </tbody>
        </table>
      </div>

      <Pager page={page} pageSize={50} total={query.data?.total ?? 0} onPage={setPage} />

      <ContactDrawer
        contactId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => query.refetch()}
      />
      <AddContactDrawer
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setAdding(false);
          query.refetch();
          setOpenId(id);
        }}
      />
    </div>
  );
}

function currentRole(c: Contact): string {
  const cur = c.roles.find((r) => r.isCurrent) ?? c.roles[0];
  if (!cur) return c.title ?? "—";
  return [cur.role, cur.entityLabel].filter(Boolean).join(" · ") || c.title || "—";
}

function ContactRowView({ c, onOpen }: { c: Contact; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="cursor-pointer border-b last:border-0 hover:bg-accent/40">
      <td className="px-3 py-2 font-medium">{c.fullName}</td>
      <td className="px-2 py-2 text-xs text-muted-foreground">{currentRole(c)}</td>
      <td className="px-2 py-2 text-xs">
        {c.email ?? <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="px-2 py-2 text-xs">
        {c.phone ?? <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="px-2 py-2 text-xs">
        {c.instagram ?? <span className="text-muted-foreground/40">—</span>}
      </td>
    </tr>
  );
}

const inputC = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm";
const labelC = "text-xs font-medium text-muted-foreground";

function AddContactDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { who } = useGrowthWho();
  const save = useServerFn(upsertGrowthContact);
  const [f, setF] = useState({
    fullName: "",
    title: "",
    email: "",
    phone: "",
    instagram: "",
    source: "",
    sourceUrl: "",
    notes: "",
  });
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setF({
        fullName: "",
        title: "",
        email: "",
        phone: "",
        instagram: "",
        source: "",
        sourceUrl: "",
        notes: "",
      });
      setMore(false);
    }
  }, [open]);

  const submit = async () => {
    if (!f.fullName.trim()) return;
    setBusy(true);
    try {
      const res = (await save({
        data: {
          fullName: f.fullName,
          title: f.title || null,
          email: f.email || null,
          phone: f.phone || null,
          instagram: f.instagram || null,
          source: f.source || null,
          sourceUrl: f.sourceUrl || null,
          notes: f.notes || null,
          who: who ?? undefined,
        },
      })) as { ok: boolean; id?: string; error?: string; storageReady?: boolean };
      if (!res.ok)
        toast.error(
          res.storageReady === false
            ? "Apply the growth migration to add contacts"
            : (res.error ?? "Failed"),
        );
      else {
        toast.success("Contact added");
        onCreated(res.id!);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="Add contact" width="max-w-md">
      <div className="space-y-3">
        <div>
          <label className={labelC}>Name</label>
          <input
            className={inputC}
            value={f.fullName}
            onChange={(e) => setF({ ...f, fullName: e.target.value })}
            autoFocus
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label className={labelC}>Role</label>
          <input
            className={inputC}
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            placeholder="Chapter President"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelC}>Email</label>
            <input
              className={inputC}
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </div>
          <div>
            <label className={labelC}>Phone</label>
            <input
              className={inputC}
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className={labelC}>Instagram</label>
          <input
            className={inputC}
            value={f.instagram}
            onChange={(e) => setF({ ...f, instagram: e.target.value })}
            placeholder="@handle or URL"
          />
        </div>

        <button
          type="button"
          onClick={() => setMore(!more)}
          className="text-xs text-muted-foreground underline"
        >
          {more ? "Hide details" : "More details"}
        </button>
        {more && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelC}>Source</label>
                <input
                  className={inputC}
                  value={f.source}
                  onChange={(e) => setF({ ...f, source: e.target.value })}
                  placeholder="chapter site, IG…"
                />
              </div>
              <div>
                <label className={labelC}>Source URL</label>
                <input
                  className={inputC}
                  value={f.sourceUrl}
                  onChange={(e) => setF({ ...f, sourceUrl: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className={labelC}>Notes</label>
              <textarea
                className="min-h-16 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                value={f.notes}
                onChange={(e) => setF({ ...f, notes: e.target.value })}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            disabled={busy || !f.fullName.trim()}
            onClick={submit}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Save contact
          </button>
          <button
            onClick={onClose}
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent/40"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Attach them to a chapter, council, campus, or national org after saving — you can add
          several relationships over time.
        </p>
      </div>
    </Drawer>
  );
}

function ContactDrawer({
  contactId,
  onClose,
  onChanged,
}: {
  contactId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const detail = useQuery({
    queryKey: ["growth-contact-one", contactId],
    queryFn: () => getGrowthContact({ data: { id: contactId! } }),
    enabled: !!contactId,
  });
  const events = useQuery({
    queryKey: ["growth-contact-events", contactId],
    queryFn: () => listOutreachEvents({ data: { contactId: contactId! } }),
    enabled: !!contactId,
  });
  const c = detail.data?.contact ?? null;

  const refetchAll = () => {
    void detail.refetch();
    void events.refetch();
    onChanged();
  };

  return (
    <Drawer
      open={!!contactId}
      onClose={onClose}
      title={c?.fullName ?? "Contact"}
      subtitle={c?.title ?? undefined}
    >
      {!c ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <Section title="Details">
            <dl className="space-y-1 text-sm">
              <KV label="Email" value={c.email} />
              <KV label="Phone" value={c.phone} />
              <KV label="Instagram" value={c.instagram} />
              <KV label="Source" value={c.source} />
              {c.notes && <div className="pt-1 text-sm text-muted-foreground">{c.notes}</div>}
            </dl>
          </Section>

          <Section title="Quick log">
            <OutreachActions
              target={{
                contactId: c.id,
                entityType: c.roles[0]?.entityType ?? null,
                entityId: c.roles[0]?.entityId ?? null,
                campusId: c.roles[0]?.campusId ?? null,
              }}
              onLogged={refetchAll}
            />
          </Section>

          <RolesSection contact={c} onChanged={refetchAll} />

          <Section title="Outreach timeline">
            <Timeline events={events.data?.rows ?? []} ready={events.data?.storageReady ?? true} />
          </Section>

          <DangerDelete
            contactId={c.id}
            onDeleted={() => {
              onClose();
              onChanged();
            }}
          />
        </>
      )}
    </Drawer>
  );
}

function RolesSection({ contact, onChanged }: { contact: Contact; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const endRole = useServerFn(endContactRole);
  return (
    <Section
      title={`Relationships (${contact.roles.length})`}
      action={
        <button onClick={() => setAdding(!adding)} className="text-xs text-primary underline">
          {adding ? "cancel" : "+ add"}
        </button>
      }
    >
      {contact.roles.length === 0 && !adding && (
        <div className="text-sm text-muted-foreground">
          No relationships yet — attach them to a chapter, council, campus, or org.
        </div>
      )}
      <div className="space-y-1.5">
        {contact.roles.map((r) => (
          <div key={r.id} className="rounded-md border px-2.5 py-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{r.role ?? "—"}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${r.isCurrent ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
              >
                {r.isCurrent ? "current" : "former"}
                {(r.startTerm || r.endTerm) &&
                  ` · ${[r.startTerm, r.endTerm].filter(Boolean).join("–")}`}
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>{r.entityLabel}</span>
              {r.isCurrent && (
                <button
                  onClick={async () => {
                    await endRole({ data: { id: r.id } });
                    toast.success("Marked former");
                    onChanged();
                  }}
                  className="underline"
                >
                  mark former
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {adding && (
        <AddRoleForm
          contactId={contact.id}
          onDone={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}
    </Section>
  );
}

function AddRoleForm({ contactId, onDone }: { contactId: string; onDone: () => void }) {
  const { who } = useGrowthWho();
  const save = useServerFn(upsertContactRole);
  const [picked, setPicked] = useState<PickedEntity | null>(null);
  const [role, setRole] = useState("");
  const [startTerm, setStartTerm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const res = (await save({
        data: {
          contactId,
          entityType: picked.entityType,
          entityId: picked.entityId ?? undefined,
          campusId: picked.campusId ?? undefined,
          councilSlug: picked.councilSlug ?? undefined,
          role: role || null,
          startTerm: startTerm || null,
          isCurrent: true,
          who: who ?? undefined,
        },
      })) as { ok: boolean; error?: string; storageReady?: boolean };
      if (!res.ok)
        toast.error(
          res.storageReady === false ? "Apply the growth migration first" : (res.error ?? "Failed"),
        );
      else {
        toast.success("Relationship added");
        onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-muted/20 p-3">
      <EntityPicker value={picked} onChange={setPicked} />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={inputC}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role (President…)"
        />
        <input
          className={inputC}
          value={startTerm}
          onChange={(e) => setStartTerm(e.target.value)}
          placeholder="Term (Fall 2025)"
        />
      </div>
      <button
        disabled={busy || !picked}
        onClick={submit}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        Add relationship
      </button>
    </div>
  );
}

function DangerDelete({ contactId, onDeleted }: { contactId: string; onDeleted: () => void }) {
  const del = useServerFn(deleteGrowthContact);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="pt-2 text-right">
      {confirm ? (
        <span className="inline-flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Delete this contact?</span>
          <button
            onClick={async () => {
              await del({ data: { id: contactId } });
              toast.success("Deleted");
              onDeleted();
            }}
            className="rounded border border-rose-300 px-2 py-1 text-rose-600 hover:bg-rose-50"
          >
            Yes, delete
          </button>
          <button onClick={() => setConfirm(false)} className="underline">
            cancel
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirm(true)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-rose-600"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete contact
        </button>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value ?? "—"}</dd>
    </div>
  );
}
