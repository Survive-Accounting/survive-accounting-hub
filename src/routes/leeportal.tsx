// /leeportal — LEE'S PRIVATE PORTAL. One door to every working surface of the
// app, split the way Lee thinks about the business: CREATIVE (filming, studio,
// labs) on the left, BUSINESS (growth, outreach, ops dashboards) on the right —
// the same two-big-squares gesture as the portal home. Click a square → it
// opens into that side's links; Esc / back returns to the two doors.
//
// Private = AdminGate (the same passcode deterrent as /outreach) + noindex +
// not linked from any public surface. Plain <a> links on purpose: a portal jump
// is a fresh page load into a different app shell, not an in-app transition.
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Clapperboard, LineChart } from "lucide-react";

import { AdminGate } from "@/components/AdminGate";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { frameThemeVars } from "@/components/frames/frame-theme";

export const Route = createFileRoute("/leeportal")({
  head: () => ({ meta: [{ title: "⚡ Lee Portal — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: LeePortal,
});

interface PortalLink {
  label: string;
  href: string;
  note: string;
  /** The one to hit first — rendered big at the top of its side. */
  hero?: boolean;
}

interface PortalSide {
  key: "creative" | "business";
  title: string;
  tagline: string;
  icon: typeof Clapperboard;
  /** Accent pair for the square's edge glow. */
  c1: string;
  c2: string;
  links: PortalLink[];
}

const SIDES: PortalSide[] = [
  {
    key: "creative",
    title: "Creative",
    tagline: "Film · author · labs",
    icon: Clapperboard,
    c1: "#FCA311",
    c2: "#E0284A",
    links: [
      { label: "Studio Canvas", href: "/study/canvas", note: "The filming canvas — frames, CEQs, exhibits. \\ opens the film popout.", hero: true },
      { label: "Exhibit Lab", href: "/exhibit-lab", note: "Exhibit drills + probes (Lab v2)." },
      { label: "Exhibit Demo", href: "/exhibit-demo", note: "Exhibit cards on a bare film surface." },
      { label: "CEQ Studio", href: "/ceq", note: "Author and manage CEQs." },
      { label: "Intro / Outro", href: "/intro-outro", note: "Intro & outro card lab." },
      { label: "Logo Lab", href: "/logo-lab", note: "Brand logo + lockup variants." },
      { label: "Bolt Lab", href: "/lab/bolt", note: "The animated brand bolt." },
      { label: "Callout Demo", href: "/callout-demo", note: "Callout styles on film." },
    ],
  },
  {
    key: "business",
    title: "Business",
    tagline: "Growth · outreach · ops",
    icon: LineChart,
    c1: "#3B82F6",
    c2: "#22D3EE",
    links: [
      { label: "Growth", href: "/admin/growth", note: "Campuses, chapters, contacts, councils, intelligence.", hero: true },
      { label: "Outreach / ProfIntel", href: "/outreach", note: "Professor targeting, Greek intel, Reddit + parent listening." },
      { label: "Reps", href: "/admin/reps", note: "Rep roster, trackable links, conversions, partners." },
      { label: "Requests / Orders", href: "/outreach/orders", note: "Every inbound request and order." },
      { label: "Comms", href: "/outreach/comms", note: "Comms console, demand list, practice analytics." },
      { label: "Chapters Queue", href: "/outreach/chapters", note: "Pending chapter approvals." },
      { label: "Site QA", href: "/admin/site-qa", note: "Page templates + change detection." },
      { label: "Video Archive", href: "/outreach/video-archive", note: "Vimeo → Mux migration." },
      { label: "Backups", href: "/outreach/backups", note: "Nightly R2 backup status." },
    ],
  },
];

const CREAM = "#F4EFE6";
const MUTED = "rgba(226,232,240,0.6)";

function LeePortal() {
  const [sel, setSel] = useState<PortalSide["key"] | null>(null);
  // Esc backs out of an open side — same muscle memory as everywhere else.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const open = sel ? SIDES.find((s) => s.key === sel)! : null;

  return (
    // frameThemeVars INLINE on the root — the navy palette must exist in the
    // server-rendered HTML (html.sa-navy arrives a beat too late; see
    // SESSION-CONTEXT §6, the navy-on-navy first-paint trap).
    <div className="min-h-screen w-full" style={{ ...frameThemeVars(), background: "#0B1322", color: CREAM }}>
      <AdminGate>
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
          {/* header */}
          <div className="flex items-center gap-3">
            <BoltBoil height={44} />
            <div>
              <h1 className="text-2xl font-black tracking-tight" style={{ color: CREAM }}>Lee Portal</h1>
              <p className="text-xs" style={{ color: MUTED }}>Every dashboard, one door. Not linked anywhere public.</p>
            </div>
            {open && (
              <button
                onClick={() => setSel(null)}
                className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
                style={{ border: "1px solid rgba(244,239,230,0.25)", color: CREAM }}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Both doors
              </button>
            )}
          </div>

          {!open ? (
            // THE TWO DOORS — Creative left, Business right.
            <div className="mt-10 grid flex-1 grid-cols-1 gap-6 sm:grid-cols-2">
              {SIDES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSel(s.key)}
                  className="group relative flex min-h-[340px] flex-col items-center justify-center rounded-3xl p-8 text-center transition-transform duration-150 hover:scale-[1.015]"
                  style={{
                    background: "linear-gradient(180deg, rgba(37,52,88,0.55), rgba(11,19,34,0.9))",
                    border: `1.5px solid ${s.c1}55`,
                    boxShadow: `0 24px 60px -30px rgba(0,0,0,0.9), inset 0 0 80px -50px ${s.c1}66`,
                  }}
                >
                  <s.icon className="h-12 w-12 transition-transform duration-150 group-hover:scale-110" style={{ color: s.c1 }} />
                  <div className="mt-5 text-3xl font-black tracking-tight" style={{ color: CREAM }}>{s.title}</div>
                  <div className="mt-1 text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: s.c1 }}>{s.tagline}</div>
                  <div className="mt-4 text-xs" style={{ color: MUTED }}>
                    {s.links.slice(0, 4).map((l) => l.label).join(" · ")} …
                  </div>
                </button>
              ))}
            </div>
          ) : (
            // ONE DOOR OPEN — hero link on top, then the grid.
            <div className="mt-8">
              <div className="flex items-center gap-2.5">
                <open.icon className="h-6 w-6" style={{ color: open.c1 }} />
                <h2 className="text-xl font-black tracking-tight" style={{ color: CREAM }}>{open.title}</h2>
                <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: open.c1 }}>{open.tagline}</span>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {open.links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className="group flex items-start gap-3 rounded-2xl p-4 transition-colors"
                    style={{
                      background: l.hero ? `linear-gradient(180deg, ${open.c1}22, rgba(11,19,34,0.85))` : "rgba(37,52,88,0.35)",
                      border: `1px solid ${l.hero ? open.c1 : "rgba(244,239,230,0.14)"}`,
                      gridColumn: l.hero ? "1 / -1" : undefined,
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={l.hero ? "text-lg font-black" : "text-sm font-bold"} style={{ color: CREAM }}>{l.label}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: open.c1 }} />
                      </div>
                      <div className="mt-0.5 text-xs leading-snug" style={{ color: MUTED }}>{l.note}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="mt-10 pb-2 text-center text-[10px]" style={{ color: "rgba(226,232,240,0.35)" }}>
            /leeportal · noindex · gate shared with /outreach
          </div>
        </div>
      </AdminGate>
    </div>
  );
}
