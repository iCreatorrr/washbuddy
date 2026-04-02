/**
 * Dynamic platform fee calculation per PRD Section 3.1.
 *
 * Fee = 15% of the combined service total for a vehicle booking,
 * capped at $25.00 (2500 minor units) per vehicle booking.
 *
 * The deprecated `platformFeeMinor` field on the Service model should be
 * ignored — fees are always calculated dynamically at booking time.
 */

export const PLATFORM_FEE_RATE = 0.15;
export const PLATFORM_FEE_CAP_MINOR = 2500; // $25.00 cap per vehicle booking

/**
 * Calculate the platform fee for a given service base price.
 * Returns the fee in minor currency units (cents).
 */
export function calculatePlatformFee(serviceBasePriceMinor: number): number {
  return Math.min(
    Math.round(serviceBasePriceMinor * PLATFORM_FEE_RATE),
    PLATFORM_FEE_CAP_MINOR,
  );
}

/**
 * Calculate the all-in customer-facing price (base + fee).
 * This is the single price shown to customers — no line item breakdown.
 */
export function calculateAllInPrice(serviceBasePriceMinor: number): number {
  return serviceBasePriceMinor + calculatePlatformFee(serviceBasePriceMinor);
}
