// /outreach/greek-orgs — Greek org registry v1. Registry only: NO outreach, NO
// scraping. Per-campus chapters (campus_greek_chapters) linked to the national
// catalog (greek_orgs), with research link helpers (ProPublica 990s, LinkedIn
// advisor search, state SOS, campus FSL directory) and CSV import. Reuses the
// reddit/parent-groups campus-tabbed patterns + shared FilterPill.
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, Pencil, Plus, Trash2, Upload, Users2 } from "lucide-react";

import {
  addGreekChapter,
  COUNCILS,
  councilLabel,
  deleteGreekChapter,
  fetchGreekCampuses,
  fetchGreekCatalog,
  GREEK_STATUSES,
  importGreekChaptersCsv,
  linkedInAdvisorUrl,
  listGreekChapters,
  nextGreekStatus,
  proPublicaUrl,
  sosSearchUrl,
  updateCampusFslUrl,
  updateGreekChapter,
  type GreekCampus,
  type GreekChapter,
} from "@/lib/greek-orgs";
import { FilterPill } from "@/components/outreach/FilterPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/outreach/greek-orgs")({
  head: () => ({
    meta: [
      { title: "Outreach — Greek orgs" },
      { name: "description", content: "SEC Greek chapter registry + research link helpers." },
    ],
  }),
  component: GreekOrgs,
});

const STATUS_STYLE: Record<string, string> = {
  identified: "bg-slate-100 text-slate-600 border-slate-200",
  researching: "bg-blue-100 text-blue-700 border-blue-200",
  pilot: "bg-amber-100 text-amber-700 border-amber-200",
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  declined: "bg-red-100 text-red-700 border-red-200",
  dormant: "bg-muted text-muted-foreground border-border",
};
const inputCls = "h-9 rounded-md border border-input bg-background px-2 text-sm";

function GreekOrgs() {
  const campusesQuery = useQuery({ queryKey: ["greek-campuses"], queryFn: fetchGreekCampuses });
  const catalogQuery = useQuery({ queryKey: ["greek-catalog"], queryFn: fetchGreekCatalog });
  const chaptersQuery = useQuery({ queryKey: ["greek-chapters"], queryFn: listGreekChapters });
  const campuses = useMemo(() => campusesQuery.data ?? [], [campusesQuery.data]);
  const catalog = catalogQuery.data ?? [];
  const chapters = useMemo(() => chaptersQuery.data ?? [], [chaptersQuery.data]);
  const campusById = useMemo(() => new Map(campuses.map((c) => [c.id, c])), [campuses]);

  const [campusId, setCampusId] = useState<string | null>(null);
  const [council, setCouncil] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const refetch = () => chaptersQuery.refetch();

  const selectedCampus = campusId ? (campusById.get(campusId) ?? null) : null;

  const filtered = useMemo(
    () =>
      chapters
        .filter(
          (ch) =>
            (!campusId || ch.campus_id === campusId) &&
            (!council || ch.council === council) &&
            (!status || ch.status === status),
        )
        .sort(
          (a, b) =>
            (campusById.get(a.campus_id ?? "")?.name ?? "").localeCompare(
              campusById.get(b.campus_id ?? "")?.name ?? "",
            ) || a.national_org.localeCompare(b.national_org),
        ),
    [chapters, campusId, council, status, campusById],
  );

  // Stats: chapters by status (across the current campus filter).
  const statusCounts = useMemo(() => {
    const scope = campusId ? chapters.filter((c) => c.campus_id === campusId) : chapters;
    const by: Record<string, number> = {};
    for (const c of scope) by[c.status] = (by[c.status] ?? 0) + 1;
    return by;
  }, [chapters, campusId]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-1 flex items-center gap-2">
        <Users2 className="h-5 w-5" />
        <h1 className="text-xl font-bold tracking-tight">Greek org registry</h1>
        <Badge variant="outline" className="text-[10px]">
          registry
        </Badge>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        SEC chapter inventory for FSL research — no outreach or scraping. Log chapters, track
        status, and use the per-row research links (990s, advisor search, SOS, FSL directory).
      </p>

      {/* Stats */}
      <div className="mb-4 flex flex-wrap gap-1.5 rounded-lg border border-border bg-card/60 p-3 text-[11px]">
        <span className="font-semibold uppercase text-muted-foreground">
          {campusId ? campusById.get(campusId)?.name : "All campuses"} · {filtered.length} chapters
        </span>
        {GREEK_STATUSES.filter((s) => statusCounts[s]).map((s) => (
          <span key={s} className={`rounded-full border px-2 py-0.5 capitalize ${STATUS_STYLE[s]}`}>
            {s} {statusCounts[s]}
          </span>
        ))}
      </div>

      {/* Campus tabs */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <FilterPill active={!campusId} onClick={() => setCampusId(null)}>
          All campuses
        </FilterPill>
        {campuses.map((c) => (
          <FilterPill key={c.id} active={campusId === c.id} onClick={() => setCampusId(c.id)}>
            {c.name.replace(/^University of /, "").replace(/ University$/, "")}
          </FilterPill>
        ))}
      </div>
      {/* Council + status filters */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Council:</span>
        <FilterPill active={!council} onClick={() => setCouncil(null)}>
          All
        </FilterPill>
        {COUNCILS.map((c) => (
          <FilterPill key={c} active={council === c} onClick={() => setCouncil(c)}>
            {councilLabel(c)}
          </FilterPill>
        ))}
        <span className="ml-3 text-[11px] text-muted-foreground">Status:</span>
        <FilterPill active={!status} onClick={() => setStatus(null)}>
          All
        </FilterPill>
        {GREEK_STATUSES.map((s) => (
          <FilterPill key={s} active={status === s} onClick={() => setStatus(s)}>
            {s}
          </FilterPill>
        ))}
      </div>

      {/* Per-campus FSL directory URL */}
      {selectedCampus && (
        <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
          <FslEditor campus={selectedCampus} onSaved={() => campusesQuery.refetch()} />
        </div>
      )}

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <QuickAdd
          campuses={campuses}
          catalog={catalog}
          defaultCampusId={campusId}
          onAdded={refetch}
        />
        <CsvImport onDone={refetch} />
      </div>

      {/* Chapters */}
      <div className="space-y-2">
        {chaptersQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            No chapters match. Add one below, import a CSV, or clear a filter.
          </div>
        ) : (
          filtered.map((ch) => (
            <ChapterCard
              key={ch.id}
              ch={ch}
              campus={campusById.get(ch.campus_id ?? "") ?? null}
              onChanged={refetch}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ChapterCard({
  ch,
  campus,
  onChanged,
}: {
  ch: GreekChapter;
  campus: GreekCampus | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [advisor, setAdvisor] = useState(ch.advisor_name ?? "");
  const [advisorNotes, setAdvisorNotes] = useState(ch.advisor_notes ?? "");

  async function patch(p: Parameters<typeof updateGreekChapter>[1]) {
    try {
      await updateGreekChapter(ch.id, p);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update.");
    }
  }

  const links: { label: string; url: string }[] = [
    {
      label: "990s (ProPublica)",
      url: proPublicaUrl(
        ch.national_org,
        ch.chapter_designation,
        campus?.state ?? null,
        campus?.city ?? null,
      ),
    },
    { label: "Advisor (LinkedIn)", url: linkedInAdvisorUrl(ch.national_org, campus?.name ?? "") },
    { label: "SOS search", url: sosSearchUrl(campus?.state ?? null) },
  ];
  if (campus?.fsl_url) links.push({ label: "FSL directory", url: campus.fsl_url });

  return (
    <div className="rounded-lg border border-border bg-card/60 p-3 text-xs">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">
              {ch.letters ? `${ch.letters} · ` : ""}
              {ch.national_org}
            </span>
            {ch.chapter_designation && (
              <span className="text-muted-foreground">({ch.chapter_designation})</span>
            )}
            <Badge variant="outline" className="text-[10px] uppercase">
              {councilLabel(ch.council)}
            </Badge>
            <span className="text-muted-foreground">{campus?.name ?? "—"}</span>
            {ch.member_count_estimate != null && (
              <span className="text-muted-foreground">· ~{ch.member_count_estimate} members</span>
            )}
          </div>

          {/* research links */}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] hover:bg-muted"
              >
                {l.label}
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </a>
            ))}
          </div>

          {(ch.house_corp_name || ch.house_corp_990_url) && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              House corp: {ch.house_corp_name || "—"}
              {ch.house_corp_990_url && (
                <a
                  href={ch.house_corp_990_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 text-primary underline"
                >
                  990
                </a>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => patch({ status: nextGreekStatus(ch.status) })}
            title="Click to cycle status"
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLE[ch.status] ?? STATUS_STYLE.identified}`}
          >
            {ch.status}
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </div>
      </div>

      {/* inline advisor fields */}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Input
          value={advisor}
          onChange={(e) => setAdvisor(e.target.value)}
          onBlur={() =>
            advisor !== (ch.advisor_name ?? "") && patch({ advisor_name: advisor || null })
          }
          placeholder="Advisor name…"
          className="h-8 text-[11px]"
        />
        <Input
          value={advisorNotes}
          onChange={(e) => setAdvisorNotes(e.target.value)}
          onBlur={() =>
            advisorNotes !== (ch.advisor_notes ?? "") &&
            patch({ advisor_notes: advisorNotes || null })
          }
          placeholder="Advisor notes…"
          className="h-8 text-[11px]"
        />
      </div>

      {editing && (
        <ChapterEditor
          ch={ch}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ChapterEditor({ ch, onSaved }: { ch: GreekChapter; onSaved: () => void }) {
  const [chapterDesignation, setChapterDesignation] = useState(ch.chapter_designation ?? "");
  const [council, setCouncil] = useState(ch.council ?? "");
  const [letters, setLetters] = useState(ch.letters ?? "");
  const [members, setMembers] = useState(
    ch.member_count_estimate != null ? String(ch.member_count_estimate) : "",
  );
  const [houseCorp, setHouseCorp] = useState(ch.house_corp_name ?? "");
  const [corp990, setCorp990] = useState(ch.house_corp_990_url ?? "");
  const [notes, setNotes] = useState(ch.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateGreekChapter(ch.id, {
        chapter_designation: chapterDesignation.trim() || null,
        council: council || null,
        letters: letters.trim() || null,
        member_count_estimate: members.trim() ? Number(members.replace(/[^\d]/g, "")) : null,
        house_corp_name: houseCorp.trim() || null,
        house_corp_990_url: corp990.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Saved.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!confirm("Delete this chapter?")) return;
    try {
      await deleteGreekChapter(ch.id);
      toast.success("Deleted.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete.");
    }
  }

  return (
    <div className="mt-2 grid gap-2 rounded-md border border-dashed border-primary/40 p-3 sm:grid-cols-2">
      <label className="text-[11px] font-medium text-muted-foreground">
        Chapter designation
        <Input
          value={chapterDesignation}
          onChange={(e) => setChapterDesignation(e.target.value)}
          className="mt-0.5 h-9 text-sm"
          placeholder="e.g. Delta Psi"
        />
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        Council
        <select
          value={council}
          onChange={(e) => setCouncil(e.target.value)}
          className={`mt-0.5 w-full ${inputCls}`}
        >
          <option value="">—</option>
          {COUNCILS.map((c) => (
            <option key={c} value={c}>
              {councilLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        Letters
        <Input
          value={letters}
          onChange={(e) => setLetters(e.target.value)}
          className="mt-0.5 h-9 text-sm"
          placeholder="ATO"
        />
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        Member estimate
        <Input
          value={members}
          onChange={(e) => setMembers(e.target.value)}
          className="mt-0.5 h-9 text-sm"
          placeholder="e.g. 120"
        />
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        House corp name
        <Input
          value={houseCorp}
          onChange={(e) => setHouseCorp(e.target.value)}
          className="mt-0.5 h-9 text-sm"
        />
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        House corp 990 URL
        <Input
          value={corp990}
          onChange={(e) => setCorp990(e.target.value)}
          className="mt-0.5 h-9 text-sm"
        />
      </label>
      <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
        Notes
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-0.5 min-h-[52px] text-sm"
        />
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-1 h-4 w-4" />
          )}
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:text-red-700"
          onClick={remove}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </div>
    </div>
  );
}

function FslEditor({ campus, onSaved }: { campus: GreekCampus; onSaved: () => void }) {
  const [value, setValue] = useState(campus.fsl_url ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await updateCampusFslUrl(campus.id, value);
      toast.success("Saved.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium text-muted-foreground">FSL directory URL</span>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://…"
        className="h-8 w-80 text-sm"
      />
      <Button size="sm" variant="outline" className="h-7" disabled={saving} onClick={save}>
        <Check className="mr-1 h-3.5 w-3.5" /> Save
      </Button>
      {campus.fsl_url && (
        <a
          href={campus.fsl_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-primary underline"
        >
          Open <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function QuickAdd({
  campuses,
  catalog,
  defaultCampusId,
  onAdded,
}: {
  campuses: GreekCampus[];
  catalog: { id: string; name: string }[];
  defaultCampusId: string | null;
  onAdded: () => void;
}) {
  const [campusId, setCampusId] = useState(defaultCampusId ?? "");
  const [org, setOrg] = useState("");
  const [designation, setDesignation] = useState("");
  const [council, setCouncil] = useState("");
  const [letters, setLetters] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!campusId) return toast.error("Pick a campus.");
    if (!org.trim()) return toast.error("National org is required.");
    setSaving(true);
    try {
      await addGreekChapter({
        campus_id: campusId,
        national_org: org,
        chapter_designation: designation || null,
        council: council || null,
        letters: letters || null,
      });
      toast.success("Chapter added.");
      setOrg("");
      setDesignation("");
      setLetters("");
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Plus className="h-4 w-4" /> Add a chapter
      </div>
      <div className="grid gap-2">
        <select value={campusId} onChange={(e) => setCampusId(e.target.value)} className={inputCls}>
          <option value="">Select campus…</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Input
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          placeholder="National org (e.g. Alpha Tau Omega)"
          list="greek-catalog"
          className="text-sm"
        />
        <datalist id="greek-catalog">
          {catalog.map((o) => (
            <option key={o.id} value={o.name} />
          ))}
        </datalist>
        <div className="flex gap-2">
          <Input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="Designation (Delta Psi)"
            className="flex-1 text-sm"
          />
          <Input
            value={letters}
            onChange={(e) => setLetters(e.target.value)}
            placeholder="Letters (ATO)"
            className="w-28 text-sm"
          />
        </div>
        <select value={council} onChange={(e) => setCouncil(e.target.value)} className={inputCls}>
          <option value="">Council…</option>
          {COUNCILS.map((c) => (
            <option key={c} value={c}>
              {councilLabel(c)}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={add} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1 h-4 w-4" />
          )}
          Add chapter
        </Button>
      </div>
    </div>
  );
}

function CsvImport({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    if (!text.trim()) return toast.error("Paste CSV or choose a file first.");
    setBusy(true);
    setResult(null);
    try {
      const r = await importGreekChaptersCsv(text);
      setResult(
        `Imported ${r.inserted}, skipped ${r.skipped}.` +
          (r.errors.length ? ` Issues: ${r.errors.slice(0, 5).join("; ")}` : ""),
      );
      toast.success(`Imported ${r.inserted} chapter(s).`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Upload className="h-4 w-4" /> CSV import
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Headers: <code>campus_slug, national_org, chapter_designation, council, letters</code>
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) f.text().then(setText);
        }}
        className="mb-2 block w-full text-[11px]"
      />
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="…or paste CSV here"
        className="min-h-[70px] font-mono text-[11px]"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={run} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-1 h-4 w-4" />
          )}
          Import
        </Button>
        {result && <span className="text-[11px] text-muted-foreground">{result}</span>}
      </div>
    </div>
  );
}
