// Email Queue tab: lead-type card selector → per-type templates + broadcasts.
// Only "professors" is active; other cards are greyed out (coming soon).
import { useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEAD_TYPES, type LeadType } from "@/lib/outreach-mock";
import type { Campus } from "@/lib/outreach-mock";
import { ScheduleAndSettingsPanel } from "@/components/outreach/ScheduleAndSettingsPanel";
import { BroadcastsPanel } from "@/components/outreach/BroadcastsPanel";
import { EmailTemplatesPanel } from "@/components/outreach/EmailTemplatesPanel";

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
    <div className="space-y-6">
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

      {/* Active lead type content */}
      {active === "professors" && (
        <div className="space-y-4">
          <ScheduleAndSettingsPanel campuses={campuses} />
          <BroadcastsPanel campuses={campuses} leadType="professors" />
          <EmailTemplatesPanel leadType="professors" />
        </div>
      )}
    </div>
  );
}

export default EmailQueueShell;
