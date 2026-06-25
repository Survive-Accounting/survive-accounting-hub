// Three-tier plans block. Reusable across /pricing and the homepage.
//  - Just This Test ($45) + Semester Membership ($150) = WAITLIST (not built yet).
//  - Premium 1-on-1 ($150/hr) = LIVE → routes into the onboarding/booking funnel.
// No fake checkout. Materials CTAs open a small email+course waitlist capture
// that writes to campus_waitlist (fires the text-to-Lee trigger).
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { joinPricingWaitlist, type WaitlistTier } from "@/lib/pricing-api";

const NAVY = "#14213D";
const RED = "#CE1126";

export const TEST_PASS_PRICE = 45;
export const MEMBERSHIP_PRICE = 150;
export const HOURLY_RATE = 150;

const RED_BTN = "h-12 w-full text-base font-bold text-white";
const RED_BTN_STYLE: React.CSSProperties = {
  background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`,
};

type MaterialsTier = { key: WaitlistTier; label: string };

export default function PricingPlans({
  bookHref = "/onboard",
  className,
}: {
  bookHref?: string;
  className?: string;
}) {
  const [waitlistTier, setWaitlistTier] = useState<MaterialsTier | null>(null);

  return (
    <div className={className}>
      <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
        {/* Just This Test */}
        <PlanCard
          title="Just This Test"
          price={`$${TEST_PASS_PRICE}`}
          cadence="one exam"
          tagline="Cramming for one exam? Get the 4 chapters it covers — 1 week of access."
          features={[
            "The 4 chapters your exam covers",
            "Practice exam questions",
            "Video explainers for those chapters",
            "1 week of access",
          ]}
          cta={
            <Button className="h-12 w-full text-base font-semibold" variant="outline"
              style={{ color: NAVY, borderColor: NAVY }}
              onClick={() => setWaitlistTier({ key: "test_pass", label: "Just This Test" })}>
              Get early access
            </Button>
          }
        />

        {/* Semester Membership — BEST VALUE */}
        <PlanCard
          highlighted
          badge="Best Value"
          title="Semester Membership"
          price={`$${MEMBERSHIP_PRICE}`}
          cadence="semester"
          tagline="A full semester for the price of one tutoring hour."
          features={[
            "Every chapter in your course, all semester",
            "All practice exam questions + video explainers",
            "New content added weekly",
            "Built around the exam style you'll actually see",
          ]}
          cta={
            <Button className={RED_BTN} style={RED_BTN_STYLE}
              onClick={() => setWaitlistTier({ key: "membership", label: "Semester Membership" })}>
              Get early access
            </Button>
          }
        />

        {/* Premium 1-on-1 — LIVE */}
        <PlanCard
          title="Premium 1-on-1 Tutoring"
          price={`$${HOURLY_RATE}`}
          cadence="hour"
          tagline="Sessions built entirely around you."
          features={[
            "Live 1-on-1 Zoom sessions",
            "Only 10 hours a week",
            "Personalized to your course + exam",
            "Taught by Lee — accounting grad, tutor since 2015",
          ]}
          liveBadge
          cta={
            <a href={bookHref} className="block">
              <Button className={RED_BTN} style={RED_BTN_STYLE}>Book a session →</Button>
            </a>
          }
        />
      </div>

      <WaitlistDialog
        tier={waitlistTier}
        onClose={() => setWaitlistTier(null)}
      />
    </div>
  );
}

function PlanCard({
  title, price, cadence, tagline, features, cta, highlighted, badge, liveBadge,
}: {
  title: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  cta: React.ReactNode;
  highlighted?: boolean;
  badge?: string;
  liveBadge?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-3xl border bg-white p-6 sm:p-7",
        highlighted
          ? "border-transparent shadow-[0_20px_50px_-20px_rgba(206,17,38,0.45)] lg:-my-2 lg:py-9"
          : "border-gray-200 shadow-[0_10px_40px_-20px_rgba(20,33,61,0.25)]",
      )}
      style={highlighted ? { boxShadow: `0 0 0 2px ${RED}, 0 20px 50px -20px rgba(206,17,38,0.45)` } : undefined}
    >
      {badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
          style={{ background: RED }}>
          {badge}
        </span>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: NAVY }}>{title}</h3>
        {liveBadge && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            Available now
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-4xl font-extrabold tracking-tight" style={{ color: NAVY }}>{price}</span>
        <span className="text-sm text-gray-500">/ {cadence}</span>
      </div>
      <p className="mt-2 text-sm text-gray-600">{tagline}</p>
      <ul className="mt-5 space-y-2.5 text-[14px] text-gray-800">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {f}
          </li>
        ))}
      </ul>
      <div className="mt-7 pt-1">{cta}</div>
    </div>
  );
}

function WaitlistDialog({
  tier, onClose,
}: {
  tier: MaterialsTier | null;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const close = () => { onClose(); setTimeout(() => { setEmail(""); setCourse(""); setDone(false); }, 150); };

  const submit = async () => {
    if (!tier) return;
    setBusy(true);
    try {
      await joinPricingWaitlist({ email, course, tier: tier.key });
      setDone(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!tier} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        {done ? (
          <div className="py-2 text-center">
            <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-emerald-50">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="mt-4 text-lg font-bold" style={{ color: NAVY }}>You're on the list!</h3>
            <p className="mt-2 text-sm text-gray-600">
              {course.trim()
                ? <>You're on the list for <strong>{course.trim()}</strong> — I'll notify you the moment it's live.</>
                : <>I'll notify you the moment it's live.</>}
            </p>
            <Button className="mt-5 w-full" onClick={close}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Get early access — {tier?.label}</DialogTitle>
              <DialogDescription>
                Drop your email and I'll text you the moment it's live. No payment now.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="wl-email" className="text-xs">Email</Label>
                <Input id="wl-email" type="email" value={email} autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wl-course" className="text-xs">
                  Course <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input id="wl-course" value={course}
                  onChange={(e) => setCourse(e.target.value)} placeholder="e.g. ACCY 201 / Intermediate I" />
              </div>
              <Button className={RED_BTN} style={RED_BTN_STYLE} disabled={busy} onClick={submit}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding you…</> : "Get early access"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
