// /admin/growth/king — KING HQ. His home screen, and the reason he wants to log in.
//
// The whole page answers three questions in his language: how much have I earned,
// how close is the next milestone, and what happened lately. The mini-Venn mirrors
// the Attribution Guide so the money always comes with its explanation, and both
// documents are downloadable right here (short-lived signed URLs — never public).
//
// King lands HERE by default (the Campuses index redirects his identity). Lee sees
// the same page; there is exactly one version of the truth.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Crown, Download, FileText, Loader2, Mail, PartyPopper, Send } from "lucide-react";
import { toast } from "sonner";
import {
  growthCompSummary,
  kingDigestPreview,
  kingDocUrl,
  sendKingDigestNow,
  type KingCompView,
} from "@/lib/growth-comp.functions";
import { fmtUsd, MILESTONES } from "@/lib/growth-comp-core";
import { getAdminWho } from "@/components/AdminGate";
import { ActivityFeed } from "@/components/growth/ActivityFeed";
import { Chip, Hint, InfoDot } from "@/components/growth/v2";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/admin/growth/king")({
  component: KingHq,
});

function KingHq() {
  const q = useQuery({
    queryKey: ["king-comp"],
    queryFn: () => growthCompSummary(),
    staleTime: 60_000,
  });
  const [who, setWho] = useState<string | null>(null);
  useEffect(() => setWho(getAdminWho()), []);

  if (q.isLoading || !q.data) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  const v = q.data;
  const s = v.summary;
  const isKing = who === "king";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* hero */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Crown className="size-5 text-primary" />
          <h1 className="sa-admin-display text-lg font-semibold uppercase tracking-wide">
            {isKing ? "King HQ" : "King HQ (Lee's view)"}
          </h1>
          <span className="ml-auto text-[11px] text-muted-foreground">{s.semester.label}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Big
            label="Your growth revenue"
            value={fmtUsd(s.buckets.king_growth)}
            hint="Everything attributed to channels you run — your campaigns plus reps you manage. Your 5% is calculated on this number."
          />
          <Big
            label="Your 5% earned"
            value={fmtUsd(s.kingCommissionCents)}
            tone="gold"
            hint="5% of your growth revenue. Paid monthly by the 10th for the prior month."
          />
          <Big
            label="Milestone bonus"
            value={fmtUsd(s.milestones.bonusEarnedCents)}
            hint="Company-level bonuses on TOTAL Survive revenue — tracked or not. Attribution isn't contribution; this covers the difference."
          />
          <Big
            label="Total earned"
            value={fmtUsd(s.kingTotalCents)}
            tone="gold"
            big
            hint="Commission plus milestone bonuses, semester to date."
          />
        </div>
      </div>

      {/* milestone track */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-1 flex items-center gap-1.5">
          <h2 className="sa-admin-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Road to {s.milestones.next ? fmtUsd(s.milestones.next.revenueCents) : "the top"}
          </h2>
          <InfoDot text="Total Survive revenue this semester, all channels. Each flag is a milestone from your agreement — cumulative, so reaching $100k pays a total of $3,500." />
          {s.milestones.reached && (
            <Chip
              tone="good"
              hint={`You've cleared the ${fmtUsd(s.milestones.reached.revenueCents)} milestone — ${fmtUsd(s.milestones.reached.bonusCents)} earned.`}
            >
              <PartyPopper className="size-3" /> {fmtUsd(s.milestones.reached.revenueCents)} cleared
            </Chip>
          )}
        </div>
        <MilestoneTrack totalCents={s.totalRevenueCents} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Company total so far:{" "}
          <strong className="text-foreground">{fmtUsd(s.totalRevenueCents)}</strong>
          {s.milestones.next && (
            <>
              {" "}
              · {fmtUsd(s.milestones.next.revenueCents - s.totalRevenueCents)} to your next{" "}
              {fmtUsd(s.milestones.next.bonusCents)} bonus
            </>
          )}
        </p>
      </div>

      {/* where the money came from — the mini venn */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-2 flex items-center gap-1.5">
          <h2 className="sa-admin-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Where revenue is coming from
          </h2>
          <InfoDot text="The three tracked buckets from your Attribution Guide, on the untracked field. Only the gold circle pays your 5% — the milestones pay on all of it." />
        </div>
        <MiniVenn view={v} />
      </div>

      {/* effort + wins */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="sa-admin-display mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your semester so far
          </h2>
          <div className="space-y-1.5 text-sm">
            <Row
              k="Emails delivered"
              v={String(v.outreach.emailsSent)}
              hint="Provider-confirmed sends only — a logged note never counts."
            />
            <Row k="Instagram DMs" v={String(v.outreach.dms)} />
            <Row k="Replies" v={String(v.outreach.replies)} />
            <Row
              k="Seats bought / claimed"
              v={`${v.seats.bought} / ${v.seats.claimed}`}
              hint="Bought is the money; claimed is members actually using them. A gap means a chapter needs help distributing."
            />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="sa-admin-display mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Latest wins
          </h2>
          {v.recentWins.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Nothing on the board yet — the first chapter you close lands here, with the dollars
              next to it.
            </p>
          ) : (
            <div className="space-y-1.5">
              {v.recentWins.slice(0, 6).map((w, i) => (
                <div key={i} className="flex items-baseline gap-2 text-[12px]">
                  <span className="min-w-0 flex-1">{w.text}</span>
                  {w.amountCents != null && (
                    <span className="shrink-0 font-semibold text-emerald-400">
                      {fmtUsd(w.amountCents)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* documents + digest */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="sa-admin-display mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Your documents
        </h2>
        <div className="flex flex-wrap gap-2">
          <DocButton doc="contract" label="Growth Partner Agreement" />
          <DocButton doc="attribution" label="Revenue Attribution Guide" />
        </div>
        {!isKing && <DigestControls />}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="sa-admin-display mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          What's happening
        </h2>
        <ActivityFeed compact />
      </div>
    </div>
  );
}

function Big({
  label,
  value,
  hint,
  tone,
  big,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "gold";
  big?: boolean;
}) {
  return (
    <Hint text={hint}>
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-center">
        <div
          className={cn(
            "sa-admin-display font-semibold tabular-nums",
            big ? "text-2xl" : "text-xl",
            tone === "gold" && "text-primary",
          )}
        >
          {value}
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      </div>
    </Hint>
  );
}

function Row({ k, v, hint }: { k: string; v: string; hint?: string }) {
  const body = (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-semibold tabular-nums">{v}</span>
    </div>
  );
  return hint ? <Hint text={hint}>{body}</Hint> : body;
}

/** The gold road. The bolt rides the bar; flags mark the tiers; cleared tiers glow. */
function MilestoneTrack({ totalCents }: { totalCents: number }) {
  const max = MILESTONES[MILESTONES.length - 1].revenueCents;
  // sqrt scale so the early tiers (where the action is this semester) get real width
  const pos = (c: number) => Math.min(1, Math.sqrt(c / max)) * 100;
  return (
    <div className="relative mt-6 h-10">
      <div className="absolute left-0 right-0 top-4 h-2 rounded-full bg-muted" />
      <div
        className="absolute top-4 h-2 rounded-full bg-primary transition-all"
        style={{ width: `${pos(totalCents)}%` }}
      />
      {/* the rider */}
      <div
        className="absolute top-0.5 -translate-x-1/2 text-base transition-all"
        style={{ left: `${pos(totalCents)}%` }}
      >
        ⚡
      </div>
      {MILESTONES.map((m) => {
        const cleared = totalCents >= m.revenueCents;
        return (
          <Hint
            key={m.revenueCents}
            text={`${fmtUsd(m.revenueCents)} total revenue → ${fmtUsd(m.bonusCents)} bonus (cumulative)`}
          >
            <div
              className="absolute top-2.5 -translate-x-1/2"
              style={{ left: `${pos(m.revenueCents)}%` }}
            >
              <div className={cn("h-5 w-0.5", cleared ? "bg-primary" : "bg-border")} />
              <div
                className={cn(
                  "mt-0.5 -translate-x-1/2 whitespace-nowrap text-[9px] tabular-nums",
                  cleared ? "font-semibold text-primary" : "text-muted-foreground",
                )}
                style={{ marginLeft: "50%" }}
              >
                {fmtUsd(m.revenueCents)}
              </div>
            </div>
          </Hint>
        );
      })}
    </div>
  );
}

/** Compact venn: three discs sized to feel, not to scale; amounts beside each. */
function MiniVenn({ view }: { view: KingCompView }) {
  const b = view.summary.buckets;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 200 120" width="180" aria-hidden="true">
        <rect
          x="2"
          y="2"
          width="196"
          height="116"
          rx="10"
          fill="var(--bg-page, #0F1A2E)"
          stroke="var(--border-default, #34486D)"
        />
        <circle
          cx="75"
          cy="52"
          r="36"
          fill="#FCA311"
          fillOpacity="0.45"
          stroke="#FCA311"
          strokeWidth="1.5"
        />
        <circle
          cx="118"
          cy="52"
          r="36"
          fill="#62B6EA"
          fillOpacity="0.4"
          stroke="#62B6EA"
          strokeWidth="1.5"
        />
        <circle
          cx="96"
          cy="80"
          r="28"
          fill="#CE1126"
          fillOpacity="0.45"
          stroke="#E5484D"
          strokeWidth="1.5"
        />
        <text x="52" y="38" fontSize="8.5" fontWeight="700" fill="#FFD9A0">
          YOU
        </text>
        <text x="128" y="38" fontSize="8.5" fontWeight="700" fill="#BFE3FA">
          REPS
        </text>
        <text x="82" y="106" fontSize="8.5" fontWeight="700" fill="#FFB3BB">
          FOUNDER
        </text>
        <text x="8" y="114" fontSize="6.5" fill="#8fa0c0">
          untracked field = organic
        </text>
      </svg>
      <div className="min-w-40 flex-1 space-y-1.5 text-[12px]">
        <VennRow
          color="#FCA311"
          label="Your growth channels"
          cents={b.king_growth}
          note="pays your 5%"
        />
        <VennRow
          color="#CE1126"
          label="Founder (Lee's links)"
          cents={b.founder}
          note="excluded by agreement"
        />
        <VennRow
          color="#8fa0c0"
          label="Organic / untracked"
          cents={b.organic}
          note="counts toward milestones"
        />
      </div>
    </div>
  );
}

function VennRow({
  color,
  label,
  cents,
  note,
}: {
  color: string;
  label: string;
  cents: number;
  note: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {label} <span className="text-[10px]">· {note}</span>
      </span>
      <span className="shrink-0 font-semibold tabular-nums">{fmtUsd(cents)}</span>
    </div>
  );
}

function DocButton({ doc, label }: { doc: "contract" | "attribution"; label: string }) {
  const get = useMutation({
    mutationFn: () => kingDocUrl({ data: { doc } }),
    onSuccess: (r) => {
      if (r.url) window.open(r.url, "_blank");
      else toast.error(r.error ?? "Couldn't fetch the document.");
    },
  });
  return (
    <button
      onClick={() => get.mutate()}
      disabled={get.isPending}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
    >
      {get.isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <FileText className="size-3.5" />
      )}
      {label}
      <Download className="size-3 text-muted-foreground" />
    </button>
  );
}

/** Lee-only digest controls: preview what King would receive, or send it now. */
function DigestControls() {
  const [preview, setPreview] = useState<string | null>(null);
  const load = useMutation({
    mutationFn: () => kingDigestPreview(),
    onSuccess: (r) => setPreview(`Subject: ${r.subject}\n\n${r.text}`),
  });
  const send = useMutation({
    mutationFn: () => sendKingDigestNow(),
    onSuccess: (r) =>
      r.ok ? toast.success("Digest sent to King.") : toast.error(r.error ?? "Send failed"),
  });
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Hint text="See exactly the plain-text email King's daily digest would contain right now.">
          <button
            onClick={() => load.mutate()}
            disabled={load.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
          >
            <Mail className="size-3" /> Preview King's digest
          </button>
        </Hint>
        <button
          onClick={() => {
            if (window.confirm("Email this digest to King now?")) send.mutate();
          }}
          disabled={send.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
        >
          <Send className="size-3" /> Send now
        </button>
        <span className="text-[10px] text-muted-foreground">
          Also runs daily at 8am CT — only when something changed.
        </span>
      </div>
      {preview && (
        <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px]">
          {preview}
        </pre>
      )}
    </div>
  );
}
