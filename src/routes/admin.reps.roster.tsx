// /admin/reps/roster — CAMPUS REPS management: the roster/leaderboard, the application queue
// (approve → rep verifies phone → active), rep-submitted contact QC (the gate that QUALIFIES a
// chapter assignment), and per-rep actions incl. read-only "View as".
//
// Sits inside the existing /admin/reps shell → AdminGate + AdminSessionGate wrap it; every server
// function it calls assertAdmin()s again server-side.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Money, TestToggle, useShowTest } from "@/components/reps/RepsKit";
import {
  adminAssignmentAction, adminChangeRepCampus, adminListPendingRepContacts, adminListReps,
  adminGetRepBonus, adminListRepApplications, adminQueueSigningBonus, adminRepAction,
  adminRepAssignments, adminReviewApplication, adminReviewRepContact, adminScheduleRepCall,
  type AdminRepRow, type RepApplicationCard,
} from "@/lib/rep-admin.functions";
import { REP_COVERAGES, REP_COVERAGE_LABEL, REP_STATUS_LABEL, type RepCoverage, type RepStatus } from "@/lib/rep-shared";
import { CALL_CAPTURE_PROMPTS } from "@/lib/rep-copy";

export const Route = createFileRoute("/admin/reps/roster")({
  component: RosterPage,
});

const STATUS_TONE: Record<RepStatus, string> = {
  applied: "bg-amber-500/15 text-amber-600",
  approved: "bg-sky-500/15 text-sky-600",
  active: "bg-emerald-500/15 text-emerald-600",
  paused: "bg-slate-500/15 text-slate-500",
  deactivated: "bg-rose-500/15 text-rose-600",
};

type SortKey = "chaptersQualified" | "contactsApproved" | "clicks" | "signups" | "revenueCents" | "commissionCents" | "createdAt";

function RosterPage() {
  const qc = useQueryClient();
  const [showTest, setShowTest] = useShowTest();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("revenueCents");
  const [openRep, setOpenRep] = useState<AdminRepRow | null>(null);

  const reps = useQuery({ queryKey: ["admin-reps"], queryFn: () => adminListReps() });
  const pending = useQuery({ queryKey: ["admin-rep-contacts"], queryFn: () => adminListPendingRepContacts() });
  const apps = useQuery({ queryKey: ["admin-rep-apps"], queryFn: () => adminListRepApplications() });

  const rows = useMemo(() => {
    let list = reps.data?.reps ?? [];
    if (!showTest) list = list.filter((r) => !r.isTest);
    if (status !== "all") list = list.filter((r) => r.repStatus === status);
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((r) => r.name.toLowerCase().includes(needle) || (r.campusName ?? "").toLowerCase().includes(needle) || (r.email ?? "").toLowerCase().includes(needle));
    return [...list].sort((a, b) => sort === "createdAt" ? b.createdAt.localeCompare(a.createdAt) : (b[sort] as number) - (a[sort] as number));
  }, [reps.data, showTest, status, q, sort]);

  const applications = useMemo(() => (reps.data?.reps ?? []).filter((r) => r.repStatus === "applied" && (showTest || !r.isTest)), [reps.data, showTest]);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin-reps"] }); void qc.invalidateQueries({ queryKey: ["admin-rep-contacts"] }); void qc.invalidateQueries({ queryKey: ["admin-rep-apps"] }); };

  const act = useMutation({
    mutationFn: (v: { partnerId: string; action: "approve" | "pause" | "reactivate" | "deactivate" | "revoke_sessions" }) => adminRepAction({ data: v }),
    onSuccess: (r) => { if (r.ok) { toast.success("Done."); refresh(); } else toast.error(r.error ?? "Failed."); },
    onError: () => toast.error("Couldn't reach the server."),
  });
  const review = useMutation({
    mutationFn: (v: { contactId: string; decision: "approve" | "reject"; makeEligible?: boolean }) => adminReviewRepContact({ data: v }),
    onSuccess: (r) => { if (r.ok) { toast.success(r.assignment ? `Contact reviewed — assignment now ${r.assignment}.` : "Contact reviewed."); refresh(); } else toast.error(r.error ?? "Failed."); },
    onError: () => toast.error("Couldn't reach the server."),
  });

  return (
    <div className="grid gap-6">
      {/* APPLICATIONS */}
      {applications.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          {/* SELF-VERIFY ERA: signup no longer waits on approval — this section only renders for
              LEGACY 'applied' rows from the brief approval-gate era. */}
          <h2 className="text-sm font-bold">Legacy unverified signups ({applications.length})</h2>
          <div className="mt-2 grid gap-2">
            {applications.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <div className="min-w-0 text-sm">
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-muted-foreground"> · {r.campusName ?? "no campus"} · {r.email ?? "—"} · {r.phone ?? "—"}{r.phoneVerified ? " · phone ✓" : ""}{r.isTest ? " · TEST" : ""}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => act.mutate({ partnerId: r.id, action: "approve" })} disabled={act.isPending}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => act.mutate({ partnerId: r.id, action: "deactivate" })} disabled={act.isPending}>Decline</Button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Signup is self-verify now — these older rows just need the rep to verify their phone at /rep/dashboard. Approve clears them into that path; Decline deactivates.</p>
        </section>
      )}

      {/* V2 APPLICATION QUEUE — call-first review, sorted by chapters reachable */}
      <section className="rounded-xl border border-border p-4">
        <h2 className="text-sm font-bold">Rep applications {apps.data?.applications.length ? `(${apps.data.applications.length})` : ""}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Sorted by chapters reachable — the number that decides this. Every applicant gets a call before approval; approving asks for the coverage call (the campus-capacity flag) and turns their coverage map into assigned chapters.</p>
        {apps.isLoading && <p className="mt-2 text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Loading…</p>}
        {apps.data && apps.data.applications.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No applications waiting ⚡</p>}
        <div className="mt-2 grid gap-2">
          {(apps.data?.applications ?? []).map((a) => (
            <ApplicationCard key={a.partnerId} a={a} refresh={refresh} />
          ))}
        </div>
      </section>

      {/* REP-SUBMITTED CONTACT QC */}
      <section className="rounded-xl border border-border p-4">
        <h2 className="text-sm font-bold">Rep-submitted contacts to review {pending.data?.contacts.length ? `(${pending.data.contacts.length})` : ""}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Approve = the contact is real/usable → the rep's chapter reservation QUALIFIES. Reject = fake/wrong → the reservation releases unless the rep has another usable contact. "Also open for outreach" additionally makes it eligible in the Growth queue.</p>
        {pending.isLoading && <p className="mt-2 text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Loading…</p>}
        {pending.data && pending.data.contacts.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Queue is empty ⚡</p>}
        <div className="mt-2 grid gap-2">
          {(pending.data?.contacts ?? []).map((c) => (
            <div key={c.contactId} className="rounded-lg border border-border px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{c.name ?? "(no name)"}{c.role ? ` · ${c.role}` : ""} <span className="font-normal text-muted-foreground">— {c.chapterName}, {c.campusName}</span></p>
                  <p className="text-xs text-muted-foreground">{[c.email, c.phone, c.instagram].filter(Boolean).join(" · ") || "no contact point?"} · by {c.repName}{c.notes ? ` · "${c.notes}"` : ""}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" onClick={() => review.mutate({ contactId: c.contactId, decision: "approve" })} disabled={review.isPending}>Approve</Button>
                  <Button size="sm" variant="secondary" onClick={() => review.mutate({ contactId: c.contactId, decision: "approve", makeEligible: true })} disabled={review.isPending}>Approve + outreach</Button>
                  <Button size="sm" variant="outline" onClick={() => review.mutate({ contactId: c.contactId, decision: "reject" })} disabled={review.isPending}>Reject</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ROSTER / LEADERBOARD */}
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, campus, email…" className="max-w-xs" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(REP_STATUS_LABEL) as RepStatus[]).map((s) => <SelectItem key={s} value={s}>{REP_STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="revenueCents">Sort: Revenue</SelectItem>
              <SelectItem value="commissionCents">Sort: Commission</SelectItem>
              <SelectItem value="chaptersQualified">Sort: Chapters qualified</SelectItem>
              <SelectItem value="contactsApproved">Sort: Contacts approved</SelectItem>
              <SelectItem value="clicks">Sort: Clicks</SelectItem>
              <SelectItem value="signups">Sort: Signups</SelectItem>
              <SelectItem value="createdAt">Sort: Newest</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto"><TestToggle value={showTest} onChange={setShowTest} /></div>
        </div>

        {reps.isLoading && <p className="mt-4 text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Loading reps…</p>}
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2">Rep</th>
                <th className="px-3 py-2">Campus</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-center">Phone ✓</th>
                <th className="px-3 py-2 text-right">Chapters</th>
                <th className="px-3 py-2 text-right">Contacts</th>
                <th className="px-3 py-2 text-right">Clicks</th>
                <th className="px-3 py-2 text-right">Signups</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2 text-right">Commission</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30" onClick={() => setOpenRep(r)}>
                  <td className="px-3 py-2 font-semibold">{r.name}{r.isTest && <span className="ml-1.5 rounded bg-orange-500/15 px-1 text-[10px] font-bold text-orange-600">TEST</span>}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.campusName ?? "—"}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[r.repStatus]}`}>{REP_STATUS_LABEL[r.repStatus]}</span></td>
                  <td className="px-3 py-2 text-center">{r.phoneVerified ? "✓" : "—"}</td>
                  <td className="px-3 py-2 text-right">{r.chaptersQualified}<span className="text-muted-foreground">/{r.chaptersReserved + r.chaptersQualified}</span></td>
                  <td className="px-3 py-2 text-right">{r.contactsApproved}<span className="text-muted-foreground">/{r.contactsSubmitted}</span></td>
                  <td className="px-3 py-2 text-right">{r.clicks}</td>
                  <td className="px-3 py-2 text-right">{r.signups}</td>
                  <td className="px-3 py-2 text-right"><Money cents={r.revenueCents} /></td>
                  <td className="px-3 py-2 text-right"><Money cents={r.commissionCents} /></td>
                </tr>
              ))}
              {rows.length === 0 && !reps.isLoading && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">No reps match.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Chapters = qualified/total this term · Contacts = approved/submitted. Commission excludes void. Ledger lives in the Conversions tab.</p>
      </section>

      {openRep && <RepDrawer rep={openRep} onClose={() => setOpenRep(null)} refresh={refresh} act={(action) => act.mutate({ partnerId: openRep.id, action })} busy={act.isPending} />}
    </div>
  );
}

// ── V2 application card — one applicant, everything the call needs ───────────────────────────
function ApplicationCard({ a, refresh }: { a: RepApplicationCard; refresh: () => void }) {
  const [coverage, setCoverage] = useState<RepCoverage | "">("");
  const [callAt, setCallAt] = useState("");
  const [notes, setNotes] = useState(a.callNotes ?? "");
  const review = useMutation({
    mutationFn: (v: { decision: "approve" | "waitlist" | "decline" }) =>
      adminReviewApplication({ data: { partnerId: a.partnerId, decision: v.decision, coverage: coverage || null, callNotes: notes || null } }),
    onSuccess: (r) => {
      if (r.ok) { toast.success(r.assignedCount != null ? `Approved — ${r.assignedCount} chapter${r.assignedCount === 1 ? "" : "s"} assigned${r.skipped ? `, ${r.skipped} already held` : ""}.` : "Done."); refresh(); }
      else toast.error(r.error ?? "Failed.");
    },
    onError: () => toast.error("Couldn't reach the server."),
  });
  const schedule = useMutation({
    mutationFn: () => adminScheduleRepCall({ data: { partnerId: a.partnerId, callAt, notes: notes || null } }),
    onSuccess: (r) => { if (r.ok) { toast.success("Call scheduled."); refresh(); } else toast.error(r.error ?? "Failed."); },
  });
  const courseLabel = a.courseStatus === "taking_now" ? "taking the course now" : a.courseStatus === "taken" ? "has taken the course" : a.courseStatus === "not_yet" ? "hasn't taken it" : "course status unknown";

  return (
    <div className="rounded-lg border border-border px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {a.name}
            {a.weightedRole && <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">COUNCIL ACCESS</span>}
            {a.isTest && <span className="ml-1.5 rounded bg-orange-500/15 px-1 text-[10px] font-bold text-orange-600">TEST</span>}
            <span className="font-normal text-muted-foreground"> · {a.campusName ?? "?"} · {a.ownChapterName ?? "no chapter"}{a.graduationYear ? ` · '${String(a.graduationYear).slice(2)}` : ""}</span>
          </p>
          <p className="text-xs text-muted-foreground">{[a.email, a.phone].filter(Boolean).join(" · ")} · {courseLabel}{a.roles.length ? ` · roles: ${a.roles.join(", ")}` : ""}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold leading-none">{a.reachable}</p>
          <p className="text-[10px] uppercase text-muted-foreground">chapters reachable</p>
          <p className="text-[11px] text-muted-foreground">member of {a.reachMember} · knows someone at {a.reachKnows}</p>
        </div>
      </div>
      {a.pitch && <p className="mt-1.5 rounded bg-muted/40 px-2.5 py-1.5 text-xs italic">“{a.pitch}”</p>}
      {a.callAt && <p className="mt-1.5 text-xs text-muted-foreground">📞 Call {new Date(a.callAt).toLocaleString()}{a.status === "waitlisted" ? " · currently waitlisted" : ""}</p>}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="grid gap-0.5">
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">Schedule call</label>
          <div className="flex gap-1.5">
            <Input type="datetime-local" value={callAt} onChange={(e) => setCallAt(e.target.value)} className="h-8 w-[190px] text-xs" />
            <Button size="sm" variant="outline" onClick={() => schedule.mutate()} disabled={!callAt || schedule.isPending}>Set</Button>
          </div>
        </div>
        <div className="grid min-w-[200px] flex-1 gap-0.5">
          <label className="text-[10px] font-semibold uppercase text-muted-foreground" title={CALL_CAPTURE_PROMPTS.join(" · ")}>Call notes — {CALL_CAPTURE_PROMPTS.length} things to capture</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={CALL_CAPTURE_PROMPTS[0]} className="h-8 text-xs" />
        </div>
        <Select value={coverage} onValueChange={(v) => setCoverage(v as RepCoverage)}>
          <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue placeholder="Coverage (for approve)" /></SelectTrigger>
          <SelectContent>
            {REP_COVERAGES.map((c) => <SelectItem key={c} value={c}>{REP_COVERAGE_LABEL[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => review.mutate({ decision: "approve" })} disabled={!coverage || review.isPending}>Approve</Button>
        <Button size="sm" variant="secondary" onClick={() => review.mutate({ decision: "waitlist" })} disabled={review.isPending}>Waitlist</Button>
        <Button size="sm" variant="outline" onClick={() => review.mutate({ decision: "decline" })} disabled={review.isPending}>Decline</Button>
      </div>
    </div>
  );
}

// ── signing bonus (drawer block): derived state + the one-time queue action ──────────────────
function BonusBlock({ partnerId }: { partnerId: string }) {
  const q = useQuery({ queryKey: ["admin-rep-bonus", partnerId], queryFn: () => adminGetRepBonus({ data: { partnerId } }) });
  const queue = useMutation({
    mutationFn: () => adminQueueSigningBonus({ data: { partnerId } }),
    onSuccess: (r) => { if (r.ok) { toast.success(`Bonus queued — $${((r.cents ?? 0) / 100).toFixed(2)} pending in the ledger.`); void q.refetch(); } else toast.error(r.error ?? "Failed."); },
    onError: () => toast.error("Couldn't reach the server."),
  });
  if (!q.data?.ok) return null;
  const { bonus, alreadyQueued } = q.data;
  return (
    <div className="rounded-lg border border-border px-3 py-2 text-sm">
      <p className="font-bold">Signing bonus <span className="font-normal text-muted-foreground">— {bonus.lines.map((l) => `${l.count}×$${l.eachCents / 100}`).join(" · ")}</span></p>
      <p className="text-xs text-muted-foreground">
        Earned ${(bonus.earnedCents / 100).toFixed(2)} of $300 · {bonus.locked ? "🔒 locked (no $1,000+ chapter sale)" : "✓ unlocked"}
        {alreadyQueued && ` · queued in ledger ($${(alreadyQueued.cents / 100).toFixed(2)}, ${alreadyQueued.status})`}
      </p>
      {!bonus.locked && !alreadyQueued && bonus.earnedCents > 0 && (
        <Button size="sm" className="mt-1.5" onClick={() => queue.mutate()} disabled={queue.isPending}>Queue bonus payout (one-time)</Button>
      )}
    </div>
  );
}

// ── per-rep drawer ───────────────────────────────────────────────────────────────────────────
function RepDrawer({ rep, onClose, refresh, act, busy }: {
  rep: AdminRepRow; onClose: () => void; refresh: () => void;
  act: (a: "approve" | "pause" | "reactivate" | "deactivate" | "revoke_sessions") => void; busy: boolean;
}) {
  const [campusSlug, setCampusSlug] = useState("");
  const asg = useQuery({ queryKey: ["admin-rep-asg", rep.id], queryFn: () => adminRepAssignments({ data: { partnerId: rep.id } }) });
  const changeCampus = useMutation({
    mutationFn: () => adminChangeRepCampus({ data: { partnerId: rep.id, campusSlug: campusSlug.trim() } }),
    onSuccess: (r) => { if (r.ok) { toast.success("Campus changed."); refresh(); } else toast.error(r.error ?? "Failed."); },
  });
  const asgAct = useMutation({
    mutationFn: (v: { assignmentId: string; action: "revoke" | "release" }) => adminAssignmentAction({ data: v }),
    onSuccess: (r) => { if (r.ok) { toast.success("Assignment updated."); void asg.refetch(); refresh(); } else toast.error(r.error ?? "Failed."); },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rep.name} <span className="text-sm font-normal text-muted-foreground">· {rep.campusName ?? "no campus"} · {REP_STATUS_LABEL[rep.repStatus]}{rep.isTest ? " · TEST" : ""}</span></DialogTitle>
        </DialogHeader>

        <div className="grid gap-1 text-sm">
          <p><span className="text-muted-foreground">Email</span> {rep.email ?? "—"} · <span className="text-muted-foreground">Phone</span> {rep.phone ?? "—"} {rep.phoneVerified ? "✓ verified" : "(unverified)"}</p>
          <p className="text-muted-foreground">Chapters {rep.chaptersQualified}/{rep.chaptersReserved + rep.chaptersQualified} qualified · Contacts {rep.contactsApproved}/{rep.contactsSubmitted} approved · {rep.clicks} clicks · {rep.signups} signups · <Money cents={rep.revenueCents} /> revenue · <Money cents={rep.commissionCents} /> commission</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {rep.repStatus === "applied" && <Button size="sm" onClick={() => act("approve")} disabled={busy}>Approve</Button>}
          {(rep.repStatus === "active" || rep.repStatus === "approved") && <Button size="sm" variant="outline" onClick={() => act("pause")} disabled={busy}>Pause</Button>}
          {(rep.repStatus === "paused" || rep.repStatus === "deactivated") && <Button size="sm" onClick={() => act("reactivate")} disabled={busy}>Reactivate</Button>}
          {rep.repStatus !== "deactivated" && <Button size="sm" variant="outline" onClick={() => act("deactivate")} disabled={busy}>Deactivate</Button>}
          <Button size="sm" variant="outline" onClick={() => act("revoke_sessions")} disabled={busy}>Revoke sessions</Button>
          <Button size="sm" variant="secondary" asChild>
            <Link to="/admin/reps/view/$partnerId" params={{ partnerId: rep.id }}>View as {rep.name.split(" ")[0]} →</Link>
          </Button>
        </div>

        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-1">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Change campus (slug)</label>
            <Input value={campusSlug} onChange={(e) => setCampusSlug(e.target.value)} placeholder="e.g. auburn" />
          </div>
          <Button size="sm" variant="outline" onClick={() => changeCampus.mutate()} disabled={!campusSlug.trim() || changeCampus.isPending}>Change</Button>
        </div>

        <BonusBlock partnerId={rep.id} />

        <div>
          <h3 className="text-sm font-bold">Chapter assignments</h3>
          {asg.isLoading && <p className="mt-1 text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Loading…</p>}
          {asg.data && asg.data.assignments.length === 0 && <p className="mt-1 text-sm text-muted-foreground">None yet.</p>}
          <div className="mt-1.5 grid gap-1.5">
            {(asg.data?.assignments ?? []).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <p><span className="font-semibold">{a.chapterName}</span> <span className="text-muted-foreground">· {a.termId} · {a.status}</span></p>
                {(a.status === "reserved" || a.status === "qualified") && (
                  <Button size="sm" variant="outline" onClick={() => asgAct.mutate({ assignmentId: a.id, action: "revoke" })} disabled={asgAct.isPending}>Revoke</Button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Revoking frees the chapter for another rep this term. Reassignment: revoke here, then the other rep adds their contact (or use the DB console for a direct transfer).</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
