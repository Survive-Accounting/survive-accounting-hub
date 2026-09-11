// /admin/growth/links — OUTREACH LINKS (2026-09-11): one place to look up a contact and grab
// their link and their DM. Campus → council → org, the org account and each person, the link
// and message for each, and blanks Lee can fill in on the spot.
//
// Lee: "a /links page where I can go to get the DM outreach links and messages I want to send.
// Quick, easy to copy … grabbing links for a specific chapter's scholarship chair. Or, a specific
// greek council, filter by campus, etc."
//
// Behind the team passcode (the /admin/growth layout wraps every child in AdminGate): it lists
// students' personal handles and emails. A plain /links redirects here.
//
// The link and the message per contact come from lib/outreach-links (pure, tested) — the same
// module the DM console and the Today list use, so all three surfaces agree.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Link as LinkIcon, Loader2, MessageSquare, Pencil, Plus, Square, Trash2, X } from "lucide-react";

import { TARGET_CAMPUSES } from "@/lib/king-dm";
import { cn } from "@/lib/utils";
import { renderQueryState } from "@/components/growth/QueryState";
import { outreachLinksCampus, outreachMarkSent, outreachRetireContact, outreachSaveContact, type OutreachCampusData } from "@/lib/outreach-links.functions";
import {
  bareUrl, buildOrgs, cleanHandle, contactDm, firstNameOf, fullUrl, GROUP_LABEL, GROUP_ORDER, hasChair, isChairTitle, linkFor, needsContact, orgHandle, orgMatches,
  reachable, sentCount, withContactRef, type LinkContact, type LinkOrg,
} from "@/lib/outreach-links";

type Filter = "all" | "need" | "unsent" | "chairs";

export const Route = createFileRoute("/admin/growth/links")({
  validateSearch: (s: Record<string, unknown>): { campus?: string; q?: string; f?: Filter } => ({
    ...(typeof s.campus === "string" && s.campus ? { campus: s.campus } : {}),
    ...(typeof s.q === "string" && s.q ? { q: s.q } : {}),
    ...(s.f === "need" || s.f === "unsent" || s.f === "chairs" ? { f: s.f } : {}),
  }),
  head: () => ({ meta: [{ title: "Outreach links — Survive Growth" }, { name: "robots", content: "noindex" }] }),
  component: LinksPage,
});

function LinksPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const campusSlug = search.campus ?? TARGET_CAMPUSES[0].slug;
  const q = search.q ?? "";
  const filter: Filter = search.f ?? "all";
  const setSearch = (patch: Partial<{ campus: string; q: string; f: Filter }>) =>
    void navigate({ to: "/admin/growth/links", search: (p) => ({ ...p, ...patch, ...(patch.q === "" ? { q: undefined } : {}), ...(patch.f === "all" ? { f: undefined } : {}) }), replace: true });

  const dataQ = useQuery({ queryKey: ["outreach-links", campusSlug], queryFn: () => outreachLinksCampus({ data: { campusSlug } }) });

  return (
    <div className="mx-auto w-full max-w-[980px] px-3 pb-24 pt-4 sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-[26px] font-black leading-none tracking-tight">Outreach links<span className="text-primary">.</span></h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Greek life Instagram DMs · one link and one message per contact</p>
        </div>
      </header>

      {/* CAMPUS — the DM console's campus list, in its order. */}
      <nav aria-label="Campus" className="mt-4 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
        {TARGET_CAMPUSES.map((c) => (
          <button key={c.slug} type="button" aria-pressed={c.slug === campusSlug} onClick={() => setSearch({ campus: c.slug })}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap", c.slug === campusSlug ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/40 hover:bg-muted")}>
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", c.stage === "active" ? "bg-emerald-400" : "bg-border")} aria-hidden />
            {c.label}
          </button>
        ))}
      </nav>

      {renderQueryState(dataQ, { label: "Loading contacts…" }) ?? (dataQ.data
        ? <CampusLinks data={dataQ.data} q={q} filter={filter} onQ={(v) => setSearch({ q: v })} onFilter={(f) => setSearch({ f })} />
        : <p className="mt-6 text-[13px] text-muted-foreground">That campus isn&apos;t in the campus table.</p>)}

      <section aria-label="Which link goes where" className="mt-10 grid gap-3 border-t border-border pt-4 text-[12px] text-muted-foreground sm:grid-cols-3">
        <div><b className="text-foreground">Council contacts</b> (scholarship chair, president, council account) get the council chair page: <code className="text-foreground">/go/&lt;campus&gt;/council/ifc</code>. It links every chapter in that council.</div>
        <div><b className="text-foreground">Chapter contacts</b> (scholarship chair, chapter account) get their chapter chair page: <code className="text-foreground">/go/&lt;campus&gt;/&lt;chapter&gt;</code>.</div>
        <div><b className="text-foreground">Clubs, FSL staff and chapters not on the site</b> get the campus page: <code className="text-foreground">/s/&lt;campus&gt;</code>. Every link carries the contact&apos;s ref, so clicks land on the DM console.</div>
      </section>
    </div>
  );
}

function CampusLinks({ data, q, filter, onQ, onFilter }: { data: OutreachCampusData; q: string; filter: Filter; onQ: (v: string) => void; onFilter: (f: Filter) => void }) {
  const { campus, chapters, contacts } = data;
  const orgs = useMemo(() => buildOrgs(contacts, chapters), [contacts, chapters]);
  const hasChapters = campus.siteChapters > 0;

  const chapterOrgs = orgs.filter((o) => o.kind === "chapter");
  const facts = {
    withAcct: chapterOrgs.filter((o) => !!orgHandle(o)).length,
    withChair: chapterOrgs.filter(hasChair).length,
    people: orgs.reduce((n, o) => n + o.people.length, 0),
    sent: orgs.reduce((n, o) => n + sentCount(o), 0),
  };

  let shown = orgs.filter((o) => orgMatches(o, q));
  if (filter === "need") shown = shown.filter(needsContact);
  if (filter === "unsent") shown = shown.filter((o) => reachable(o) && sentCount(o) === 0);
  if (filter === "chairs") shown = shown.filter(hasChair);

  const groups = [...GROUP_ORDER, "Other"].map((g) => ({ g, orgs: shown.filter((o) => o.group === g) })).filter((x) => x.orgs.length);

  return (
    <>
      <section className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-[20px] font-black leading-tight">{campus.label}{campus.courseCode && <span className="ml-2 text-[13px] font-semibold text-muted-foreground">{campus.courseCode}</span>}</h2>
        <p className="text-[12.5px] tabular-nums text-muted-foreground">
          <b className="text-foreground">{campus.siteChapters}</b> chapters on the site · <b className="text-foreground">{facts.withAcct}</b> with a chapter account · <b className="text-foreground">{facts.withChair}</b> with a scholarship chair · <b className="text-foreground">{facts.people}</b> people · <b className="text-foreground">{facts.sent}</b> DMs sent
        </p>
      </section>
      {!hasChapters && (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px]">{campus.label} has no chapters on the site yet, so every link here falls back to the campus page. Add chapters before DMing chairs here.</p>
      )}

      <div className="sticky top-0 z-[5] mt-3 flex flex-wrap items-center gap-2 bg-background py-2">
        <input type="search" value={q} onChange={(e) => onQ(e.target.value)} placeholder="Search chapter, person, title or @handle" aria-label="Search"
          className="min-w-[220px] flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] outline-none focus:border-primary" />
        <div role="group" aria-label="Show" className="flex overflow-hidden rounded-lg border border-border">
          {([["all", "All"], ["chairs", "Scholarship chairs"], ["need", "Needs a contact"], ["unsent", "Not sent yet"]] as const).map(([f, label]) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => onFilter(f)} className={cn("px-2.5 py-1.5 text-[12px]", filter === f ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted/50")}>{label}</button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">Nothing matches. Clear the search or switch to All.</p>
      ) : groups.map(({ g, orgs: list }) => {
        const council = list.find((o) => o.kind === "council" || o.kind === "office");
        const rest = list.filter((o) => o !== council).sort((a, b) => a.name.localeCompare(b.name));
        const n = rest.filter((o) => o.kind === "chapter").length;
        return (
          <section key={g} className="mt-5">
            <div className="mb-2 flex items-baseline gap-2.5">
              <h3 className="text-[15px] font-black">{GROUP_LABEL[g] ?? g}</h3>
              {n > 0 && <span className="text-[12px] tabular-nums text-muted-foreground">{n} chapter{n === 1 ? "" : "s"}</span>}
            </div>
            <div className="flex flex-col gap-2">
              {council && <OrgCard org={council} data={data} lifted defaultOpen />}
              {rest.map((o) => <OrgCard key={o.key} org={o} data={data} defaultOpen={!!q || filter === "chairs"} />)}
            </div>
          </section>
        );
      })}
    </>
  );
}

// ── one org ───────────────────────────────────────────────────────────────────────────────────

function OrgCard({ org, data, lifted, defaultOpen }: { org: LinkOrg; data: OutreachCampusData; lifted?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [editing, setEditing] = useState<null | { contact: LinkContact | null; kind: LinkContact["contactKind"]; title: string }>(null);
  const acct = orgHandle(org);
  const chair = org.people.find((p) => isChairTitle(p.execTitle));
  const sent = sentCount(org);
  const others = org.people.filter((p) => p !== chair).length;
  const flagged = [org.account, ...org.people].filter((c) => c?.needsReview);
  const link = linkFor(data.campus.slug, org, data.campus.siteChapters > 0);

  return (
    <div className={cn("rounded-xl border border-border bg-card", lifted && "shadow-md")}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-left">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <strong className="text-[14px] font-semibold">{org.name}</strong>
          {org.letters && <span className="text-[12.5px] tracking-wide text-muted-foreground">{org.letters}</span>}
          {org.kind !== "chapter" && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{org.kind === "office" ? "staff" : org.kind}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {sent > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-400">Sent {sent}</span>}
          {org.kind === "chapter" && !org.onSite && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-400">Not on site</span>}
          {flagged.length > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber-400">Check</span>}
          <span className={cn("text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden>›</span>
        </div>
        <div className="col-span-2 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[12px] text-muted-foreground">
          {acct ? <span>@<span className="font-mono text-foreground">{acct}</span></span> : <span className="text-red-400">no {org.kind === "chapter" ? "chapter" : "org"} account</span>}
          {(org.kind === "chapter" || org.kind === "council") && (chair
            ? <span>Chair: {chair.fullName || "?"}{cleanHandle(chair.personalIg) && <> <span className="font-mono text-foreground">@{cleanHandle(chair.personalIg)}</span></>}</span>
            : <span className="text-red-400">no scholarship chair</span>)}
          {others > 0 && <span>+{others} {others === 1 ? "person" : "people"}</span>}
        </div>
      </button>

      {open && (
        <div className="flex flex-col border-t border-border px-3.5 pb-3.5 pt-1">
          {flagged.map((c) => c && <div key={c.id} className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[12px] text-amber-400">{c.fullName || `@${c.orgIg || c.personalIg}`}: {c.reviewReason || "needs review"}</div>)}
          {editing ? (
            <ContactForm org={org} data={data} contact={editing.contact} kind={editing.kind} title={editing.title} onClose={() => setEditing(null)} />
          ) : (
            <>
              <ContactRow org={org} data={data} contact={org.account} isOrg link={link} onEdit={() => setEditing({ contact: org.account, kind: "org_inbox", title: org.account ? "Edit the account" : "Add the account" })} />
              {org.people.map((p) => (
                <ContactRow key={p.id} org={org} data={data} contact={p} isOrg={false} link={link} onEdit={() => setEditing({ contact: p, kind: p.contactKind || "student_officer", title: "Edit" })} />
              ))}
              {(org.kind === "chapter" || org.kind === "council") && !chair && (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-dashed border-border py-2.5 last:border-b-0">
                  <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Scholarship chair</div><div className="text-[12.5px] text-red-400">Not found yet</div></div>
                  <button type="button" onClick={() => setEditing({ contact: null, kind: "student_officer", title: "Add the scholarship chair" })} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] hover:bg-muted"><Plus className="size-3.5" /> Add scholarship chair</button>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11.5px] text-muted-foreground">From the contact list and the site.</span>
                <button type="button" onClick={() => setEditing({ contact: null, kind: "student_officer", title: "Add a person" })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted"><Plus className="size-3.5" /> Add a person</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── one contact row ───────────────────────────────────────────────────────────────────────────

function ContactRow({ org, data, contact, isOrg, link, onEdit }: { org: LinkOrg; data: OutreachCampusData; contact: LinkContact | null; isOrg: boolean; link: ReturnType<typeof linkFor>; onEdit: () => void }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState<null | "dm" | "link">(null);
  const handle = contact ? cleanHandle(isOrg ? (contact.orgIg || contact.personalIg) : (contact.personalIg || contact.orgIg)) : "";
  const email = contact?.email ?? "";
  const role = isOrg
    ? (org.kind === "council" ? "Council account" : org.kind === "chapter" ? "Chapter account" : org.kind === "office" ? "Office account" : "Club account")
    : (contact?.execTitle || "Member");
  const path = withContactRef(link.path, contact?.id);
  const sentAt = contact?.igSentAt ?? contact?.dmSentAt ?? null;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["outreach-links", data.campus.slug] });

  const mark = useMutation({
    mutationFn: (sent: boolean) => outreachMarkSent({ data: { id: contact!.id, sent, channel: isOrg ? "org_ig" : handle ? "personal_ig" : "email" } }),
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const retire = useMutation({
    mutationFn: () => outreachRetireContact({ data: { id: contact!.id } }),
    onSuccess: () => { invalidate(); toast.success("Removed."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async (what: "dm" | "link") => {
    const text = what === "link" ? fullUrl(path) : contactDm({
      campusLabel: data.campus.label, courseCode: data.campus.courseCode, org,
      firstName: isOrg ? "" : firstNameOf(contact?.fullName ?? ""), isOrg,
      link: bareUrl(path), campusHasChapters: data.campus.siteChapters > 0,
    });
    try { await navigator.clipboard.writeText(text); setCopied(what); window.setTimeout(() => setCopied(null), 1600); }
    catch { toast.error("Clipboard blocked — copy it from the link line."); }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-dashed border-border py-2.5 last:border-b-0 max-sm:grid-cols-1">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{role}</div>
        {!isOrg && <div className="text-[13.5px] font-semibold">{contact?.fullName || "Unnamed"}</div>}
        {handle
          ? <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer" className="font-mono text-[12.5px] text-primary hover:underline">@{handle}</a>
          : <div className="text-[12.5px] text-red-400">No Instagram yet</div>}
        {contact?.altIg && <div className="font-mono text-[11.5px] text-muted-foreground">also @{contact.altIg}</div>}
        {email && <div className="break-all font-mono text-[11.5px] text-muted-foreground">{email}</div>}
      </div>
      <div className="flex flex-wrap justify-end gap-1.5 max-sm:justify-start">
        {handle && <a href={`https://ig.me/m/${handle}`} target="_blank" rel="noreferrer" title="Opens the Instagram DM thread" className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] hover:bg-muted"><ExternalLink className="size-3.5" /> Open DM</a>}
        <button type="button" onClick={() => void copy("dm")} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[12px] font-semibold text-primary-foreground">{copied === "dm" ? <Check className="size-3.5" /> : <MessageSquare className="size-3.5" />} Copy DM</button>
        <button type="button" onClick={() => void copy("link")} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] hover:bg-muted">{copied === "link" ? <Check className="size-3.5" /> : <LinkIcon className="size-3.5" />} Copy link</button>
        {contact && (handle || email) && (
          <button type="button" onClick={() => mark.mutate(!sentAt)} disabled={mark.isPending} title={sentAt ? "Sent — click to undo" : "Mark sent"}
            className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px]", sentAt ? "bg-emerald-500/15 font-semibold text-emerald-400" : "border border-border hover:bg-muted")}>
            {mark.isPending ? <Loader2 className="size-3.5 animate-spin" /> : sentAt ? <Check className="size-3.5" /> : <Square className="size-3.5" />} {sentAt ? `Sent ${fmtDate(sentAt)}` : "Mark sent"}
          </button>
        )}
        {contact && contact.clicks > 0 && <span title="Link clicks" className="inline-flex items-center gap-0.5 self-center text-[11.5px] tabular-nums text-primary"><LinkIcon className="size-3" /> {contact.clicks}</span>}
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-muted" title={contact ? "Edit" : "Add"}>{contact ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}{!contact && " Add handle"}</button>
        {contact && !isOrg && <button type="button" onClick={() => { if (window.confirm(`Remove ${contact.fullName || "this contact"} from the list?`)) retire.mutate(); }} className="inline-flex items-center rounded-lg px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-muted" title="Remove"><Trash2 className="size-3.5" /></button>}
      </div>
      <div className="col-span-full flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-muted-foreground max-sm:col-span-1">
        <span>{link.why}:</span>
        <a href={fullUrl(path)} target="_blank" rel="noreferrer" className="break-all font-mono text-foreground hover:underline">{bareUrl(path)}</a>
      </div>
    </div>
  );
}

function fmtDate(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`; }

// ── add / edit ────────────────────────────────────────────────────────────────────────────────

function ContactForm({ org, data, contact, kind, title, onClose }: { org: LinkOrg; data: OutreachCampusData; contact: LinkContact | null; kind: LinkContact["contactKind"]; title: string; onClose: () => void }) {
  const qc = useQueryClient();
  const isOrg = kind === "org_inbox";
  const [fullName, setFullName] = useState(contact?.fullName ?? "");
  const [execTitle, setExecTitle] = useState(contact?.execTitle ?? (title.includes("scholarship") ? "Scholarship Chair" : ""));
  const [personalIg, setPersonalIg] = useState(contact?.personalIg ?? "");
  const [orgIg, setOrgIg] = useState(contact?.orgIg ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const save = useMutation({
    mutationFn: () => outreachSaveContact({ data: {
      campusSlug: data.campus.slug, id: contact?.id,
      orgType: org.kind, council: org.kind === "office" ? "FSL Office" : org.kind === "club" ? "Campus Club" : org.group,
      orgName: org.name, contactKind: isOrg ? "org_inbox" : (kind || "student_officer"),
      execTitle: isOrg ? "" : execTitle, fullName: isOrg ? "" : fullName, orgIg, personalIg: isOrg ? "" : personalIg, email,
    } }),
    onSuccess: (r) => { if (!r.ok) { toast.error(r.error ?? "Couldn't save"); return; } void qc.invalidateQueries({ queryKey: ["outreach-links", data.campus.slug] }); toast.success("Saved."); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const field = "w-full rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[13px] outline-none focus:border-primary";
  const label = "flex flex-col gap-1 text-[11.5px] text-muted-foreground";
  return (
    <form className="mt-2 flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="flex items-center justify-between"><span className="text-[13px] font-semibold">{title} · {org.name}</span><button type="button" onClick={onClose} aria-label="Cancel" className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button></div>
      <div className="grid gap-2 sm:grid-cols-2">
        {!isOrg && <label className={label}>Name<input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" /></label>}
        {!isOrg && <label className={label}>Title<input className={field} value={execTitle} onChange={(e) => setExecTitle(e.target.value)} placeholder="Scholarship Chair" autoComplete="off" /></label>}
        {!isOrg && <label className={label}>Personal Instagram<input className={field} value={personalIg} onChange={(e) => setPersonalIg(e.target.value)} placeholder="@handle" autoComplete="off" /></label>}
        <label className={label}>{org.kind === "chapter" ? "Chapter" : "Org"} Instagram<input className={field} value={orgIg} onChange={(e) => setOrgIg(e.target.value)} placeholder="@handle" autoComplete="off" /></label>
        <label className={label}>Email<input className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.edu" autoComplete="off" /></label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12.5px] text-muted-foreground hover:bg-muted">Cancel</button>
        <button type="submit" disabled={save.isPending} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50">{save.isPending && <Loader2 className="size-3.5 animate-spin" />} Save</button>
      </div>
    </form>
  );
}
