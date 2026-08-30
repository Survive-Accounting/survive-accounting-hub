// The pinned announcement at the top of the growth board. Lee sets the focus for
// the week here; King reads it first thing. It's affixed (always present) but
// collapsible — once you've read it you can fold it to a one-line banner, and that
// choice is remembered per-browser so it doesn't nag every visit.
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Megaphone } from "lucide-react";
import { MiniBolt } from "./v2";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "sa-growth-announce-priorities-v1";

type Priority = {
  n: number;
  title: string;
  body: string;
};

// The three contact-gathering priorities for the first 20 campuses (Lee → King, Aug 28).
const PRIORITIES: Priority[] = [
  {
    n: 1,
    title: "Council executives — IFC, Panhellenic, NPHC, MCG",
    body:
      "One council saying yes can mean exposure to 15+ chapters at once. One email or IG DM may be all it takes. Not every council exists at every campus — grab the ones that do.",
  },
  {
    n: 2,
    title: "Top 5 fraternities + Top 5 sororities (10 total)",
    body: "Executive emails and personal Instagram handles for each chapter.",
  },
  {
    n: 3,
    title: "Business clubs — Women in Business first",
    body:
      "Emails and Instagrams for Women in Business clubs first; add Investing and Finance clubs if there's time.",
  },
];

export function GrowthAnnouncement() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setOpen(false);
    } catch {
      /* private mode / blocked storage — default open is fine */
    }
  }, []);
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "0" : "1");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-primary/40 bg-primary/5">
      <button
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <MiniBolt primary="#CE1126" secondary="#14213D" size={18} />
        <Megaphone className="size-3.5 shrink-0 text-primary" />
        <span className="sa-admin-display text-[11px] font-semibold uppercase tracking-wider text-primary">
          Priorities right now
        </span>
        <span className="text-[11px] text-muted-foreground">
          Contacts to gather for the first 20 campuses
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          {open ? "Collapse" : "Read"}
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-primary/25 px-3 py-2.5">
          {PRIORITIES.map((p) => (
            <div key={p.n} className="flex gap-2.5">
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                  "bg-primary/15 text-[11px] font-bold text-primary",
                )}
              >
                {p.n}
              </span>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold leading-snug text-foreground">
                  {p.title}
                </div>
                <div className="text-[11px] leading-snug text-muted-foreground">{p.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
