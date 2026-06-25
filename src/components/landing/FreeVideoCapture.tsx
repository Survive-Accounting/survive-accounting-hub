// Free-video lead magnet. Email (+ optional course) -> INSTANT reveal of the
// explainer videos right here (no "check your email" step). Feeds the same list
// (campus_waitlist, source='free_videos'). Lee fills the embeds below.
import { useState } from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { captureFreeVideoLead } from "@/lib/pricing-api";

const NAVY = "#14213D";
const RED = "#CE1126";

// Lee fills these in — drop a YouTube/Vimeo/MP4 embed URL into `embedUrl` and the
// card renders the player. Until then it shows a labeled placeholder.
const FREE_VIDEOS: { title: string; blurb: string; embedUrl?: string }[] = [
  { title: "How to actually read a journal entry", blurb: "The atom of accounting, in 4 minutes." },
  { title: "Debits & credits without the confusion", blurb: "The mental model that makes it click." },
  { title: '"My exam looked nothing like the homework"', blurb: "Why — and how to study for the real thing." },
];

export default function FreeVideoCapture({ className }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await captureFreeVideoLead({ email, course });
      setRevealed(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="free-videos" className={className} style={{ background: "#FAFAF7" }}>
      <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl" style={{ color: NAVY }}>
            Free accounting explainers — drop your email, watch now
          </h2>
          <p className="mt-3 text-[15px] text-gray-600">
            Get a few free explainers right now — and be first in line when the full materials drop.
          </p>
        </div>

        {!revealed ? (
          <div className="mx-auto mt-8 max-w-md">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input type="email" value={email} autoComplete="email"
                onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu"
                className="h-12" />
              <Button className="h-12 px-6 text-base font-bold text-white"
                style={{ background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)` }}
                disabled={busy} onClick={submit}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> …</> : "Watch now"}
              </Button>
            </div>
            <div className="mt-3">
              <Label htmlFor="fv-course" className="sr-only">Course (optional)</Label>
              <Input id="fv-course" value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="Your course (optional) — e.g. ACCY 201"
                className="h-11" />
            </div>
            <p className="mt-3 text-center text-xs text-gray-500">
              No spam. One email = instant access + first in line when materials launch.
            </p>
          </div>
        ) : (
          <div className="mt-10">
            <p className="mb-5 text-center text-sm font-semibold text-emerald-700">
              You're in — here are your explainers 👇
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FREE_VIDEOS.map((v) => (
                <div key={v.title} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="relative aspect-video bg-gray-100">
                    {v.embedUrl ? (
                      <iframe
                        src={v.embedUrl}
                        title={v.title}
                        className="absolute inset-0 h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-content-center text-gray-400">
                        <PlayCircle className="mx-auto h-12 w-12" />
                        <span className="mt-2 text-xs">Video coming soon</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-sm font-semibold" style={{ color: NAVY }}>{v.title}</h3>
                    <p className="mt-1 text-xs text-gray-500">{v.blurb}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
