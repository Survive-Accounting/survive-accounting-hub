import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DualClock } from "./DualClock";

const LOGO_URL =
  "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";
const DISCORD_URL =
  "https://discord.com/channels/1513548854337732750/1513558107597570109";

export function OutreachBanner() {
  return (
    <div
      className="group relative mb-5 overflow-hidden rounded-xl border border-white/10 px-5 py-4 shadow-lg"
      style={{ backgroundColor: "#14213D" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(600px 120px at 20% 50%, rgba(255,255,255,0.08), transparent 60%), radial-gradient(500px 100px at 80% 50%, rgba(206,17,38,0.15), transparent 60%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent"
        style={{ animation: "sheenSweep 6s ease-in-out infinite" }}
      />

      <div className="relative flex flex-wrap items-center gap-4">
        <img
          src={LOGO_URL}
          alt="Survive Accounting"
          className="h-8 object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="flex-1 min-w-[240px] text-center text-white">
          <span className="text-sm font-semibold tracking-tight sm:text-base">
            🛣️ The road to 1,000 students is in front of us. Let&apos;s do this together, King!
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white"
          >
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-1.5 h-4 w-4" />
              Discord
            </a>
          </Button>
          <DualClock />
        </div>
      </div>
    </div>
  );
}
