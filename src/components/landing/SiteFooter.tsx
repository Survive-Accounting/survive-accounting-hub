// Redesigned site footer: wordmark + tagline, social/contact, a Press modal,
// the legal row, and a quiet, dignified in-memory line for Lee's twin brother
// Ben that opens a restrained remembrance modal (NOT a marketing element).
import { useState } from "react";
import { Instagram, Mail, ExternalLink } from "lucide-react";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const FOOTER_BG = "#0f172a";
const LOGO_URL =
  "https://lwfiles.mycourse.app/672bc379cd024d536f651ecc-public/1554d231f0e2bf121ac35937c4d438ca.png";

// Press, in publication order. Room to add recent pieces at the top later.
const PRESS: { outlet: string; date?: string; title: string; url: string }[] = [
  {
    outlet: "Oxford Eagle", date: "Apr 2017",
    title: "Tutoring startup takes top prize at Ole Miss business competition",
    url: "https://oxfordeagle.com/2017/04/14/tutoring-startup-takes-top-prize-at-ole-miss-business-competition/",
  },
  {
    outlet: "Innovate Mississippi", date: "Jul 2018",
    title: "Collegiate Tutoring: Art of the Pivot",
    url: "https://www.innovate.ms/collegiate_tutoring_pivot/",
  },
  {
    outlet: "Magee News",
    title: "Lee Ingram: Making a Name for Himself in the SEC",
    url: "https://mageenews.com/lee-ingram-making-a-name-for-himself-in-the-sec/",
  },
  {
    outlet: "RateMyProfessors",
    title: "Lee's reviews",
    url: "https://www.ratemyprofessors.com/professor/3070884",
  },
];

const BEN_STORIES: { outlet: string; date?: string; title: string; url: string }[] = [
  {
    outlet: "The Daily Mississippian",
    title: "Ole Miss alumnus publishes stories, creates scholarship to memorialize twin brother",
    url: "https://thedmonline.com/ole-miss-alumnus-publishes-stories-creates-scholarship-to-memorialize-twin-brother/",
  },
  {
    outlet: "Oxford Eagle", date: "Jul 2020",
    title: "Honoring late brother and helping others through music",
    url: "https://oxfordeagle.com/2020/07/24/lee-ingram-honoring-late-brother-and-helping-others-through-music/",
  },
];
const BEN_DONATE_URL = "https://umfoundation.givingfuel.com/give";

// Legacy callers (/start, outreach school pages) still pass scroll/booking
// handlers; the redesigned footer no longer renders those nav buttons, so the
// props are accepted and ignored for back-compat.
interface SiteFooterProps {
  onScrollToContact?: () => void;
  onScrollToReviews?: () => void;
  onBookTutoring?: () => void;
}

export default function SiteFooter(_props: SiteFooterProps = {}) {
  void _props;
  const [pressOpen, setPressOpen] = useState(false);
  const [benOpen, setBenOpen] = useState(false);

  const linkClass = "text-[13px] no-underline transition-colors hover:text-white";
  const muted: React.CSSProperties = { color: "rgba(255,255,255,0.65)", fontFamily: "Inter, sans-serif" };
  const faint: React.CSSProperties = { color: "rgba(255,255,255,0.4)", fontFamily: "Inter, sans-serif" };

  return (
    <footer style={{ background: FOOTER_BG }}>
      <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-[1.5fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <a href="/" aria-label="Survive Accounting — home" className="inline-flex items-center transition-opacity hover:opacity-90">
              <img src={LOGO_URL} alt="Survive Accounting" className="h-[22px] w-auto select-none object-contain" draggable={false} />
            </a>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed" style={muted}>
              Survive it. Or learn to love it. Accounting tutoring from someone who genuinely loves it.
            </p>
          </div>

          {/* Explore */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={faint}>Explore</p>
            <nav className="mt-3 flex flex-col gap-2">
              <a href="/onboard" className={linkClass} style={muted}>Get started</a>
              <a href="/#plans" className={linkClass} style={muted}>Pricing</a>
              <button onClick={() => setPressOpen(true)} className={`${linkClass} text-left`} style={muted}>Press</button>
            </nav>
          </div>

          {/* Connect */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={faint}>Connect</p>
            <nav className="mt-3 flex flex-col gap-2.5">
              <a href="https://instagram.com/grooveginger" target="_blank" rel="noopener noreferrer"
                className={`${linkClass} inline-flex items-center gap-2`} style={muted}>
                <Instagram className="h-4 w-4" /> @grooveginger
              </a>
              <a href="mailto:lee@surviveaccounting.com"
                className={`${linkClass} inline-flex items-center gap-2`} style={muted}>
                <Mail className="h-4 w-4" /> lee@surviveaccounting.com
              </a>
            </nav>
          </div>
        </div>

        {/* In memory — quiet, dignified, restrained */}
        <div className="mt-10 border-t pt-6 text-center" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <button onClick={() => setBenOpen(true)} className="text-[12px] italic transition-colors hover:text-white/80"
            style={{ color: "rgba(255,255,255,0.45)", fontFamily: "Inter, sans-serif" }}>
            In memory of my twin brother, Ben Ingram (1993–2017).
          </button>
        </div>
      </div>

      {/* Legal row */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-between gap-2 px-4 py-4 sm:flex-row sm:px-6">
          <p className="text-[11px]" style={faint}>
            © {new Date().getFullYear()} Earned Wisdom, LLC
          </p>
          <div className="flex items-center gap-4">
            <details className="group">
              <summary className="cursor-pointer list-none text-[11px] hover:underline" style={faint}>
                <span className="group-open:hidden">SMS policy</span>
                <span className="hidden group-open:inline">Hide SMS policy</span>
              </summary>
              <p className="mt-2 max-w-[520px] text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)", fontFamily: "Inter, sans-serif" }}>
                By texting (662) 565-8818, you agree to receive replies from Lee about your tutoring
                request. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out,
                HELP for help. See our{" "}
                <a href="/privacy" className="underline hover:text-white">Privacy</a> and{" "}
                <a href="/terms" className="underline hover:text-white">Terms</a>.
              </p>
            </details>
            <a href="/privacy" className="text-[11px] hover:underline" style={faint}>Privacy</a>
            <a href="/terms" className="text-[11px] hover:underline" style={faint}>Terms</a>
          </div>
        </div>
      </div>

      {/* Press modal */}
      <Dialog open={pressOpen} onOpenChange={setPressOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>In the press</DialogTitle>
            <DialogDescription>A few places Survive Accounting and Lee&apos;s work have shown up.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {PRESS.map((p) => (
              <li key={p.url}>
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  className="group flex items-start gap-3 rounded-xl border border-gray-200 p-3 transition-colors hover:border-gray-300 hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                      {p.outlet}{p.date ? <span className="font-normal text-gray-400">· {p.date}</span> : null}
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-[#14213D]">{p.title}</p>
                  </div>
                  <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-gray-400 group-hover:text-gray-600" />
                </a>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Ben remembrance modal — calm, no sales framing */}
      <Dialog open={benOpen} onOpenChange={setBenOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ben Ingram</DialogTitle>
            <DialogDescription>1993–2017</DialogDescription>
          </DialogHeader>
          <p className="text-[15px] leading-relaxed text-gray-700">
            My twin brother. I keep building, teaching, and playing music with him in mind. His
            memory lives on through the scholarship our family created in his name.
          </p>

          <div className="mt-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">His story</p>
            <ul className="mt-2 space-y-2">
              {BEN_STORIES.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                    className="group flex items-start gap-3 rounded-xl border border-gray-200 p-3 transition-colors hover:border-gray-300 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-gray-500">
                        {s.outlet}{s.date ? <span className="font-normal text-gray-400"> · {s.date}</span> : null}
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-[#14213D]">{s.title}</p>
                    </div>
                    <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-gray-400 group-hover:text-gray-600" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <a href={BEN_DONATE_URL} target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white"
            style={{ background: "#14213D" }}>
            Support the Benson Reed Ingram Honors Scholars Program
          </a>
          <p className="text-center text-[11px] text-gray-400">University of Mississippi Foundation</p>
        </DialogContent>
      </Dialog>
    </footer>
  );
}
