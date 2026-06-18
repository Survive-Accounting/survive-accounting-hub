// Email Queue tab: Cold Emails (priority queue) + Standard Campaigns.
import { useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEAD_TYPES, type LeadType } from "@/lib/outreach-mock";
import type { Campus } from "@/lib/outreach-mock";
import { ScheduleAndSettingsPanel } from "@/components/outreach/ScheduleAndSettingsPanel";
import { BroadcastsPanel } from "@/components/outreach/BroadcastsPanel";
import { EmailTemplatesPanel } from "@/components/outreach/EmailTemplatesPanel";
import { CampaignBuilder } from "@/components/outreach/CampaignBuilder";
import { CampaignsListPanel } from "@/components/outreach/CampaignsListPanel";
import { GlobalDailyLimitCard } from "@/components/outreach/GlobalDailyLimitCard";
import { ColdEmailsPanel } from "@/components/outreach/ColdEmailsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

const LEAD_TYPE_ICON: Record<LeadType, string> = {
  professors:              "🎓",
  bap_advisors:            "📋",
  accounting_departments:  "🏛️",
  cpa_alumni:              "💼",
};

const LEAD_TYPE_DESC: Record<LeadType, string> = {
  professors:              "Email accounting professors directly",
  bap_advisors:            "Reach Beta Alpha Psi chapter advisors",
  accounting_departments:  "Contact department chairs and coordinators",
  cpa_alumni:              "Connect with CPA-track alumni networks",
};

export function EmailQueueShell({ campuses }: { campuses: Campus[] }) {
  const [active, setActive] = useState<LeadType>("professors");

  return (
    <Tabs defaultValue="cold" className="space-y-6">
      <TabsList>
        <TabsTrigger value="cold">Cold Emails</TabsTrigger>
        <TabsTrigger value="standard">Standard Campaigns</TabsTrigger>
      </TabsList>

      <TabsContent value="cold" className="space-y-4">
        <ColdEmailsPanel campuses={campuses} />
      </TabsContent>

      <TabsContent value="standard" className="space-y-6">
        {/* Lead-type cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LEAD_TYPES.map((lt) => {
            const isActive = active === lt.id && !lt.coming_soon;
            return (
              <button
                key={lt.id}
                onClick={() => !lt.coming_soon && setActive(lt.id)}
                disabled={lt.coming_soon}
                className={cn(
                  "relative flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-all",
                  lt.coming_soon
                    ? "cursor-not-allowed border-border/50 bg-muted/20 opacity-50"
                    : isActive
                      ? "border-[#14213D] bg-[#14213D]/5 shadow-sm ring-1 ring-[#14213D]/20"
                      : "border-border bg-card hover:border-[#14213D]/40 hover:bg-muted/30",
                )}
              >
                <span className="text-2xl leading-none">{LEAD_TYPE_ICON[lt.id]}</span>
                <div className="min-w-0">
                  <div className={cn("text-sm font-semibold", lt.coming_soon && "text-muted-foreground")}>
                    {lt.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                    {lt.coming_soon ? "Coming soon" : LEAD_TYPE_DESC[lt.id]}
                  </div>
                </div>
                {lt.coming_soon && (
                  <Lock className="absolute right-3 top-3 h-3.5 w-3.5 text-muted-foreground/60" />
                )}
                {isActive && (
                  <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[#CE1126]" />
                )}
              </button>
            );
          })}
        </div>

        {active === "professors" && (
          <div className="space-y-4">
            <GlobalDailyLimitCard />
            <CampaignBuilder campuses={campuses} />
            <CampaignsListPanel />
            <EmailTemplatesPanel leadType="professors" />
            <BroadcastsPanel campuses={campuses} leadType="professors" />
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50">
                <span>Advanced / Legacy Scheduling</span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                <ScheduleAndSettingsPanel campuses={campuses} />
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

export default EmailQueueShell;
