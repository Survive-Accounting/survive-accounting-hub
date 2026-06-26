// Three-tier plans block. Reusable across /pricing and the homepage.
//  - Just One Test ($45) + Semester Membership ($125) = WAITLIST (marked-down
//    "lock in the discount" capture into campus_waitlist; fires text-to-Lee).
//  - Premium 1-on-1 = prepaid semester block ($1,350, was $1,500) -> Stripe
//    Payment Link (gated until STRIPE_TUTORING_PAYMENT_LINK is set; no fake URL).
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
import { joinPricingWaitlist, reservePrepayLead, type WaitlistTier } from "@/lib/pricing-api";
import { STRIPE_TUTORING_PAYMENT_LINK, TUTORING_SOLD_OUT, TUTORING_SEATS_LEFT_TEXT } from "@/lib/site-config";

const NAVY = "#14213D";
const RED = "#CE1126";

export const TEST_PASS_PRICE = 45;
export const TEST_PASS_WAS = 60;
export const MEMBERSHIP_PRICE = 99;
export const MEMBERSHIP_WAS = 150;
// Premium 1-on-1 is now a full-price, capacity-capped semester block — NO
// discount. 15 hours prepaid at a straight $150/hr.
export const PREPAY_PRICE = 2250;
export const PREPAY_HOURS = 15;
export const PREPAY_RATE = 150;
// Kept (= PREPAY_PRICE, so nothing renders as a discount) for back-compat with
// the onboarding wizard's plan-summary import until that flow is reworked.
export const PREPAY_WAS = 2250;

const RED_BTN = "h-12 w-full text-base font-bold text-white";
const RED_BTN_STYLE: React.CSSProperties = {
  background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`,
};

type MaterialsTier = { key: WaitlistTier; label: string };

/** The three selectable plans. Used by the onboarding wizard's "Confirm Plan" step. */
export type PricingPlanKey = "test_pass" | "membership" | "prepay";

export default function PricingPlans({
  bookHref = "/onboard",
  className,
  onSelectPlan,
}: {
  bookHref?: string;
  className?: string;
  /** When provided (e.g. the onboarding wizard), every card's CTA becomes
   *  "Choose this plan" and calls this instead of the waitlist modal / Stripe. */
  onSelectPlan?: (plan: PricingPlanKey) => void;
}) {
  // bookHref kept for backward-compat with existing call sites (no longer used
  // for the 1-on-1 CTA, which now goes through Stripe prepay).
  void bookHref;
  const selecting = !!onSelectPlan;
  const [waitlistTier, setWaitlistTier] = useState<MaterialsTier | null>(null);
  const [reserveOpen, setReserveOpen] = useState(false);
  const stripeReady = STRIPE_TUTORING_PAYMENT_LINK.trim().length > 0;
  const soldOut = TUTORING_SOLD_OUT;

  const chooseBtn = (plan: PricingPlanKey, outline?: boolean) => (
    <Button
      className={outline ? "h-12 w-full text-base font-semibold" : RED_BTN}
      variant={outline ? "outline" : undefined}
      style={outline ? { color: NAVY, borderColor: NAVY } : RED_BTN_STYLE}
      onClick={() => onSelectPlan?.(plan)}
    >
      Choose this plan →
    </Button>
  );

  return (
    <div className={className}>
      {!selecting && (
        <p className="mb-6 text-center text-sm font-medium text-gray-600">
          Lock in the launch discount — join the waitlist, no payment now.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
        {/* Just One Test — WAITLIST */}
        <PlanCard
          title="Just One Test"
          price={`$${TEST_PASS_PRICE}`}
          wasPrice={`$${TEST_PASS_WAS}`}
          cadence="one exam"
          tagline="Pick the four chapters your exam covers — 1 week of access."
          features={[
            "The 4 chapters your exam covers",
            "Practice exam questions",
            "Video explainers for those chapters",
            "1 week of access",
          ]}
          cta={selecting ? chooseBtn("test_pass", true) : (
            <Button className="h-12 w-full text-base font-semibold" variant="outline"
              style={{ color: NAVY, borderColor: NAVY }}
              onClick={() => setWaitlistTier({ key: "test_pass", label: "Just One Test" })}>
              Notify me
            </Button>
          )}
        />

        {/* Semester Membership — BEST VALUE, WAITLIST */}
        <PlanCard
          highlighted
          badge="Best Value"
          title="Semester Membership"
          price={`$${MEMBERSHIP_PRICE}`}
          wasPrice={`$${MEMBERSHIP_WAS}`}
          cadence="semester"
          tagline="A full semester for the price of one tutoring hour."
          features={[
            "Every chapter in your course, all semester",
            "All practice exam questions + video explainers",
            "New content added weekly",
            "Built around the exam style you'll actually see",
          ]}
          cta={selecting ? chooseBtn("membership") : (
            <Button className={RED_BTN} style={RED_BTN_STYLE}
              onClick={() => setWaitlistTier({ key: "membership", label: "Semester Membership" })}>
              Notify me
            </Button>
          )}
        />

        {/* Premium 1-on-1 — full-price, capacity-capped semester partnership */}
        <PlanCard
          title="Premium 1-on-1 Tutoring"
          price={`$${PREPAY_PRICE.toLocaleString()}`}
          priceNote={`${PREPAY_HOURS} one-on-one hours · $${PREPAY_RATE}/hr`}
          subLine="Your tutor for the semester — built entirely around your course, professor, and exam."
          features={[
            `${PREPAY_HOURS} hours of live 1-on-1 Zoom sessions`,
            "Tailored to your exact course + professor's exam style",
            "~2–3 hrs/week, more around test time",
            "Re-up hours anytime; unused hours roll to next semester",
            "Only 4 students per semester",
            "Full refund after session 1 if you're not happy",
          ]}
          footnote="Pay → book your intro call → we set your recurring weekly time."
          availability={soldOut ? "soldout" : "available"}
          seatsLeftText={soldOut ? "" : TUTORING_SEATS_LEFT_TEXT}
          cta={selecting ? chooseBtn("prepay") : (
            soldOut ? (
              <Button className={RED_BTN} style={RED_BTN_STYLE} onClick={() => setReserveOpen(true)}>
                Join the waitlist
              </Button>
            ) : stripeReady ? (
              <Button className={RED_BTN} style={RED_BTN_STYLE} onClick={() => setReserveOpen(true)}>
                Reserve your seat →
              </Button>
            ) : (
              <Button className={RED_BTN} style={RED_BTN_STYLE} disabled title="Coming soon">
                Reserve your seat →
              </Button>
            )
          )}
        />
      </div>

      <WaitlistDialog tier={waitlistTier} onClose={() => setWaitlistTier(null)} />
      <ReserveDialog open={reserveOpen} soldOut={soldOut} onClose={() => setReserveOpen(false)} />
    </div>
  );
}

function PlanCard({
  title, price, wasPrice, cadence, priceNote, saveNote, subLine, tagline, features, cta, footnote,
  highlighted, badge, liveBadge, availability, seatsLeftText,
}: {
  title: string;
  price: string;
  wasPrice?: string;
  cadence?: string;
  priceNote?: string;
  saveNote?: string;
  subLine?: string;
  tagline?: string;
  features: string[];
  cta: React.ReactNode;
  footnote?: string;
  highlighted?: boolean;
  badge?: string;
  liveBadge?: boolean;
  availability?: "available" | "soldout";
  seatsLeftText?: string;
}) {
  const soldOut = availability === "soldout";
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-3xl border bg-white p-6 transition-[transform,box-shadow] duration-200 sm:p-7",
        highlighted
          ? "border-transparent shadow-[0_20px_50px_-20px_rgba(206,17,38,0.45)] lg:-my-2 lg:py-9"
          : "border-gray-200 shadow-[0_10px_40px_-20px_rgba(20,33,61,0.25)] hover:-translate-y-1 hover:shadow-[0_24px_50px_-18px_rgba(20,33,61,0.35)]",
      )}
      style={highlighted ? { boxShadow: `0 0 0 2px ${RED}, 0 20px 50px -20px rgba(206,17,38,0.45)` } : undefined}
    >
      {badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
          style={{ background: RED }}>
          {badge}
        </span>
      )}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold" style={{ color: NAVY }}>{title}</h3>
        {(availability || liveBadge) && (
          <span className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            soldOut ? "bg-gray-100 text-gray-500" : "bg-emerald-50 text-emerald-700",
          )}>
            {soldOut ? "Sold out" : "Available now"}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-4xl font-extrabold tracking-tight" style={{ color: NAVY }}>{price}</span>
        {wasPrice && <span className="text-lg font-semibold text-gray-400 line-through">{wasPrice}</span>}
        {cadence && <span className="text-sm text-gray-500">/ {cadence}</span>}
      </div>
      {priceNote && <p className="mt-1 text-sm font-medium text-gray-600">{priceNote}</p>}
      {seatsLeftText && <p className="mt-1 text-xs font-semibold" style={{ color: RED }}>{seatsLeftText}</p>}
      {saveNote && (
        <span className="mt-1 inline-block w-fit rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          {saveNote}
        </span>
      )}
      {subLine && <p className="mt-2 text-sm font-medium" style={{ color: NAVY }}>{subLine}</p>}
      {tagline && <p className="mt-2 text-sm text-gray-600">{tagline}</p>}
      <ul className="mt-5 space-y-2.5 text-[14px] text-gray-800">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {f}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-7">
        {footnote && <p className="mb-3 text-xs text-gray-500">{footnote}</p>}
        {cta}
      </div>
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
  const [phone, setPhone] = useState("");
  const [campus, setCampus] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const close = () => {
    onClose();
    setTimeout(() => { setEmail(""); setPhone(""); setCampus(""); setCourse(""); setDone(false); }, 150);
  };

  const submit = async () => {
    if (!tier) return;
    setBusy(true);
    try {
      await joinPricingWaitlist({ email, phone, campus, course, tier: tier.key });
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
                ? <>You're locked in for <strong>{course.trim()}</strong> — I'll let you know the moment it's live.</>
                : <>You're locked in — I'll let you know the moment it's live.</>}
            </p>
            <Button className="mt-5 w-full" onClick={close}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Lock in your price — {tier?.label}</DialogTitle>
              <DialogDescription>
                Join the waitlist to lock in the launch discount. No payment now.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="wl-email" className="text-xs">Email</Label>
                <Input id="wl-email" type="email" value={email} autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wl-phone" className="text-xs">
                  Phone <span className="text-muted-foreground">(optional — want a text when it&apos;s live? Add your number)</span>
                </Label>
                <Input id="wl-phone" type="tel" value={phone} autoComplete="tel"
                  onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="wl-campus" className="text-xs">
                    School <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input id="wl-campus" value={campus}
                    onChange={(e) => setCampus(e.target.value)} placeholder="e.g. Ole Miss" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wl-course" className="text-xs">
                    Course <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input id="wl-course" value={course}
                    onChange={(e) => setCourse(e.target.value)} placeholder="e.g. ACCY 201" />
                </div>
              </div>
              <Button className={RED_BTN} style={RED_BTN_STYLE} disabled={busy} onClick={submit}>
                {busy
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding you…</>
                  : `Join waitlist — lock in $${tier?.key === "membership" ? MEMBERSHIP_PRICE : TEST_PASS_PRICE}`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Premium 1-on-1 capture step — runs BEFORE the Stripe handoff so the lead (and
// their context) is saved even if they abandon at checkout. On reserve, writes
// the lead then redirects to Stripe with client_reference_id + prefilled_email
// so the payment matches back. When sold out, it's a plain waitlist capture.
function ReserveDialog({
  open, soldOut, onClose,
}: { open: boolean; soldOut: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [campus, setCampus] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const close = () => {
    onClose();
    setTimeout(() => {
      setName(""); setEmail(""); setPhone(""); setCampus(""); setCourse(""); setDone(false);
    }, 150);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const { id } = await reservePrepayLead({
        name, email, phone, campus, course,
        mode: soldOut ? "waitlist" : "reserve",
      });
      if (soldOut) {
        setDone(true);
        setBusy(false);
      } else {
        // Lead captured first; hand off to Stripe with the match key + email.
        const url = new URL(STRIPE_TUTORING_PAYMENT_LINK);
        url.searchParams.set("client_reference_id", id);
        url.searchParams.set("prefilled_email", email.trim().toLowerCase());
        window.location.href = url.toString();
      }
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        {done ? (
          <div className="py-2 text-center">
            <div className="mx-auto grid h-14 w-14 place-content-center rounded-full bg-emerald-50">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="mt-4 text-lg font-bold" style={{ color: NAVY }}>You&apos;re on the waitlist!</h3>
            <p className="mt-2 text-sm text-gray-600">
              All four seats are full right now — I&apos;ll reach out the moment one opens up.
            </p>
            <Button className="mt-5 w-full" onClick={close}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{soldOut ? "Join the 1-on-1 waitlist" : "Reserve your seat"}</DialogTitle>
              <DialogDescription>
                {soldOut
                  ? "All four seats are taken — leave your info and I'll reach out when one opens."
                  : "Quick details, then I'll send you to secure checkout. Full refund after session 1 if you're not happy."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="rs-name" className="text-xs">Name</Label>
                <Input id="rs-name" value={name} autoComplete="name"
                  onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rs-email" className="text-xs">Email</Label>
                <Input id="rs-email" type="email" value={email} autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rs-phone" className="text-xs">
                  Phone <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input id="rs-phone" type="tel" value={phone} autoComplete="tel"
                  onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="rs-campus" className="text-xs">
                    School <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input id="rs-campus" value={campus}
                    onChange={(e) => setCampus(e.target.value)} placeholder="Not listed? Just type it" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rs-course" className="text-xs">
                    Course <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input id="rs-course" value={course}
                    onChange={(e) => setCourse(e.target.value)} placeholder="e.g. ACCY 303" />
                </div>
              </div>
              <Button className={RED_BTN} style={RED_BTN_STYLE} disabled={busy} onClick={submit}>
                {busy
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {soldOut ? "Adding you…" : "Taking you to checkout…"}</>
                  : soldOut ? "Join the waitlist" : `Continue to checkout — $${PREPAY_PRICE.toLocaleString()} →`}
              </Button>
              <p className="text-center text-[11px] text-gray-400">
                {soldOut
                  ? "No payment — just the waitlist."
                  : "Secure payment via Stripe. Your seat is held once payment completes."}
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
