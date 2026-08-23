// /admin/reps/links — every trackable link, with its funnel. Click a row for the detail drawer:
// destination, partner, campaign, short URL + QR, effective commission rule, and recent conversions.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getAdminWho } from "@/components/AdminGate";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  CopyButton,
  KpiRow,
  Money,
  TestToggle,
  TypeBadge,
  useShowTest,
} from "@/components/reps/RepsKit";
import { getLinkDetail, listLinks, setLinkActive } from "@/lib/referral-admin.functions";
import { ruleLabel } from "@/lib/referral-shared";

export const Route = createFileRoute("/admin/reps/links")({
  component: LinksPage,
});

function LinksPage() {
  const listFn = useServerFn(listLinks);
  const [showTest, setShowTest] = useShowTest();
  const [openCode, setOpenCode] = useState<string | null>(null);

  const linksQ = useQuery({
    queryKey: ["reps-links", showTest],
    queryFn: () => listFn({ data: { includeTest: showTest } }),
  });
  const rows = linksQ.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Links</h1>
        <TestToggle value={showTest} onChange={setShowTest} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Link</th>
              <th className="px-3 py-2 text-left font-medium">Partner</th>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-right font-medium">Clicks</th>
              <th className="px-3 py-2 text-right font-medium">Signups</th>
              <th className="px-3 py-2 text-right font-medium">Purch.</th>
              <th className="px-3 py-2 text-right font-medium">Revenue</th>
              <th className="px-3 py-2 text-right font-medium">Commission</th>
            </tr>
          </thead>
          <tbody>
            {linksQ.isLoading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            )}
            {!linksQ.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No links yet. Create one in the Lab.
                </td>
              </tr>
            )}
            {rows.map((l) => (
              <tr
                key={l.id}
                onClick={() => setOpenCode(l.code)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">/r/{l.code}</span>
                    {!l.active && (
                      <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                        off
                      </span>
                    )}
                    {l.is_test && (
                      <span className="rounded bg-amber-100 px-1.5 text-[10px] text-amber-700">
                        TEST
                      </span>
                    )}
                  </div>
                  {l.label && <div className="text-xs text-muted-foreground">{l.label}</div>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span>{l.partner_name ?? "—"}</span>
                    <TypeBadge type={l.partner_type ?? null} />
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{l.campaign ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.stats.clicks}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.stats.signups}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.stats.purchases}</td>
                <td className="px-3 py-2 text-right">
                  <Money cents={l.stats.revenueCents} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Money cents={l.stats.commissionCents} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LinkDetailSheet code={openCode} onClose={() => setOpenCode(null)} />
    </div>
  );
}

function LinkDetailSheet({ code, onClose }: { code: string | null; onClose: () => void }) {
  const detailFn = useServerFn(getLinkDetail);
  const activeFn = useServerFn(setLinkActive);
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["reps-link-detail", code],
    queryFn: () => detailFn({ data: { code: code as string } }),
    enabled: !!code,
  });

  const toggleActive = useMutation({
    mutationFn: async (active: boolean) =>
      activeFn({ data: { id: detailQ.data!.link.id, active } }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["reps-link-detail", code] });
      qc.invalidateQueries({ queryKey: ["reps-links"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const d = detailQ.data;

  return (
    <Sheet open={!!code} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Link detail</SheetTitle>
        </SheetHeader>
        {!d ? (
          <div className="py-10 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <div className="space-y-2">
              <div className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm">
                {d.shortUrl}
              </div>
              <div className="flex gap-2">
                <CopyButton text={d.shortUrl} label="Copy link" className="flex-1 justify-center" />
                <a
                  href={d.qrDataUri}
                  download={`survive-${d.link.code}-qr.png`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" /> QR
                </a>
              </div>
            </div>

            <KpiRow stats={d.stats} />

            <dl className="space-y-2 text-sm">
              <Row label="Destination">
                <a
                  href={d.link.destination_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 break-all text-primary hover:underline"
                >
                  {d.link.destination_url} <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </Row>
              <Row label="Partner">
                <span className="flex items-center gap-1.5">
                  {d.partner?.name ?? "—"} <TypeBadge type={d.partner?.type ?? null} />
                </span>
              </Row>
              <Row label="Campaign">{d.link.campaign ?? "—"}</Row>
              <Row label="Commission">{ruleLabel(d.rule)}</Row>
              <Row label="Created">{new Date(d.link.created_at).toLocaleDateString()}</Row>
              <Row label="Active">
                <button
                  onClick={() => toggleActive.mutate(!d.link.active)}
                  className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted"
                >
                  {d.link.active ? "On — click to disable" : "Off — click to enable"}
                </button>
              </Row>
            </dl>

            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recent conversions
              </div>
              {d.recentConversions.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {d.recentConversions.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                    >
                      <span className="rounded bg-muted px-1.5 py-0.5">{c.kind}</span>
                      <span className="truncate text-muted-foreground">
                        {c.email ?? c.subject_type ?? "—"}
                      </span>
                      <span className="ml-auto tabular-nums">
                        <Money cents={c.amount_cents} />
                      </span>
                      {c.is_test && (
                        <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700">
                          TEST
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
