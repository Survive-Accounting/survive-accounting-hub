// CONTACT LIST — the reach map for one entity, and the tools to keep building it.
//
// Every contact is editable, every contact links back to where it came from, and there are
// two ways to add one: type it, or paste the page you found it on and pick from what we
// read there. That second path exists because the scraper missed Lee Women in Business's
// Instagram even though it was sitting on the UNLV involvement page.
//
// Contacts with no email are grouped separately (SOCIAL / ADVISORY) rather than mixed in,
// so "who can I actually email" is answerable at a glance.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Instagram, Link2, Loader2, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { growthOutreachContacts, type OutreachContactRow } from "@/lib/growth-queue.functions";
import {
  growthAddContact,
  growthExtractFromUrl,
  growthRetireContact,
  growthUpdateContact,
  type ExtractedContact,
} from "@/lib/growth-reach.functions";
import { Chip, Hint } from "@/components/growth/v2";
import { HINTS } from "@/components/growth/hints";
import { cn } from "@/lib/utils";

type EntityType = "chapter" | "council" | "club" | "campus";

const CONTACT_TYPES = [
  { value: "role_inbox", label: "Role inbox (e.g. ifc@…)" },
  { value: "organization_general", label: "Organization general" },
  { value: "chapter_exec", label: "Chapter exec" },
  { value: "student_officer", label: "Student officer" },
  { value: "staff_advisor", label: "Staff advisor (advisory only)" },
  { value: "social_account", label: "Social account" },
  { value: "unknown", label: "Not sure" },
] as const;

export function ContactList({
  campusId,
  entityType,
  entityId,
  councilType,
  entityLabel,
}: {
  campusId: string;
  entityType: EntityType;
  entityId?: string | null;
  councilType?: string | null;
  entityLabel: string;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const contacts = useQuery({
    queryKey: ["growth-outreach-contacts", campusId],
    queryFn: () => growthOutreachContacts({ data: { campusId } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["growth-outreach-contacts", campusId] });
    qc.invalidateQueries({ queryKey: ["growth-campus-detail", campusId] });
  };

  const key = entityId ? `${entityType}:${entityId}` : `council:${councilType}`;
  const entity = (contacts.data?.entities ?? []).find((e) => e.key === key);
  const rows = entity?.contacts ?? [];
  const emailRows = rows.filter((c) => c.email && c.class !== "ADVISORY");
  const socialRows = rows.filter((c) => !c.email && c.class !== "ADVISORY");
  const advisoryRows = rows.filter((c) => c.class === "ADVISORY");

  if (contacts.isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Loading contacts…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {emailRows.length === 0 && socialRows.length === 0 && advisoryRows.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No contacts yet for {entityLabel}. Add one below — it's usable immediately.
        </p>
      )}

      {emailRows.length > 0 && (
        <Group title="Email" hint="Addresses we can put in an outreach queue.">
          {emailRows.map((c) =>
            editing === c.qcId ? (
              <EditRow
                key={c.qcId}
                contact={c}
                onDone={() => {
                  setEditing(null);
                  refresh();
                }}
              />
            ) : (
              <Row key={c.qcId} contact={c} onEdit={() => setEditing(c.qcId)} onRetired={refresh} />
            ),
          )}
        </Group>
      )}

      {socialRows.length > 0 && (
        <Group title="Instagram only — no email" hint={HINTS.contactClass.SOCIAL}>
          {socialRows.map((c) =>
            editing === c.qcId ? (
              <EditRow
                key={c.qcId}
                contact={c}
                onDone={() => {
                  setEditing(null);
                  refresh();
                }}
              />
            ) : (
              <Row key={c.qcId} contact={c} onEdit={() => setEditing(c.qcId)} onRetired={refresh} />
            ),
          )}
        </Group>
      )}

      {advisoryRows.length > 0 && (
        <Group title="Advisors — escalation only" hint={HINTS.contactClass.ADVISORY}>
          {advisoryRows.map((c) => (
            <Row
              key={c.qcId}
              contact={c}
              onEdit={() => setEditing(c.qcId)}
              onRetired={refresh}
              muted
            />
          ))}
        </Group>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Hint text={HINTS.addContact}>
          <button
            onClick={() => {
              setAdding((v) => !v);
              setPasting(false);
            }}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
          >
            <Plus className="size-3" /> Add contact
          </button>
        </Hint>
        <Hint text={HINTS.extractUrl}>
          <button
            onClick={() => {
              setPasting((v) => !v);
              setAdding(false);
            }}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
          >
            <Link2 className="size-3" /> Paste a URL
          </button>
        </Hint>
      </div>

      {adding && (
        <AddForm
          campusId={campusId}
          entityType={entityType}
          entityId={entityId ?? null}
          councilType={councilType ?? null}
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
      {pasting && (
        <PasteUrl
          campusId={campusId}
          entityType={entityType}
          entityId={entityId ?? null}
          councilType={councilType ?? null}
          onDone={() => {
            setPasting(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Hint text={hint}>
        <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
      </Hint>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({
  contact,
  onEdit,
  onRetired,
  muted,
}: {
  contact: OutreachContactRow;
  onEdit: () => void;
  onRetired: () => void;
  muted?: boolean;
}) {
  const retire = useMutation({
    mutationFn: () =>
      growthRetireContact({
        data: { qcId: contact.qcId, reason: "Marked wrong from the campus contact list" },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Marked wrong — removed from outreach.");
        onRetired();
      } else toast.error(r.error ?? "Couldn't update that contact.");
    },
  });
  const igHref = contact.instagram?.startsWith("http")
    ? contact.instagram
    : contact.instagram
      ? `https://instagram.com/${contact.instagram.replace(/^@/, "")}`
      : null;

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded px-1 py-1 text-[11px] hover:bg-muted/50",
        muted && "opacity-70",
      )}
    >
      {contact.email ? (
        <Mail className="size-3 shrink-0 text-muted-foreground" />
      ) : (
        <Instagram className="size-3 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {contact.email ? (
          contact.email
        ) : igHref ? (
          <a href={igHref} target="_blank" rel="noreferrer" className="underline">
            {contact.instagram}
          </a>
        ) : (
          <span className="text-muted-foreground">no reachable path</span>
        )}
        {contact.name && (
          <span className="text-muted-foreground">
            {" · "}
            {contact.name}
            {contact.role ? ` (${contact.role})` : ""}
          </span>
        )}
      </span>
      <Chip
        tone={
          contact.class === "CURRENT_HIGH"
            ? "good"
            : contact.class === "VERIFY"
              ? "warn"
              : contact.class === "SOCIAL"
                ? "info"
                : "neutral"
        }
        hint={HINTS.contactClass[contact.class]}
      >
        {contact.class === "CURRENT_HIGH" ? "high confidence" : contact.class.toLowerCase()}
      </Chip>
      {contact.sourceUrl && (
        <Hint text={HINTS.sourceLink}>
          <a
            href={contact.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Open the page this contact came from"
          >
            <ExternalLink className="size-3" />
          </a>
        </Hint>
      )}
      <button
        onClick={onEdit}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        aria-label="Edit contact"
      >
        <Pencil className="size-3" />
      </button>
      <button
        onClick={() => {
          if (
            window.confirm(
              "Mark this contact as wrong? It stays on record but leaves every outreach queue.",
            )
          )
            retire.mutate();
        }}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
        aria-label="Mark contact wrong"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

function EditRow({ contact, onDone }: { contact: OutreachContactRow; onDone: () => void }) {
  const [name, setName] = useState(contact.name ?? "");
  const [role, setRole] = useState(contact.role ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [instagram, setInstagram] = useState(contact.instagram ?? "");
  const [sourceUrl, setSourceUrl] = useState(contact.sourceUrl ?? "");
  const save = useMutation({
    mutationFn: () =>
      growthUpdateContact({
        data: { qcId: contact.qcId, name, role, email, instagram, sourceUrl },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Saved — marked verified and usable.");
        onDone();
      } else toast.error(r.error ?? "Couldn't save.");
    },
  });
  return (
    <div className="space-y-1.5 rounded border border-primary/40 bg-muted/40 p-2">
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Email" value={email} onChange={setEmail} placeholder="name@school.edu" />
        <Field
          label="Instagram"
          value={instagram}
          onChange={setInstagram}
          placeholder="@handle or URL"
        />
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Role" value={role} onChange={setRole} placeholder="Academic chair" />
      </div>
      <Field
        label="Found at (URL)"
        value={sourceUrl}
        onChange={setSourceUrl}
        placeholder="https://…"
      />
      <div className="flex gap-1.5">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onDone}
          className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
        >
          Cancel
        </button>
        <span className="self-center text-[10px] text-muted-foreground">
          Saving marks this verified for the current term.
        </span>
      </div>
    </div>
  );
}

function AddForm({
  campusId,
  entityType,
  entityId,
  councilType,
  onDone,
}: {
  campusId: string;
  entityType: EntityType;
  entityId: string | null;
  councilType: string | null;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [contactType, setContactType] = useState<string>("organization_general");
  const add = useMutation({
    mutationFn: () =>
      growthAddContact({
        data: {
          campusId,
          entityType,
          entityId,
          councilType,
          contactType: contactType as never,
          email,
          instagram,
          name,
          role,
          sourceUrl,
        },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Contact added — ready for outreach.");
        onDone();
      } else toast.error(r.error ?? "Couldn't add that contact.");
    },
  });
  return (
    <div className="space-y-1.5 rounded border border-border bg-muted/40 p-2">
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Email" value={email} onChange={setEmail} placeholder="name@school.edu" />
        <Field
          label="Instagram"
          value={instagram}
          onChange={setInstagram}
          placeholder="@handle or URL"
        />
        <Field label="Name" value={name} onChange={setName} placeholder="optional" />
        <Field label="Role" value={role} onChange={setRole} placeholder="optional" />
      </div>
      <Field
        label="Found at (URL)"
        value={sourceUrl}
        onChange={setSourceUrl}
        placeholder="https://… (recommended)"
      />
      <label className="block">
        <span className="text-[10px] text-muted-foreground">What kind of contact</span>
        <select
          value={contactType}
          onChange={(e) => setContactType(e.target.value)}
          className="mt-0.5 w-full rounded border border-border bg-card px-1.5 py-1 text-[11px]"
        >
          {CONTACT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-1.5">
        <button
          onClick={() => add.mutate()}
          disabled={add.isPending || (!email.trim() && !instagram.trim())}
          className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {add.isPending ? "Adding…" : "Add contact"}
        </button>
        <button
          onClick={onDone}
          className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function PasteUrl({
  campusId,
  entityType,
  entityId,
  councilType,
  onDone,
}: {
  campusId: string;
  entityType: EntityType;
  entityId: string | null;
  councilType: string | null;
  onDone: () => void;
}) {
  const [url, setUrl] = useState("");
  const [found, setFound] = useState<ExtractedContact[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const read = useMutation({
    mutationFn: () => growthExtractFromUrl({ data: { url } }),
    onSuccess: (r) => {
      setFound(r.contacts);
      if (r.error) toast.info(r.error);
      else
        toast.success(
          `Found ${r.contacts.length} contact${r.contacts.length === 1 ? "" : "s"} on that page.`,
        );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't read that page."),
  });
  const save = useMutation({
    mutationFn: async () => {
      const chosen = (found ?? []).filter((c) => picked.has(c.value));
      for (const c of chosen) {
        await growthAddContact({
          data: {
            campusId,
            entityType,
            entityId,
            councilType,
            contactType: c.kind === "instagram" ? "social_account" : "organization_general",
            email: c.kind === "email" ? c.value : null,
            instagram: c.kind === "instagram" ? c.value : null,
            sourceUrl: url,
            note: c.context ? `Found on the page near: ${c.context.slice(0, 200)}` : null,
          },
        });
      }
      return chosen.length;
    },
    onSuccess: (n) => {
      toast.success(`Added ${n} contact${n === 1 ? "" : "s"}.`);
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add those."),
  });

  return (
    <div className="space-y-1.5 rounded border border-border bg-muted/40 p-2">
      <div className="flex gap-1.5">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://involvement.unlv.edu/organization/…"
          className="min-w-0 flex-1 rounded border border-border bg-card px-1.5 py-1 text-[11px]"
        />
        <button
          onClick={() => read.mutate()}
          disabled={read.isPending || !url.trim()}
          className="shrink-0 rounded border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
        >
          {read.isPending ? <Loader2 className="size-3 animate-spin" /> : "Read page"}
        </button>
      </div>
      {found && found.length > 0 && (
        <>
          <div className="max-h-52 space-y-0.5 overflow-y-auto">
            {found.map((c) => (
              <label
                key={c.value}
                className="flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 text-[11px] hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={picked.has(c.value)}
                  onChange={(e) =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(c.value);
                      else next.delete(c.value);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.value}</span>
                  {c.context && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      …{c.context}…
                    </span>
                  )}
                </span>
                <Chip tone={c.kind === "email" ? "good" : "info"}>{c.kind}</Chip>
              </label>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || picked.size === 0}
              className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {save.isPending ? "Adding…" : `Add ${picked.size} selected`}
            </button>
            <button
              onClick={onDone}
              className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </>
      )}
      {found && found.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          Nothing found on that page. Try the page that actually shows the contact details.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 w-full rounded border border-border bg-card px-1.5 py-1 text-[11px]"
      />
    </label>
  );
}
