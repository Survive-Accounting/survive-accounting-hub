// /outreach/reddit — Reddit listener (LINK DASHBOARD v1). Read-only listening:
// NO posting, NO DMs, NO auto-engagement. Reddit API fetch is approval-pending, so
// v1 is manual: a grid of Reddit search links per campus + a quick-add form that
// logs a post URL into reddit_mentions for triage. The gated fetch path lives in
// reddit.functions.ts and lights up when REDDIT_LISTENER_ENABLED flips on.
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Loader2, MessageSquare, Plus, RefreshCw, Check, Pencil } from "lucide-react";

import {
  addRedditMention,
  fetchRedditCampuses,
  listRedditMentions,
  nextRedditStatus,
  redditSearchTerms,
  redditSearchUrl,
  updateCampusSubreddit,
  updateRedditMention,
  REDDIT_STATUSES,
  type RedditCampus,
  type RedditMention,
} from "@/lib/reddit";
import { refreshRedditMentions } from "@/lib/reddit.functions";
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
  new: "bg-blue-100 text-blue-700 border-blue-200",
  reviewed: "bg-amber-100 text-amber-700 border-amber-200",
  engaged: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ignored: "bg-muted text-muted-foreground border-border",
};

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

  const campusName = (id: string | null) => campuses.find((c) => c.id === id)?.name ?? "—";
  const selectedCampus = campuses.find((c) => c.id === campusId) ?? null;

  // New mentions in the last 7 days, per campus (where demand is warming).
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

  async function cycleStatus(m: RedditMention) {
    try {
      await updateRedditMention(m.id, { status: nextRedditStatus(m.status) });
      mentionsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update.");
    }
  }
  async function saveNotes(m: RedditMention, notes: string) {
    if ((m.notes ?? "") === notes) return;
    try {
      await updateRedditMention(m.id, { notes });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save note.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
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
          New mentions this week · {weekTotal} total
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

      {/* Campus filter (tabs) */}
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

      {/* Per-campus tools: subreddit editor + search-link grid + quick add */}
      {selectedCampus && (
        <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          <SubredditEditor campus={selectedCampus} onSaved={() => campusesQuery.refetch()} />
          <SearchLinkGrid campus={selectedCampus} />
        </div>
      )}
      <QuickAdd
        campuses={campuses}
        defaultCampusId={campusId}
        onAdded={() => mentionsQuery.refetch()}
      />

      {/* Mentions table */}
      <div className="mt-4">
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
          <div className="overflow-x-auto rounded-lg border border-border text-xs">
            <table className="w-full">
              <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Posted</th>
                  <th className="px-3 py-2 text-left">Campus</th>
                  <th className="px-3 py-2 text-left">Post</th>
                  <th className="px-3 py-2 text-left">Terms</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-t border-border align-top hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {relTime(m.posted_at ?? m.found_at)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{campusName(m.campus_id)}</td>
                    <td className="px-3 py-2">
                      <a
                        href={m.url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
                      >
                        {m.title || m.url || "(untitled)"}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      {m.snippet && (
                        <div className="mt-0.5 max-w-md text-[11px] text-muted-foreground">
                          {m.snippet}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex max-w-[160px] flex-wrap gap-1">
                        {(m.matched_terms ?? []).map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => cycleStatus(m)}
                        title="Click to cycle status"
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLE[m.status] ?? STATUS_STYLE.ignored}`}
                      >
                        {m.status}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        defaultValue={m.notes ?? ""}
                        placeholder="note…"
                        onBlur={(e) => saveNotes(m, e.target.value)}
                        className="h-7 w-40 text-[11px]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

  // Gated fetch button — proves the API seam; reports the disabled reason in v1.
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
  defaultCampusId,
  onAdded,
}: {
  campuses: RedditCampus[];
  defaultCampusId: string | null;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [campusId, setCampusId] = useState(defaultCampusId ?? "");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [snippet, setSnippet] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

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
        snippet: snippet || null,
        notes: notes || null,
      });
      toast.success("Logged for triage.");
      setUrl("");
      setTitle("");
      setSnippet("");
      setNotes("");
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
          <select
            value={campusId}
            onChange={(e) => setCampusId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Select campus…</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.reddit.com/r/…/comments/…"
            className="text-sm"
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post title"
            className="text-sm sm:col-span-2"
          />
          <Textarea
            value={snippet}
            onChange={(e) => setSnippet(e.target.value)}
            placeholder="Snippet (optional)"
            className="text-sm sm:col-span-2"
          />
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="text-sm sm:col-span-2"
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
