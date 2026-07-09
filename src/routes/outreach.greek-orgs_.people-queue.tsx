// /outreach/greek-orgs/people-queue — phase-2 VA queue: one PERSON per screen.
// Works greek_org_people by years_count desc where contact fields are still empty
// (status pending). Card: name/org/titles/tenure + a LinkedIn search link + the
// enrichment fields. Confirm & next (Enter) = enriched, N = not found.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, SkipForward } from "lucide-react";

import {
  fetchGreekCatalog,
  listGreekPeople,
  PERSON_ENRICH_STATUSES,
  updateGreekPerson,
  type GreekPerson,
} from "@/lib/greek-orgs";
import { FilterPill } from "@/components/outreach/FilterPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/outreach/greek-orgs_/people-queue")({
  head: () => ({ meta: [{ title: "GreekIntel — people queue" }] }),
  component: PeopleQueue,
});

const linkedInSearchUrl = (name: string, orgName: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    `${name} ${orgName}`,
  )}`;

function PeopleQueue() {
  const peopleQuery = useQuery({ queryKey: ["greek-people"], queryFn: listGreekPeople });
  const catalogQuery = useQuery({ queryKey: ["greek-catalog"], queryFn: fetchGreekCatalog });
  const people = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data]);
  const orgNameById = useMemo(
    () => new Map((catalogQuery.data ?? []).map((o) => [o.id, o.name])),
    [catalogQuery.data],
  );

  const [status, setStatus] = useState<string | null>("pending");
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);

  // Deepest tenure first; the default "pending" filter also requires the contact
  // fields to still be empty (that's the work this queue exists to do).
  const queue = useMemo(
    () =>
      people
        .filter((p) => {
          const s = p.enrichment_status ?? "pending";
          if (status && s !== status) return false;
          if (status === "pending" && (p.email || p.phone || p.linkedin_url)) return false;
          return true;
        })
        .sort((a, b) => b.years_count - a.years_count || (b.last_year ?? 0) - (a.last_year ?? 0)),
    [people, status],
  );

  const current = started ? queue[idx] : null;

  function advance() {
    peopleQuery.refetch();
    if (idx + 1 >= queue.length) {
      toast.success("People queue complete.");
      setStarted(false);
      setIdx(0);
    } else {
      setIdx((i) => i + 1);
    }
  }

  if (!started) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">People queue</h1>
          <Link to="/outreach/greek-orgs" className="text-sm text-primary underline">
            ← registry
          </Link>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          One person per screen, deepest tenure first. Enter = confirm &amp; next, N = not found.
        </p>
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Status:</span>
            {PERSON_ENRICH_STATUSES.map((s) => (
              <FilterPill key={s} active={status === s} onClick={() => setStatus(s)}>
                {s}
              </FilterPill>
            ))}
            <FilterPill active={!status} onClick={() => setStatus(null)}>
              any
            </FilterPill>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={() => {
                setIdx(0);
                setStarted(true);
              }}
              disabled={queue.length === 0}
            >
              Start queue ({queue.length})
            </Button>
            {queue.length === 0 && (
              <span className="text-xs text-muted-foreground">
                No people match. Paste officers in the org queue first.
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!current) {
    return <div className="p-6 text-sm text-muted-foreground">Queue empty.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <button type="button" onClick={() => setStarted(false)} className="text-primary underline">
          ← filters
        </button>
        <span>
          {idx + 1} of {queue.length}
        </span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary"
          style={{ width: `${((idx + 1) / queue.length) * 100}%` }}
        />
      </div>

      <PersonCard
        key={current.id}
        p={current}
        orgName={orgNameById.get(current.org_id) ?? "—"}
        onDone={advance}
      />
    </div>
  );
}

const FIELDS: { key: keyof GreekPerson & string; label: string; placeholder: string }[] = [
  { key: "linkedin_url", label: "LinkedIn URL", placeholder: "https://linkedin.com/in/…" },
  { key: "employer", label: "Employer", placeholder: "Company / firm" },
  { key: "role_now", label: "Role now", placeholder: "Current title" },
  { key: "alma_mater", label: "Alma mater", placeholder: "School" },
  { key: "email", label: "Email", placeholder: "email@…" },
  { key: "phone", label: "Phone", placeholder: "(###) ###-####" },
  { key: "business_url", label: "Business URL", placeholder: "https://…" },
];

function PersonCard({
  p,
  orgName,
  onDone,
}: {
  p: GreekPerson;
  orgName: string;
  onDone: () => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS.map((f) => [
        f.key,
        ((p as unknown as Record<string, unknown>)[f.key] as string) ?? "",
      ]),
    ),
  );
  const [notes, setNotes] = useState(p.notes ?? "");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));

  async function save(status: "enriched" | "not_found") {
    setBusy(true);
    try {
      const patch: Record<string, string | null> = { enrichment_status: status };
      for (const f of FIELDS) patch[f.key] = vals[f.key].trim() || null;
      patch.notes = notes.trim() || null;
      await updateGreekPerson(p.id, patch as Parameters<typeof updateGreekPerson>[1]);
      toast.success(status === "enriched" ? "Enriched." : "Marked not found.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  // Keyboard: Enter = confirm, N = not found (ignored while typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
      if (e.key === "Enter" && !typing && !busy) {
        e.preventDefault();
        save("enriched");
      } else if ((e.key === "n" || e.key === "N") && !typing && !busy) {
        e.preventDefault();
        save("not_found");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, vals, notes]);

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-lg font-bold">{p.person_name}</span>
        {p.is_current && (
          <Badge className="bg-emerald-100 text-[10px] text-emerald-700">current</Badge>
        )}
        <span className="text-muted-foreground">{orgName}</span>
        <Badge variant="secondary" className="text-[10px]">
          {p.years_count} yr{p.years_count === 1 ? "" : "s"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {p.first_year}–{p.last_year}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {(p.titles ?? []).map((t) => (
          <span
            key={t}
            className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px]"
          >
            {t}
          </span>
        ))}
      </div>

      <a
        href={linkedInSearchUrl(p.person_name, orgName)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
      >
        Search LinkedIn <ExternalLink className="h-3 w-3" />
      </a>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-[11px] font-medium text-muted-foreground">
            {f.label}
            <Input
              value={vals[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="mt-0.5 h-8 text-sm"
            />
          </label>
        ))}
        <label className="text-[11px] font-medium text-muted-foreground sm:col-span-2">
          Notes
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-0.5 min-h-[48px] text-[11px]"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => save("enriched")}>
          {busy ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-1 h-4 w-4" />
          )}
          Confirm &amp; next{" "}
          <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">Enter</kbd>
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => save("not_found")}>
          <SkipForward className="mr-1 h-4 w-4" /> Not found{" "}
          <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">N</kbd>
        </Button>
      </div>
    </div>
  );
}
