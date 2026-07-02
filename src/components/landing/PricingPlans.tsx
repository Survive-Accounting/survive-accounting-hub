// Homepage pricing section. Under the pre-order (Cram Pack) model this is a
// single primary CTA into the /order wizard — the old SKU cards (Just One Test,
// Semester Membership) and the standalone Premium 1-on-1 card are retired.
// 1-on-1 now lives as a secondary card on the /order summary step.
//
// Kept for backward-compat: the PricingPlanKey type + price constants (imported
// elsewhere) and the onSelectPlan prop (no longer used — the pre-order model
// routes to /order rather than selecting a SKU).
import { Button } from "@/components/ui/button";

const RED = "#CE1126";

// Real prices, no discounts. Kept as exports for back-compat with importers.
export const TEST_PASS_PRICE = 60;
export const MEMBERSHIP_PRICE = 150;
export const PREPAY_PRICE = 1250;
export const PREPAY_HOURS = 10;
export const PREPAY_RATE = 125;
export const TEST_PASS_WAS = TEST_PASS_PRICE;
export const MEMBERSHIP_WAS = MEMBERSHIP_PRICE;
export const PREPAY_WAS = PREPAY_PRICE;

/** Kept for back-compat (imported by the onboarding wizard's types). */
export type PricingPlanKey = "test_pass" | "membership" | "prepay";

const RED_BTN_STYLE: React.CSSProperties = {
  background: `linear-gradient(180deg, ${RED} 0%, #A8101F 100%)`,
};

export default function PricingPlans({
  bookHref = "/order",
  className,
  onSelectPlan,
}: {
  bookHref?: string;
  className?: string;
  /** Retained for back-compat; unused under the pre-order model. */
  onSelectPlan?: (plan: PricingPlanKey) => void;
}) {
  void onSelectPlan;
  const href = bookHref || "/order";
  return (
    <div className={className}>
      <div className="mx-auto max-w-md text-center">
        <a href={href} className="inline-block w-full sm:w-auto">
          <Button className="h-12 w-full px-10 text-base font-bold text-white sm:w-auto" style={RED_BTN_STYLE}>
            Request Help →
          </Button>
        </a>
        <p className="mt-3 text-xs text-gray-500">
          Free to request · I quote before I build
        </p>
      </div>
    </div>
  );
}
