import { logger } from "./logger";

// Standard booking: 15% capped at $25
export const STANDARD_FEE_RATE = 0.15;
export const STANDARD_FEE_CAP_MINOR = 2500; // $25.00

// Subscription booking (3+ washes): 15% capped at $20
export const SUBSCRIPTION_FEE_CAP_MINOR = 2000; // $20.00
export const SUBSCRIPTION_MIN_WASHES = 3;

export interface FeeOptions {
  isSubscription?: boolean;
  discountAmountMinor?: number;
}

/**
 * Calculate the platform fee for a booking.
 * Fee = 15% of (base price - discount), capped at $25 (standard) or $20 (subscription).
 * Fee is calculated on the POST-DISCOUNT price per PRD Section 3.1.
 */
export function calculatePlatformFee(
  serviceBasePriceMinor: number,
  options?: FeeOptions,
): number {
  const discount = options?.discountAmountMinor ?? 0;
  const effectivePrice = Math.max(serviceBasePriceMinor - discount, 0);
  const cap = options?.isSubscription
    ? SUBSCRIPTION_FEE_CAP_MINOR
    : STANDARD_FEE_CAP_MINOR;
  const fee = Math.min(Math.round(effectivePrice * STANDARD_FEE_RATE), cap);

  logger.debug(
    { serviceBasePriceMinor, discount, effectivePrice, cap, fee, isSubscription: !!options?.isSubscription },
    "feeCalculator.calculatePlatformFee",
  );

  return fee;
}

/**
 * Calculate the all-in price the customer sees.
 * = (base price - discount) + platform fee
 */
export function calculateAllInPrice(
  serviceBasePriceMinor: number,
  options?: FeeOptions,
): number {
  const discount = options?.discountAmountMinor ?? 0;
  const effectivePrice = Math.max(serviceBasePriceMinor - discount, 0);
  return effectivePrice + calculatePlatformFee(serviceBasePriceMinor, options);
}

/**
 * Calculate total discount from a set of applicable discount rules.
 * Handles stacking logic: stackable discounts sum together;
 * non-stackable discounts compete (largest wins).
 * Returns total discount in minor units.
 */
export function calculateDiscounts(
  serviceBasePriceMinor: number,
  applicableDiscounts: Array<{
    percentOff?: number | null;
    flatAmountOff?: number | null;
    isStackable: boolean;
  }>,
): { totalDiscountMinor: number; appliedDescriptions: string[] } {
  const stackable = applicableDiscounts.filter((d) => d.isStackable);
  const nonStackable = applicableDiscounts.filter((d) => !d.isStackable);

  // Calculate stackable total
  let stackableTotal = 0;
  const descriptions: string[] = [];
  for (const d of stackable) {
    if (d.percentOff) {
      const amount = Math.round(serviceBasePriceMinor * (d.percentOff / 100));
      stackableTotal += amount;
      descriptions.push(`${d.percentOff}% off`);
    }
    if (d.flatAmountOff) {
      stackableTotal += d.flatAmountOff;
      descriptions.push(`$${(d.flatAmountOff / 100).toFixed(2)} off`);
    }
  }

  // Calculate best non-stackable
  let bestNonStackable = 0;
  let bestNonStackableDesc = "";
  for (const d of nonStackable) {
    let amount = 0;
    let desc = "";
    if (d.percentOff) {
      amount = Math.round(serviceBasePriceMinor * (d.percentOff / 100));
      desc = `${d.percentOff}% off`;
    }
    if (d.flatAmountOff && d.flatAmountOff > amount) {
      amount = d.flatAmountOff;
      desc = `$${(d.flatAmountOff / 100).toFixed(2)} off`;
    }
    if (amount > bestNonStackable) {
      bestNonStackable = amount;
      bestNonStackableDesc = desc;
    }
  }

  // The result is the MAX of (all stackable combined) vs (best non-stackable)
  let totalDiscountMinor: number;
  let appliedDescriptions: string[];
  if (bestNonStackable > stackableTotal) {
    totalDiscountMinor = bestNonStackable;
    appliedDescriptions = [bestNonStackableDesc];
  } else {
    totalDiscountMinor = stackableTotal;
    appliedDescriptions = descriptions;
  }

  // Discount cannot exceed base price
  totalDiscountMinor = Math.min(totalDiscountMinor, serviceBasePriceMinor);

  return { totalDiscountMinor, appliedDescriptions };
}

/**
 * Determine if a booking qualifies for subscription fee rates.
 */
export function isSubscriptionEligible(totalWashesInPackage: number): boolean {
  return totalWashesInPackage >= SUBSCRIPTION_MIN_WASHES;
}
