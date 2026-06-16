// Outreach Home — command-center dashboard.
// High-level snapshot, student funnel, active campaigns, quick actions.
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Activity, Mail, Users, MessageSquare, FileText, GraduationCap,
  Megaphone, Settings, MessageCircle, PlusCircle, Upload, BarChart3,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchCampaigns, fetchCampaignMetrics, fetchHomeSnapshot,
  type CampaignMetrics,
} from "@/lib/outreach-api";
import { StudentIntakesPanel } from "./StudentIntakesPanel";

interface HomeDashboardProps {
  onCreateCampaign: () => void;
  onImportLeads: () => void;
  onOpenAISettings: () => void;
  onViewTexts: () => void;
}

export function HomeDashboard({
  onCreateCampaign, onImportLeads, onOpenAISettings, onViewTexts,
}: HomeDashboardProps) {
  const snapQ = useQuery({ queryKey: ["home-snapshot"], queryFn: fetchHomeSnapshot, staleTime: 60_000 });
  const campaignsQ = useQuery({ queryKey: ["outreach-campaigns"], queryFn: fetchCampaigns });
  const activeCampaigns = (campaignsQ.data ?? []).filter((c) =>
    ["scheduled", "running", "paused"].includes(c.status),
  );

  const metricsQs = useQueries({
    queries: activeCampaigns.map((c) => ({
      queryKey: ["campaign-metrics", c.id],
      queryFn: () => fetchCampaignMetrics(c.id),
      staleTime: 60_000,
    })),
  });
  const metricsById = useMemo(() => {
    const m = new Map<string, CampaignMetrics>();
    activeCampaigns.forEach((c, i) => {
      const d = metricsQs[i]?.data;
      if (d) m.set(c.id, d);
    });
    return m;
  }, [activeCampaigns, metricsQs]);

  const s = snapQ.data;

  return (
    <div className="space-y-6">
      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onCreateCampaign} className="gap-1.5">
          <PlusCircle className="h-4 w-4" /> Create Campaign
        </Button>
        <Button variant="outline" onClick={onImportLeads} className="gap-1.5">
          <Upload className="h-4 w-4" /> Import Accepted Leads
        </Button>
        <Button variant="outline" onClick={onOpenAISettings} className="gap-1.5">
          <Settings className="h-4 w-4" /> AI Research Settings
        </Button>
        <Button variant="outline" onClick={onViewTexts} className="gap-1.5">
          <MessageCircle className="h-4 w-4" /> View Texts
        </Button>
      </div>

      {/* Outreach Snapshot */}
      <Section title="Outreach Snapshot" icon={<Activity className="h-4 w-4" />}>
        <StatGrid>
          <StatTile label="Suggested leads" value={s?.suggestedLeads} icon={<Users className="h-4 w-4" />} />
          <StatTile label="Imported leads" value={s?.importedLeads} icon={<Users className="h-4 w-4" />} />
          <StatTile label="Scheduled" value={s?.campaignLeadsScheduled} icon={<Mail className="h-4 w-4" />} />
          <StatTile label="Emails sent" value={s?.emailsSent} icon={<Mail className="h-4 w-4" />} />
          <StatTile label="Opens" value={s?.opens} icon={<BarChart3 className="h-4 w-4" />} />
          <StatTile label="Replies" value={s?.replies} icon={<MessageSquare className="h-4 w-4" />} />
          <StatTile label="Bounces" value={s?.bounces} muted />
          <StatTile label="Complaints" value={s?.complaints} muted />
        </StatGrid>
      </Section>

      {/* Student Funnel */}
      <Section title="Student Funnel" icon={<GraduationCap className="h-4 w-4" />}>
        <StatGrid>
          <StatTile label="Booking submissions" value={s?.bookingSubmissions} icon={<FileText className="h-4 w-4" />} />
          <StatTile label="Waitlist signups" value={s?.waitlistSignups} icon={<Users className="h-4 w-4" />} />
          <StatTile label="Syllabi uploaded" value={s?.syllabiUploaded} icon={<FileText className="h-4 w-4" />} />
          <StatTile label="Text conversations" value={s?.textConversations} icon={<MessageCircle className="h-4 w-4" />} />
        </StatGrid>
      </Section>

      {/* Recent student intakes from /start */}
      <StudentIntakesPanel />

      {/* Active Campaigns */}
      <Section title="Active Campaigns" icon={<Megaphone className="h-4 w-4" />}>
        {activeCampaigns.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No active campaigns. Create one to start outreach.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeCampaigns.map((c) => {
              const m = metricsById.get(c.id);
              const remaining = m ? m.remaining : c.total_leads;
              const estDays = c.daily_limit > 0 ? Math.ceil(remaining / c.daily_limit) : null;
              return (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.total_leads.toLocaleString()} leads · {c.total_campuses} campuses · {c.daily_limit}/day
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <MiniStat label="Sent" value={m?.sent ?? 0} />
                    <MiniStat label="Replied" value={m?.replied ?? 0} />
                    <MiniStat label="Remaining" value={remaining} />
                    <MiniStat label="Days left" value={estDays ?? 0} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>;
}

function StatTile({ label, value, icon, muted }: { label: string; value: number | undefined; icon?: React.ReactNode; muted?: boolean }) {
  return (
    <Card className={`p-3 ${muted ? "bg-muted/30" : ""}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">
        {value == null ? "—" : value.toLocaleString()}
      </div>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

export default HomeDashboard;
