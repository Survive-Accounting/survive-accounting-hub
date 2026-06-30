// /outreach/profintel — ProfIntel "Choose campus leads".
// The careful, one-lead-at-a-time professor outreach flow:
//   1. Search + select a campus.
//   2. See its RMP-matched leads, most-rated first (the same priority sort as
//      Lead Finder).
//   3. Optionally paste a shortlist of names from the Google Sheet to auto-select.
//   4. Create one editable email draft per selected lead, pre-filled from the
//      base template.
//   5. Review/edit each draft (subject + body), mark it ready, and schedule a
//      send day/time.
// NOTHING sends automatically — every row is saved as a draft for review. The
// "Schedule emails" tab shows the outgoing queue.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Loader2, Mail, MailPlus, Search, Trash2, Wand2,
} from "lucide-react";

import { fetchCampuses } from "@/lib/outreach-api";
import {
  createDrafts, deleteSend, fetchCampusRmpLeads, getTemplate, listSends,
  renderTemplate, saveTemplate, updateSend, courseMatchesText,
  type ProfIntelLead, type ProfIntelSend, type ProfIntelTemplate,
} from "@/lib/profintel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const Route = createFileRoute("/outreach/profintel")({
  head: () => ({
    meta: [
      { title: "ProfIntel — Choose campus leads" },
      { name: "description", content: "Pick a campus and prepare careful professor outreach drafts." },
    ],
  }),
  component: ProfIntelChoose,
});

/** ISO → value for <input type="datetime-local"> (local time). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fullName(l: ProfIntelLead): string {
  return `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim();
}

function ProfIntelChoose() {
  const campusQuery = useQuery({ queryKey: ["campuses"], queryFn: fetchCampuses, retry: 1 });
  const [campusId, setCampusId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const campus = useMemo(
    () => (campusQuery.data ?? []).find((c) => c.id === campusId) ?? null,
    [campusQuery.data, campusId],
  );

  const leadsQuery = useQuery({
    queryKey: ["profintel-leads", campusId],
    queryFn: () => fetchCampusRmpLeads(campusId!),
    enabled: !!campusId,
  });
  const leads = leadsQuery.data ?? [];

  const draftsQuery = useQuery({
    queryKey: ["profintel-drafts", campusId],
    queryFn: () => listSends({ campusId: campusId! }),
    enabled: !!campusId,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paste, setPaste] = useState("");
  const [creating, setCreating] = useState(false);

  // Reset selection when switching campus.
  useEffect(() => { setSelected(new Set()); setPaste(""); }, [campusId]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Match the pasted shortlist (one name per line) against the loaded leads and
  // select whatever we can resolve. Surfaces any names we couldn't find.
  function applyPaste() {
    const lines = paste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
    const byName = new Map<string, string>(); // normalized full name → lead id
    const byLast = new Map<string, string[]>();
    for (const l of leads) {
      const fn = norm(fullName(l));
      if (fn) byName.set(fn, l.id);
      const last = norm(l.last_name ?? "");
      if (last) byLast.set(last, [...(byLast.get(last) ?? []), l.id]);
    }
    const next = new Set(selected);
    const missing: string[] = [];
    for (const raw of lines) {
      const n = norm(raw);
      let id = byName.get(n);
      if (!id) {
        // loose: try last-token unique match
        const last = n.split(" ").pop() ?? "";
        const cands = byLast.get(last);
        if (cands && cands.length === 1) id = cands[0];
      }
      if (id) next.add(id);
      else missing.push(raw);
    }
    setSelected(next);
    const found = lines.length - missing.length;
    toast.success(`Selected ${found} of ${lines.length}${missing.length ? ` — not found: ${missing.join(", ")}` : ""}`);
  }

  async function handleCreate() {
    if (!campusId || !campus) return;
    const chosen = leads.filter((l) => selected.has(l.id));
    if (chosen.length === 0) { toast.error("Select at least one lead."); return; }
    setCreating(true);
    try {
      const tpl = await getTemplate();
      const n = await createDrafts({ campusId, school: campus.school_name, template: tpl, leads: chosen });
      toast.success(`Created ${n} draft${n === 1 ? "" : "s"}.`);
      setSelected(new Set());
      await draftsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create drafts.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {/* Campus picker */}
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Step 1 — pick a campus</p>
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-secondary px-3 text-sm hover:bg-secondary/80"
            >
              <Search className="h-4 w-4" />
              {campus ? campus.school_name : "Search campuses"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="center">
            <Command filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
              <CommandInput placeholder="Search by school name…" />
              <CommandList>
                <CommandEmpty>No campuses found.</CommandEmpty>
                <CommandGroup>
                  {(campusQuery.data ?? [])
                    .filter((c) => !c.archived)
                    .map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.school_name} ${c.state ?? ""}`}
                        onSelect={() => { setCampusId(c.id); setSearchOpen(false); }}
                        className="text-xs"
                      >
                        <span className="truncate">{c.school_name}</span>
                        {c.state && <span className="ml-auto text-[10px] text-muted-foreground">{c.state}</span>}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {campus && (
          <h1 className="text-2xl font-bold tracking-tight">{campus.school_name}</h1>
        )}
      </div>

      {!campusId ? (
        <div className="mt-12 text-center text-sm text-muted-foreground">
          Search and select a campus to see its RMP-matched leads.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* Paste shortlist */}
          <section className="rounded-xl border border-border bg-card/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Wand2 className="h-4 w-4" /> Paste a shortlist (optional)
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              One name per line (from your Google Sheet). We'll auto-select matching leads below.
            </p>
            <Textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={"Jane Smith\nJohn Doe"}
              className="min-h-[72px] text-xs"
            />
            <div className="mt-2">
              <Button size="sm" variant="secondary" onClick={applyPaste} disabled={!paste.trim()}>
                Match &amp; select
              </Button>
            </div>
          </section>

          {/* Leads table */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">
                Step 2 — select leads{" "}
                <span className="text-muted-foreground">
                  ({leads.length} RMP-matched · {selected.size} selected)
                </span>
              </div>
              <Button size="sm" onClick={handleCreate} disabled={creating || selected.size === 0}>
                {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MailPlus className="mr-1 h-4 w-4" />}
                Create {selected.size || ""} draft{selected.size === 1 ? "" : "s"}
              </Button>
            </div>
            {leadsQuery.isLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading leads…
              </div>
            ) : leads.length === 0 ? (
              <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                No RMP-matched leads for this campus yet. Scrape faculty + RMP in Lead Finder first.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border text-xs">
                <table className="w-full">
                  <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2 text-left">Professor</th>
                      <th className="px-2 py-2 text-right">RMP</th>
                      <th className="px-2 py-2 text-right"># ratings</th>
                      <th className="px-2 py-2 text-left">RMP course matches</th>
                      <th className="px-2 py-2 text-left">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => {
                      const on = selected.has(l.id);
                      return (
                        <tr
                          key={l.id}
                          className={`cursor-pointer border-t border-border hover:bg-muted/40 ${on ? "bg-primary/5" : ""}`}
                          onClick={() => toggle(l.id)}
                        >
                          <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={on} onCheckedChange={() => toggle(l.id)} />
                          </td>
                          <td className="px-2 py-1.5 font-medium">{fullName(l) || "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{l.rmp_rating != null ? l.rmp_rating.toFixed(1) : "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{l.rmp_num_ratings ?? "—"}</td>
                          <td className="px-2 py-1.5">
                            {courseMatchesText(l.rmp_course_match_json) ? (
                              <span className="text-emerald-700">{courseMatchesText(l.rmp_course_match_json)}</span>
                            ) : "—"}
                          </td>
                          <td className="px-2 py-1.5">
                            {l.email ? <span className="text-foreground">{l.email}</span> : <span className="text-muted-foreground">no email</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Drafts for this campus */}
          <DraftsSection
            campusId={campusId}
            drafts={draftsQuery.data ?? []}
            loading={draftsQuery.isLoading}
            onChanged={() => draftsQuery.refetch()}
          />

          {/* Base template editor */}
          <TemplateEditor />
        </div>
      )}
    </div>
  );
}

function DraftsSection({
  campusId, drafts, loading, onChanged,
}: {
  campusId: string;
  drafts: ProfIntelSend[];
  loading: boolean;
  onChanged: () => void;
}) {
  const pending = drafts.filter((d) => d.status === "draft" || d.status === "scheduled");
  return (
    <section>
      <div className="mb-2 text-sm font-semibold">
        Step 3 — review, edit &amp; schedule{" "}
        <span className="text-muted-foreground">({pending.length} draft{pending.length === 1 ? "" : "s"})</span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading drafts…
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          No drafts yet. Select leads above and click "Create drafts".
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((d) => (
            <DraftCard key={d.id} draft={d} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}

function DraftCard({ draft, onChanged }: { draft: ProfIntelSend; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body ?? "");
  const [ready, setReady] = useState(draft.ready);
  const [when, setWhen] = useState(toLocalInput(draft.scheduled_at));
  const [saving, setSaving] = useState(false);

  const dirty =
    subject !== (draft.subject ?? "") ||
    body !== (draft.body ?? "") ||
    ready !== draft.ready ||
    when !== toLocalInput(draft.scheduled_at);

  async function save() {
    setSaving(true);
    try {
      const scheduled_at = fromLocalInput(when);
      await updateSend(draft.id, {
        subject, body, ready,
        scheduled_at,
        status: ready && scheduled_at ? "scheduled" : "draft",
      });
      toast.success("Saved.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete draft to ${draft.to_name || draft.to_email || "this lead"}?`)) return;
    try {
      await deleteSend(draft.id);
      toast.success("Deleted.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card/60">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-muted-foreground hover:text-foreground">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Mail className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{draft.to_name || "—"}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {draft.to_email || "no email"} {draft.course_matches ? `· ${draft.course_matches}` : ""}
          </div>
        </div>
        {draft.status === "scheduled" && (
          <Badge variant="secondary" className="text-[10px]">Scheduled</Badge>
        )}
        {draft.ready && draft.status !== "scheduled" && (
          <Badge variant="outline" className="text-[10px]">Ready</Badge>
        )}
        <Button size="sm" variant="ghost" onClick={remove} className="h-7 px-2 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Body</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[180px] text-sm" />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={ready} onCheckedChange={(v) => setReady(!!v)} />
              Ready to send
            </label>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Schedule send</label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-8 w-[220px] text-sm" />
            </div>
            <div className="ml-auto">
              <Button size="sm" onClick={save} disabled={saving || !dirty}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
          {ready && !fromLocalInput(when) && (
            <p className="text-[11px] text-amber-600">Tip: set a send time to move this into the scheduled queue.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateEditor() {
  const tplQuery = useQuery({ queryKey: ["profintel-template"], queryFn: getTemplate });
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (tplQuery.data && !loaded) {
      setSubject(tplQuery.data.subject);
      setBody(tplQuery.data.body);
      setLoaded(true);
    }
  }, [tplQuery.data, loaded]);

  async function save() {
    setSaving(true);
    try {
      const tpl: ProfIntelTemplate = { subject, body };
      await saveTemplate(tpl);
      toast.success("Template saved. New drafts will use it.");
      // sample preview proof to console-free path; just confirm.
      renderTemplate(tpl, { id: "x", first_name: "Jane", last_name: "Smith", email: null, rmp_rating: 4.5, rmp_num_ratings: 120, rmp_course_match_json: { acct: { code: "ACCT 2101", count: 3 } } }, "Sample U");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Base email template
        <span className="ml-2 font-normal text-muted-foreground">— edit the default used for new drafts</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          {tplQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                Tokens: <code>{"{first_name}"}</code> <code>{"{last_name}"}</code> <code>{"{full_name}"}</code>{" "}
                <code>{"{school}"}</code> <code>{"{course}"}</code> <code>{"{rmp_rating}"}</code>
              </p>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Subject</label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Body</label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[200px] text-sm" />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Save template
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
