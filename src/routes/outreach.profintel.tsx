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
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRightLeft, Check, ChevronDown, ChevronRight, ExternalLink, GraduationCap, Loader2, Mail, MailPlus,
  MapPin, Plus, Search, Sparkles, Trash2, UserMinus, Wand2,
} from "lucide-react";

import { fetchCampuses } from "@/lib/outreach-api";
import { type Campus } from "@/lib/outreach-mock";
import { autoDiscoverCampusFaculty } from "@/lib/faculty-scrape.functions";
import { researchProgramCourses } from "@/lib/program-courses.functions";
import { createMobilityCampus } from "@/lib/profintel.functions";
import {
  acceptIncomingMove, clearDrafts, createDrafts, createManualLeads, deleteSend, fetchProfintelLeads,
  getTemplate, listIncomingMoves, listSends, moveLead, parseManualLeads, renderTemplate, retireLead,
  saveCampusCourseCodes, saveTemplate, updateLeadEmail, updateSend, courseMatchesText,
  DEFAULT_PROFINTEL_TEMPLATE,
  type CourseFamilyCodes, type IncomingMove, type ProfIntelLead, type ProfIntelSend, type ProfIntelTemplate,
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

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

/** Where the grad-cap icon should go to grab an email fast. Prefer the real faculty
 * page (source_url), but many leads were found via RMP — for those source_url is just
 * the RMP profile, which has no email. In that case fall back to a Google search for
 * the professor + school so Lee can find the directory page quickly. */
function facultyLink(l: ProfIntelLead, school: string): { href: string; kind: "faculty" | "search" } {
  const src = l.source_url ?? "";
  if (src && !/ratemyprofessor/i.test(src)) return { href: src, kind: "faculty" };
  const q = encodeURIComponent(`${fullName(l)} ${school} accounting faculty email`.trim());
  return { href: `https://www.google.com/search?q=${q}`, kind: "search" };
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
    queryFn: () => fetchProfintelLeads(campusId!),
    enabled: !!campusId,
  });
  const matched = leadsQuery.data?.matched ?? [];
  const allFaculty = leadsQuery.data?.all ?? [];
  // Show the curated RMP-matched set when it exists; otherwise fall back to the
  // full active roster (freshly scraped / hand-entered campuses with no RMP yet).
  const showingAll = matched.length === 0 && allFaculty.length > 0;
  const leads = matched.length > 0 ? matched : allFaculty;

  const incomingQuery = useQuery({
    queryKey: ["profintel-incoming", campusId],
    queryFn: () => listIncomingMoves(campusId!),
    enabled: !!campusId,
  });

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

          {/* Incoming faculty — professors recorded as having moved here */}
          {(incomingQuery.data?.length ?? 0) > 0 && (
            <IncomingFaculty
              moves={incomingQuery.data ?? []}
              campusId={campusId}
              campusNameById={(id) => (campusQuery.data ?? []).find((c) => c.id === id)?.school_name ?? "another campus"}
              onChanged={() => { incomingQuery.refetch(); leadsQuery.refetch(); }}
            />
          )}

          {/* Leads table */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">
                Step 2 — select leads{" "}
                <span className="text-muted-foreground">
                  ({leads.length} {showingAll ? "active faculty" : "RMP-matched"} · {selected.size} selected)
                </span>
              </div>
              <Button size="sm" onClick={handleCreate} disabled={creating || selected.size === 0}>
                {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MailPlus className="mr-1 h-4 w-4" />}
                Create {selected.size || ""} draft{selected.size === 1 ? "" : "s"}
              </Button>
            </div>
            {showingAll && (
              <p className="mb-2 text-[11px] text-amber-600">
                No RMP-matched leads yet — showing all active faculty. Run RMP cross-reference in Lead Finder to curate, or just work from here.
              </p>
            )}
            {leadsQuery.isLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading leads…
              </div>
            ) : leads.length === 0 ? (
              <AddLeadsTools
                campusId={campusId}
                campusName={campus?.school_name ?? ""}
                empty
                onChanged={() => leadsQuery.refetch()}
              />
            ) : (
              <>
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
                        <th className="w-8 px-2 py-2"></th>
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
                            <td className="px-2 py-1.5 font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                {fullName(l) || "—"}
                                {(() => {
                                  const link = facultyLink(l, campus?.school_name ?? "");
                                  return (
                                    <a
                                      href={link.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      title={link.kind === "faculty" ? "Open the faculty page this lead was found on" : "Search Google for this professor's faculty page / email"}
                                      className="text-muted-foreground hover:text-primary"
                                    >
                                      {link.kind === "faculty"
                                        ? <GraduationCap className="h-3.5 w-3.5" />
                                        : <Search className="h-3.5 w-3.5" />}
                                    </a>
                                  );
                                })()}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{l.rmp_rating != null ? l.rmp_rating.toFixed(1) : "—"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{l.rmp_num_ratings ?? "—"}</td>
                            <td className="px-2 py-1.5">
                              {courseMatchesText(l.rmp_course_match_json) ? (
                                <span className="text-emerald-700">{courseMatchesText(l.rmp_course_match_json)}</span>
                              ) : "—"}
                            </td>
                            <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                              <EmailCell lead={l} onSaved={() => leadsQuery.refetch()} />
                            </td>
                            <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                              <MobilityControl
                                lead={l}
                                campusId={campusId}
                                campuses={campusQuery.data ?? []}
                                onChanged={() => leadsQuery.refetch()}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3">
                  <AddLeadsTools
                    campusId={campusId}
                    campusName={campus?.school_name ?? ""}
                    onChanged={() => leadsQuery.refetch()}
                  />
                </div>
              </>
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

/** Inline email in the Step 2 leads table: shows the email (or a prompt), and on
 * click turns into an input so Lee can paste a missing one. Saves to the lead on
 * blur/Enter so it flows into any draft created afterward. */
function EmailCell({ lead, onSaved }: { lead: ProfIntelLead; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(lead.email ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setVal(lead.email ?? ""); }, [lead.email]);

  async function save() {
    setEditing(false);
    const next = val.trim() || null;
    if (next === (lead.email ?? null)) return;
    setSaving(true);
    try {
      await updateLeadEmail(lead.id, next);
      toast.success(next ? "Email saved." : "Email cleared.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save email.");
      setVal(lead.email ?? "");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { setVal(lead.email ?? ""); setEditing(false); }
        }}
        placeholder="name@school.edu"
        className="h-7 w-[220px] text-xs"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-left hover:underline"
      title="Click to add or edit"
    >
      {saving ? (
        <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> saving…</span>
      ) : lead.email ? (
        <span className="text-foreground">{lead.email}</span>
      ) : (
        <span className="text-muted-foreground italic">+ add email</span>
      )}
    </button>
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
  const [resetting, setResetting] = useState(false);

  async function reset() {
    if (!confirm(`Delete all ${pending.length} draft${pending.length === 1 ? "" : "s"} for this campus and start from scratch?`)) return;
    setResetting(true);
    try {
      await clearDrafts(campusId);
      toast.success("Cleared. Select leads above to create fresh drafts.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear drafts.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">
          Step 3 — review, edit &amp; schedule{" "}
          <span className="text-muted-foreground">({pending.length} draft{pending.length === 1 ? "" : "s"})</span>
        </div>
        {pending.length > 0 && (
          <Button size="sm" variant="outline" onClick={reset} disabled={resetting} className="h-7 text-muted-foreground hover:text-destructive">
            {resetting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}
            Reset drafts
          </Button>
        )}
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
  // Open by default so the email is right there to read and edit — click anywhere
  // on the header to collapse. Edits auto-save on blur (and on toggle/schedule
  // change), so it's "just click and edit" with no separate Save step.
  const [open, setOpen] = useState(true);
  const [toEmail, setToEmail] = useState(draft.to_email ?? "");
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body ?? "");
  const [ready, setReady] = useState(draft.ready);
  const [when, setWhen] = useState(toLocalInput(draft.scheduled_at));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Persist the current edit state, with optional overrides for fields whose
  // React state hasn't settled yet (checkbox/date onChange).
  async function persist(over: { toEmail?: string; subject?: string; body?: string; ready?: boolean; when?: string } = {}) {
    const toEmailV = over.toEmail ?? toEmail;
    const subjectV = over.subject ?? subject;
    const bodyV = over.body ?? body;
    const readyV = over.ready ?? ready;
    const whenV = over.when ?? when;
    const scheduled_at = fromLocalInput(whenV);
    // Skip the write when nothing actually changed (avoids churn on every blur).
    const unchanged =
      toEmailV === (draft.to_email ?? "") &&
      subjectV === (draft.subject ?? "") &&
      bodyV === (draft.body ?? "") &&
      readyV === draft.ready &&
      whenV === toLocalInput(draft.scheduled_at);
    if (unchanged) return;
    setStatus("saving");
    try {
      await updateSend(draft.id, {
        to_email: toEmailV.trim() || null,
        subject: subjectV,
        body: bodyV,
        ready: readyV,
        scheduled_at,
        status: readyV && scheduled_at ? "scheduled" : "draft",
      });
      setStatus("saved");
      onChanged();
    } catch (e) {
      setStatus("idle");
      toast.error(e instanceof Error ? e.message : "Failed to save.");
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
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-muted-foreground">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <Mail className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{draft.to_name || "—"}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {toEmail || "no email"} {draft.course_matches ? `· ${draft.course_matches}` : ""}
          </div>
        </div>
        {status === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {status === "saved" && <Check className="h-3.5 w-3.5 text-emerald-600" />}
        {draft.status === "scheduled" && (
          <Badge variant="secondary" className="text-[10px]">Scheduled</Badge>
        )}
        {draft.ready && draft.status !== "scheduled" && (
          <Badge variant="outline" className="text-[10px]">Ready</Badge>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); remove(); }}
          className="h-7 px-2 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3" onClick={(e) => e.stopPropagation()}>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">To (email)</label>
            <Input
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              onBlur={() => persist()}
              placeholder="grab from the faculty page (🎓) if missing"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} onBlur={() => persist()} className="text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Body</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={() => persist()} className="min-h-[200px] text-sm" />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={ready} onCheckedChange={(v) => { setReady(!!v); persist({ ready: !!v }); }} />
              Ready to send
            </label>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Schedule send</label>
              <Input
                type="datetime-local"
                value={when}
                onChange={(e) => { setWhen(e.target.value); persist({ when: e.target.value }); }}
                className="h-8 w-[220px] text-sm"
              />
            </div>
            <div className="ml-auto text-[11px] text-muted-foreground">
              {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Edits save automatically"}
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
      renderTemplate(tpl, { id: "x", first_name: "Jane", last_name: "Smith", email: null, is_phd: true, source_url: null, rmp_profile_url: null, rmp_rating: 4.5, rmp_num_ratings: 120, rmp_course_match_json: { acct: { code: "ACCT 2101", count: 3 } } }, "Sample U");
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
                Tokens: <code>{"{recipient_name}"}</code> (Dr. Lastname for PhDs, else first name){" "}
                <code>{"{course_prefix}"}</code> (e.g. ACCY) <code>{"{first_name}"}</code> <code>{"{last_name}"}</code>{" "}
                <code>{"{full_name}"}</code> <code>{"{school}"}</code> <code>{"{course}"}</code> <code>{"{rmp_rating}"}</code>
              </p>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setSubject(DEFAULT_PROFINTEL_TEMPLATE.subject); setBody(DEFAULT_PROFINTEL_TEMPLATE.body); }}
                >
                  Load default template
                </Button>
                <span className="ml-2 text-[11px] text-muted-foreground">Fills the editor with Lee's base email — review, then Save.</span>
              </div>
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

/** Per-row transport control: mark a professor Retired or Moved. */
function MobilityControl({
  lead, campusId, campuses, onChanged,
}: {
  lead: ProfIntelLead;
  campusId: string;
  campuses: Campus[];
  onChanged: () => void;
}) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function retire() {
    if (!confirm(`Mark ${fullName(lead) || "this professor"} as retired (no longer teaching anywhere)? They'll drop off this campus's list but stay in the movement history.`)) return;
    setBusy(true);
    try {
      await retireLead(lead, campusId);
      toast.success("Marked retired.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to retire.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" disabled={busy} title="This professor moved or retired">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs">
          <DropdownMenuItem onClick={() => setMoveOpen(true)}>
            <MapPin className="mr-2 h-3.5 w-3.5" /> Moved to another campus…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={retire} className="text-destructive focus:text-destructive">
            <UserMinus className="mr-2 h-3.5 w-3.5" /> Retired (not teaching)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        lead={lead}
        fromCampusId={campusId}
        campuses={campuses}
        onMoved={() => { setMoveOpen(false); onChanged(); }}
      />
    </>
  );
}

/** Move flow: pick an existing destination campus, or write in a new one. A new
 * campus is created gated (not student-facing) and its course codes are researched
 * for approval before the move is recorded. */
function MoveDialog({
  open, onOpenChange, lead, fromCampusId, campuses, onMoved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: ProfIntelLead;
  fromCampusId: string;
  campuses: Campus[];
  onMoved: () => void;
}) {
  const createCampus = useServerFn(createMobilityCampus);
  const research = useServerFn(researchProgramCourses);

  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"pick" | "new">("pick");
  const [newName, setNewName] = useState("");
  const [newState, setNewState] = useState("");
  const [busy, setBusy] = useState(false);
  const [researching, setResearching] = useState(false);
  const [newCampusId, setNewCampusId] = useState<string | null>(null);
  const [code, setCode] = useState<CourseFamilyCodes>({ intro_1: "", intro_2: "", intermediate_1: "", intermediate_2: "" });

  // Reset when reopened.
  useEffect(() => {
    if (open) {
      setQuery(""); setPhase("pick"); setNewName(""); setNewState("");
      setBusy(false); setResearching(false); setNewCampusId(null);
      setCode({ intro_1: "", intro_2: "", intermediate_1: "", intermediate_2: "" });
    }
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campuses
      .filter((c) => !c.archived && c.id !== fromCampusId)
      .filter((c) => !q || `${c.school_name} ${c.state ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [campuses, query, fromCampusId]);

  async function moveTo(toCampusId: string, label: string) {
    setBusy(true);
    try {
      await moveLead(lead, fromCampusId, toCampusId);
      toast.success(`Moved ${fullName(lead) || "professor"} → ${label}.`);
      onMoved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to move.");
      setBusy(false);
    }
  }

  // Create the gated campus, then attempt code research (best-effort: a failure
  // just leaves the fields blank for manual entry — never blocks the move).
  async function createAndResearch() {
    if (newName.trim().length < 2) { toast.error("Enter the school name."); return; }
    setBusy(true);
    try {
      const c = await createCampus({ data: { name: newName.trim(), state: newState.trim() || null } });
      setNewCampusId(c.id);
      toast.success(c.existed ? "Campus already existed — reusing it." : "Campus created (gated).");
      await runResearch(c.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create campus.");
    } finally {
      setBusy(false);
    }
  }

  async function runResearch(campusId: string) {
    setResearching(true);
    try {
      const res = (await research({ data: { campusId } })) as { course_family_codes_json?: Record<string, string> };
      const c = res.course_family_codes_json ?? {};
      setCode((prev) => ({
        intro_1: c.intro_1 ?? prev.intro_1,
        intro_2: c.intro_2 ?? prev.intro_2,
        intermediate_1: c.intermediate_1 ?? prev.intermediate_1,
        intermediate_2: c.intermediate_2 ?? prev.intermediate_2,
      }));
      if (!c.intro_1 && !c.intro_2 && !c.intermediate_1 && !c.intermediate_2) {
        toast.message("Research found no codes — enter them manually below (🔍 to look each up).");
      }
    } catch (e) {
      toast.error(`Course-code research failed: ${e instanceof Error ? e.message : "unknown"} — enter them manually below.`);
    } finally {
      setResearching(false);
    }
  }

  async function approveAndMove() {
    if (!newCampusId) return;
    setBusy(true);
    try {
      await saveCampusCourseCodes(newCampusId, code);
      await moveLead(lead, fromCampusId, newCampusId);
      toast.success(`Moved ${fullName(lead) || "professor"} → ${newName.trim()}.`);
      onMoved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to move.");
      setBusy(false);
    }
  }

  const FAMILIES: { key: keyof CourseFamilyCodes; label: string; phrase: string }[] = [
    { key: "intro_1", label: "Intro 1", phrase: "Introduction to Financial Accounting" },
    { key: "intro_2", label: "Intro 2", phrase: "Introduction to Managerial Accounting" },
    { key: "intermediate_1", label: "IA1", phrase: "Intermediate Accounting I" },
    { key: "intermediate_2", label: "IA2", phrase: "Intermediate Accounting II" },
  ];
  const searchUrl = (phrase: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(`${newName.trim()} "${phrase}" course number catalog`)}`;
  const noCodes = !code.intro_1 && !code.intro_2 && !code.intermediate_1 && !code.intermediate_2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move {fullName(lead) || "professor"}</DialogTitle>
          <DialogDescription>
            Record where they teach now. This drops them off this campus's list and logs the move.
          </DialogDescription>
        </DialogHeader>

        {phase === "pick" ? (
          <div className="space-y-3">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search campuses we already have…"
              className="text-sm"
            />
            <div className="max-h-56 space-y-1 overflow-auto">
              {matches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => moveTo(c.id, c.school_name)}
                  className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/50"
                >
                  <span className="truncate">{c.school_name}</span>
                  {c.state && <span className="ml-2 text-[10px] text-muted-foreground">{c.state}</span>}
                </button>
              ))}
              {matches.length === 0 && (
                <p className="px-1 py-2 text-xs text-muted-foreground">No match. Add the campus below.</p>
              )}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => { setPhase("new"); setNewName(query); }} disabled={busy}>
              <Plus className="mr-1 h-4 w-4" /> Add a new campus
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {!newCampusId ? (
              <>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">School name</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="University of Maryland" className="text-sm" autoFocus />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">State (optional)</label>
                  <Input value={newState} onChange={(e) => setNewState(e.target.value)} placeholder="MD" className="h-8 w-24 text-sm" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Created hidden from students until vetted. We'll research its course codes next — you can edit them before approving.
                </p>
                <div className="flex justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setPhase("pick")} disabled={busy}>Back</Button>
                  <Button size="sm" onClick={createAndResearch} disabled={busy}>
                    {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                    Create &amp; research codes
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold">Course codes for {newName.trim()}</div>
                  <button
                    type="button"
                    onClick={() => { FAMILIES.forEach((f) => window.open(searchUrl(f.phrase), "_blank", "noopener")); }}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                    title="Open a Google search for all four in new tabs"
                  >
                    <ExternalLink className="h-3 w-3" /> search all 4
                  </button>
                </div>
                {researching ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Researching course codes…
                  </div>
                ) : (
                  <div className="space-y-2">
                    {FAMILIES.map((f) => (
                      <div key={f.key} className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-[11px] text-muted-foreground">{f.label}</span>
                        <Input
                          value={code[f.key]}
                          onChange={(e) => setCode((p) => ({ ...p, [f.key]: e.target.value }))}
                          placeholder={f.key.startsWith("intro") ? "e.g. ACCT 201" : "e.g. ACCT 311"}
                          className="h-8 text-sm"
                        />
                        <a
                          href={searchUrl(f.phrase)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Google: ${newName.trim()} ${f.phrase} course number`}
                          className="shrink-0 text-muted-foreground hover:text-primary"
                        >
                          <Search className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => runResearch(newCampusId)} disabled={busy || researching}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" /> Retry research
                  </Button>
                  <Button size="sm" onClick={approveAndMove} disabled={busy || researching}>
                    {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                    {noCodes ? "Move without codes" : "Approve & move here"}
                  </Button>
                </div>
                {noCodes && (
                  <p className="text-[11px] text-amber-600">
                    No codes yet — add them so this campus isn't left hanging (🔍 looks each up). You can still move now.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Professors recorded as having moved TO this campus — one click adds them as a
 * lead here (and closes the move edge). */
function IncomingFaculty({
  moves, campusId, campusNameById, onChanged,
}: {
  moves: IncomingMove[];
  campusId: string;
  campusNameById: (id: string | null) => string;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function accept(m: IncomingMove) {
    setBusyId(m.id);
    try {
      await acceptIncomingMove(m, campusId);
      toast.success(`Added ${m.person_name || "professor"} as a lead here.`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
        <ArrowRightLeft className="h-4 w-4" /> Faculty who moved here ({moves.length})
      </div>
      <div className="space-y-1.5">
        {moves.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs">
            <div className="min-w-0">
              <span className="font-medium">{m.person_name || "—"}</span>
              <span className="text-muted-foreground">
                {" "}· from {campusNameById(m.from_campus_id)}
                {m.rmp_from_rating != null ? ` · was ${m.rmp_from_rating.toFixed(1)}★ (${m.rmp_from_num ?? "?"})` : ""}
              </span>
            </div>
            <Button size="sm" variant="secondary" className="h-7" onClick={() => accept(m)} disabled={busyId === m.id}>
              {busyId === m.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              Add as lead
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Generate leads (faculty scrape) + hand-enter/paste leads for a campus. Shown
 * inline when a campus has no leads, and as a collapsible helper otherwise. */
function AddLeadsTools({
  campusId, campusName, empty, onChanged,
}: {
  campusId: string;
  campusName: string;
  empty?: boolean;
  onChanged: () => void;
}) {
  const discover = useServerFn(autoDiscoverCampusFaculty);
  const [open, setOpen] = useState(!!empty);
  const [generating, setGenerating] = useState(false);
  const [paste, setPaste] = useState("");
  const [adding, setAdding] = useState(false);

  const parsed = useMemo(() => parseManualLeads(paste), [paste]);

  async function generate() {
    setGenerating(true);
    try {
      const res = (await discover({ data: { campusId } })) as { inserted?: number; discovered?: number };
      const n = res?.inserted ?? 0;
      if (n > 0) toast.success(`Scraped ${n} new faculty. Refreshing…`);
      else toast.message("Scrape finished — no new faculty found. Paste them in below.");
      onChanged();
    } catch (e) {
      toast.error(`Faculty scrape failed: ${e instanceof Error ? e.message : "unknown"}. Paste them in below instead.`);
    } finally {
      setGenerating(false);
    }
  }

  async function addPasted() {
    if (parsed.length === 0) return;
    setAdding(true);
    try {
      const n = await createManualLeads(campusId, parsed);
      toast.success(`Added ${n} lead${n === 1 ? "" : "s"}.`);
      setPaste("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add leads.");
    } finally {
      setAdding(false);
    }
  }

  const body = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
          Generate (scrape faculty)
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Auto-discovers {campusName || "this campus"}'s faculty pages and scrapes them. May take a minute.
        </span>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          …or paste from a spreadsheet — one professor per line:{" "}
          <code>Name⇥RMP⇥# ratings⇥course matches⇥email</code> (tab- or comma-separated)
        </p>
        <Textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={"Holly Hawk\t4.2\t15\tACCT 2010, ACCT 3110\thhawk@clemson.edu"}
          className="min-h-[90px] font-mono text-[11px]"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={addPasted} disabled={adding || parsed.length === 0}>
            {adding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Add {parsed.length || ""} lead{parsed.length === 1 ? "" : "s"}
          </Button>
          {parsed.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              Preview: {parsed.slice(0, 3).map((p) => p.name).join(", ")}{parsed.length > 3 ? "…" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (empty) {
    return (
      <div className="rounded-md border border-dashed p-4">
        <p className="mb-3 text-center text-sm text-muted-foreground">
          No leads for this campus yet. Generate them, or paste your own.
        </p>
        {body}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/60">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        + Add or generate more leads
      </button>
      {open && <div className="border-t border-border px-3 py-3">{body}</div>}
    </div>
  );
}
