// Three-tier plans block (homepage #plans + onboarding plan step). Clean, NO
// discounts — real prices only, feature lists behind a "What's included" expander.
//  - Just One Test ($45) + Semester Membership ($99) = WAITLIST ("Notify me"
//    capture into campus_waitlist; fires text-to-Lee).
//  - Premium 1-on-1 ($1,250 = 10 hrs @ $125/hr) -> capture-first ReserveDialog,
//    then Stripe if STRIPE_TUTORING_PAYMENT_LINK is set, else "Reserve for Fall".
import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
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

// Clean, official, NO discounts — real prices only (no strikethrough/"was"/"save").
export const TEST_PASS_PRICE = 60;
export const MEMBERSHIP_PRICE = 150;
// Premium 1-on-1: full-price, capacity-capped semester block — 10 hours at $125/hr.
export const PREPAY_PRICE = 1250;
export const PREPAY_HOURS = 10;
export const PREPAY_RATE = 125;
// Deprecated "was" prices — kept as exports (= current price, so nothing renders
// as a discount) only for back-compat with importers until they're updated.
export const TEST_PASS_WAS = TEST_PASS_PRICE;
export const MEMBERSHIP_WAS = MEMBERSHIP_PRICE;
export const PREPAY_WAS = PREPAY_PRICE;

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
      <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
        {/* Just One Test — WAITLIST */}
        <PlanCard
          title="Just One Test"
          tagline="Cram Mode"
          price={`$${TEST_PASS_PRICE}`}
          priceNote="per exam"
          description="Cram for one test. Get exam prep for only the chapters it covers."
          features={[
            "The 4 chapters your exam covers",
            "Practice exam questions",
            "Video explainers for those chapters",
            "5-day access",
          ]}
          note={selecting ? undefined : "In development now — launching early July."}
          cta={selecting ? chooseBtn("test_pass", true) : (
            <a href="/onboard" className="block">
              <Button className="h-12 w-full text-base font-semibold" variant="outline"
                style={{ color: NAVY, borderColor: NAVY }}>
                Notify me
              </Button>
            </a>
          )}
        />

        {/* Semester Membership — BEST VALUE, WAITLIST */}
        <PlanCard
          highlighted
          badge="Best Value"
          title="Semester Membership"
          tagline="All Semester"
          price={`$${MEMBERSHIP_PRICE}`}
          priceNote="per semester"
          description="Crush every test. Get exam prep for every chapter in your course."
          features={[
            "Every chapter in your course, all semester",
            "All practice exams + video explainers",
            "New content added weekly",
            "Built around the exam style you'll actually see",
          ]}
          note={selecting ? undefined : "In development now — launching early July."}
          cta={selecting ? chooseBtn("membership") : (
            <a href="/onboard" className="block">
              <Button className={RED_BTN} style={RED_BTN_STYLE}>Notify me</Button>
            </a>
          )}
        />

        {/* Premium 1-on-1 — full-price, capacity-capped semester partnership */}
        <PlanCard
          title="Premium 1-on-1"
          tagline="Your Semester Coach"
          price={`$${PREPAY_PRICE.toLocaleString()}`}
          priceNote={`${PREPAY_HOURS} one-on-one hours · $${PREPAY_RATE}/hr`}
          description="Your tutor for the semester, built around your exact course + professor."
          features={[
            `${PREPAY_HOURS} hours of live 1-on-1 Zoom sessions`,
            "Tailored to your exact course + professor's exam style",
            "~3 hours per week, more around test time",
            "Re-up hours anytime; unused hours roll to next semester",
            "Only 4 students per semester",
          ]}
          howToStart={[
            "Pay → book your intro call → we set your recurring weekly time.",
            "No risk — full refund after your first session if you're not satisfied.",
          ]}
          availability={soldOut ? "soldout" : "available"}
          seatsLeftText={soldOut ? "" : TUTORING_SEATS_LEFT_TEXT}
          cta={selecting ? chooseBtn("prepay") : (
            <a href="/onboard" className="block">
              <Button className={RED_BTN} style={RED_BTN_STYLE}>
                {soldOut ? "Join the waitlist" : "Reserve your slot"}
              </Button>
            </a>
          )}
        />
      </div>

      <WaitlistDialog tier={waitlistTier} onClose={() => setWaitlistTier(null)} />
      <ReserveDialog open={reserveOpen} soldOut={soldOut} stripeReady={stripeReady} onClose={() => setReserveOpen(false)} />
    </div>
  );
}

function PlanCard({
  title, tagline, price, priceNote, description, features, cta, note, howToStart,
  highlighted, badge, availability, seatsLeftText,
}: {
  title: string;
  tagline?: string;
  price: string;
  priceNote?: string;
  description?: string;
  features: string[];
  cta: React.ReactNode;
  note?: string;
  howToStart?: string[];
  highlighted?: boolean;
  badge?: string;
  availability?: "available" | "soldout";
  seatsLeftText?: string;
}) {
  const soldOut = availability === "soldout";
  const [open, setOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {tagline && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: RED }}>{tagline}</p>
          )}
          <h3 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>{title}</h3>
        </div>
        {availability && (
          <span className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            soldOut ? "bg-gray-100 text-gray-500" : "bg-emerald-50 text-emerald-700",
          )}>
            {soldOut ? "Sold out" : "Available now"}
          </span>
        )}
      </div>
      <div className="mt-3">
        <span className="text-4xl font-extrabold tracking-tight" style={{ color: NAVY }}>{price}</span>
      </div>
      {priceNote && <p className="mt-1 text-sm font-medium text-gray-500">{priceNote}</p>}
      {seatsLeftText && <p className="mt-1 text-xs font-semibold" style={{ color: RED }}>{seatsLeftText}</p>}
      {description && <p className="mt-2 text-sm leading-relaxed text-gray-600">{description}</p>}

      <div className="mt-auto pt-6">
        {cta}
        {note && <p className="mt-2 text-center text-xs text-gray-500">{note}</p>}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-3 flex w-full items-center justify-center gap-1 text-xs font-semibold transition-colors hover:opacity-80"
          style={{ color: NAVY }}
        >
          What&apos;s included
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <ul className="mt-3 space-y-2 text-left text-[13px] text-gray-700">
            {features.map((f) => (
              <li key={f} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {f}
              </li>
            ))}
          </ul>
        )}
        {howToStart && howToStart.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setHowOpen((o) => !o)}
              aria-expanded={howOpen}
              className="mt-2 flex w-full items-center justify-center gap-1 text-xs font-semibold transition-colors hover:opacity-80"
              style={{ color: NAVY }}
            >
              How to start
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", howOpen && "rotate-180")} />
            </button>
            {howOpen && (
              <ul className="mt-3 space-y-2 text-left text-[13px] text-gray-700">
                {howToStart.map((s) => (
                  <li key={s} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {s}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
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
  open, soldOut, stripeReady, onClose,
}: { open: boolean; soldOut: boolean; stripeReady: boolean; onClose: () => void }) {
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
      if (soldOut || !stripeReady) {
        // Sold out → waitlist; or payment not live yet → reserve a Fall slot.
        // Either way the lead is captured (+ notify fires); just confirm.
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
            <h3 className="mt-4 text-lg font-bold" style={{ color: NAVY }}>
              {soldOut ? "You're on the waitlist!" : "Your slot is reserved!"}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {soldOut
                ? "All four seats are full right now — I'll reach out the moment one opens up."
                : "I've held a Fall slot for you. I'll reach out personally to set up your sessions and payment."}
            </p>
            <Button className="mt-5 w-full" onClick={close}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {soldOut ? "Join the 1-on-1 waitlist" : stripeReady ? "Reserve your slot" : "Reserve your slot for Fall"}
              </DialogTitle>
              <DialogDescription>
                {soldOut
                  ? "All four seats are taken — leave your info and I'll reach out when one opens."
                  : stripeReady
                    ? "Quick details, then I'll send you to secure checkout. Full refund after session 1 if you're not happy."
                    : "Quick details and I'll hold your slot for Fall — no payment now. I'll follow up personally to set it up."}
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
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {soldOut ? "Adding you…" : stripeReady ? "Taking you to checkout…" : "Reserving…"}</>
                  : soldOut ? "Join the waitlist" : stripeReady ? `Continue to checkout — $${PREPAY_PRICE.toLocaleString()} →` : "Reserve my slot →"}
              </Button>
              <p className="text-center text-[11px] text-gray-400">
                {soldOut
                  ? "No payment — just the waitlist."
                  : stripeReady
                    ? "Secure payment via Stripe. Your seat is held once payment completes."
                    : "No payment now — I'll reach out personally to set up your sessions."}
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
