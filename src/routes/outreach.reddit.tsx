// /outreach/reddit — Reddit listener (LINK DASHBOARD v1). Read-only listening:
// NO posting, NO DMs, NO auto-engagement. Reddit API fetch is approval-pending, so
// v1 is manual: a grid of Reddit search links per campus + hand-logged posts you
// triage. The gated fetch path lives in reddit.functions.ts (REDDIT_LISTENER_ENABLED).
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Check,
  Star,
  Trash2,
} from "lucide-react";

import {
  addRedditMention,
  COURSE_FAMILIES,
  courseFamilyLabel,
  deleteRedditMention,
  fetchRedditCampuses,
  listRedditMentions,
  nextRedditStatus,
  projectSchedule,
  redditSearchTerms,
  redditSearchUrl,
  REDDIT_STATUSES,
  SENT_CHANNELS,
  updateCampusSubreddit,
  updateRedditMention,
  type RedditCampus,
  type RedditMention,
} from "@/lib/reddit";
import { fetchRedditPost, refreshRedditMentions } from "@/lib/reddit.functions";
import { parseRedditPaste } from "@/lib/reddit-paste";
import { FilterPill } from "@/components/outreach/FilterPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/outreach/reddit")({
  head: () => ({
    meta: [
      { title: "Outreach — Reddit listening" },
      {
        name: "description",
        content: "Read-only Reddit listener: campus subreddit search links + mention triage.",
      },
    ],
  }),
  component: RedditListener,
});

const STATUS_STYLE: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 border-blue-200",
  sent: "bg-purple-100 text-purple-700 border-purple-200",
  engaged: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ignored: "bg-muted text-muted-foreground border-border",
};

const inputCls = "h-9 rounded-md border border-input bg-background px-2 text-sm";

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "—";
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Color-coded post age: fresh (<1wk) green, recent (<6mo) neutral, stale (>6mo)
 *  amber with a "check if archived" nudge. Null posted_at → no chip. */
function recency(postedAt: string | null): { label: string; cls: string; tip?: string } | null {
  if (!postedAt) return null;
  const t = new Date(postedAt).getTime();
  if (Number.isNaN(t)) return null;
  const days = (Date.now() - t) / 86_400_000;
  const label = relTime(postedAt);
  if (days < 7) return { label, cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (days < 180) return { label, cls: "bg-muted text-muted-foreground border-border" };
  return {
    label,
    cls: "bg-amber-100 text-amber-700 border-amber-200",
    tip: "older — check if archived before commenting",
  };
}

function RedditListener() {
  const campusesQuery = useQuery({ queryKey: ["reddit-campuses"], queryFn: fetchRedditCampuses });
  const mentionsQuery = useQuery({
    queryKey: ["reddit-mentions"],
    queryFn: () => listRedditMentions(),
  });
  const campuses = useMemo(() => campusesQuery.data ?? [], [campusesQuery.data]);
  const mentions = useMemo(() => mentionsQuery.data ?? [], [mentionsQuery.data]);

  const [campusId, setCampusId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showStarred, setShowStarred] = useState(true);
  const [showOthers, setShowOthers] = useState(true);
  const refetch = () => mentionsQuery.refetch();

  const campusName = (id: string | null) => campuses.find((c) => c.id === id)?.name ?? "—";
  const selectedCampus = campuses.find((c) => c.id === campusId) ?? null;

  // New this week, per campus (stats header).
  const weekAgo = Date.now() - 7 * 86400 * 1000;
  const newThisWeek = useMemo(() => {
    const by: Record<string, number> = {};
    for (const m of mentions) {
      if (m.status === "ignored") continue;
      if (new Date(m.found_at).getTime() >= weekAgo)
        by[m.campus_id ?? "?"] = (by[m.campus_id ?? "?"] ?? 0) + 1;
    }
    return by;
  }, [mentions, weekAgo]);
  const weekTotal = Object.values(newThisWeek).reduce((a, b) => a + b, 0);

  const filtered = useMemo(
    () =>
      mentions.filter(
        (m) =>
          (!campusId || m.campus_id === campusId) && (!statusFilter || m.status === statusFilter),
      ),
    [mentions, campusId, statusFilter],
  );
  const starred = filtered.filter((m) => m.starred);
  const others = filtered.filter((m) => !m.starred);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-1 flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        <h1 className="text-xl font-bold tracking-tight">Reddit listening</h1>
        <Badge variant="outline" className="text-[10px]">
          read-only
        </Badge>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Find accounting/course chatter on campus subreddits. No posting, DMs, or auto-engagement —
        you review links, log posts, and triage. Live API fetch is pending Reddit approval.
      </p>

      {/* Stats: new this week per campus */}
      <div className="mb-4 rounded-lg border border-border bg-card/60 p-3">
        <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
          New this week · {weekTotal} total
        </div>
        {weekTotal === 0 ? (
          <div className="text-xs text-muted-foreground">None logged in the last 7 days yet.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {campuses
              .filter((c) => (newThisWeek[c.id] ?? 0) > 0)
              .sort((a, b) => (newThisWeek[b.id] ?? 0) - (newThisWeek[a.id] ?? 0))
              .map((c) => (
                <span
                  key={c.id}
                  className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px]"
                >
                  {c.name}{" "}
                  <span className="font-semibold text-emerald-700">{newThisWeek[c.id]}</span>
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Campus filter */}
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
      {/* Status filter */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Status:</span>
        <FilterPill active={!statusFilter} onClick={() => setStatusFilter(null)}>
          All
        </FilterPill>
        {REDDIT_STATUSES.map((s) => (
          <FilterPill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {s}
          </FilterPill>
        ))}
      </div>

      {/* Per-campus tools */}
      {selectedCampus && (
        <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          <SubredditEditor campus={selectedCampus} onSaved={() => campusesQuery.refetch()} />
          <SearchLinkGrid campus={selectedCampus} />
        </div>
      )}
      <QuickAdd campuses={campuses} activeCampusId={campusId} onAdded={refetch} />

      {/* Mentions */}
      <div className="mt-4 space-y-4">
        {mentionsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            No mentions logged{campusId ? ` for ${campusName(campusId)}` : ""} yet. Use the search
            links above to find posts, then quick-add them.
          </div>
        ) : (
          <>
            {starred.length > 0 && (
              <Section
                title={`★ Starred (${starred.length})`}
                open={showStarred}
                onToggle={() => setShowStarred((v) => !v)}
              >
                {starred.map((m) => (
                  <MentionCard
                    key={m.id}
                    m={m}
                    campuses={campuses}
                    campusName={campusName}
                    onChanged={refetch}
                  />
                ))}
              </Section>
            )}
            <Section
              title={`Others (${others.length})`}
              open={showOthers}
              onToggle={() => setShowOthers((v) => !v)}
            >
              {others.length === 0 ? (
                <div className="px-1 py-2 text-xs text-muted-foreground">Nothing here.</div>
              ) : (
                others.map((m) => (
                  <MentionCard
                    key={m.id}
                    m={m}
                    campuses={campuses}
                    campusName={campusName}
                    onChanged={refetch}
                  />
                ))
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase text-muted-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

function MentionCard({
  m,
  campuses,
  campusName,
  onChanged,
}: {
  m: RedditMention;
  campuses: RedditCampus[];
  campusName: (id: string | null) => string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(m.notes ?? "");

  async function patch(p: Parameters<typeof updateRedditMention>[1]) {
    try {
      await updateRedditMention(m.id, p);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update.");
    }
  }
  const projection = projectSchedule(m.taking_course, m.taking_term);

  return (
    <div className="rounded-lg border border-border bg-card/60 p-3 text-xs">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => patch({ starred: !m.starred })}
          title={m.starred ? "Unstar" : "Star (priority)"}
          className="mt-0.5 shrink-0"
        >
          <Star
            className={`h-4 w-4 ${m.starred ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a
              href={m.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
            >
              {m.title || m.url || "(untitled)"}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
            <span className="text-muted-foreground">
              {campusName(m.campus_id)} · r/{m.subreddit || "?"}
              {m.author ? ` · u/${m.author}` : ""}
            </span>
            {(() => {
              const r = recency(m.posted_at);
              return r ? (
                <span
                  title={r.tip}
                  className={`rounded-full border px-1.5 py-0.5 text-[10px] ${r.cls} ${r.tip ? "cursor-help" : ""}`}
                >
                  {r.label}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">{relTime(m.found_at)}</span>
              );
            })()}
          </div>

          {/* tags row */}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {m.is_accounting_major === true && (
              <Badge className="gap-1 bg-indigo-100 text-[10px] text-indigo-700">
                <GraduationCap className="h-3 w-3" /> Accounting
              </Badge>
            )}
            {m.is_accounting_major === false && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                non-major
              </Badge>
            )}
            {m.taking_course && (
              <span
                className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                title={
                  projection.length
                    ? "Projected: " + projection.map((p) => `${p.label} ${p.term}`).join(" → ")
                    : undefined
                }
              >
                {courseFamilyLabel(m.taking_course)}
                {m.taking_term ? ` · ${m.taking_term}` : ""}
              </span>
            )}
            {(m.matched_terms ?? []).map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>

          {m.snippet && <div className="mt-1 text-[11px] text-muted-foreground">{m.snippet}</div>}

          {projection.length > 1 && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Likely path: {projection.map((p) => `${p.label} (${p.term})`).join(" → ")}
            </div>
          )}
        </div>

        {/* status + actions */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => patch({ status: nextRedditStatus(m.status) })}
            title="Click to cycle status"
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLE[m.status] ?? STATUS_STYLE.ignored}`}
          >
            {m.status}
          </button>
          {m.status === "sent" && (m.sent_via?.length ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground">via {m.sent_via!.join(" + ")}</span>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </div>
      </div>

      {/* inline notes (taller, readable) */}
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== (m.notes ?? "") && patch({ notes })}
        placeholder="Notes…"
        className="mt-2 min-h-[52px] text-[11px] leading-relaxed"
      />

      {editing && (
        <MentionEditor
          m={m}
          campuses={campuses}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function MentionEditor({
  m,
  campuses,
  onSaved,
}: {
  m: RedditMention;
  campuses: RedditCampus[];
  onSaved: () => void;
}) {
  const [campusId, setCampusId] = useState(m.campus_id ?? "");
  const [status, setStatus] = useState(m.status);
  const [sentVia, setSentVia] = useState<string[]>(m.sent_via ?? []);
  const [author, setAuthor] = useState(m.author ?? "");
  const [major, setMajor] = useState(
    m.is_accounting_major === true ? "yes" : m.is_accounting_major === false ? "no" : "unknown",
  );
  const [takingCourse, setTakingCourse] = useState(m.taking_course ?? "");
  const [takingTerm, setTakingTerm] = useState(m.taking_term ?? "");
  const [title, setTitle] = useState(m.title ?? "");
  const [url, setUrl] = useState(m.url ?? "");
  const [saving, setSaving] = useState(false);

  const toggleChannel = (c: string) =>
    setSentVia((v) => (v.includes(c) ? v.filter((x) => x !== c) : [...v, c]));

  async function save() {
    setSaving(true);
    try {
      const sub = campuses.find((c) => c.id === campusId)?.subreddit ?? m.subreddit;
      await updateRedditMention(m.id, {
        campus_id: campusId || null,
        subreddit: sub,
        status,
        sent_via: sentVia,
        author: author.trim() || null,
        is_accounting_major: major === "yes" ? true : major === "no" ? false : null,
        taking_course: takingCourse || null,
        taking_term: takingTerm.trim() || null,
        title: title.trim() || null,
        url: url.trim() || null,
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
    if (!confirm("Delete this mention? This can't be undone.")) return;
    try {
      await deleteRedditMention(m.id);
      toast.success("Deleted.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete.");
    }
  }

  const projection = projectSchedule(takingCourse || null, takingTerm || null);

  return (
    <div className="mt-2 grid gap-2 rounded-md border border-dashed border-primary/40 p-3 sm:grid-cols-2">
      <label className="text-[11px] font-medium text-muted-foreground">
        Campus
        <select
          value={campusId}
          onChange={(e) => setCampusId(e.target.value)}
          className={`mt-0.5 w-full ${inputCls}`}
        >
          <option value="">—</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`mt-0.5 w-full ${inputCls}`}
        >
          {REDDIT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {status === "sent" && (
        <div className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
          Sent via
          <div className="mt-0.5 flex gap-1.5">
            {SENT_CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleChannel(c)}
                className={`rounded-full border px-2.5 py-1 text-[11px] capitalize ${
                  sentVia.includes(c)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="text-[11px] font-medium text-muted-foreground">
        Reddit username
        <div className="mt-0.5 flex items-center gap-1">
          <span className="text-muted-foreground">u/</span>
          <Input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        Accounting major?
        <select
          value={major}
          onChange={(e) => setMajor(e.target.value)}
          className={`mt-0.5 w-full ${inputCls}`}
        >
          <option value="unknown">Unknown</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>

      <label className="text-[11px] font-medium text-muted-foreground">
        Taking (course family)
        <select
          value={takingCourse}
          onChange={(e) => setTakingCourse(e.target.value)}
          className={`mt-0.5 w-full ${inputCls}`}
        >
          <option value="">—</option>
          {COURSE_FAMILIES.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[11px] font-medium text-muted-foreground">
        When (e.g. Fall 2025)
        <Input
          value={takingTerm}
          onChange={(e) => setTakingTerm(e.target.value)}
          placeholder="Fall 2025"
          className="mt-0.5 h-9 text-sm"
        />
      </label>

      {projection.length > 1 && (
        <div className="rounded bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground sm:col-span-2">
          Projected path: {projection.map((p) => `${p.label} (${p.term})`).join(" → ")}
        </div>
      )}

      <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
        Title
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-0.5 h-9 text-sm"
        />
      </label>
      <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
        URL
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-0.5 h-9 text-sm"
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

function SubredditEditor({ campus, onSaved }: { campus: RedditCampus; onSaved: () => void }) {
  const [value, setValue] = useState(campus.subreddit ?? "");
  const [saving, setSaving] = useState(false);
  const refresh = useServerFn(refreshRedditMentions);
  const [fetching, setFetching] = useState(false);

  async function save(markVerified: boolean) {
    setSaving(true);
    try {
      await updateCampusSubreddit(campus.id, value, markVerified);
      toast.success(markVerified ? "Subreddit confirmed." : "Saved.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }
  async function tryFetch() {
    setFetching(true);
    try {
      const res = (await refresh({ data: { campusId: campus.id } })) as
        | { disabled: true; reason: string }
        | { ok: true; upserted: number; posts_seen: number; backoffs: number };
      if ("disabled" in res) toast.message("Auto-fetch is off", { description: res.reason });
      else
        toast.success(
          `Fetched: ${res.upserted} new of ${res.posts_seen} seen${res.backoffs ? ` · ${res.backoffs} backoffs` : ""}.`,
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fetch failed.");
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium text-muted-foreground">r/</span>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-40 text-sm"
        placeholder="subreddit"
      />
      {campus.subreddit_verified ? (
        <Badge className="bg-emerald-100 text-[10px] text-emerald-700">verified</Badge>
      ) : (
        <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">
          needs verification
        </Badge>
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={saving}
        onClick={() => save(false)}
      >
        <Pencil className="mr-1 h-3.5 w-3.5" /> Save
      </Button>
      <Button size="sm" className="h-7" disabled={saving} onClick={() => save(true)}>
        <Check className="mr-1 h-3.5 w-3.5" /> Confirm
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-muted-foreground"
        disabled={fetching}
        onClick={tryFetch}
        title="Reddit API fetch — pending approval"
      >
        {fetching ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
        )}
        Auto-fetch (API pending)
      </Button>
    </div>
  );
}

function SearchLinkGrid({ campus }: { campus: RedditCampus }) {
  const sub = (campus.subreddit ?? "").trim();
  const terms = useMemo(
    () => redditSearchTerms(campus.course_family_codes_json),
    [campus.course_family_codes_json],
  );
  if (!sub)
    return (
      <div className="text-xs text-amber-600">Set a subreddit above to generate search links.</div>
    );
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
        Search r/{sub} (opens Reddit, newest-first, last month)
      </div>
      <div className="flex flex-wrap gap-1.5">
        {terms.map((t) => (
          <a
            key={t}
            href={redditSearchUrl(sub, t)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
          >
            {t}
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </a>
        ))}
      </div>
    </div>
  );
}

function QuickAdd({
  campuses,
  activeCampusId,
  onAdded,
}: {
  campuses: RedditCampus[];
  activeCampusId: string | null;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [campusId, setCampusId] = useState(activeCampusId ?? "");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [major, setMajor] = useState("unknown");
  const [takingCourse, setTakingCourse] = useState("");
  const [takingTerm, setTakingTerm] = useState("");
  const [notes, setNotes] = useState("");
  const [snippet, setSnippet] = useState<string | null>(null);
  const [postedAt, setPostedAt] = useState<string | null>(null);
  const [pasteBlob, setPasteBlob] = useState("");
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const fetchPost = useServerFn(fetchRedditPost);

  // Auto-populate the campus dropdown from the active filter.
  useEffect(() => {
    if (activeCampusId) setCampusId(activeCampusId);
  }, [activeCampusId]);

  // PRIMARY path: paste the whole Reddit page → heuristic parse prefills the form.
  // If the paste (or URL field) contains a post URL, we ALSO fire the .json fetch
  // as a silent first attempt to enrich — it may 403, in which case the parse wins.
  function applyPaste(text: string) {
    const p = parseRedditPaste(text);
    if (p.title) setTitle(p.title);
    if (p.author) setAuthor(p.author);
    if (p.snippet) setSnippet(p.snippet);
    if (p.posted_at) setPostedAt(p.posted_at);
    if (p.url) setUrl(p.url);
    if (!campusId && p.subreddit) {
      const match = campuses.find(
        (c) => (c.subreddit ?? "").toLowerCase() === p.subreddit!.toLowerCase(),
      );
      if (match) setCampusId(match.id);
    }
    if (p.title || p.author || p.snippet || p.url) setAutoFilled(true);
    if (p.url) void tryAutofill(p.url);
  }

  // On paste/blur of a Reddit URL: fetch the post once and prefill. Silent on
  // failure — Lee just types it in manually.
  async function tryAutofill(u: string) {
    const isPostUrl = /reddit\.com\/r\/[^/]+\/comments\//i.test(u) || /redd\.it\//i.test(u);
    if (!u.trim() || !isPostUrl) return;
    setFetching(true);
    try {
      const r = (await fetchPost({ data: { url: u.trim() } })) as
        | { ok: false }
        | {
            ok: true;
            title: string | null;
            author: string | null;
            snippet: string | null;
            posted_at: string | null;
            campus_id: string | null;
          };
      if (!r.ok) return;
      if (r.title) setTitle(r.title);
      if (r.author) setAuthor(r.author);
      setSnippet(r.snippet);
      setPostedAt(r.posted_at);
      if (r.campus_id && !campusId) setCampusId(r.campus_id);
      setAutoFilled(true);
    } catch {
      /* silent fallback to manual entry */
    } finally {
      setFetching(false);
    }
  }

  async function add() {
    if (!campusId) return toast.error("Pick a campus.");
    if (!url.trim() || !title.trim()) return toast.error("URL and title are required.");
    setSaving(true);
    try {
      const sub = campuses.find((c) => c.id === campusId)?.subreddit ?? null;
      await addRedditMention({
        campus_id: campusId,
        subreddit: sub,
        url,
        title,
        author: author || null,
        snippet,
        posted_at: postedAt,
        is_accounting_major: major === "yes" ? true : major === "no" ? false : null,
        taking_course: takingCourse || null,
        taking_term: takingTerm || null,
        notes: notes || null,
      });
      toast.success("Logged for triage.");
      setUrl("");
      setTitle("");
      setAuthor("");
      setMajor("unknown");
      setTakingCourse("");
      setTakingTerm("");
      setNotes("");
      setSnippet(null);
      setPostedAt(null);
      setPasteBlob("");
      setAutoFilled(false);
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold"
      >
        <Plus className="h-4 w-4" /> Quick-add a Reddit post
      </button>
      {open && (
        <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Textarea
              value={pasteBlob}
              onChange={(e) => setPasteBlob(e.target.value)}
              onPaste={(e) => applyPaste(e.clipboardData.getData("text"))}
              placeholder="Paste the whole Reddit page here to auto-fill…"
              className="min-h-[60px] text-[11px]"
            />
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              Open the post → Ctrl+A, Ctrl+C → paste here. Everything below stays editable.
            </div>
          </div>
          <select
            value={campusId}
            onChange={(e) => setCampusId(e.target.value)}
            className={inputCls}
          >
            <option value="">Select campus…</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Reddit username (u/…)"
            className="text-sm"
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post title"
            className="text-sm sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={(e) => tryAutofill(e.target.value)}
                onPaste={(e) => tryAutofill(e.clipboardData.getData("text"))}
                placeholder="https://www.reddit.com/r/…/comments/…  (paste to auto-fill)"
                className="text-sm"
              />
              {fetching && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              )}
            </div>
            {autoFilled && (
              <div className="mt-0.5 text-[10px] text-emerald-700">
                Auto-filled from Reddit — edit anything before saving.
              </div>
            )}
          </div>
          <select value={major} onChange={(e) => setMajor(e.target.value)} className={inputCls}>
            <option value="unknown">Major? Unknown</option>
            <option value="yes">Accounting major</option>
            <option value="no">Not a major</option>
          </select>
          <div className="flex gap-2">
            <select
              value={takingCourse}
              onChange={(e) => setTakingCourse(e.target.value)}
              className={`flex-1 ${inputCls}`}
            >
              <option value="">Taking…</option>
              {COURSE_FAMILIES.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <Input
              value={takingTerm}
              onChange={(e) => setTakingTerm(e.target.value)}
              placeholder="Fall 2025"
              className="flex-1 text-sm"
            />
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="min-h-[52px] text-sm sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <Button size="sm" onClick={add} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              Add to triage
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
